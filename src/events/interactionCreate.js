import { Events, MessageFlags } from 'discord.js';

import { logger } from '../utils/logger.js';

import { getGuildConfig } from '../services/config/guildConfig.js';

import {
    getBotMessage,
    isBotOwner,
    isCommandCategoryEnabled,
} from '../config/bot.js';

import botConfig from '../config/bot.js';

import {
    handleApplicationModal,
} from '../commands/Community/apply.js';

import {
    handleMusicSeekModal,
} from '../handlers/musicButtonHandler.js';

import {
    handleInteractionError,
    createError,
    ErrorTypes,
    ErrorCodes,
} from '../utils/errorHandler.js';

import {
    createInteractionTraceContext,
    runWithTraceContext,
} from '../utils/logger.js';

import {
    validateChatInputPayloadOrThrow,
} from '../utils/commandInputValidation.js';

import {
    enforceAbuseProtection,
    formatCooldownDuration,
} from '../utils/abuseProtection.js';

import {
    isCommandEnabled,
} from '../services/commandAccessService.js';

import {
    resolveSlashAccessKey,
} from '../utils/messageAdapter.js';

import {
    isCollectorManagedComponent,
} from '../utils/collectorComponents.js';

import {
    enforceDefaultCommandPermissions,
} from '../utils/permissionGuard.js';

import {
    isBlacklisted,
} from '../utils/blacklist.js';

// ============================================================
// PB ACCESS
// ============================================================

const PB_ACCESS_ROLE_ID =
    '1537847398746030100';

// ============================================================
// BLACKLIST
// ============================================================

const BLACKLIST_OWNER_ID =
    '1171948174190067737';

const BLACKLIST_MANAGEMENT_COMMANDS =
    new Set([
        'bl',
        'unbl',
    ]);

// ============================================================
// COMMAND ERROR SUBTYPES
// ============================================================

const COMMAND_ERROR_SUBTYPES = {
    warn: 'warn_failed',
    kick: 'kick_failed',
    ban: 'ban_failed',
    unban: 'unban_failed',
    timeout: 'timeout_failed',
    untimeout: 'untimeout_failed',
    warnings: 'warnings_view_failed',
    ticket: 'ticket_failed',
    serverstats: 'serverstats_failed',
    gcreate: 'giveaway_failed',
    gend: 'giveaway_failed',
    gdelete: 'giveaway_failed',
    greroll: 'giveaway_failed',
    youtube: 'youtube_failed',
};

// ============================================================
// TRACE CONTEXT
// ============================================================

function withTraceContext(
    context = {},
    traceContext = {},
) {
    return {
        traceId:
            traceContext?.traceId,

        guildId:
            context.guildId ||
            traceContext?.guildId,

        userId:
            context.userId ||
            traceContext?.userId,

        command:
            context.commandName ||
            traceContext?.command,

        ...context,
    };
}

// ============================================================
// SAFE INTERACTION ACKNOWLEDGEMENT
// ============================================================

async function acknowledgeInteraction(
    interaction,
) {
    if (
        !interaction ||
        !interaction.isChatInputCommand()
    ) {
        return true;
    }

    if (
        interaction.replied ||
        interaction.deferred
    ) {
        return true;
    }

    try {
        /*
         * IMPORTANT:
         *
         * Do not use Ephemeral here.
         *
         * This is only the initial acknowledgement.
         * Individual commands remain responsible for deciding
         * whether their actual response should be ephemeral.
         */

        await interaction.deferReply();

        logger.info(
            `✅ Interaction acknowledged: /${interaction.commandName}`,
        );

        return true;
    } catch (error) {
        logger.error(
            `❌ Failed to acknowledge /${interaction.commandName}:`,
            {
                error:
                    error?.stack ||
                    error?.message ||
                    error,

                code:
                    error?.code,

                interactionId:
                    interaction.id,

                guildId:
                    interaction.guildId,

                userId:
                    interaction.user?.id,
            },
        );

        return false;
    }
}

// ============================================================
// BLACKLIST RESPONSE
// ============================================================

async function respondToBlacklistedUser(
    interaction,
) {
    const embed = {
        title:
            '🚫 You Are Blacklisted',

        description:
            'You are currently **blacklisted from using this bot**.\n\n' +
            'You do not have permission to use any of the bot\'s commands while you are blacklisted.\n\n' +
            'If you believe this was done in error, please contact the bot developer.',

        color: 0xff0000,
    };

    try {
        if (
            interaction.deferred &&
            !interaction.replied
        ) {
            await interaction.editReply({
                embeds: [embed],
            });

            return true;
        }

        if (
            !interaction.replied
        ) {
            await interaction.reply({
                embeds: [embed],
                flags:
                    MessageFlags.Ephemeral,
            });

            return true;
        }

        await interaction.followUp({
            embeds: [embed],
            flags:
                MessageFlags.Ephemeral,
        });

        return true;
    } catch (error) {
        logger.error(
            'Failed to respond to blacklisted user:',
            error,
        );

        return false;
    }
}

// ============================================================
// INTERACTION CREATE
// ============================================================

export default {
    name: Events.InteractionCreate,

    async execute(
        interaction,
        client,
    ) {
        /*
         * ========================================================
         * ABSOLUTE FIRST STEP FOR SLASH COMMANDS
         * ========================================================
         *
         * Do this BEFORE ANY DATABASE, CONFIG, BLACKLIST,
         * TRACE, PERMISSION, OR OTHER WORK.
         *
         * This is the part that prevents:
         *
         * "This application did not respond"
         */

        if (
            interaction.isChatInputCommand()
        ) {
            const commandName =
                String(
                    interaction.commandName ||
                        '',
                ).toLowerCase();

            logger.info(
                `📥 InteractionCreate received /${commandName}`,
            );

            const acknowledged =
                await acknowledgeInteraction(
                    interaction,
                );

            if (!acknowledged) {
                return;
            }
        }

        /*
         * --------------------------------------------------------
         * Build trace context AFTER the interaction is
         * acknowledged.
         * --------------------------------------------------------
         */

        let traceContext;

        try {
            traceContext =
                createInteractionTraceContext(
                    interaction,
                );
        } catch (error) {
            logger.error(
                'Failed to create interaction trace context:',
                error,
            );

            traceContext = {
                traceId:
                    interaction.id,

                guildId:
                    interaction.guildId,

                userId:
                    interaction.user?.id,

                command:
                    interaction.commandName,
            };
        }

        interaction.traceContext =
            traceContext;

        interaction.traceId =
            traceContext.traceId;

        return runWithTraceContext(
            traceContext,
            async () => {
                try {
                    // ==================================================
                    // BLACKLIST
                    // ==================================================

                    if (
                        interaction.user &&
                        isBlacklisted(
                            interaction.user.id,
                        )
                    ) {
                        if (
                            interaction.isChatInputCommand()
                        ) {
                            logger.info(
                                `Blocked blacklisted user ${interaction.user.tag} (${interaction.user.id}) from using /${interaction.commandName}.`,
                            );

                            await respondToBlacklistedUser(
                                interaction,
                            );

                            return;
                        }

                        if (
                            interaction.isAutocomplete() ||
                            interaction.isButton() ||
                            interaction.isStringSelectMenu() ||
                            interaction.isModalSubmit()
                        ) {
                            await respondToBlacklistedUser(
                                interaction,
                            );

                            return;
                        }
                    }

                    // ==================================================
                    // OWNER-ONLY BLACKLIST COMMANDS
                    // ==================================================

                    if (
                        interaction.isChatInputCommand() &&
                        BLACKLIST_MANAGEMENT_COMMANDS.has(
                            interaction.commandName
                                ?.toLowerCase(),
                        ) &&
                        interaction.user.id !==
                            BLACKLIST_OWNER_ID
                    ) {
                        const denial = {
                            embeds: [
                                {
                                    title:
                                        '⛔ Permission Denied',

                                    description:
                                        'Only the bot developer can use the blacklist and unblacklist commands.',

                                    color: 0xff0000,
                                },
                            ],
                        };

                        if (
                            interaction.deferred &&
                            !interaction.replied
                        ) {
                            await interaction.editReply(
                                denial,
                            );
                        } else if (
                            !interaction.replied
                        ) {
                            await interaction.reply({
                                ...denial,

                                flags:
                                    MessageFlags.Ephemeral,
                            });
                        }

                        return;
                    }

                    // ==================================================
                    // CHAT INPUT / SLASH COMMAND
                    // ==================================================

                    if (
                        interaction.isChatInputCommand()
                    ) {
                        const commandName =
                            String(
                                interaction.commandName ||
                                    '',
                            ).toLowerCase();

                        logger.info(
                            `📥 Processing /${commandName}`,
                        );

                        // ==================================================
                        // FIND COMMAND
                        // ==================================================

                        const command =
                            client.commands?.get(
                                commandName,
                            );

                        if (!command) {
                            throw createError(
                                `No command matching ${commandName} was found.`,
                                ErrorTypes.CONFIGURATION,
                                'Sorry, that command does not exist.',
                                withTraceContext(
                                    {
                                        commandName,
                                    },
                                    traceContext,
                                ),
                            );
                        }

                        if (
                            typeof command.execute !==
                            'function'
                        ) {
                            throw createError(
                                `Command ${commandName} has no execute function.`,
                                ErrorTypes.CONFIGURATION,
                                'This command is not configured correctly.',
                                withTraceContext(
                                    {
                                        commandName,
                                    },
                                    traceContext,
                                ),
                            );
                        }

                        // ==================================================
                        // VALIDATE INPUT
                        // ==================================================

                        validateChatInputPayloadOrThrow(
                            interaction,
                            withTraceContext(
                                {
                                    type:
                                        'command_input_validation',

                                    commandName,
                                },
                                traceContext,
                            ),
                        );

                        // ==================================================
                        // MAINTENANCE
                        // ==================================================

                        if (
                            botConfig &&
                            isMaintenanceModeSafe() &&
                            !isBotOwner(
                                interaction.user.id,
                            )
                        ) {
                            throw createError(
                                'Bot is in maintenance mode',
                                ErrorTypes.CONFIGURATION,
                                getBotMessage(
                                    'maintenanceMode',
                                ),
                                withTraceContext(
                                    {
                                        commandName,
                                    },
                                    traceContext,
                                ),
                            );
                        }

                        // ==================================================
                        // CATEGORY
                        // ==================================================

                        if (
                            !isCommandCategoryEnabled(
                                command.category,
                            )
                        ) {
                            throw createError(
                                `Feature disabled for category ${command.category}`,
                                ErrorTypes.CONFIGURATION,
                                getBotMessage(
                                    'commandDisabled',
                                ),
                                withTraceContext(
                                    {
                                        commandName,
                                        category:
                                            command.category,
                                    },
                                    traceContext,
                                ),
                            );
                        }

                        // ==================================================
                        // DEFAULT COOLDOWN
                        // ==================================================

                        const defaultCooldownSec =
                            Number(
                                botConfig.commands
                                    ?.defaultCooldown,
                            ) || 0;

                        if (
                            defaultCooldownSec >
                                0 &&
                            !isBotOwner(
                                interaction.user.id,
                            )
                        ) {
                            const cooldownKey =
                                `${interaction.user.id}:${commandName}`;

                            const expiresAt =
                                client.cooldowns?.get(
                                    cooldownKey,
                                );

                            if (
                                expiresAt &&
                                Date.now() <
                                    expiresAt
                            ) {
                                const remainingSec =
                                    Math.ceil(
                                        (expiresAt -
                                            Date.now()) /
                                            1000,
                                    );

                                throw createError(
                                    `Default command cooldown active for ${commandName}`,
                                    ErrorTypes.RATE_LIMIT,
                                    getBotMessage(
                                        'cooldownActive',
                                        {
                                            time:
                                                `${remainingSec}s`,
                                        },
                                    ),
                                    withTraceContext(
                                        {
                                            commandName,
                                            remainingSec,
                                        },
                                        traceContext,
                                    ),
                                );
                            }

                            client.cooldowns?.set(
                                cooldownKey,
                                Date.now() +
                                    defaultCooldownSec *
                                        1000,
                            );
                        }

                        // ==================================================
                        // ABUSE PROTECTION
                        // ==================================================

                        const abuseProtection =
                            await enforceAbuseProtection(
                                interaction,
                                command,
                                commandName,
                            );

                        if (
                            !abuseProtection.allowed
                        ) {
                            const formattedCooldown =
                                formatCooldownDuration(
                                    abuseProtection.remainingMs,
                                );

                            throw createError(
                                `Risky command cooldown active for ${commandName}`,
                                ErrorTypes.RATE_LIMIT,
                                `This command is on cooldown. Please wait ${formattedCooldown} before trying again.`,
                                withTraceContext(
                                    {
                                        commandName,

                                        subtype:
                                            'command_cooldown',

                                        expected:
                                            true,

                                        cooldownMs:
                                            abuseProtection.remainingMs,

                                        cooldownWindowMs:
                                            abuseProtection.policy
                                                ?.windowMs,

                                        cooldownMaxAttempts:
                                            abuseProtection.policy
                                                ?.maxAttempts,
                                    },
                                    traceContext,
                                ),
                            );
                        }

                        // ==================================================
                        // GUILD CONFIG
                        // ==================================================

                        let guildConfig =
                            null;

                        if (
                            interaction.guild
                        ) {
                            guildConfig =
                                await getGuildConfig(
                                    client,
                                    interaction.guild.id,
                                    traceContext,
                                );

                            const accessKey =
                                resolveSlashAccessKey(
                                    interaction,
                                );

                            const enabled =
                                await isCommandEnabled(
                                    client,
                                    interaction.guild.id,
                                    accessKey,
                                    command.category,
                                );

                            if (!enabled) {
                                throw createError(
                                    `Command ${accessKey} is disabled in this guild`,
                                    ErrorTypes.CONFIGURATION,
                                    'This command has been disabled for this server.',
                                    withTraceContext(
                                        {
                                            commandName:
                                                accessKey,

                                            guildId:
                                                interaction.guild.id,
                                        },
                                        traceContext,
                                    ),
                                );
                            }
                        }

                        // ==================================================
                        // PB ACCESS
                        // ==================================================

                        const hasPBAccess =
                            interaction.member?.roles?.cache?.has(
                                PB_ACCESS_ROLE_ID,
                            ) ?? false;

                        if (
                            !hasPBAccess
                        ) {
                            const permissionAllowed =
                                await enforceDefaultCommandPermissions(
                                    interaction,
                                    command,
                                    {
                                        source:
                                            'interactionCreate',

                                        guildConfig,
                                    },
                                );

                            if (
                                !permissionAllowed
                            ) {
                                return;
                            }
                        } else {
                            logger.info(
                                `PB Access permission override: ${interaction.user.tag} used /${commandName}`,
                            );
                        }

                        // ==================================================
                        // EXECUTE
                        // ==================================================

                        logger.info(
                            `▶️ Executing /${commandName}...`,
                        );

                        await command.execute(
                            interaction,
                            guildConfig,
                            client,
                        );

                        logger.info(
                            `✅ Finished executing /${commandName}.`,
                        );

                        /*
                         * A command may complete without sending a
                         * response. Since we already acknowledged the
                         * interaction, make sure the user still sees
                         * something instead of an indefinite-looking
                         * interaction.
                         */

                        if (
                            interaction.deferred &&
                            !interaction.replied
                        ) {
                            await interaction.editReply({
                                content:
                                    '✅ Command completed successfully.',
                            });
                        }

                        return;
                    }

                    // ========================================================
                    // AUTOCOMPLETE
                    // ========================================================

                    if (
                        interaction.isAutocomplete()
                    ) {
                        const command =
                            client.commands?.get(
                                String(
                                    interaction.commandName ||
                                        '',
                                ).toLowerCase(),
                            );

                        if (
                            command?.autocomplete
                        ) {
                            try {
                                await command.autocomplete(
                                    interaction,
                                    client,
                                );
                            } catch (error) {
                                logger.error(
                                    'Error handling command autocomplete:',
                                    error,
                                );

                                await interaction
                                    .respond([])
                                    .catch(
                                        () => {},
                                    );
                            }

                            return;
                        }

                        await interaction
                            .respond([])
                            .catch(
                                () => {},
                            );

                        return;
                    }

                    // ========================================================
                    // BUTTONS
                    // ========================================================

                    if (
                        interaction.isButton()
                    ) {
                        const [
                            customId,
                            ...args
                        ] =
                            interaction.customId.split(
                                ':',
                            );

                        const button =
                            client.buttons?.get(
                                customId,
                            );

                        if (
                            !button
                        ) {
                            if (
                                !interaction.customId.includes(
                                    ':',
                                ) ||
                                isCollectorManagedComponent(
                                    customId,
                                )
                            ) {
                                return;
                            }

                            throw createError(
                                `No button handler found for ${customId}`,
                                ErrorTypes.CONFIGURATION,
                                'This button is not available.',
                            );
                        }

                        await button.execute(
                            interaction,
                            client,
                            args,
                        );

                        return;
                    }

                    // ========================================================
                    // STRING SELECT MENUS
                    // ========================================================

                    if (
                        interaction.isStringSelectMenu()
                    ) {
                        const [
                            customId,
                            ...args
                        ] =
                            interaction.customId.split(
                                ':',
                            );

                        const selectMenu =
                            client.selectMenus?.get(
                                customId,
                            );

                        if (
                            !selectMenu
                        ) {
                            if (
                                !interaction.customId.includes(
                                    ':',
                                ) ||
                                isCollectorManagedComponent(
                                    customId,
                                )
                            ) {
                                return;
                            }

                            throw createError(
                                `No select menu handler found for ${customId}`,
                                ErrorTypes.CONFIGURATION,
                                'This select menu is not available.',
                            );
                        }

                        await selectMenu.execute(
                            interaction,
                            client,
                            args,
                        );

                        return;
                    }

                    // ========================================================
                    // MODALS
                    // ========================================================

                    if (
                        interaction.isModalSubmit()
                    ) {
                        if (
                            interaction.customId ===
                            'music_seek_modal'
                        ) {
                            await handleMusicSeekModal(
                                interaction,
                                client,
                            );

                            return;
                        }

                        if (
                            interaction.customId.startsWith(
                                'app_modal_',
                            )
                        ) {
                            await handleApplicationModal(
                                interaction,
                            );

                            return;
                        }

                        if (
                            interaction.customId.startsWith(
                                'app_review_',
                            ) ||
                            interaction.customId.startsWith(
                                'jtc_',
                            ) ||
                            interaction.customId.startsWith(
                                'config_wizard_modal:',
                            ) ||
                            interaction.customId.startsWith(
                                'log_dash_channel_modal:',
                            ) ||
                            interaction.customId.startsWith(
                                'log_dash_filter_modal:',
                            )
                        ) {
                            return;
                        }

                        const [
                            customId,
                            ...args
                        ] =
                            interaction.customId.split(
                                ':',
                            );

                        const modal =
                            client.modals?.get(
                                customId,
                            );

                        if (
                            !modal
                        ) {
                            if (
                                !interaction.customId.includes(
                                    ':',
                                )
                            ) {
                                return;
                            }

                            throw createError(
                                `No modal handler found for ${customId}`,
                                ErrorTypes.CONFIGURATION,
                                'This form is not available.',
                            );
                        }

                        await modal.execute(
                            interaction,
                            client,
                            args,
                        );

                        return;
                    }
                } catch (error) {
                    logger.error(
                        '❌ Unhandled interaction error:',
                        {
                            event:
                                'interaction.unhandled_error',

                            errorCode:
                                ErrorCodes.INTERACTION_UNHANDLED,

                            error:
                                error?.stack ||
                                error?.message ||
                                error,

                            traceId:
                                traceContext.traceId,

                            interactionId:
                                interaction.id,

                            guildId:
                                interaction.guildId,

                            userId:
                                interaction.user?.id,

                            commandName:
                                interaction.commandName,
                        },
                    );

                    /*
                     * The interaction has already been acknowledged
                     * for slash commands, so handleInteractionError()
                     * must edit the existing response rather than
                     * attempting a second initial reply.
                     */

                    try {
                        await handleInteractionError(
                            interaction,
                            error,
                            withTraceContext(
                                {
                                    type:
                                        interaction.isChatInputCommand()
                                            ? 'command'
                                            : 'interaction',

                                    commandName:
                                        interaction.commandName,

                                    customId:
                                        interaction.customId,

                                    subtype:
                                        COMMAND_ERROR_SUBTYPES[
                                            interaction.commandName
                                        ] ||
                                        error?.context
                                            ?.subtype,

                                    source:
                                        'interactionCreate',
                                },
                                traceContext,
                            ),
                        );
                    } catch (
                        replyError
                    ) {
                        logger.error(
                            'Failed to send interaction error response:',
                            replyError,
                        );

                        if (
                            interaction.isChatInputCommand() &&
                            interaction.deferred &&
                            !interaction.replied
                        ) {
                            try {
                                await interaction.editReply({
                                    content:
                                        '❌ An error occurred while processing this command.',
                                });
                            } catch (
                                finalError
                            ) {
                                logger.error(
                                    '❌ Final interaction fallback failed:',
                                    finalError,
                                );
                            }
                        }
                    }
                }
            },
        );
    },
};

// ============================================================
// SAFE MAINTENANCE CHECK
// ============================================================

function isMaintenanceModeSafe() {
    try {
        const config =
            botConfig?.maintenanceMode;

        if (
            typeof config === 'boolean'
        ) {
            return config;
        }

        if (
            typeof config?.enabled ===
            'boolean'
        ) {
            return config.enabled;
        }

        return false;
    } catch {
        return false;
    }
}