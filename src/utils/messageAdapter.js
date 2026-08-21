import { mapArgumentsToOptions } from './prefixParser.js';
import { handleInteractionError } from './errorHandler.js';
import { logger } from './logger.js';
import { InteractionHelper } from './interactionHelper.js';

import {
    SLASH_ONLY_COMMANDS,
} from '../config/commands/prefixRestrictions.js';

import { getCommandPrefix } from '../config/bot.js';

import {
    ResponseCoordinator,
    buildPrefixUsage,
} from './responseCoordinator.js';

import {
    enforceDefaultCommandPermissions,
} from './permissionGuard.js';

import { isBlacklisted } from './blacklist.js';

export {
    buildPrefixUsage,
};

// ============================================================
// COMMAND JSON
// ============================================================

function getCommandJson(commandData) {
    if (
        commandData &&
        typeof commandData.toJSON === 'function'
    ) {
        return commandData.toJSON();
    }

    return commandData || {};
}

// ============================================================
// COMMAND NAME
// ============================================================

function getCommandName(command) {
    const data = getCommandJson(command?.data);

    return data?.name
        ? String(data.name).toLowerCase()
        : null;
}

// ============================================================
// SLASH ACCESS KEY
// ============================================================

export function resolveSlashAccessKey(interaction) {
    const subcommandGroup =
        interaction.options.getSubcommandGroup(false);

    const subcommand =
        interaction.options.getSubcommand(false);

    if (subcommandGroup && subcommand) {
        return `${interaction.commandName} ${subcommandGroup} ${subcommand}`;
    }

    if (subcommand) {
        return `${interaction.commandName} ${subcommand}`;
    }

    return interaction.commandName;
}

// ============================================================
// PREFIX ACCESS KEY
// ============================================================

export function resolvePrefixAccessKey(commandData, args) {
    const options = mapArgumentsToOptions(
        args,
        commandData,
    );

    const subcommand = options.getSubcommand();
    const subcommandGroup = options.getSubcommandGroup();

    const commandName =
        getCommandJson(commandData)?.name;

    if (!commandName) {
        return null;
    }

    if (subcommandGroup && subcommand) {
        return `${commandName} ${subcommandGroup} ${subcommand}`;
    }

    if (subcommand) {
        return `${commandName} ${subcommand}`;
    }

    return commandName;
}

// ============================================================
// RESOLVE USER ID
// ============================================================

function resolveUserId(value) {
    if (!value) {
        return null;
    }

    const stringValue =
        String(value).trim();

    const match =
        stringValue.match(
            /^<@!?(\d+)>$/,
        );

    if (match) {
        return match[1];
    }

    if (/^\d+$/.test(stringValue)) {
        return stringValue;
    }

    return null;
}

// ============================================================
// RESOLVE PREFIX USER
// ============================================================

async function resolvePrefixUser(
    message,
    rawValue,
) {
    const userId =
        resolveUserId(rawValue);

    if (!userId) {
        return null;
    }

    // --------------------------------------------------------
    // Guild member cache
    // --------------------------------------------------------

    const cachedMember =
        message.guild?.members?.cache?.get(
            userId,
        );

    if (cachedMember?.user) {
        return cachedMember.user;
    }

    // --------------------------------------------------------
    // User cache
    // --------------------------------------------------------

    const cachedUser =
        message.client?.users?.cache?.get(
            userId,
        );

    if (cachedUser) {
        return cachedUser;
    }

    // --------------------------------------------------------
    // Discord API fallback
    // --------------------------------------------------------

    try {
        return await message.client.users.fetch(
            userId,
        );
    } catch (error) {
        logger.debug(
            `Unable to resolve prefix user ${userId}:`,
            error,
        );

        return null;
    }
}

// ============================================================
// CREATE MOCK INTERACTION
// ============================================================

export async function createMockInteraction(
    message,
    commandData,
    args,
) {
    const commandJson =
        getCommandJson(commandData);

    const options =
        mapArgumentsToOptions(
            args,
            commandData,
        );

    // --------------------------------------------------------
    // Resolve user options
    // --------------------------------------------------------

    const resolvedUsers = new Map();

    const commandOptions =
        commandJson?.options || [];

    for (const optionDef of commandOptions) {
        if (optionDef.type !== 6) {
            continue;
        }

        const rawValue =
            options.getUser(optionDef.name);

        if (!rawValue) {
            continue;
        }

        const user =
            await resolvePrefixUser(
                message,
                rawValue,
            );

        if (user) {
            resolvedUsers.set(
                optionDef.name,
                user,
            );
        }
    }

    // --------------------------------------------------------
    // Resolve user options inside subcommands
    // --------------------------------------------------------

    for (const optionDef of commandOptions) {
        // Subcommand
        if (optionDef.type === 1) {
            for (const subOption of optionDef.options || []) {
                if (subOption.type !== 6) {
                    continue;
                }

                const rawValue =
                    options.getUser(
                        subOption.name,
                    );

                if (!rawValue) {
                    continue;
                }

                const user =
                    await resolvePrefixUser(
                        message,
                        rawValue,
                    );

                if (user) {
                    resolvedUsers.set(
                        subOption.name,
                        user,
                    );
                }
            }
        }

        // Subcommand group
        if (optionDef.type === 2) {
            for (const group of optionDef.options || []) {
                for (const subOption of group.options || []) {
                    if (subOption.type !== 6) {
                        continue;
                    }

                    const rawValue =
                        options.getUser(
                            subOption.name,
                        );

                    if (!rawValue) {
                        continue;
                    }

                    const user =
                        await resolvePrefixUser(
                            message,
                            rawValue,
                        );

                    if (user) {
                        resolvedUsers.set(
                            subOption.name,
                            user,
                        );
                    }
                }
            }
        }
    }

    const commandStartTime =
        Date.now();

    let replyMessage = null;

    // ========================================================
    // MOCK INTERACTION
    // ========================================================

    const mockInteraction = {
        // ----------------------------------------------------
        // Basic interaction information
        // ----------------------------------------------------

        user:
            message.author,

        member:
            message.member,

        guild:
            message.guild,

        guildId:
            message.guild?.id ?? null,

        channel:
            message.channel,

        client:
            message.client,

        commandName:
            commandJson?.name ?? null,

        commandId:
            message.id,

        id:
            message.id,

        applicationId:
            message.client?.application?.id ??
            message.client?.user?.id ??
            null,

        createdTimestamp:
            message.createdTimestamp,

        createdAt:
            message.createdAt,

        _commandStartTime:
            commandStartTime,

        _isPrefixCommand:
            true,

        // ----------------------------------------------------
        // Permissions
        // ----------------------------------------------------

        get memberPermissions() {
            return (
                message.member?.permissions ??
                null
            );
        },

        // ----------------------------------------------------
        // Discord interaction compatibility
        //
        // These are important because InteractionHelper and
        // permission/command utilities may check them.
        // ----------------------------------------------------

        isRepliable() {
            return true;
        },

        isCommand() {
            return true;
        },

        isChatInputCommand() {
            return true;
        },

        isAutocomplete() {
            return false;
        },

        isButton() {
            return false;
        },

        isStringSelectMenu() {
            return false;
        },

        isRoleSelectMenu() {
            return false;
        },

        isUserSelectMenu() {
            return false;
        },

        isChannelSelectMenu() {
            return false;
        },

        isMentionableSelectMenu() {
            return false;
        },

        isModalSubmit() {
            return false;
        },

        isAnySelectMenu() {
            return false;
        },

        // ----------------------------------------------------
        // Interaction state
        // ----------------------------------------------------

        deferred:
            false,

        replied:
            false,

        ephemeral:
            false,

        webhook:
            null,

        _replyMessage:
            null,

        // ----------------------------------------------------
        // OPTIONS
        // ----------------------------------------------------

        options: {
            get(name) {
                return options.get(name);
            },

            getString(name) {
                return options.getString(name);
            },

            getUser(name) {
                return (
                    resolvedUsers.get(name) ??
                    null
                );
            },

            getMember(name) {
                const user =
                    resolvedUsers.get(name);

                if (!user || !message.guild) {
                    return null;
                }

                return (
                    message.guild.members.cache.get(
                        user.id,
                    ) ??
                    null
                );
            },

            getChannel(name) {
                const rawValue =
                    options.getString(name);

                if (
                    !rawValue ||
                    !message.guild
                ) {
                    return null;
                }

                const match =
                    String(rawValue).match(
                        /^<#(\d+)>$/,
                    );

                const channelId =
                    match
                        ? match[1]
                        : String(rawValue);

                return message.guild.channels
                    .fetch(channelId)
                    .catch(() => null);
            },

            getRole(name) {
                const rawValue =
                    options.getString(name);

                if (
                    !rawValue ||
                    !message.guild
                ) {
                    return null;
                }

                const match =
                    String(rawValue).match(
                        /^<@&(\d+)>$/,
                    );

                const roleId =
                    match
                        ? match[1]
                        : String(rawValue);

                return message.guild.roles
                    .fetch(roleId)
                    .catch(() => null);
            },

            getInteger(name) {
                return options.getInteger(name);
            },

            getNumber(name) {
                if (
                    typeof options.getNumber ===
                    'function'
                ) {
                    return options.getNumber(name);
                }

                return null;
            },

            getBoolean(name) {
                return options.getBoolean(name);
            },

            getSubcommand(required = true) {
                return options.getSubcommand(
                    required,
                );
            },

            getSubcommandGroup(required = true) {
                return options.getSubcommandGroup(
                    required,
                );
            },

            validateRequired() {
                return options.validateRequired();
            },

            _hoistedOptions:
                args.map(
                    (arg, index) => ({
                        name:
                            commandJson
                                ?.options?.[index]
                                ?.name ||
                            `arg${index}`,

                        value:
                            arg,

                        type:
                            3,
                    }),
                ),
        },

        // ====================================================
        // REPLY
        // ====================================================

        reply:
            async (payload) => {
                if (
                    replyMessage
                ) {
                    return mockInteraction.editReply(
                        payload,
                    );
                }

                replyMessage =
                    await message.channel.send(
                        payload,
                    );

                mockInteraction.replied =
                    true;

                mockInteraction.deferred =
                    false;

                mockInteraction._replyMessage =
                    replyMessage;

                return replyMessage;
            },

        // ====================================================
        // EDIT REPLY
        // ====================================================

        editReply:
            async (payload) => {
                if (!replyMessage) {
                    replyMessage =
                        await message.channel.send(
                            payload,
                        );

                    mockInteraction.replied =
                        true;

                    mockInteraction.deferred =
                        false;

                    mockInteraction._replyMessage =
                        replyMessage;

                    return replyMessage;
                }

                const edited =
                    await replyMessage.edit(
                        payload,
                    );

                mockInteraction.replied =
                    true;

                mockInteraction.deferred =
                    false;

                mockInteraction._replyMessage =
                    edited;

                return edited;
            },

        // ====================================================
        // FOLLOW UP
        // ====================================================

        followUp:
            async (payload) => {
                return message.channel.send(
                    payload,
                );
            },

        // ====================================================
        // DEFER REPLY
        // ====================================================

        deferReply:
            async () => {
                mockInteraction.deferred =
                    true;

                mockInteraction.replied =
                    false;

                return mockInteraction;
            },

        // ====================================================
        // FETCH REPLY
        // ====================================================

        fetchReply:
            async () => {
                return (
                    replyMessage ||
                    message
                );
            },

        // ====================================================
        // DELETE REPLY
        // ====================================================

        deleteReply:
            async () => {
                if (
                    replyMessage &&
                    replyMessage.deletable
                ) {
                    await replyMessage.delete();

                    replyMessage =
                        null;

                    mockInteraction._replyMessage =
                        null;

                    mockInteraction.replied =
                        false;

                    mockInteraction.deferred =
                        false;
                }

                return null;
            },

        // ====================================================
        // RESPONSE COORDINATOR
        // ====================================================

        _responseCoordinator:
            null,
    };

    // ========================================================
    // ATTACH RESPONSE COORDINATOR
    // ========================================================

    try {
        const coordinator =
            ResponseCoordinator.attach(
                mockInteraction,
                {
                    message,
                },
            );

        mockInteraction._responseCoordinator =
            coordinator;
    } catch (error) {
        logger.warn(
            'Failed to attach ResponseCoordinator to prefix interaction:',
            error,
        );
    }

    // ========================================================
    // PATCH INTERACTION RESPONSES
    // ========================================================

    try {
        InteractionHelper.patchInteractionResponses(
            mockInteraction,
        );
    } catch (error) {
        logger.warn(
            'Failed to patch prefix interaction responses:',
            error,
        );
    }

    // ========================================================
    // RESTORE OUR PREFIX RESPONSE METHODS
    //
    // Some interaction helpers replace reply/editReply/
    // deferReply. Prefix commands need these methods to send
    // actual Discord messages, so restore them after patching.
    // ========================================================

    mockInteraction.reply =
        async (payload) => {
            if (replyMessage) {
                return mockInteraction.editReply(
                    payload,
                );
            }

            replyMessage =
                await message.channel.send(
                    payload,
                );

            mockInteraction.replied =
                true;

            mockInteraction.deferred =
                false;

            mockInteraction._replyMessage =
                replyMessage;

            return replyMessage;
        };

    mockInteraction.editReply =
        async (payload) => {
            if (!replyMessage) {
                replyMessage =
                    await message.channel.send(
                        payload,
                    );

                mockInteraction.replied =
                    true;

                mockInteraction.deferred =
                    false;

                mockInteraction._replyMessage =
                    replyMessage;

                return replyMessage;
            }

            const edited =
                await replyMessage.edit(
                    payload,
                );

            mockInteraction.replied =
                true;

            mockInteraction.deferred =
                false;

            mockInteraction._replyMessage =
                edited;

            return edited;
        };

    mockInteraction.followUp =
        async (payload) => {
            return message.channel.send(
                payload,
            );
        };

    mockInteraction.deferReply =
        async () => {
            mockInteraction.deferred =
                true;

            mockInteraction.replied =
                false;

            return mockInteraction;
        };

    mockInteraction.fetchReply =
        async () => {
            return (
                replyMessage ||
                message
            );
        };

    mockInteraction.deleteReply =
        async () => {
            if (
                replyMessage &&
                replyMessage.deletable
            ) {
                await replyMessage.delete();

                replyMessage =
                    null;

                mockInteraction._replyMessage =
                    null;

                mockInteraction.replied =
                    false;

                mockInteraction.deferred =
                    false;
            }

            return null;
        };

    return mockInteraction;
}

// ============================================================
// PREFIX SUPPORT
// ============================================================

export function supportsPrefixExecution(command) {
    if (!command) {
        return false;
    }

    if (
        command.prefixOnly === false ||
        command.slashOnly === true
    ) {
        return false;
    }

    const commandName =
        getCommandName(command);

    if (
        commandName &&
        SLASH_ONLY_COMMANDS.has(
            commandName,
        )
    ) {
        return false;
    }

    if (
        typeof command.messageExecute ===
        'function'
    ) {
        return true;
    }

    if (
        typeof command.prefixExecute ===
        'function'
    ) {
        return true;
    }

    return (
        typeof command.execute ===
        'function'
    );
}

// ============================================================
// EXECUTE PREFIX COMMAND
// ============================================================

export async function executePrefixCommand(
    command,
    message,
    args,
    client,
    prefixOverride = null,
    guildConfig = null,
) {
    if (!command) {
        logger.warn(
            'executePrefixCommand was called without a command.',
        );

        return;
    }

    if (!message) {
        logger.warn(
            'executePrefixCommand was called without a message.',
        );

        return;
    }

    const commandName =
        getCommandName(command);

    logger.info(
        `Starting prefix execution for ${commandName} with args: ${JSON.stringify(args)}`,
    );

    if (
        isBlacklisted(
            message.author.id,
        )
    ) {
        logger.info(
            `Blocked blacklisted user ${message.author.tag} (${message.author.id}) from using prefix command.`,
        );

        return;
    }

    // ========================================================
    // MESSAGE-BASED PREFIX COMMAND
    // ========================================================

    if (
        typeof command.messageExecute ===
        'function'
    ) {
        try {
            await command.messageExecute(
                message,
                args,
                client,
            );
        } catch (error) {
            logger.error(
                `Error executing message-based prefix command ${commandName}:`,
                error,
            );
        }

        return;
    }

    // ========================================================
    // CREATE PREFIX INTERACTION
    // ========================================================

    let mockInteraction;

    try {
        mockInteraction =
            await createMockInteraction(
                message,
                command.data,
                args,
            );
    } catch (error) {
        logger.error(
            `Failed to create prefix interaction for ${commandName}:`,
            error,
        );

        return;
    }

    if (!mockInteraction) {
        logger.error(
            `Prefix interaction was not created for ${commandName}.`,
        );

        return;
    }

    const coordinator =
        mockInteraction._responseCoordinator;

    const prefix =
        prefixOverride ||
        getCommandPrefix();

    try {
        // ====================================================
        // DEFAULT PERMISSIONS
        // ====================================================

        logger.debug(
            `Checking default permissions for prefix command ${commandName}.`,
        );

        const permissionAllowed =
            await enforceDefaultCommandPermissions(
                mockInteraction,
                command,
                {
                    source:
                        'messageAdapter.executePrefixCommand',

                    guildConfig,
                },
            );

        logger.debug(
            `Permission result for ${commandName}: ${permissionAllowed}`,
        );

        if (!permissionAllowed) {
            return;
        }

        // ====================================================
        // REQUIRED OPTIONS
        // ====================================================

        const validation =
            mockInteraction.options
                .validateRequired();

        logger.debug(
            `Required option validation for ${commandName}: ${JSON.stringify(validation)}`,
        );

        if (!validation.valid) {
            if (
                coordinator &&
                typeof coordinator.respondUsageFromCommand ===
                    'function'
            ) {
                await coordinator.respondUsageFromCommand(
                    prefix,
                    command,
                    validation,
                );
            } else {
                await mockInteraction.reply({
                    content:
                        buildPrefixUsage(
                            prefix,
                            command,
                            validation,
                        ),
                });
            }

            return;
        }

        // ====================================================
        // EXECUTE PREFIX HANDLER
        // ====================================================

        if (
            typeof command.prefixExecute ===
            'function'
        ) {
            logger.info(
                `Executing ${prefix}${commandName} using prefixExecute.`,
            );

            await command.prefixExecute(
                mockInteraction,
                guildConfig,
                client,
            );

            return;
        }

        // ====================================================
        // FALLBACK TO NORMAL EXECUTE
        // ====================================================

        if (
            typeof command.execute ===
            'function'
        ) {
            logger.info(
                `Executing ${prefix}${commandName} using execute.`,
            );

            await command.execute(
                mockInteraction,
                guildConfig,
                client,
            );

            return;
        }

        logger.error(
            `Command ${commandName} has no executable handler.`,
        );
    } catch (error) {
        logger.error(
            `Prefix command ${prefix}${commandName} failed:`,
            error,
        );

        try {
            await handleInteractionError(
                mockInteraction,
                error,
                {
                    type:
                        'prefix_command',

                    command:
                        commandName,

                    source:
                        'messageAdapter.executePrefixCommand',
                },
            );
        } catch (handlerError) {
            logger.error(
                `Failed to handle error from prefix command ${commandName}:`,
                handlerError,
            );
        }
    }
}