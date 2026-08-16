import {
  SlashCommandBuilder,
  PermissionFlagsBits,
} from 'discord.js';

import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import {
  getModerationCases,
} from '../../utils/moderation.js';

export default {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('View a user\'s moderation history')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user whose history you want to view')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers
    ),

  category: 'moderation',

  abuseProtection: {
    maxAttempts: 10,
    windowMs: 60_000,
  },

  async execute(interaction) {
    try {
      const user =
        interaction.options.getUser('user');

      if (!user) {
        return interaction.editReply({
          embeds: [
            createEmbed({
              title: '❌ User Not Found',
              description:
                'I could not find that user.',
              color: 'error',
            }),
          ],
        });
      }

      const cases =
        await getModerationCases(
          interaction.guild.id,
          {
            userId: user.id,
            limit: 10,
          }
        );

      if (!cases.length) {
        return interaction.editReply({
          embeds: [
            createEmbed({
              title: '📋 Moderation History',
              description:
                `**${user.tag}** has no recorded moderation history.`,
              color: 'info',
            }),
          ],
        });
      }

      const historyLines = [];

      for (const caseData of cases) {
        const caseId =
          caseData.caseId || 'N/A';

        const action =
          caseData.action || 'Unknown Action';

        const reason =
          caseData.reason || 'No reason provided';

        const executor =
          caseData.executor || 'Unknown moderator';

        const duration =
          caseData.duration
            ? `\n**Duration:** ${caseData.duration}`
            : '';

        const date =
          caseData.createdAt
            ? `<t:${Math.floor(
                new Date(caseData.createdAt).getTime() / 1000
              )}:R>`
            : 'Unknown date';

        historyLines.push(
          `### Case #${caseId} — ${action}\n` +
          `**Reason:** ${reason}\n` +
          `**Moderator:** ${executor}` +
          duration +
          `\n**Date:** ${date}`
        );
      }

      const embed =
        createEmbed({
          title: `📋 Moderation History — ${user.tag}`,
          description:
            historyLines.join('\n\n'),
          color: 'info',
        });

      await interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      logger.error(
        'History command error:',
        error
      );

      await interaction.editReply({
        embeds: [
          createEmbed({
            title: '❌ Error',
            description:
              'An unexpected error occurred while retrieving the moderation history.',
            color: 'error',
          }),
        ],
      }).catch(() => {});
    }
  },
};
