import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';

import {
  getFromDb,
  setInDb,
} from '../../utils/database.js';

import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  replyUserError,
  ErrorTypes,
} from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';

async function updateCaseReason(
  guildId,
  caseId,
  newReason
) {
  const caseKey =
    `moderation_case_${guildId}_${caseId}`;

  const caseData =
    await getFromDb(caseKey, null);

  if (!caseData) {
    return null;
  }

  caseData.reason = newReason;
  caseData.updatedAt =
    new Date().toISOString();

  await setInDb(
    caseKey,
    caseData
  );

  const listKey =
    `moderation_cases_list_${guildId}`;

  const caseList =
    await getFromDb(listKey, []);

  const index =
    caseList.findIndex(
      (entry) =>
        Number(entry.caseId) === Number(caseId)
    );

  if (index !== -1) {
    caseList[index] = {
      ...caseList[index],
      reason: newReason,
      updatedAt: caseData.updatedAt,
    };

    await setInDb(
      listKey,
      caseList
    );
  }

  return caseData;
}

export default {
  data: new SlashCommandBuilder()
    .setName('reason')
    .setDescription('Change the reason for a moderation case')
    .addIntegerOption((option) =>
      option
        .setName('case')
        .setDescription('The case number')
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('The new reason')
        .setRequired(true)
        .setMaxLength(900)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ModerateMembers
    ),

  category: 'moderation',

  async execute(interaction) {
    const caseId =
      interaction.options.getInteger('case');

    const reason =
      interaction.options.getString('reason');

    try {
      const updated =
        await updateCaseReason(
          interaction.guildId,
          caseId,
          reason
        );

      if (!updated) {
        return await replyUserError(interaction, {
          type: ErrorTypes.NOT_FOUND,
          message: `Moderation case #${caseId} was not found.`,
        });
      }

      await InteractionHelper.safeReply(
        interaction,
        {
          embeds: [
            successEmbed(
              'Case Updated',
              `The reason for case **#${caseId}** has been updated to:\n> ${reason}`
            ),
          ],
          flags: MessageFlags.Ephemeral,
        }
      );
    } catch (error) {
      logger.error(
        'Reason command error:',
        error
      );

      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message:
          'An unexpected error occurred while updating the case.',
      });
    }
  },

  async messageExecute(message, args) {
    if (!Array.isArray(args) || args.length < 2) {
      return;
    }

    const caseId =
      Number(args[0]);

    const reason =
      args.slice(1).join(' ').trim();

    if (
      !Number.isInteger(caseId) ||
      caseId < 1 ||
      !reason
    ) {
      return;
    }

    try {
      const updated =
        await updateCaseReason(
          message.guild.id,
          caseId,
          reason
        );

      if (!updated) {
        return message.reply(
          `Moderation case #${caseId} was not found.`
        );
      }

      await message.reply(
        `Updated the reason for case #${caseId}.`
      );
    } catch (error) {
      logger.error(
        'Prefix reason command error:',
        error
      );
    }
  },
};
