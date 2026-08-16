import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import { successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';

import {
    replyUserError,
    ErrorTypes,
} from '../../utils/errorHandler.js';

// Discord's maximum slowmode is 6 hours.
const MAX_SLOWMODE_SECONDS = 6 * 60 * 60;

// ============================================================
// PARSE DURATION
// ============================================================

function parseDuration(value) {
    if (!value) {
        return null;
    }

    const input =
        String(value)
            .trim()
            .toLowerCase();

    if (input === 'off' || input === 'disable') {
        return 0;
    }

    /*
     * Supported:
     *
     * 10s = 10 seconds
     * 1m  = 1 minute
     * 1h  = 1 hour
     * 1d  = 1 day
     */

    const match =
        input.match(/^(\d+(?:\.\d+)?)(s|m|h|d)$/);

    if (!match) {
        return null;
    }

    const amount =
        Number(match[1]);

    const unit =
        match[2];

    if (!Number.isFinite(amount) || amount <= 0) {
        return null;
    }

    let seconds;

    switch (unit) {
        case 's':
            seconds = amount;
            break;

        case 'm':
            seconds = amount * 60;
            break;

        case 'h':
            seconds = amount * 60 * 60;
            break;

        case 'd':
            seconds = amount * 60 * 60 * 24;
            break;

        default:
            return null;
    }

    if (!Number.isFinite(seconds)) {
        return null;
    }

    if (!Number.isInteger(seconds)) {
        return null;
    }

    return seconds;
}

// ============================================================
// FORMAT DURATION
// ============================================================

function formatDuration(seconds) {
    if (seconds === 0) {
        return 'off';
    }

    if (seconds < 60) {
        return `${seconds} second${seconds === 1 ? '' : 's'}`;
    }

    if (seconds < 60 * 60) {
        const minutes =
            seconds / 60;

        return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    }

    const hours =
        seconds / (60 * 60);

    return `${hours} hour${hours === 1 ? '' : 's'}`;
}

// ============================================================
// COMMAND
// ============================================================

export default {
    data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set the slowmode for the current channel')
        .addStringOption((option) =>
            option
                .setName('duration')
                .setDescription(
                    'Duration such as 10s, 1m, 1h, or off'
                )
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageChannels
        ),

    category: 'moderation',

    abuseProtection: {
        maxAttempts: 10,
        windowMs: 60_000,
    },

    // ========================================================
    // /slowmode
    // ========================================================

    async execute(interaction, config, client) {
        const channel =
            interaction.channel;

        if (!interaction.guild || !channel) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message:
                    'This command can only be used in a server.',
            });
        }

        const durationInput =
            interaction.options.getString('duration');

        const seconds =
            parseDuration(durationInput);

        // ====================================================
        // INVALID FORMAT
        // ====================================================

        if (seconds === null) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message:
                    'Invalid duration. Use a format such as `10s`, `1m`, `1h`, or `1d`. Use `off` to disable slowmode.',
            });
        }

        // ====================================================
        // DISCORD MAXIMUM
        // ====================================================

        if (
            seconds >
            MAX_SLOWMODE_SECONDS
        ) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message:
                    'Discord only allows slowmode up to **6 hours**. Please use a duration between `1s` and `6h`.',
            });
        }

        // ====================================================
        // BOT PERMISSION
        // ====================================================

        const botMember =
            interaction.guild.members.me;

        if (
            !botMember ||
            !botMember.permissionsIn(channel).has(
                PermissionFlagsBits.ManageChannels
            )
        ) {
            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message:
                    'I need the **Manage Channels** permission in this channel to change slowmode.',
            });
        }

        try {
            const previousSeconds =
                channel.rateLimitPerUser || 0;

            // ==================================================
            // NO CHANGE
            // ==================================================

            if (
                previousSeconds === seconds
            ) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message:
                        seconds === 0
                            ? 'Slowmode is already disabled in this channel.'
                            : `Slowmode is already set to **${formatDuration(seconds)}**.`,
                });
            }

            // ==================================================
            // SET SLOWMODE
            // ==================================================

            await channel.setRateLimitPerUser(
                seconds,
                `Slowmode changed by ${interaction.user.tag}`
            );

            // ==================================================
            // LOG
            // ==================================================

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action:
                        seconds === 0
                            ? 'Slowmode Disabled'
                            : 'Slowmode Updated',

                    target:
                        `${channel.name} (${channel.id})`,

                    executor:
                        `${interaction.user.tag} (${interaction.user.id})`,

                    reason:
                        seconds === 0
                            ? 'Slowmode disabled manually.'
                            : `Slowmode set to ${formatDuration(seconds)}.`,

                    metadata: {
                        channelId:
                            channel.id,

                        moderatorId:
                            interaction.user.id,

                        previousSlowmode:
                            previousSeconds,

                        newSlowmode:
                            seconds,

                        duration:
                            seconds === 0
                                ? 'off'
                                : formatDuration(seconds),

                        commandType:
                            interaction._isPrefixCommand
                                ? 'prefix'
                                : 'slash',
                    },
                },
            });

            // ==================================================
            // RESPONSE
            // ==================================================

            const embed =
                seconds === 0
                    ? successEmbed(
                        'Slowmode Disabled',
                        `Slowmode has been disabled in ${channel}.`
                    )
                    : successEmbed(
                        'Slowmode Updated',
                        `Slowmode has been set to **${formatDuration(seconds)}** in ${channel}.`
                    );

            await interaction.reply({
                embeds: [embed],
            });
        } catch (error) {
            logger.error(
                'Slowmode command error:',
                error
            );

            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message:
                    'I could not change the slowmode for this channel. Make sure I have **Manage Channels** permission.',
            });
        }
    },
};
