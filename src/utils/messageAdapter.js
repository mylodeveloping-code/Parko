// messageAdapter.js

import { mapArgumentsToOptions } from './prefixParser.js';
import { handleInteractionError } from './errorHandler.js';
import { logger } from './logger.js';
import { InteractionHelper } from './interactionHelper.js';
import { SLASH_ONLY_COMMANDS } from '../config/commands/prefixRestrictions.js';
import { getCommandPrefix } from '../config/bot.js';
import {
    ResponseCoordinator,
    buildPrefixUsage,
} from './responseCoordinator.js';
import { enforceDefaultCommandPermissions } from './permissionGuard.js';

export { buildPrefixUsage };

function getCommandJson(commandData) {
    return commandData?.toJSON
        ? commandData.toJSON()
        : commandData;
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

    // Plain Discord ID
    if (/^\d+$/.test(stringValue)) {
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
    args
) {
    const options =
        mapArgumentsToOptions(
            args,
            commandData
        );

    const commandStartTime =
        Date.now();

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
            message.guild?.id ?? null,

        commandName:
            commandData?.name ||
            commandData?.toJSON?.()?.name ||
            null,

        commandId:
            message.id,

        id:
            message.id,

        options: {
            // ------------------------------------------------
            // Generic get
            // ------------------------------------------------

            get: (name) => {
                return options.get(name);
            },

            // ------------------------------------------------
            // String
            // ------------------------------------------------

            getString: (name) => {
                return options.getString(name);
            },

            // ------------------------------------------------
            // USER
            // ------------------------------------------------

            getUser: (name) => {
                const rawValue =
                    options.getUser(name);

                if (!rawValue) {
                    return null;
                }

                const userId =
                    resolveUserId(rawValue);

                if (!userId) {
                    return null;
                }

                // First try the member cache.
                const cachedMember =
                    message.guild?.members?.cache?.get(
                        userId
                    );

                if (cachedMember?.user) {
                    return cachedMember.user;
                }

                // Then try the user cache.
                const cachedUser =
                    message.client?.users?.cache?.get(
                        userId
                    );

                if (cachedUser) {
                    return cachedUser;
                }

                /*
                 * Return a minimal User-like object.
                 *
                 * This is enough for commands that primarily
                 * need the user's ID and tag.
                 */
                return {
                    id: userId,

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

            // ------------------------------------------------
            // MEMBER
            // ------------------------------------------------

            getMember: (name) => {
                const rawValue =
                    options.getUser(name);

                if (!rawValue) {
                    return null;
                }

                const userId =
                    resolveUserId(rawValue);

                if (!userId) {
                    return null;
                }

                /*
                 * Return the cached member if available.
                 */
                const cachedMember =
                    message.guild?.members?.cache?.get(
                        userId
                    );

                if (cachedMember) {
                    return cachedMember;
                }

                /*
                 * IMPORTANT:
                 *
                 * Prefix commands cannot make getMember()
                 * itself async because Discord's real
                 * CommandInteraction API expects getMember()
                 * to be synchronous.
                 *
                 * The untimeout command already has a fallback:
                 *
                 * guild.members.fetch(targetUser.id)
                 *
                 * so returning null here allows that fallback
                 * to run correctly.
                 */
                return null;
            },

            // ------------------------------------------------
            // CHANNEL
            // ------------------------------------------------

            getChannel: (name) => {
                const rawValue =
                    options.getString(name);

                if (!rawValue || !message.guild) {
                    return null;
                }

                const match =
                    String(rawValue).match(
                        /^<#(\d+)>$/
                    );

                const channelId =
                    match
                        ? match[1]
                        : String(rawValue);

                return message.guild.channels
                    .fetch(channelId)
                    .catch(() => null);
            },

            // ------------------------------------------------
            // ROLE
            // ------------------------------------------------

            getRole: (name) => {
                const rawValue =
                    options.getString(name);

                if (!rawValue || !message.guild) {
                    return null;
                }

                const match =
                    String(rawValue).match(
                        /^<@&(\d+)>$/
                    );

                const roleId =
                    match
                        ? match[1]
                        : String(rawValue);

                return message.guild.roles
                    .fetch(roleId)
                    .catch(() => null);
            },

            // ------------------------------------------------
            // INTEGER
            // ------------------------------------------------

            getInteger: (name) => {
                return options.getInteger(name);
            },

            // ------------------------------------------------
            // BOOLEAN
            // ------------------------------------------------

            getBoolean: (name) => {
                return options.getBoolean(name);
            },

            // ------------------------------------------------
            // SUBCOMMAND
            // ------------------------------------------------

            getSubcommand: () => {
                return options.getSubcommand();
            },

            getSubcommandGroup: () => {
                return options.getSubcommandGroup();
            },

            // ------------------------------------------------
            // REQUIRED VALIDATION
            // ------------------------------------------------

            validateRequired: () => {
                return options.validateRequired();
            },

            // ------------------------------------------------
            // HOISTED OPTIONS
            // ------------------------------------------------

            _hoistedOptions:
                args.map(
                    (arg, index) => ({
                        name:
                            commandData
                                ?.options?.[index]
                                ?.name ||
                            `arg${index}`,

                        value:
                            arg,

                        type:
                            3,
                    })
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

        // ----------------------------------------------------
        // REPLY HANDLING
        // ----------------------------------------------------

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

    // ========================================================
    // RESPONSE COORDINATOR
    // ========================================================

    const coordinator =
        ResponseCoordinator.attach(
            mockInteraction,
            {
                message,
            }
        );

    mockInteraction._responseCoordinator =
        coordinator;

    mockInteraction.reply =
        (payload) =>
            coordinator.respond(payload);

    mockInteraction.editReply =
        (payload) =>
            coordinator.edit(payload);

    mockInteraction.followUp =
        (payload) =>
            coordinator.followUp(payload);

    mockInteraction.deferReply =
        () =>
            coordinator.deferLocal();

    // Patch Discord interaction helpers.
    InteractionHelper.patchInteractionResponses(
        mockInteraction
    );

    return mockInteraction;
}

// ============================================================
// PREFIX SUPPORT
// ============================================================

export function supportsPrefixExecution(
    command
) {
    if (
        command.prefixOnly === false ||
        command.slashOnly === true
    ) {
        return false;
    }

    const commandName =
        command.data?.name?.toLowerCase();

    if (
        commandName &&
        SLASH_ONLY_COMMANDS.has(commandName)
    ) {
        return false;
    }

    if (command.prefixExecute) {
        return true;
    }

    return !!command.execute;
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
    const mockInteraction =
        createMockInteraction(
            message,
            command.data,
            args
        );

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
                command.data,
                validation
            );

            return;
        }

        // ====================================================
        // EXECUTE COMMAND
        // ====================================================

        if (command.prefixExecute) {
            await command.prefixExecute(
                mockInteraction,
                guildConfig,
                client
            );
        } else {
            await command.execute(
                mockInteraction,
                guildConfig,
                client
            );
        }
    } catch (error) {
        await handleInteractionError(
            mockInteraction,
            error,
            {
                type:
                    'prefix_command',

                command:
                    command.data?.name,

                source:
                    'messageAdapter.executePrefixCommand',
            }
        );
    }
}
