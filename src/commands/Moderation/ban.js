import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { isModerationExempt } from '../../utils/moderation.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user from the server')

        .addUserOption((option) =>
            option
                .setName('target')
                .setDescription('The user to ban')
                .setRequired(true)
        )

        .addStringOption((option) =>
            option
                .setName('length')
                .setDescription(
                    'Ban duration, e.g. 30m, 12h, 7d, 2w'
                )
                .setRequired(false)
        )

        .addStringOption((option) =>
            option
                .setName('reason')
                .setDescription('Reason for the ban')
                .setRequired(false)
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.BanMembers
        ),

    category: 'moderation',

    async execute(interaction, config, client) {
        const user =
            interaction.options.getUser('target');

        const length =
            interaction.options.getString('length');

        const reason =
            interaction.options.getString('reason') ||
            'No reason provided';

        if (!user) {
            throw new TitanBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'You must specify a user to ban.',
                {
                    subtype: 'invalid_user',
                }
            );
        }

        if (isModerationExempt(user.id)) {
            throw new TitanBotError(
                'User is moderation exempt',
                ErrorTypes.VALIDATION,
                'This user is exempt from all moderation actions.'
            );
        }

        if (user.id === interaction.user.id) {
            throw new TitanBotError(
                'Cannot ban self',
                ErrorTypes.VALIDATION,
                'You cannot ban yourself.'
            );
        }

        if (user.id === client.user.id) {
            throw new TitanBotError(
                'Cannot ban bot',
                ErrorTypes.VALIDATION,
                'You cannot ban the bot.'
            );
        }

        const result =
            await ModerationService.banUser({
                guild: interaction.guild,
                user,
                moderator: interaction.member,
                reason,
                length,
            });

        await InteractionHelper.universalReply(
            interaction,
            {
                embeds: [
                    successEmbed(
                        `User Banned`,
                        `**User:** ${user} (\`${user.id}\`)\n` +
                        `**Reason:** ${reason}\n` +
                        `**Length:** ${result.length || 'Permanent'}\n` +
                        `**Case ID:** #${result.caseId}`,
                    ),
                ],
            }
        );
    },
};