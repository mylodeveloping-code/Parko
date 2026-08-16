import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';

import { getFromDb } from '../../utils/database.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  replyUserError,
  ErrorTypes,
} from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription('View a moderation case')
    .addIntegerOption((option) =>
      option
        .setName('id')
        .setDescription('The case number')
        .setRequired(true)
        .setMinValue(1)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers
    ),

  category: 'moderation',

  async execute(interaction) {
    const caseId =
      interaction.options.getInteger('id');

    try {
      const key =
        `moderation_case_${interaction.guildId}_${caseId}`;

      const caseData =
        await getFromDb(key, null);

      if (!caseData) {
        return await replyUserError(interaction, {
          type: ErrorTypes.NOT_FOUND,
          message: `Moderation case #${caseId} was not found.`,
        });
      }

      const embed =
        successEmbed(
          `Moderation Case #${caseId}`,
          [
            `**Action:** ${caseData.action || 'Unknown'}`,
            `**Target:** ${caseData.target || 'Unknown'}`,
            `**Executor:** ${caseData.executor || 'Unknown'}`,
            `**Reason:** ${caseData.reason || 'No reason provided'}`,
            caseData.duration
              ? `**Duration:** ${caseData.duration}`
              : null,
            `**Created:** <t:${Math.floor(
              new Date(caseData.createdAt).getTime() / 1000
            )}:F>`,
          ]
            .filter(Boolean)
            .join('\n')
        );

      await InteractionHelper.safeReply(
        interaction,
        {
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        }
      );
    } catch (error) {
      logger.error(
        'Case command error:',
        error
      );

      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message:
          'An unexpected error occurred while retrieving that case.',
      });
    }
  },

  async messageExecute(message, args) {
    const caseId =
      Number(
        Array.isArray(args)
          ? args[0]
          : args
      );

    if (!Number.isInteger(caseId) || caseId < 1) {
      return;
    }

    try {
      const key =
        `moderation_case_${message.guild.id}_${caseId}`;

      const caseData =
        await getFromDb(key, null);

      if (!caseData) {
        return message.reply(
          `Moderation case #${caseId} was not found.`
        );
      }

      const embed =
        successEmbed(
          `Moderation Case #${caseId}`,
          [
            `**Action:** ${caseData.action || 'Unknown'}`,
            `**Target:** ${caseData.target || 'Unknown'}`,
            `**Executor:** ${caseData.executor || 'Unknown'}`,
            `**Reason:** ${caseData.reason || 'No reason provided'}`,
            caseData.duration
              ? `**Duration:** ${caseData.duration}`
              : null,
            `**Created:** <t:${Math.floor(
              new Date(caseData.createdAt).getTime() / 1000
            )}:F>`,
          ]
            .filter(Boolean)
            .join('\n')
        );

      await message.reply({
        embeds: [embed],
      });
    } catch (error) {
      logger.error(
        'Prefix case command error:',
        error
      );
    }
  },
};
