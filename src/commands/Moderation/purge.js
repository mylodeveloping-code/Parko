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

const FOURTEEN_DAYS_MS =
  14 * 24 * 60 * 60 * 1000;

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
        .setDescription('Only delete messages sent by this user')
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

    if (!channel) {
      return await replyUserError(interaction, {
        type: ErrorTypes.VALIDATION,
        message:
          'This command cannot be used in this channel.',
      });
    }

    try {
      let messagesToDelete = [];

      // ========================================================
      // NO TARGET
      // ========================================================

      if (!target) {
        /*
         * Fetch the newest requested amount of messages.
         */

        const fetched =
          await channel.messages.fetch({
            limit: amount,
          });

        messagesToDelete =
          [...fetched.values()].slice(
            0,
            amount
          );
      }

      // ========================================================
      // TARGET
      // ========================================================

      else {
        /*
         * Search backwards through the channel until we
         * find the requested number of messages sent by
         * the target user.
         *
         * Unlike the previous version, OLD messages are
         * NOT skipped.
         */

        messagesToDelete =
          await findMessagesByUser({
            channel,
            userId: target.id,
            amount,
          });
      }

      // ========================================================
      // DELETE
      // ========================================================

      const deletedCount =
        await deleteMessagesIndividuallyOrBulk(
          messagesToDelete
        );

      // ========================================================
      // LOG
      // ========================================================

      await logEvent({
        client,
        guild: interaction.guild,
        event: {
          action: 'Messages Purged',

          target: target
            ? `${target.tag || target.username} (${target.id}) — ${channel} (${deletedCount} messages)`
            : `${channel} (${deletedCount} messages)`,

          executor:
            `${interaction.user.tag} (${interaction.user.id})`,

          reason:
            target
              ? `Deleted ${deletedCount} messages sent by ${target.tag || target.username}`
              : `Deleted ${deletedCount} messages`,

          metadata: {
            channelId:
              channel.id,

            messageCount:
              deletedCount,

            requestedAmount:
              amount,

            targetUserId:
              target?.id || null,

            moderatorId:
              interaction.user.id,

            commandType:
              'slash',
          },
        },
      });

      // ========================================================
      // RESPONSE
      // ========================================================

      const description =
        target
          ? `Deleted **${deletedCount}** message${deletedCount === 1 ? '' : 's'} from **${target.tag || target.username}** in ${channel}.`
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

          flags:
            MessageFlags.Ephemeral,
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
          'An unexpected error occurred while deleting messages.',
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
      args = [];
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

    /*
     * Optional target.
     *
     * Supported:
     *
     * .purge 100
     * .purge 100 Dyno
     * .purge 100 @Dyno
     * .purge 100 155149108183695360
     */

    const targetInput =
      args.slice(1).join(' ').trim();

    let targetUserId = null;
    let targetDisplayName = null;

    if (targetInput) {
      const resolvedTarget =
        await resolveTargetUser(
          message,
          targetInput
        );

      if (!resolvedTarget) {
        return;
      }

      targetUserId =
        resolvedTarget.id;

      targetDisplayName =
        resolvedTarget.tag ||
        resolvedTarget.username ||
        targetUserId;
    }

    try {
      let messagesToDelete = [];

      // ========================================================
      // NO TARGET
      // ========================================================

      if (!targetUserId) {
        /*
         * Fetch messages BEFORE the .purge command.
         *
         * This prevents the .purge message itself from
         * being deleted.
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
      // TARGET
      // ========================================================

      else {
        /*
         * Search backwards for messages from the target.
         *
         * Old messages are included.
         */

        messagesToDelete =
          await findMessagesByUser({
            channel,
            userId: targetUserId,
            amount,
            beforeMessageId: message.id,
          });
      }

      // ========================================================
      // DELETE
      // ========================================================

      const deletedCount =
        await deleteMessagesIndividuallyOrBulk(
          messagesToDelete
        );

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
      // DELETE COMMAND
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
          action:
            'Messages Purged',

          target:
            targetUserId
              ? `${targetDisplayName} (${targetUserId}) — ${channel} (${deletedCount} messages)`
              : `${channel} (${deletedCount} messages)`,

          executor:
            `${message.author.tag} (${message.author.id})`,

          reason:
            targetUserId
              ? `Deleted ${deletedCount} messages sent by ${targetDisplayName}`
              : `Deleted ${deletedCount} messages`,

          metadata: {
            channelId:
              channel.id,

            messageCount:
              deletedCount,

            requestedAmount:
              amount,

            targetUserId:
              targetUserId || null,

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

// ============================================================
// DELETE MESSAGES
// ============================================================

async function deleteMessagesIndividuallyOrBulk(
  messages
) {
  if (!messages || messages.length === 0) {
    return 0;
  }

  /*
   * Convert to an array in case a Collection was passed.
   */

  const messageArray =
    Array.isArray(messages)
      ? messages
      : [...messages.values()];

  const now =
    Date.now();

  const recentMessages = [];
  const oldMessages = [];

  /*
   * Separate messages into:
   *
   * - Recent: can use bulkDelete()
   * - Old: must be deleted individually
   */

  for (const message of messageArray) {
    if (!message) {
      continue;
    }

    const age =
      now - message.createdTimestamp;

    if (age < FOURTEEN_DAYS_MS) {
      recentMessages.push(message);
    } else {
      oldMessages.push(message);
    }
  }

  let deletedCount = 0;

  // ==========================================================
  // DELETE RECENT MESSAGES IN BULK
  // ==========================================================

  if (recentMessages.length > 0) {
    try {
      /*
       * Discord allows up to 100 messages per bulk delete.
       */

      for (
        let i = 0;
        i < recentMessages.length;
        i += 100
      ) {
        const chunk =
          recentMessages.slice(
            i,
            i + 100
          );

        try {
          const deleted =
            await messageArray[0].channel.bulkDelete(
              chunk,
              true
            );

          deletedCount +=
            deleted.size;

        } catch (error) {
          /*
           * If bulk deletion fails for any reason,
           * fall back to deleting these messages individually.
           */

          logger.warn(
            'Bulk deletion failed. Falling back to individual deletion.',
            error
          );

          for (const message of chunk) {
            try {
              await message.delete(
                'Purge command'
              );

              deletedCount++;
            } catch (deleteError) {
              logger.warn(
                `Could not delete message ${message.id}:`,
                deleteError
              );
            }
          }
        }
      }
    } catch (error) {
      logger.warn(
        'Recent message bulk deletion failed:',
        error
      );
    }
  }

  // ==========================================================
  // DELETE OLD MESSAGES INDIVIDUALLY
  // ==========================================================

  if (oldMessages.length > 0) {
    for (const message of oldMessages) {
      try {
        await message.delete(
          'Purge command'
        );

        deletedCount++;

      } catch (error) {
        /*
         * Ignore messages that have already been deleted
         * or can no longer be accessed.
         */

        logger.warn(
          `Could not individually delete old message ${message.id}:`,
          error
        );
      }
    }
  }

  return deletedCount;
}

// ============================================================
// FIND MESSAGES BY USER
// ============================================================

async function findMessagesByUser({
  channel,
  userId,
  amount,
  beforeMessageId = null,
}) {
  const foundMessages = [];

  let before =
    beforeMessageId || undefined;

  /*
   * Keep searching until:
   *
   * 1. We have found the requested amount, or
   * 2. There are no more messages.
   */

  while (
    foundMessages.length < amount
  ) {
    const remaining =
      amount - foundMessages.length;

    const fetchLimit =
      Math.min(
        100,
        Math.max(1, remaining)
      );

    const fetched =
      await channel.messages.fetch({
        limit: fetchLimit,
        before,
      });

    if (fetched.size === 0) {
      break;
    }

    for (const msg of fetched.values()) {
      if (
        msg.author?.id === userId
      ) {
        foundMessages.push(msg);
      }

      if (
        foundMessages.length >= amount
      ) {
        break;
      }
    }

    /*
     * Get the oldest message we just fetched.
     */

    const oldest =
      fetched.last();

    if (!oldest) {
      break;
    }

    before =
      oldest.id;

    /*
     * If Discord returned fewer messages than requested,
     * there are no more messages to search.
     */

    if (
      fetched.size < fetchLimit
    ) {
      break;
    }
  }

  return foundMessages.slice(
    0,
    amount
  );
}

// ============================================================
// RESOLVE PREFIX TARGET
// ============================================================

async function resolveTargetUser(
  message,
  input
) {
  /*
   * Discord mention:
   *
   * <@123456789>
   * <@!123456789>
   */

  const mentionMatch =
    input.match(
      /^<@!?(\d+)>$/
    );

  if (mentionMatch) {
    const userId =
      mentionMatch[1];

    const member =
      await message.guild.members
        .fetch(userId)
        .catch(() => null);

    if (member) {
      return member.user;
    }

    return null;
  }

  /*
   * Direct Discord user ID.
   */

  if (/^\d{17,20}$/.test(input)) {
    const member =
      await message.guild.members
        .fetch(input)
        .catch(() => null);

    if (member) {
      return member.user;
    }

    /*
     * The user might not currently be in the guild.
     */

    const user =
      await message.client.users
        .fetch(input)
        .catch(() => null);

    return user || null;
  }

  /*
   * Try matching:
   *
   * - username
   * - global name
   * - server display name
   * - Discord tag
   */

  const search =
    input.toLowerCase();

  const members =
    await message.guild.members
      .fetch()
      .catch(() => null);

  if (!members) {
    return null;
  }

  const member =
    members.find((guildMember) => {
      const username =
        guildMember.user.username
          ?.toLowerCase();

      const globalName =
        guildMember.user.globalName
          ?.toLowerCase();

      const displayName =
        guildMember.displayName
          ?.toLowerCase();

      const tag =
        guildMember.user.tag
          ?.toLowerCase();

      return (
        username === search ||
        globalName === search ||
        displayName === search ||
        tag === search
      );
    });

  return member?.user || null;
}