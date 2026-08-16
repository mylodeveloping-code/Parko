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
      /*
       * SLASH COMMAND ONLY
       *
       * /purge does NOT have a command message to react to
       * or delete. It simply deletes the requested messages.
       */

      const messages =
        await channel.messages.fetch({
          limit: amount,
        });

      const deleted =
        await channel.bulkDelete(
          messages,
          true
        );

      const deletedCount = deleted.size;

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
          .catch((err) =>
            logger.debug(
              'Failed to auto-delete purge response:',
              err
            )
          );
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

    // ==========================================================
    // VALIDATION
    // ==========================================================

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
       * ========================================================
       * FIND MESSAGES BEFORE THE .purge COMMAND
       * ========================================================
       *
       * We fetch up to 100 messages plus the command itself.
       *
       * The .purge message is NEVER included in the messages
       * being purged.
       */

      const fetched =
        await channel.messages.fetch({
          limit: 100,
          before: message.id,
        });

      /*
       * Discord returns the messages before the supplied message.
       *
       * Take exactly the requested amount.
       */

      const messagesToDelete =
        fetched.first(amount);

      if (messagesToDelete.length > 0) {
        /*
         * ======================================================
         * DELETE THE MESSAGES FIRST
         * ======================================================
         */

        await channel.bulkDelete(
          messagesToDelete,
          true
        );
      }

      const deletedCount =
        messagesToDelete.length;

      /*
       * ========================================================
       * REACT TO THE .purge COMMAND
       * ========================================================
       *
       * This happens AFTER the messages have been deleted.
       */

      await message.react('👍').catch((error) => {
        logger.debug(
          'Failed to react to purge command:',
          error
        );
      });

      /*
       * ========================================================
       * WAIT 2 SECONDS
       * ========================================================
       */

      await new Promise((resolve) =>
        setTimeout(resolve, 2000)
      );

      /*
       * ========================================================
       * DELETE THE .purge COMMAND
       * ========================================================
       */

      await message.delete().catch((error) => {
        logger.debug(
          'Failed to delete purge command:',
          error
        );
      });

      /*
       * ========================================================
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
