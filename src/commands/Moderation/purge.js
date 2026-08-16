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

    if (
      !Number.isInteger(amount) ||
      amount < 1 ||
      amount > 100
    ) {
      return await replyUserError(interaction, {
        type: ErrorTypes.VALIDATION,
        message:
          'Please specify a number between 1 and 100.',
      });
    }

    try {
      // ----------------------------------------------------------
      // /purge ONLY
      //
      // There is no prefix command message here.
      // Simply delete the requested number of messages.
      // ----------------------------------------------------------

      const fetched =
        await channel.messages.fetch({
          limit: amount,
        });

      const messages =
        [...fetched.values()].slice(0, amount);

      if (messages.length === 0) {
        await InteractionHelper.safeEditReply(
          interaction,
          {
            embeds: [
              successEmbed(
                'Messages Purged',
                'There were no messages to delete.'
              ),
            ],
            flags: MessageFlags.Ephemeral,
          }
        );

        return;
      }

      const deleted =
        await channel.bulkDelete(
          messages,
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
          .catch((error) => {
            logger.debug(
              'Failed to auto-delete purge response:',
              error
            );
          });
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
    if (
      !message ||
      !message.channel ||
      !message.guild
    ) {
      return;
    }

    // ----------------------------------------------------------
    // Get the amount
    // ----------------------------------------------------------

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

    const channel =
      message.channel;

    try {
      // ========================================================
      // IMPORTANT
      // ========================================================
      //
      // "before: message.id" guarantees that the .purge
      // command itself CANNOT be included in the messages
      // being deleted.
      //
      // Example:
      //
      // Message A
      // Message B
      // Message C
      // Message D
      // Message E
      // .purge 5
      //
      // The five messages above are deleted.
      // The .purge 5 message stays until AFTER the deletion.
      // ========================================================

      const fetched =
        await channel.messages.fetch({
          limit: amount,
          before: message.id,
        });

      // Discord returns newest -> oldest.
      // Take exactly the requested amount.
      const messagesToDelete =
        [...fetched.values()]
          .filter(
            (msg) =>
              msg.id !== message.id
          )
          .slice(0, amount);

      let deletedCount = 0;

      // ========================================================
      // DELETE THE REQUESTED MESSAGES FIRST
      // ========================================================

      if (
        messagesToDelete.length > 0
      ) {
        const deleted =
          await channel.bulkDelete(
            messagesToDelete,
            true
          );

        deletedCount =
          deleted.size;
      }

      logger.info(
        `Prefix purge: deleted ${deletedCount} messages before ${message.author.tag}'s .purge command.`
      );

      // ========================================================
      // REACT TO .PURGE
      // ========================================================

      try {
        await message.react('👍');

        logger.info(
          `Prefix purge: reacted to .purge command from ${message.author.tag}.`
        );
      } catch (error) {
        logger.warn(
          'Prefix purge: failed to react to purge command:',
          error
        );
      }

      // ========================================================
      // WAIT 2 SECONDS
      // ========================================================

      await new Promise(
        (resolve) =>
          setTimeout(resolve, 2000)
      );

      // ========================================================
      // DELETE .PURGE COMMAND
      // ========================================================

      try {
        if (message.deletable) {
          await message.delete();

          logger.info(
            `Prefix purge: deleted .purge command from ${message.author.tag}.`
          );
        }
      } catch (error) {
        logger.warn(
          'Prefix purge: failed to delete purge command:',
          error
        );
      }

      // ========================================================
      // LOG
      // ========================================================

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
            channelId:
              channel.id,

            messageCount:
              deletedCount,

            requestedAmount:
              amount,

            moderatorId:
              message.author.id,

            commandType:
              'prefix',
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
