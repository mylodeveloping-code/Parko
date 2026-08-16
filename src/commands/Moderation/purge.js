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
        .setDescription('Number of messages to delete (1-100)')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .addUserOption((option) =>
      option
        .setName('target')
        .setDescription(
          'Optional user whose messages should be deleted'
        )
        .setRequired(false)
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

    const target =
      interaction.options.getUser('target');

    const channel =
      interaction.channel;

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
      let messagesToDelete;

      // ========================================================
      // NORMAL PURGE
      // ========================================================

      if (!target) {
        const fetched =
          await channel.messages.fetch({
            limit: amount,
          });

        messagesToDelete =
          fetched;
      }

      // ========================================================
      // TARGETED PURGE
      // ========================================================

      else {
        messagesToDelete =
          await findMessagesByUser(
            channel,
            target.id,
            amount
          );
      }

      // ========================================================
      // DELETE
      // ========================================================

      let deletedCount = 0;

      if (messagesToDelete.size > 0) {
        const deleted =
          await channel.bulkDelete(
            messagesToDelete,
            true
          );

        deletedCount =
          deleted.size;
      }

      // ========================================================
      // LOG
      // ========================================================

      const targetText = target
        ? `${target.tag} (${target.id})`
        : 'All users';

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
            target
              ? `Deleted ${deletedCount} messages from ${target.tag}`
              : `Deleted ${deletedCount} messages`,

          metadata: {
            channelId: channel.id,
            messageCount: deletedCount,
            requestedAmount: amount,
            moderatorId: interaction.user.id,
            commandType: 'slash',
            targetUserId: target?.id || null,
            targetUsername: target?.tag || null,
          },
        },
      });

      // ========================================================
      // RESPONSE
      // ========================================================

      const description = target
        ? `Deleted **${deletedCount}** message${deletedCount === 1 ? '' : 's'} from **${target.tag}** in ${channel}.`
        : `Deleted **${deletedCount}** message${deletedCount === 1 ? '' : 's'} in ${channel}.`;

      await InteractionHelper.safeEditReply(
        interaction,
        {
          embeds: [
            successEmbed(
              'Messages Purged',
              description
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

    if (!Array.isArray(args)) {
      return;
    }

    const amount =
      Number(args[0]);

    if (
      !Number.isInteger(amount) ||
      amount < 1 ||
      amount > 100
    ) {
      return;
    }

    const channel =
      message.channel;

    // ========================================================
    // FIND TARGET
    // ========================================================

    let targetId = null;
    let targetUser = null;

    if (args.length >= 2) {
      const targetInput =
        String(args[1]).trim();

      targetId =
        extractUserId(targetInput);

      if (targetId) {
        targetUser =
          await client.users
            .fetch(targetId)
            .catch(() => null);
      }

      /*
       * If it wasn't a mention or ID, try finding
       * the member by username/display name.
       */

      if (!targetUser) {
        const members =
          await message.guild.members.fetch();

        const search =
          targetInput
            .replace(/^@/, '')
            .toLowerCase();

        const member =
          members.find((member) =>
            member.user.username
              .toLowerCase() === search ||
            member.displayName
              .toLowerCase() === search ||
            member.user.tag
              .toLowerCase() === search
          );

        if (member) {
          targetUser =
            member.user;

          targetId =
            member.user.id;
        }
      }

      if (!targetId || !targetUser) {
        return;
      }
    }

    try {
      let messagesToDelete;

      // ========================================================
      // NORMAL PURGE
      // ========================================================

      if (!targetId) {
        /*
         * We specifically fetch messages BEFORE
         * the .purge command message.
         *
         * This prevents the command itself from
         * being included in the purge.
         */

        const messagesBeforeCommand =
          await channel.messages.fetch({
            limit: amount,
            before: message.id,
          });

        messagesToDelete =
          messagesBeforeCommand.first(amount);
      }

      // ========================================================
      // TARGETED PURGE
      // ========================================================

      else {
        messagesToDelete =
          await findMessagesByUser(
            channel,
            targetId,
            amount,
            message.id
          );
      }

      // ========================================================
      // DELETE
      // ========================================================

      let deletedCount = 0;

      if (
        messagesToDelete &&
        messagesToDelete.size > 0
      ) {
        const deleted =
          await channel.bulkDelete(
            messagesToDelete,
            true
          );

        deletedCount =
          deleted.size;
      }

      // ========================================================
      // REACT
      // ========================================================

      try {
        await message.react('👍');
      } catch (error) {
        logger.warn(
          'Could not react to .purge message:',
          error
        );
      }

      // ========================================================
      // WAIT
      // ========================================================

      await new Promise((resolve) =>
        setTimeout(resolve, 2000)
      );

      // ========================================================
      // DELETE COMMAND MESSAGE
      // ========================================================

      try {
        await message.delete();
      } catch (error) {
        logger.warn(
          'Could not delete .purge message:',
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
            targetUser
              ? `Deleted ${deletedCount} messages from ${targetUser.tag}`
              : `Deleted ${deletedCount} messages`,

          metadata: {
            channelId: channel.id,
            messageCount: deletedCount,
            requestedAmount: amount,
            moderatorId: message.author.id,
            commandType: 'prefix',
            targetUserId: targetUser?.id || null,
            targetUsername: targetUser?.tag || null,
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

// ============================================================
// FIND MESSAGES BY USER
// ============================================================

async function findMessagesByUser(
  channel,
  userId,
  amount,
  beforeMessageId = null
) {
  const matchingMessages =
    [];

  let lastMessageId =
    beforeMessageId;

  /*
   * Discord fetches a maximum of 100 messages
   * per request.
   *
   * We continue fetching older messages until:
   *
   * 1. We find the requested amount.
   * 2. There are no more messages.
   *
   * We stop after 10,000 messages to avoid
   * accidentally scanning an enormous channel.
   */

  const MAX_MESSAGES_TO_SCAN =
    10_000;

  let scanned =
    0;

  while (
    matchingMessages.length < amount &&
    scanned < MAX_MESSAGES_TO_SCAN
  ) {
    const fetchOptions = {
      limit: 100,
    };

    if (lastMessageId) {
      fetchOptions.before =
        lastMessageId;
    }

    const batch =
      await channel.messages.fetch(
        fetchOptions
      );

    if (batch.size === 0) {
      break;
    }

    scanned +=
      batch.size;

    for (const msg of batch.values()) {
      if (
        msg.author?.id === userId
      ) {
        matchingMessages.push(
          msg
        );

        if (
          matchingMessages.length >=
          amount
        ) {
          break;
        }
      }
    }

    const oldestMessage =
      batch.last();

    if (!oldestMessage) {
      break;
    }

    lastMessageId =
      oldestMessage.id;

    /*
     * If fewer than 100 messages were returned,
     * we've reached the beginning of the channel.
     */

    if (batch.size < 100) {
      break;
    }
  }

  /*
   * Convert the array into a Collection-like
   * structure that bulkDelete accepts.
   */

  const collection =
    new Map();

  for (const message of matchingMessages) {
    collection.set(
      message.id,
      message
    );
  }

  return collection;
}

// ============================================================
// EXTRACT USER ID
// ============================================================

function extractUserId(input) {
  if (!input) {
    return null;
  }

  const value =
    String(input).trim();

  // <@123456789>
  const mentionMatch =
    value.match(/^<@!?(\d+)>$/);

  if (mentionMatch) {
    return mentionMatch[1];
  }

  // 123456789
  if (/^\d+$/.test(value)) {
    return value;
  }

  return null;
}