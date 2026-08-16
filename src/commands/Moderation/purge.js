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
      let deletedCount = 0;

      // ========================================================
      // NO TARGET
      // ========================================================

      if (!target) {
        /*
         * No target was specified.
         *
         * Simply delete the newest requested amount
         * of messages.
         */

        const fetched =
          await channel.messages.fetch({
            limit: amount,
          });

        const deleted =
          await channel.bulkDelete(
            fetched,
            true
          );

        deletedCount =
          deleted.size;
      }

      // ========================================================
      // TARGET SPECIFIED
      // ========================================================

      else {
        /*
         * Target was specified.
         *
         * Discord only lets us fetch up to 100 messages
         * at a time, so we search backwards through the
         * channel until we have found the requested amount.
         */

        const messagesToDelete =
          await findMessagesByUser({
            channel,
            userId: target.id,
            amount,
          });

        if (messagesToDelete.length > 0) {
          const deleted =
            await channel.bulkDelete(
              messagesToDelete,
              true
            );

          deletedCount =
            deleted.size;
        }
      }

      // ========================================================
      // LOG
      // ========================================================

      await logEvent({
        client,
        guild: interaction.guild,
        event: {
          action: 'Messages Purged',

          target: target
            ? `${target.tag || target.username} (${target.id})`
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
     * Supports:
     *
     * .purge 100 @Dyno
     * .purge 100 155149108183695360
     * .purge 100 Dyno
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
         * Search backwards through the channel for messages
         * sent by the requested user.
         *
         * The .purge command itself is excluded because
         * we always fetch messages before message.id.
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
   * 1. We have found the requested number of messages, or
   * 2. Discord has no more messages to give us.
   */

  while (
    foundMessages.length < amount
  ) {
    const remaining =
      amount - foundMessages.length;

    /*
     * Discord allows a maximum of 100 messages
     * per fetch.
     */

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
      /*
       * Only include messages from the target user.
       */

      if (
        msg.author?.id === userId
      ) {
        /*
         * Only include messages that Discord can
         * bulk delete.
         *
         * bulkDelete(..., true) also ignores old messages,
         * but avoiding them here makes the result cleaner.
         */

        if (
          Date.now() - msg.createdTimestamp <
          14 * 24 * 60 * 60 * 1000
        ) {
          foundMessages.push(msg);
        }
      }

      if (
        foundMessages.length >= amount
      ) {
        break;
      }
    }

    /*
     * Use the oldest fetched message as the cursor
     * for the next request.
     */

    const oldest =
      fetched.last();

    if (!oldest) {
      break;
    }

    before =
      oldest.id;

    /*
     * If fewer than 100 messages were returned,
     * Discord has reached the end of the available
     * message history.
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
   * Remove Discord mention formatting:
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
     * The user may not currently be in the guild.
     * Try fetching them directly from Discord.
     */

    const user =
      await message.client.users
        .fetch(input)
        .catch(() => null);

    return user || null;
  }

  /*
   * Try matching a guild member by:
   *
   * - username
   * - display name
   * - global name
   * - tag
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