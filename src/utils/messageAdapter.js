import { mapArgumentsToOptions } from './prefixParser.js';
import { handleInteractionError } from './errorHandler.js';
import { logger } from './logger.js';
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
    const options =
        mapArgumentsToOptions(args, commandData);

    const subcommand =
        options.getSubcommand();

    const subcommandGroup =
        options.getSubcommandGroup();

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

    // Discord.js User / GuildMember
    if (
        typeof value === 'object' &&
        value.id
    ) {
        return String(value.id);
    }

    const stringValue =
        String(value).trim();

    // <@123456789>
    let match =
        stringValue.match(/^<@(\d+)>$/);

    if (match) {
        return match[1];
    }

    // <@!123456789>
    match =
        stringValue.match(/^<@!(\d+)>$/);

    if (match) {
        return match[1];
    }

    // Raw Discord ID
    if (/^\d+$/.test(stringValue)) {
        return stringValue;
    }

    return null;
}

// ============================================================
// FIND RAW PREFIX ARGUMENT
//
// This is important because prefixParser.js may not expose
// user arguments through options.getUser() in the same way
// Discord's real SlashCommandInteraction does.
// ============================================================

function getRawArgument(
    args,
    commandData,
    optionName,
) {
    const commandJson =
        getCommandJson(commandData);

    const commandOptions =
        commandJson?.options || [];

    const optionIndex =
        commandOptions.findIndex(
            (option) =>
                option?.name === optionName,
        );

    if (
        optionIndex >= 0 &&
        args?.[optionIndex] !== undefined
    ) {
        return args[optionIndex];
    }

    return null;
}

// ============================================================
// RESOLVE USER
// ============================================================

function resolveUser(
    message,
    rawValue,
) {
    if (!rawValue) {
        return null;
    }

    // Already a GuildMember
    if (
        typeof rawValue === 'object' &&
        rawValue.id &&
        rawValue.user
    ) {
        return rawValue.user;
    }

    // Already a Discord.js User
    if (
        typeof rawValue === 'object' &&
        rawValue.id
    ) {
        return rawValue;
    }

    const userId =
        resolveUserId(rawValue);

    if (!userId) {
        return null;
    }

    // Guild member cache
    const cachedMember =
        message.guild?.members?.cache?.get(
            userId,
        );

    if (cachedMember?.user) {
        return cachedMember.user;
    }

    // Client user cache
    const cachedUser =
        message.client?.users?.cache?.get(
            userId,
        );

    if (cachedUser) {
        return cachedUser;
    }

    return null;
}

// ============================================================
// RESOLVE MEMBER
// ============================================================

function resolveMember(
    message,
    rawValue,
) {
    if (!rawValue) {
        return null;
    }

    // Already a GuildMember
    if (
        typeof rawValue === 'object' &&
        rawValue.id &&
        rawValue.user
    ) {
        return rawValue;
    }

    const userId =
        resolveUserId(rawValue);

    if (!userId || !message.guild) {
        return null;
    }

    return (
        message.guild.members.cache.get(
            userId,
        ) || null
    );
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

            // ==================================================
            // GET USER
            // ==================================================

            getUser: (name) => {
                /*
                 * First try the parser's value.
                 */
                let rawValue = null;

                try {
                    rawValue =
                        options.getUser(name);
                } catch {
                    rawValue = null;
                }

                /*
                 * If that doesn't work, get the original
                 * prefix argument directly.
                 */
                if (!rawValue) {
                    rawValue =
                        getRawArgument(
                            args,
                            commandData,
                            name,
                        );
                }

                /*
                 * If still unavailable, try generic get().
                 */
                if (!rawValue) {
                    try {
                        rawValue =
                            options.get(name);
                    } catch {
                        rawValue = null;
                    }
                }

                return resolveUser(
                    message,
                    rawValue,
                );
            },

            // ==================================================
            // GET MEMBER
            // ==================================================

            getMember: (name) => {
                let rawValue = null;

                try {
                    rawValue =
                        options.getUser(name);
                } catch {
                    rawValue = null;
                }

                if (!rawValue) {
                    rawValue =
                        getRawArgument(
                            args,
                            commandData,
                            name,
                        );
                }

                if (!rawValue) {
                    try {
                        rawValue =
                            options.get(name);
                    } catch {
                        rawValue = null;
                    }
                }

                return resolveMember(
                    message,
                    rawValue,
                );
            },

            // ==================================================
            // GET CHANNEL
            // ==================================================

            getChannel: (name) => {
                let rawValue =
                    options.getString(name);

                if (!rawValue) {
                    rawValue =
                        getRawArgument(
                            args,
                            commandData,
                            name,
                        );
                }

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

            // ==================================================
            // GET ROLE
            // ==================================================

            getRole: (name) => {
                let rawValue =
                    options.getString(name);

                if (!rawValue) {
                    rawValue =
                        getRawArgument(
                            args,
                            commandData,
                            name,
                        );
                }

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

            // ==================================================
            // GET INTEGER
            // ==================================================

            getInteger: (name) => {
                return options.getInteger(name);
            },

            // ==================================================
            // GET BOOLEAN
            // ==================================================

            getBoolean: (name) => {
                return options.getBoolean(name);
            },

            // ==================================================
            // SUBCOMMANDS
            // ==================================================

            getSubcommand: () => {
                return options.getSubcommand();
            },

            getSubcommandGroup: () => {
                return options.getSubcommandGroup();
            },

            // ==================================================
            // REQUIRED VALIDATION
            // ==================================================

            validateRequired: () => {
                return options.validateRequired();
            },

            // ==================================================
            // HOISTED OPTIONS
            // ==================================================

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
    // CREATE MOCK INTERACTION
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
        // EXECUTE PREFIX HANDLER
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

        // ====================================================
        // FALLBACK TO NORMAL EXECUTE
        // ====================================================

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
