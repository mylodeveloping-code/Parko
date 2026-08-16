import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';

import { successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  replyUserError,
  ErrorTypes,
} from '../../utils/errorHandler.js';

export default {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete a specific amount of messages')
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('Number of messages (1-100)')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageMessages
    ),

  category: 'moderation',

  abuseProtection: {
    maxAttempts: 5,
    windowMs: 60_000,
  },

  // ============================================================
  // /purge
  // ============================================================

  async execute(interaction, config, client) {
    const deferSuccess =
      await InteractionHelper.safeDefer(interaction, {
        flags: MessageFlags.Ephemeral,
      });

    if (!deferSuccess) {
      logger.warn('Purge interaction defer failed', {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'purge',
      });

      return;
    }

    const amount =
      interaction.options.getInteger('amount');

    const channel = interaction.channel;

    if (amount < 1 || amount > 100) {
      return await replyUserError(interaction, {
        type: ErrorTypes.VALIDATION,
        message:
          'Please specify a number between 1 and 100.',
      });
    }

    try {
      // /purge simply deletes the requested number
      // of messages. There is no command message
      // that needs to be skipped.

      const fetched =
        await channel.messages.fetch({
          limit: amount,
        });

      const deleted =
        await channel.bulkDelete(
          fetched,
          true
        );

      const deletedCount =
        deleted.size;

      await logEvent({
        client,
        guild: interaction.guild,
        event: {
          action: 'Messages Purged',
          target:
            `${channel} (${deletedCount} messages)`,
          executor:
            `${interaction.user.tag} (${interaction.user.id})`,
          reason:
            `Deleted ${deletedCount} messages`,
          metadata: {
            channelId: channel.id,
            messageCount: deletedCount,
            requestedAmount: amount,
            moderatorId: interaction.user.id,
            commandType: 'slash',
          },
        },
      });

      await InteractionHelper.safeEditReply(
        interaction,
        {
          embeds: [
            successEmbed(
              'Messages Purged',
              `Deleted ${deletedCount} messages in ${channel}.`
            ),
          ],
          flags: MessageFlags.Ephemeral,
        }
      );

      setTimeout(() => {
        interaction
          .deleteReply()
          .catch(() => {});
      }, 3000);

    } catch (error) {
      logger.error(
        'Slash purge command error:',
        error
      );

      await replyUserError(interaction, {
        type: ErrorTypes.UNKNOWN,
        message:
          'An unexpected error occurred during message deletion. Note: Messages older than 14 days cannot be bulk deleted.',
      });
    }
  },

  // ============================================================
  // .purge
  // ============================================================

  async messageExecute(message, args, client) {
    if (!message || !message.channel) {
      return;
    }

    const amount = Number(
      Array.isArray(args)
        ? args[0]
        : args
    );

    if (
      !Number.isInteger(amount) ||
      amount < 1 ||
      amount > 100
    ) {
      return;
    }

    const channel = message.channel;

    try {
      /*
       * IMPORTANT:
       *
       * We DO NOT fetch the newest messages normally.
       *
       * We specifically ask Discord for messages BEFORE
       * the .purge command's message ID.
       *
       * Therefore the .purge message itself can NEVER
       * be included in the purge.
       */

      const messagesBeforeCommand =
        await channel.messages.fetch({
          limit: amount,
          before: message.id,
        });

      /*
       * Discord returns newest -> oldest.
       *
       * We only want the exact number requested.
       */

      const messagesToDelete =
        messagesBeforeCommand.first(amount);

      /*
       * ========================================================
       * STEP 1:
       * DELETE THE REQUESTED MESSAGES
       * ========================================================
       *
       * The .purge message is NOT in this collection.
       */

      let deletedCount = 0;

      if (messagesToDelete.length > 0) {
        const deleted =
          await channel.bulkDelete(
            messagesToDelete,
            true
          );

        deletedCount =
          deleted.size;
      }

      /*
       * ========================================================
       * STEP 2:
       * REACT TO THE .purge MESSAGE
       * ========================================================
       */

      try {
        await message.react('👍');
      } catch (error) {
        logger.warn(
          'Could not react to .purge message:',
          error
        );
      }

      /*
       * ========================================================
       * STEP 3:
       * WAIT 2 SECONDS
       * ========================================================
       */

      await new Promise((resolve) =>
        setTimeout(resolve, 2000)
      );

      /*
       * ========================================================
       * STEP 4:
       * DELETE THE .purge MESSAGE
       * ========================================================
       */

      try {
        await message.delete();
      } catch (error) {
        logger.warn(
          'Could not delete .purge message:',
          error
        );
      }

      /*
       * ========================================================
       * STEP 5:
       * LOG
       * ========================================================
       */

      await logEvent({
        client,
        guild: message.guild,
        event: {
          action: 'Messages Purged',

          target:
            `${channel} (${deletedCount} messages)`,

          executor:
            `${message.author.tag} (${message.author.id})`,

          reason:
            `Deleted ${deletedCount} messages`,

          metadata: {
            channelId: channel.id,
            messageCount: deletedCount,
            requestedAmount: amount,
            moderatorId: message.author.id,
            commandType: 'prefix',
          },
        },
      });

    } catch (error) {
      logger.error(
        'Prefix purge command error:',
        error
      );
    }
  },
};
