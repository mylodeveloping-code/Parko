import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import {
    warningEmbed,
} from '../../utils/embeds.js';

import {
    logger,
} from '../../utils/logger.js';

import {
    TitanBotError,
    ErrorTypes,
} from '../../utils/errorHandler.js';

import {
    InteractionHelper,
} from '../../utils/interactionHelper.js';

import {
    ModerationService,
} from '../../services/moderation/moderationService.js';

import {
    isModerationExempt,
    resolveModerationTarget,
} from '../../utils/moderation.js';

// ============================================================
// SLASH COMMAND DURATIONS
// ============================================================

const durationChoices = [
    { name: '5 minutes', value: 5 },
    { name: '10 minutes', value: 10 },
    { name: '30 minutes', value: 30 },
    { name: '1 hour', value: 60 },
    { name: '6 hours', value: 360 },
    { name: '1 day', value: 1440 },
    { name: '1 week', value: 10080 },
];

// ============================================================
// PREFIX DURATION PARSER
// ============================================================
//
// Supported:
//
// 5m
// 10m
// 30m
// 1h
// 6h
// 24h
// 1d
// 1w
//
// Also accepts plain minutes:
//
// 10
//
// ============================================================

function parsePrefixDuration(value) {
    if (!value) {
        return null;
    }

    const input =
        String(value)
            .trim()
            .toLowerCase();

    // Plain number = minutes.
    if (/^\d+$/.test(input)) {
        const minutes =
            Number(input);

        if (
            !Number.isFinite(minutes) ||
            minutes <= 0
        ) {
            return null;
        }

        return {
            minutes,
            display:
                formatDurationDisplay(minutes),
        };
    }

    const match =
        input.match(
            /^(\d+(?:\.\d+)?)(m|h|d|w)$/
        );

    if (!match) {
        return null;
    }

    const amount =
        Number(match[1]);

    const unit =
        match[2];

    if (
        !Number.isFinite(amount) ||
        amount <= 0
    ) {
        return null;
    }

    let minutes;

    switch (unit) {
        case 'm':
            minutes =
                amount;
            break;

        case 'h':
            minutes =
                amount * 60;
            break;

        case 'd':
            minutes =
                amount * 1440;
            break;

        case 'w':
            minutes =
                amount * 10080;
            break;

        default:
            return null;
    }

    if (
        !Number.isFinite(minutes) ||
        minutes <= 0
    ) {
        return null;
    }

    if (
        !Number.isInteger(minutes)
    ) {
        minutes =
            Math.floor(minutes);
    }

    return {
        minutes,
        display:
            formatDurationDisplay(minutes),
    };
}

// ============================================================
// DURATION DISPLAY
// ============================================================

function formatDurationDisplay(minutes) {
    if (minutes % 10080 === 0) {
        const weeks =
            minutes / 10080;

        return `${weeks} week${weeks === 1 ? '' : 's'}`;
    }

    if (minutes % 1440 === 0) {
        const days =
            minutes / 1440;

        return `${days} day${days === 1 ? '' : 's'}`;
    }

    if (minutes % 60 === 0) {
        const hours =
            minutes / 60;

        return `${hours} hour${hours === 1 ? '' : 's'}`;
    }

    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

// ============================================================
// RESOLVE PREFIX USER
// ============================================================

async function resolvePrefixTarget(
    interaction,
    rawTarget
) {
    if (!rawTarget) {
        return null;
    }

    const input =
        String(rawTarget).trim();

    const mentionMatch =
        input.match(
            /^<@!?(\d+)>$/
        );

    const userId =
        mentionMatch
            ? mentionMatch[1]
            : /^\d+$/.test(input)
                ? input
                : null;

    if (!userId) {
        return null;
    }

    return (
        interaction.guild.members
            .fetch(userId)
            .catch(() => null)
    );
}

// ============================================================
// COMMAND
// ============================================================

export default {
    data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription(
            'Timeout a user for a specific duration.'
        )

        .addUserOption((option) =>
            option
                .setName('target')
                .setDescription(
                    'User to timeout'
                )
                .setRequired(true)
        )

        .addIntegerOption((option) =>
            option
                .setName('duration')
                .setDescription(
                    'Duration of the timeout in minutes'
                )
                .setRequired(true)
                .addChoices(
                    ...durationChoices
                )
        )

        .addStringOption((option) =>
            option
                .setName('reason')
                .setDescription(
                    'Reason for the timeout'
                )
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.ModerateMembers
        ),

    category: 'moderation',

    // ========================================================
    // PREFIX COMMAND
    // ========================================================
    //
    // This allows:
    //
    // >mute USER 10m test
    // >mute USER 1h test
    // >mute USER 1d test
    // >mute USER 10 test
    //
    // ========================================================

    async prefixExecute(
        interaction,
        config,
        client
    ) {
        const rawArgs =
            interaction.options?._positional || [];

        const targetInput =
            rawArgs[0];

        const durationInput =
            rawArgs[1];

        const reason =
            rawArgs
                .slice(2)
                .join(' ')
                .trim() ||
            'No reason provided';

        // ================================================
        // TARGET
        // ================================================

        const member =
            await resolvePrefixTarget(
                interaction,
                targetInput
            );

        if (!member) {
            await interaction.reply({
                content:
                    '❌ I could not find that user in this server.\n\n' +
                    'Usage: `>mute <user ID/@mention> <duration> [reason]`',
            });

            return;
        }

        const targetUser =
            member.user;

        // ================================================
        // DURATION
        // ================================================

        const parsedDuration =
            parsePrefixDuration(
                durationInput
            );

        if (!parsedDuration) {
            await interaction.reply({
                content:
                    '❌ Invalid timeout duration.\n\n' +
                    'Examples: `10m`, `1h`, `6h`, `1d`, `1w`\n\n' +
                    'Usage: `>mute <user ID/@mention> <duration> [reason]`',
            });

            return;
        }

        const durationMinutes =
            parsedDuration.minutes;

        const durationMs =
            durationMinutes *
            60 *
            1000;

        // ================================================
        // MODERATION EXEMPTION
        // ================================================

        if (
            isModerationExempt(
                targetUser.id
            )
        ) {
            throw new TitanBotError(
                'User is moderation exempt',
                ErrorTypes.VALIDATION,
                'This user is exempt from all moderation actions.'
            );
        }

        // ================================================
        // SELF CHECK
        // ================================================

        if (
            targetUser.id ===
            interaction.user.id
        ) {
            throw new TitanBotError(
                'Cannot timeout self',
                ErrorTypes.VALIDATION,
                'You cannot timeout yourself.'
            );
        }

        // ================================================
        // BOT CHECK
        // ================================================

        if (
            targetUser.id ===
            client.user.id
        ) {
            throw new TitanBotError(
                'Cannot timeout bot',
                ErrorTypes.VALIDATION,
                'You cannot timeout the bot.'
            );
        }

        // ================================================
        // MODERATION HIERARCHY
        // ================================================

        ModerationService.assertModerationHierarchy(
            interaction.member,
            member,
            'timeout'
        );

        // ================================================
        // PERFORM TIMEOUT
        // ================================================

        const result =
            await ModerationService.timeoutUser({
                guild:
                    interaction.guild,

                member,

                moderator:
                    interaction.member,

                durationMs,

                reason,
            });

        // ================================================
        // RESPONSE
        // ================================================

        await interaction.reply({
            embeds: [
                warningEmbed(
                    `⏳ <@${targetUser.id}> has been timed out | ${targetUser.id}`,
                    `**Duration:** ${parsedDuration.display}\n` +
                    `**Reason:** ${reason}\n` +
                    `**Case ID:** #${result.caseId}`
                ),
            ],
        });

        logger.info(
            `Prefix timeout: ${targetUser.tag} was timed out by ${interaction.user.tag}`,
            {
                userId:
                    targetUser.id,

                guildId:
                    interaction.guildId,

                moderatorId:
                    interaction.user.id,

                duration:
                    parsedDuration.display,

                durationMs,

                reason,

                caseId:
                    result.caseId,
            }
        );
    },

    // ========================================================
    // SLASH COMMAND
    // ========================================================

    async execute(
        interaction,
        config,
        client
    ) {
        const deferSuccess =
            await InteractionHelper.safeDefer(
                interaction
            );

        if (!deferSuccess) {
            logger.warn(
                'Timeout interaction defer failed',
                {
                    userId:
                        interaction.user.id,

                    guildId:
                        interaction.guildId,

                    commandName:
                        'timeout',
                }
            );

            return;
        }

        // ============================================
        // TARGET / DURATION / REASON
        // ============================================

        const targetUser =
            interaction.options.getUser(
                'target'
            );

        const durationMinutes =
            interaction.options.getInteger(
                'duration'
            );

        const reason =
            interaction.options.getString(
                'reason'
            ) ||
            'No reason provided';

        if (!targetUser) {
            throw new TitanBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'You must specify a user to timeout.',
                {
                    subtype:
                        'invalid_user',
                }
            );
        }

        if (!interaction.guild) {
            throw new TitanBotError(
                'Guild unavailable',
                ErrorTypes.INTERNAL,
                'This command can only be used inside a server.'
            );
        }

        // ============================================
        // MODERATION EXEMPTION
        // ============================================

        if (
            isModerationExempt(
                targetUser.id
            )
        ) {
            throw new TitanBotError(
                'User is moderation exempt',
                ErrorTypes.VALIDATION,
                'This user is exempt from all moderation actions.'
            );
        }

        // ============================================
        // SELF CHECK
        // ============================================

        if (
            targetUser.id ===
            interaction.user.id
        ) {
            throw new TitanBotError(
                'Cannot timeout self',
                ErrorTypes.VALIDATION,
                'You cannot timeout yourself.'
            );
        }

        // ============================================
        // BOT CHECK
        // ============================================

        if (
            targetUser.id ===
            client.user.id
        ) {
            throw new TitanBotError(
                'Cannot timeout bot',
                ErrorTypes.VALIDATION,
                'You cannot timeout the bot.'
            );
        }

        // ============================================
        // RESOLVE MEMBER
        // ============================================

        const member =
            await resolveModerationTarget(
                interaction.guild,
                targetUser.id
            );

        if (!member) {
            throw new TitanBotError(
                'Target not found',
                ErrorTypes.USER_INPUT,
                'The target user is not currently in this server.'
            );
        }

        // ============================================
        // MODERATION HIERARCHY
        // ============================================

        ModerationService.assertModerationHierarchy(
            interaction.member,
            member,
            'timeout'
        );

        // ============================================
        // CONVERT DURATION
        // ============================================

        const durationMs =
            durationMinutes *
            60 *
            1000;

        // ============================================
        // PERFORM TIMEOUT
        // ============================================

        const result =
            await ModerationService.timeoutUser({
                guild:
                    interaction.guild,

                member,

                moderator:
                    interaction.member,

                durationMs,

                reason,
            });

        const durationDisplay =
            durationChoices.find(
                (choice) =>
                    choice.value ===
                    durationMinutes
            )?.name ||
            `${durationMinutes} minutes`;

        // ============================================
        // RESPONSE
        // ============================================

        await InteractionHelper.safeEditReply(
            interaction,
            {
                content: '',
                embeds: [
                    warningEmbed(
                        `⏳ <@${targetUser.id}> has been timed out | ${targetUser.id}`,
                        `**Duration:** ${durationDisplay}\n` +
                        `**Reason:** ${reason}\n` +
                        `**Case ID:** #${result.caseId}`
                    ),
                ],
            }
        );

        logger.info(
            `Sent timeout confirmation for ${targetUser.tag}`,
            {
                userId:
                    targetUser.id,

                guildId:
                    interaction.guildId,

                moderatorId:
                    interaction.user.id,

                duration:
                    durationDisplay,

                caseId:
                    result.caseId,
            }
        );
    },
};