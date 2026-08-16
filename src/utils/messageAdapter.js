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
        getCommandJson(command?.data);

    return data?.name
        ? String(data.name).toLowerCase()
        : null;
}

// ============================================================
// SLASH ACCESS KEY
// ============================================================

export function resolveSlashAccessKey(
    interaction,
) {
    const subcommandGroup =
        interaction.options.getSubcommandGroup(
            false,
        );

    const subcommand =
        interaction.options.getSubcommand(
            false,
        );

    if (
        subcommandGroup &&
        subcommand
    ) {
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

export function resolvePrefixAccessKey(
    commandData,
    args,
) {
    const options =
        mapArgumentsToOptions(
            args,
            commandData,
        );

    const subcommand =
        options.getSubcommand();

    const subcommandGroup =
        options.getSubcommandGroup();

    const commandName =
        getCommandJson(commandData)?.name;

    if (!commandName) {
        return null;
    }

    if (
        subcommandGroup &&
        subcommand
    ) {
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

    let match =
        stringValue.match(
            /^<@(\d+)>$/,
        );

    if (match) {
        return match[1];
    }

    match =
        stringValue.match(
            /^<@!(\d+)>$/,
        );

    if (match) {
        return match[1];
    }

    if (
        /^\d+$/.test(stringValue)
    ) {
        return stringValue;
    }

    return null;
}

// ============================================================
// CREATE MOCK INTERACTION
// ============================================================

export function createMockInteraction(
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

    const commandStartTime =
        Date.now();

    const mockInteraction = {
        user:
            message.author,

        member:
            message.member,

        get memberPermissions() {
            return (
                message.member?.permissions ??
                null
            );
        },

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

        options: {
            get: (name) => {
                return options.get(name);
            },

            getString: (name) => {
                return options.getString(name);
            },

            getUser: (name) => {
                const rawValue =
                    options.getUser(name);

                if (!rawValue) {
                    return null;
                }

                const userId =
                    resolveUserId(
                        rawValue,
                    );

                if (!userId) {
                    return null;
                }

                const cachedMember =
                    message.guild
                        ?.members
                        ?.cache
                        ?.get(userId);

                if (
                    cachedMember?.user
                ) {
                    return cachedMember.user;
                }

                const cachedUser =
                    message.client
                        ?.users
                        ?.cache
                        ?.get(userId);

                if (cachedUser) {
                    return cachedUser;
                }

                return {
                    id:
                        userId,

                    username:
                        'Unknown User',

                    globalName:
                        null,

                    bot:
                        false,

                    tag:
                        'Unknown User',
                };
            },

            getMember: (name) => {
                const rawValue =
                    options.getUser(name);

                if (!rawValue) {
                    return null;
                }

                const userId =
                    resolveUserId(
                        rawValue,
                    );

                if (!userId) {
                    return null;
                }

                const cachedMember =
                    message.guild
                        ?.members
                        ?.cache
                        ?.get(userId);

                if (cachedMember) {
                    return cachedMember;
                }

                return null;
            },

            getChannel: (name) => {
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

            getRole: (name) => {
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

            getInteger: (name) => {
                return options.getInteger(name);
            },

            getBoolean: (name) => {
                return options.getBoolean(name);
            },

            getSubcommand: () => {
                return options.getSubcommand();
            },

            getSubcommandGroup: () => {
                return options.getSubcommandGroup();
            },

            validateRequired: () => {
                return options.validateRequired();
            },

            _hoistedOptions:
                args.map(
                    (arg, index) => ({
                        name:
                            commandJson
                                ?.options?.[
                                index
                            ]
                                ?.name ||
                            `arg${index}`,

                        value:
                            arg,

                        type:
                            3,
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

        _replyMessage:
            null,

        deleteReply:
            async () => {
                const replyMessage =
                    coordinator.getReplyMessage();

                if (
                    replyMessage?.deletable
                ) {
                    return replyMessage.delete();
                }

                if (
                    message.deletable
                ) {
                    return message.delete();
                }

                return null;
            },

        fetchReply:
            async () => {
                return (
                    coordinator.getReplyMessage() ||
                    message
                );
            },

        ephemeral:
            false,

        webhook:
            null,
    };

    const coordinator =
        ResponseCoordinator.attach(
            mockInteraction,
            {
                message,
            },
        );

    mockInteraction._responseCoordinator =
        coordinator;

    mockInteraction.reply =
        (payload) =>
            coordinator.respond(
                payload,
            );

    mockInteraction.editReply =
        (payload) =>
            coordinator.edit(
                payload,
            );

    mockInteraction.followUp =
        (payload) =>
            coordinator.followUp(
                payload,
            );

    mockInteraction.deferReply =
        () =>
            coordinator.deferLocal();

    InteractionHelper.patchInteractionResponses(
        mockInteraction,
    );

    return mockInteraction;
}

// ============================================================
// PREFIX SUPPORT
// ============================================================

export function supportsPrefixExecution(
    command,
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

    // ========================================================
    // BLACKLIST CHECK
    // ========================================================

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
    // SPECIAL MESSAGE-BASED PREFIX COMMAND
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
    // NORMAL PREFIX COMMANDS
    // ========================================================

    let mockInteraction;

    try {
        mockInteraction =
            createMockInteraction(
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
            await coordinator.respondUsageFromCommand(
                prefix,
                command,
                validation,
            );

            return;
        }

        // ====================================================
        // EXECUTE COMMAND
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