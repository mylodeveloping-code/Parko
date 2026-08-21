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
    const data =
        getCommandJson(
            command?.data
        );

    return data?.name
        ? String(
            data.name
        ).toLowerCase()
        : null;
}

// ============================================================
// SLASH ACCESS KEY
// ============================================================

export function resolveSlashAccessKey(
    interaction
) {
    const group =
        interaction.options.getSubcommandGroup(
            false
        );

    const subcommand =
        interaction.options.getSubcommand(
            false
        );

    if (
        group &&
        subcommand
    ) {
        return `${interaction.commandName} ${group} ${subcommand}`;
    }

    if (subcommand) {
        return `${interaction.commandName} ${subcommand}`;
    }

    return interaction.commandName;
}

// ============================================================
// PREFIX ACCESS KEY
// ============================================================

export function resolvePrefixAccessKey(
    commandData,
    args
) {
    const options =
        mapArgumentsToOptions(
            args,
            commandData
        );

    const subcommand =
        options.getSubcommand();

    const group =
        options.getSubcommandGroup();

    const commandName =
        getCommandJson(
            commandData
        )?.name;

    if (!commandName) {
        return null;
    }

    if (
        group &&
        subcommand
    ) {
        return `${commandName} ${group} ${subcommand}`;
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

    const mention =
        stringValue.match(
            /^<@!?(\d+)>$/
        );

    if (mention) {
        return mention[1];
    }

    if (
        /^\d{17,20}$/.test(
            stringValue
        )
    ) {
        return stringValue;
    }

    return null;
}

// ============================================================
// RESOLVE PREFIX MEMBER
// ============================================================
//
// Prefix moderation commands often need a GuildMember rather than
// merely a User.
//
// This function ALWAYS attempts to resolve the member from the
// guild. That fixes commands such as:
//
//   >mute 1393674823514980352 10m test
//   >warn 123456789012345678 test
//
// even when the member is not currently in the cache.
// ============================================================

async function resolvePrefixMember(
    message,
    rawValue
) {
    const userId =
        resolveUserId(
            rawValue
        );

    if (!userId) {
        return null;
    }

    if (!message.guild) {
        return null;
    }

    // --------------------------------------------------------
    // Guild member cache
    // --------------------------------------------------------

    const cachedMember =
        message.guild.members.cache.get(
            userId
        );

    if (cachedMember) {
        return cachedMember;
    }

    // --------------------------------------------------------
    // Guild member API fetch
    // --------------------------------------------------------

    try {
        return await message.guild.members.fetch(
            userId
        );
    } catch (error) {
        logger.debug(
            `Unable to resolve prefix guild member ${userId}:`,
            error
        );

        return null;
    }
}

// ============================================================
// RESOLVE PREFIX USER
// ============================================================

async function resolvePrefixUser(
    message,
    rawValue
) {
    const member =
        await resolvePrefixMember(
            message,
            rawValue
        );

    if (member?.user) {
        return member.user;
    }

    const userId =
        resolveUserId(
            rawValue
        );

    if (!userId) {
        return null;
    }

    // --------------------------------------------------------
    // User cache
    // --------------------------------------------------------

    const cachedUser =
        message.client?.users?.cache?.get(
            userId
        );

    if (cachedUser) {
        return cachedUser;
    }

    // --------------------------------------------------------
    // Discord API fallback
    // --------------------------------------------------------

    try {
        return await message.client.users.fetch(
            userId
        );
    } catch (error) {
        logger.debug(
            `Unable to resolve prefix user ${userId}:`,
            error
        );

        return null;
    }
}

// ============================================================
// RESOLVE USER/MEMBER OPTION
// ============================================================

async function resolveUserOption(
    message,
    options,
    optionDef,
    resolvedUsers,
    resolvedMembers
) {
    if (
        !optionDef ||
        optionDef.type !== 6
    ) {
        return;
    }

    const raw =
        options.getUser(
            optionDef.name
        );

    if (!raw) {
        return;
    }

    const member =
        await resolvePrefixMember(
            message,
            raw
        );

    if (member) {
        resolvedMembers.set(
            optionDef.name,
            member
        );

        if (member.user) {
            resolvedUsers.set(
                optionDef.name,
                member.user
            );
        }

        return;
    }

    const user =
        await resolvePrefixUser(
            message,
            raw
        );

    if (user) {
        resolvedUsers.set(
            optionDef.name,
            user
        );
    }
}

// ============================================================
// CREATE MOCK INTERACTION
// ============================================================

export async function createMockInteraction(
    message,
    commandData,
    args
) {
    const commandJson =
        getCommandJson(
            commandData
        );

    const options =
        mapArgumentsToOptions(
            args,
            commandData
        );

    // --------------------------------------------------------
    // Resolved Discord objects
    // --------------------------------------------------------

    const resolvedUsers =
        new Map();

    const resolvedMembers =
        new Map();

    const commandOptions =
        commandJson?.options || [];

    // --------------------------------------------------------
    // Direct command options
    // --------------------------------------------------------

    for (
        const optionDef
        of commandOptions
    ) {
        await resolveUserOption(
            message,
            options,
            optionDef,
            resolvedUsers,
            resolvedMembers
        );

        // ----------------------------------------------------
        // Normal subcommand
        // ----------------------------------------------------

        if (
            optionDef.type === 1
        ) {
            for (
                const subOption
                of optionDef.options || []
            ) {
                await resolveUserOption(
                    message,
                    options,
                    subOption,
                    resolvedUsers,
                    resolvedMembers
                );
            }
        }

        // ----------------------------------------------------
        // Subcommand group
        // ----------------------------------------------------

        if (
            optionDef.type === 2
        ) {
            for (
                const group
                of optionDef.options || []
            ) {
                for (
                    const subOption
                    of group.options || []
                ) {
                    await resolveUserOption(
                        message,
                        options,
                        subOption,
                        resolvedUsers,
                        resolvedMembers
                    );
                }
            }
        }
    }

    // --------------------------------------------------------
    // Mock response state
    // --------------------------------------------------------

    let replyMessage =
        null;

    let hasReplied =
        false;

    const mockInteraction = {
        user:
            message.author,

        member:
            message.member,

        channel:
            message.channel,

        guild:
            message.guild,

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

        createdTimestamp:
            message.createdTimestamp,

        createdAt:
            message.createdAt,

        client:
            message.client,

        _isPrefixCommand:
            true,

        _replyMessage:
            null,

        _commandStartTime:
            Date.now(),

        deferred:
            false,

        replied:
            false,

        ephemeral:
            false,

        webhook:
            null,

        // ----------------------------------------------------
        // Permission getter
        // ----------------------------------------------------

        get memberPermissions() {
            return (
                message.member?.permissions ??
                null
            );
        },

        // ----------------------------------------------------
        // OPTIONS
        // ----------------------------------------------------

        options: {
            // =================================================
            // IMPORTANT:
            // Preserve the original prefix arguments.
            //
            // Commands such as timeout.js use:
            //
            // interaction.options._positional
            //
            // Without this, prefix commands receive an empty
            // argument list even though the parser parsed them.
            // =================================================

            _positional:
                args,

            get(name) {
                return options.get(name);
            },

            getString(name) {
                return options.getString(name);
            },

            getUser(name) {
                return (
                    resolvedUsers.get(
                        name
                    ) ??
                    null
                );
            },

            getMember(name) {
                return (
                    resolvedMembers.get(
                        name
                    ) ??
                    null
                );
            },

            getChannel(name) {
                const raw =
                    options.getString(
                        name
                    );

                if (
                    !raw ||
                    !message.guild
                ) {
                    return null;
                }

                const match =
                    String(raw).match(
                        /^<#(\d+)>$/
                    );

                const channelId =
                    match
                        ? match[1]
                        : String(raw);

                const cached =
                    message.guild.channels.cache.get(
                        channelId
                    );

                if (cached) {
                    return cached;
                }

                return message.guild.channels
                    .fetch(
                        channelId
                    )
                    .catch(
                        () => null
                    );
            },

            getRole(name) {
                const raw =
                    options.getString(
                        name
                    );

                if (
                    !raw ||
                    !message.guild
                ) {
                    return null;
                }

                const match =
                    String(raw).match(
                        /^<@&(\d+)>$/
                    );

                const roleId =
                    match
                        ? match[1]
                        : String(raw);

                const cached =
                    message.guild.roles.cache.get(
                        roleId
                    );

                if (cached) {
                    return cached;
                }

                return message.guild.roles
                    .fetch(
                        roleId
                    )
                    .catch(
                        () => null
                    );
            },

            getInteger(name) {
                return options.getInteger(
                    name
                );
            },

            getBoolean(name) {
                return options.getBoolean(
                    name
                );
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
                    (
                        arg,
                        index
                    ) => ({
                        name:
                            commandJson
                                ?.options?.[
                                index
                            ]?.name ||
                            `arg${index}`,

                        value:
                            arg,

                        type:
                            3,
                    })
                ),
        },

        // ====================================================
        // REPLY
        // ====================================================

        reply:
            async (
                payload
            ) => {
                if (
                    hasReplied &&
                    replyMessage
                ) {
                    return mockInteraction.editReply(
                        payload
                    );
                }

                replyMessage =
                    await message.channel.send(
                        payload
                    );

                hasReplied =
                    true;

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
            async (
                payload
            ) => {
                if (
                    !replyMessage
                ) {
                    replyMessage =
                        await message.channel.send(
                            payload
                        );

                    hasReplied =
                        true;

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
                        payload
                    );

                replyMessage =
                    edited;

                hasReplied =
                    true;

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
            async (
                payload
            ) => {
                return message.channel.send(
                    payload
                );
            },

        // ====================================================
        // DEFER
        // ====================================================

        deferReply:
            async () => {
                mockInteraction.deferred =
                    true;

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
                    replyMessage?.deletable
                ) {
                    await replyMessage.delete();
                }

                replyMessage =
                    null;

                hasReplied =
                    false;

                mockInteraction._replyMessage =
                    null;

                mockInteraction.replied =
                    false;

                mockInteraction.deferred =
                    false;

                return null;
            },
    };

    // ============================================================
    // RESPONSE COORDINATOR
    // ============================================================

    const coordinator =
        ResponseCoordinator.attach(
            mockInteraction,
            {
                message,
            }
        );

    mockInteraction._responseCoordinator =
        coordinator;

    // ============================================================
    // INTERACTION HELPER
    // ============================================================

    try {
        InteractionHelper.patchInteractionResponses(
            mockInteraction
        );
    } catch (error) {
        logger.warn(
            'Failed to patch prefix interaction responses:',
            error
        );
    }

    /*
     * Restore the direct prefix methods after patching.
     *
     * This guarantees prefix commands always send their output
     * to the original message channel.
     */

    mockInteraction.reply =
        async (
            payload
        ) => {
            if (
                hasReplied &&
                replyMessage
            ) {
                return mockInteraction.editReply(
                    payload
                );
            }

            replyMessage =
                await message.channel.send(
                    payload
                );

            hasReplied =
                true;

            mockInteraction.replied =
                true;

            mockInteraction.deferred =
                false;

            mockInteraction._replyMessage =
                replyMessage;

            return replyMessage;
        };

    mockInteraction.editReply =
        async (
            payload
        ) => {
            if (
                !replyMessage
            ) {
                replyMessage =
                    await message.channel.send(
                        payload
                    );

                hasReplied =
                    true;

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
                    payload
                );

            replyMessage =
                edited;

            hasReplied =
                true;

            mockInteraction.replied =
                true;

            mockInteraction.deferred =
                false;

            mockInteraction._replyMessage =
                edited;

            return edited;
        };

    mockInteraction.followUp =
        async (
            payload
        ) => {
            return message.channel.send(
                payload
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
                replyMessage?.deletable
            ) {
                await replyMessage.delete();
            }

            replyMessage =
                null;

            hasReplied =
                false;

            mockInteraction._replyMessage =
                null;

            mockInteraction.replied =
                false;

            mockInteraction.deferred =
                false;

            return null;
        };

    return mockInteraction;
}

// ============================================================
// PREFIX SUPPORT
// ============================================================

export function supportsPrefixExecution(
    command
) {
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
        getCommandName(
            command
        );

    if (
        commandName &&
        SLASH_ONLY_COMMANDS.has(
            commandName
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
    guildConfig = null
) {
    if (!command) {
        logger.warn(
            'executePrefixCommand was called without a command.'
        );

        return;
    }

    if (!message) {
        logger.warn(
            'executePrefixCommand was called without a message.'
        );

        return;
    }

    const commandName =
        getCommandName(
            command
        );

    if (
        isBlacklisted(
            message.author.id
        )
    ) {
        logger.info(
            `Blocked blacklisted user ${message.author.tag} (${message.author.id}) from using prefix command.`
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
                client
            );
        } catch (error) {
            logger.error(
                `Error executing message-based prefix command ${commandName}:`,
                error
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
                args
            );
    } catch (error) {
        logger.error(
            `Failed to create prefix interaction for ${commandName}:`,
            error
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
                }
            );

        if (
            !permissionAllowed
        ) {
            return;
        }

        // ====================================================
        // REQUIRED OPTIONS
        // ====================================================

        const validation =
            mockInteraction.options.validateRequired();

        if (
            !validation.valid
        ) {
            if (
                coordinator &&
                typeof coordinator.respondUsageFromCommand ===
                    'function'
            ) {
                await coordinator.respondUsageFromCommand(
                    prefix,
                    command,
                    validation
                );
            } else {
                await mockInteraction.reply({
                    content:
                        buildPrefixUsage(
                            prefix,
                            command,
                            validation
                        ),
                });
            }

            return;
        }

        // ====================================================
        // PREFIX EXECUTOR
        // ====================================================

        if (
            typeof command.prefixExecute ===
            'function'
        ) {
            await command.prefixExecute(
                mockInteraction,
                guildConfig,
                client
            );

            return;
        }

        // ====================================================
        // NORMAL EXECUTOR
        // ====================================================

        if (
            typeof command.execute ===
            'function'
        ) {
            await command.execute(
                mockInteraction,
                guildConfig,
                client
            );

            return;
        }

        logger.error(
            `Command ${commandName} has no executable handler.`
        );
    } catch (error) {
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
                }
            );
        } catch (
            responseError
        ) {
            logger.error(
                `Failed to send prefix command error for ${commandName}:`,
                responseError
            );

            /*
             * Absolute final fallback so a prefix command never
             * silently fails.
             */
            try {
                if (
                    !mockInteraction.replied
                ) {
                    await message.channel.send(
                        '❌ An error occurred while processing that command.'
                    );
                }
            } catch {
                // Nothing more can be done.
            }
        }
    }
}