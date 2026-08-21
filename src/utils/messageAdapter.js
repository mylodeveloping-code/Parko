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
//
// Prefix commands can provide:
//
//   @User
//   <@UserID>
//   <@!UserID>
//   UserID
//
// We first check cache, then fetch from Discord.
//
// This is intentionally async because a valid Discord user
// may not exist in either local cache.
//

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
    // Resolve user options BEFORE command execution.
    //
    // This makes interaction.options.getUser() behave like
    // a real Discord interaction.
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
    // Also resolve user options inside subcommands.
    // --------------------------------------------------------

    for (const optionDef of commandOptions) {
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
    let hasReplied = false;

    const mockInteraction = {
        user: message.author,

        member: message.member,

        get memberPermissions() {
            return (
                message.member?.permissions ??
                null
            );
        },

        channel: message.channel,

        guild: message.guild,

        guildId:
            message.guild?.id ??
            null,

        commandName:
            commandJson?.name ??
            null,

        commandId:
            message.id,

        id:
            message.id,

        // ====================================================
        // OPTIONS
        // ====================================================

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

            getBoolean(name) {
                return options.getBoolean(name);
            },

            getSubcommand() {
                return options.getSubcommand();
            },

            getSubcommandGroup() {
                return options.getSubcommandGroup();
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

                        value: arg,

                        type: 3,
                    }),
                ),
        },

        createdTimestamp:
            message.createdTimestamp,

        createdAt:
            message.createdAt,

        _commandStartTime:
            commandStartTime,

        _isPrefixCommand:
            true,

        client:
            message.client,

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

        // ====================================================
        // DIRECT PREFIX RESPONSE
        // ====================================================

        reply: async (payload) => {
            if (
                hasReplied &&
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

            hasReplied = true;

            mockInteraction.replied =
                true;

            mockInteraction._replyMessage =
                replyMessage;

            return replyMessage;
        },

        editReply: async (payload) => {
            if (!replyMessage) {
                replyMessage =
                    await message.channel.send(
                        payload,
                    );

                hasReplied = true;

                mockInteraction.replied =
                    true;

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

            mockInteraction._replyMessage =
                edited;

            return edited;
        },

        followUp: async (payload) => {
            return message.channel.send(
                payload,
            );
        },

        deferReply: async () => {
            mockInteraction.deferred =
                true;

            return mockInteraction;
        },

        fetchReply: async () => {
            return (
                replyMessage ||
                message
            );
        },

        deleteReply: async () => {
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
            }

            return null;
        },

        _responseCoordinator:
            null,
    };

    // ========================================================
    // RESPONSE COORDINATOR
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
    // INTERACTION HELPER
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
    // RESTORE DIRECT PREFIX METHODS
    // ========================================================

    mockInteraction.reply =
        async (payload) => {
            if (
                hasReplied &&
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

            hasReplied = true;

            mockInteraction.replied =
                true;

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

                hasReplied = true;

                mockInteraction.replied =
                    true;

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

    const coordinator =
        mockInteraction._responseCoordinator;

    const prefix =
        prefixOverride ||
        getCommandPrefix();

    try {
        // ====================================================
        // DEFAULT PERMISSIONS
        // ====================================================

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

        if (!permissionAllowed) {
            return;
        }

        // ====================================================
        // REQUIRED OPTIONS
        // ====================================================

        const validation =
            mockInteraction.options
                .validateRequired();

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
        // EXECUTE
        // ====================================================

        if (
            typeof command.prefixExecute ===
            'function'
        ) {
            await command.prefixExecute(
                mockInteraction,
                guildConfig,
                client,
            );

            return;
        }

        if (
            typeof command.execute ===
            'function'
        ) {
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
    }
}
