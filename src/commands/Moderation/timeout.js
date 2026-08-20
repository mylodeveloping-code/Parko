import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import { successEmbed } from '../../utils/embeds.js';

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

const durationChoices = [
    { name: '5 minutes', value: 5 },
    { name: '10 minutes', value: 10 },
    { name: '30 minutes', value: 30 },
    { name: '1 hour', value: 60 },
    { name: '6 hours', value: 360 },
    { name: '1 day', value: 1440 },
    { name: '1 week', value: 10080 },
];

export default {
    data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout a user for a specific duration.')

        .addUserOption((option) =>
            option
                .setName('target')
                .setDescription('User to timeout')
                .setRequired(true)
        )

        .addIntegerOption((option) =>
            option
                .setName('duration')
                .setDescription('Duration of the timeout')
                .setRequired(true)
                .addChoices(...durationChoices)
        )

        .addStringOption((option) =>
            option
                .setName('reason')
                .setDescription('Reason for the timeout')
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.ModerateMembers
        ),

    category: 'moderation',

    async execute(interaction, config, client) {
        const deferSuccess =
            await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn(
                'Timeout interaction defer failed',
                {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'timeout',
                }
            );

            return;
        }

        const targetUser =
            interaction.options.getUser('target');

        const durationMinutes =
            interaction.options.getInteger('duration');

        const reason =
            interaction.options.getString('reason') ||
            'No reason provided';

        if (!targetUser) {
            throw new TitanBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'You must specify a user to timeout.',
                {
                    subtype: 'invalid_user',
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

        if (isModerationExempt(targetUser.id)) {
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
        // RESOLVE ACTUAL GUILD MEMBER
        // ============================================
        //
        // Do NOT use:
        //
        // interaction.options.getMember('target')
        //
        // as the authoritative lookup.
        //
        // The user can be a real server member while
        // not currently existing in the local cache.
        //

        const member =
            await resolveModerationTarget(
                interaction.guild,
                targetUser.id
            );

        // Timeout requires the user to actually be
        // in this guild.
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
        // SUCCESS
        // ============================================

        await InteractionHelper.safeEditReply(
            interaction,
            {
                embeds: [
                    successEmbed(
                        `⏳ **Timed out** ${targetUser.tag} for ${durationDisplay}.`,
                        `**Reason:** ${reason}\n` +
                        `**Case ID:** #${result.caseId}`
                    ),
                ],
            }
        );
    },
};
