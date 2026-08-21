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

export { buildPrefixUsage };

function getCommandJson(commandData) {
    if (
        commandData &&
        typeof commandData.toJSON === 'function'
    ) {
        return commandData.toJSON();
    }

    return commandData || {};
}

function getCommandName(command) {
    const data =
        getCommandJson(command?.data);

    return data?.name
        ? String(data.name).toLowerCase()
        : null;
}

export function resolveSlashAccessKey(interaction) {
    const group =
        interaction.options.getSubcommandGroup(
            false,
        );

    const subcommand =
        interaction.options.getSubcommand(false);

    if (group && subcommand) {
        return `${interaction.commandName} ${group} ${subcommand}`;
    }

    if (subcommand) {
        return `${interaction.commandName} ${subcommand}`;
    }

    return interaction.commandName;
}

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

    const group =
        options.getSubcommandGroup();

    const commandName =
        getCommandJson(commandData)?.name;

    if (!commandName) {
        return null;
    }

    if (group && subcommand) {
        return `${commandName} ${group} ${subcommand}`;
    }

    if (subcommand) {
        return `${commandName} ${subcommand}`;
    }

    return commandName;
}

function resolveUserId(value) {
    if (!value) {
        return null;
    }

    const stringValue =
        String(value).trim();

    const mention =
        stringValue.match(
            /^<@!?(\d+)>$/,
        );

    if (mention) {
        return mention[1];
    }

    if (/^\d+$/.test(stringValue)) {
        return stringValue;
    }

    return null;
}

async function resolvePrefixUser(
    message,
    rawValue,
) {
    const userId =
        resolveUserId(rawValue);

    if (!userId) {
        return null;
    }

    const cachedMember =
        message.guild?.members?.cache?.get(
            userId,
        );

    if (cachedMember?.user) {
        return cachedMember.user;
    }

    const cachedUser =
        message.client?.users?.cache?.get(
            userId,
        );

    if (cachedUser) {
        return cachedUser;
    }

    try {
        return await message.client.users.fetch(
            userId,
        );
    } catch {
        return null;
    }
}

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

    const resolvedUsers = new Map();

    const commandOptions =
        commandJson?.options || [];

    async function resolveUserOption(
        optionDef,
    ) {
        if (optionDef?.type !== 6) {
            return;
        }

        const raw =
            options.getUser(
                optionDef.name,
            );

        if (!raw) {
            return;
        }

        const user =
            await resolvePrefixUser(
                message,
                raw,
            );

        if (user) {
            resolvedUsers.set(
                optionDef.name,
                user,
            );
        }
    }

    for (const option of commandOptions) {
        await resolveUserOption(option);

        if (option.type === 1) {
            for (
                const subOption
                of option.options || []
            ) {
                await resolveUserOption(
                    subOption,
                );
            }
        }

        if (option.type === 2) {
            for (
                const group
                of option.options || []
            ) {
                for (
                    const subOption
                    of group.options || []
                ) {
                    await resolveUserOption(
                        subOption,
                    );
                }
            }
        }
    }

    let replyMessage = null;

    const mockInteraction = {
        user: message.author,
        member: message.member,
        channel: message.channel,
        guild: message.guild,
        guildId:
            message.guild?.id ?? null,

        commandName:
            commandJson?.name ?? null,

        commandId: message.id,
        id: message.id,

        createdTimestamp:
            message.createdTimestamp,

        createdAt:
            message.createdAt,

        client: message.client,

        _isPrefixCommand: true,
        _replyMessage: null,
        _commandStartTime: Date.now(),

        deferred: false,
        replied: false,
        ephemeral: false,
        webhook: null,

        get memberPermissions() {
            return (
                message.member?.permissions ??
                null
            );
        },

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

                if (
                    !user ||
                    !message.guild
                ) {
                    return null;
                }

                return (
                    message.guild.members.cache.get(
                        user.id,
                    ) ?? null
                );
            },

            getChannel(name) {
                const raw =
                    options.getString(name);

                if (
                    !raw ||
                    !message.guild
                ) {
                    return null;
                }

                const match =
                    String(raw).match(
                        /^<#(\d+)>$/,
                    );

                const channelId =
                    match
                        ? match[1]
                        : String(raw);

                return message.guild.channels
                    .fetch(channelId)
                    .catch(() => null);
            },

            getRole(name) {
                const raw =
                    options.getString(name);

                if (
                    !raw ||
                    !message.guild
                ) {
                    return null;
                }

                const match =
                    String(raw).match(
                        /^<@&(\d+)>$/,
                    );

                const roleId =
                    match
                        ? match[1]
                        : String(raw);

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
                                ?.options?.[
                                index
                            ]?.name ||
                            `arg${index}`,

                        value: arg,
                        type: 3,
                    }),
                ),
        },

        reply: async (payload) => {
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

            mockInteraction._replyMessage =
                replyMessage;

            return replyMessage;
        },

        editReply: async (payload) => {
            if (!replyMessage) {
                return mockInteraction.reply(
                    payload,
                );
            }

            replyMessage =
                await replyMessage.edit(
                    payload,
                );

            mockInteraction.replied =
                true;

            mockInteraction._replyMessage =
                replyMessage;

            return replyMessage;
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
                replyMessage?.deletable
            ) {
                await replyMessage.delete();
            }

            replyMessage = null;

            mockInteraction._replyMessage =
                null;

            mockInteraction.replied =
                false;

            return null;
        },
    };

    ResponseCoordinator.attach(
        mockInteraction,
        { message },
    );

    InteractionHelper.patchInteractionResponses(
        mockInteraction,
    );

    return mockInteraction;
}

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

    return (
        typeof command.messageExecute ===
            'function' ||
        typeof command.prefixExecute ===
            'function' ||
        typeof command.execute ===
            'function'
    );
}

export async function executePrefixCommand(
    command,
    message,
    args,
    client,
    prefixOverride = null,
    guildConfig = null,
) {
    if (!command || !message) {
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

        const validation =
            mockInteraction.options.validateRequired();

        if (!validation.valid) {
            if (
                coordinator?.respondUsageFromCommand
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
                type: 'prefix_command',
                command: commandName,
                source:
                    'messageAdapter.executePrefixCommand',
            },
        );
    }
}