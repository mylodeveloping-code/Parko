import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';

import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  replyUserError,
  ErrorTypes,
} from '../../utils/errorHandler.js';
import { logEvent } from '../../utils/moderation.js';

// ============================================================
// DURATION PARSER
// ============================================================

function parseDuration(value) {
  if (!value) {
    return null;
  }

  const duration = String(value)
    .trim()
    .toLowerCase();

  // Disable slowmode.
  if (duration === 'off') {
    return 0;
  }

  // Discord's maximum slowmode is 6 hours.
  if (duration === 'max') {
    return 6 * 60 * 60;
  }

  const match = duration.match(
    /^(\d+)(s|m|h)$/
  );

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2];

  let seconds;

  if (unit === 's') {
    seconds = amount;
  } else if (unit === 'm') {
    seconds = amount * 60;
  } else if (unit === 'h') {
    seconds = amount * 60 * 60;
  } else {
    return null;
  }

  // Discord allows 0-21600 seconds.
  if (
    seconds < 0 ||
    seconds > 21600
  ) {
    return null;
  }

  return seconds;
}

// ============================================================
// FORMAT DURATION
// ============================================================

function formatDuration(seconds) {
  if (seconds === 0) {
    return 'disabled';
  }

  if (seconds === 21600) {
    return '6 hours';
  }

  if (seconds % 3600 === 0) {
    return `${seconds / 3600} hour${
      seconds / 3600 === 1 ? '' : 's'
    }`;
  }

  if (seconds % 60 === 0) {
    return `${seconds / 60} minute${
      seconds / 60 === 1 ? '' : 's'
    }`;
  }

  return `${seconds} second${
    seconds === 1 ? '' : 's'
  }`;
}

// ============================================================
// COMMAND
// ============================================================

export default {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set the slowmode for this channel')
    .addStringOption((option) =>
      option
        .setName('duration')
        .setDescription(
          'Examples: 10s, 1m, 1h, max, or off'
        )
        .setRequired(true)
    )
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageMessages
    ),

  category: 'moderation',

  abuseProtection: {
    maxAttempts: 10,
    windowMs: 60_000,
  },

  // ==========================================================
  // EXECUTE
  // ==========================================================

  async execute(interaction, config, client) {
    const isPrefixCommand =
      interaction._isPrefixCommand === true;

    try {
      // --------------------------------------------------------
      // GET DURATION
      // --------------------------------------------------------

      const durationInput =
        interaction.options.getString(
          'duration'
        );

      const seconds =
        parseDuration(
          durationInput
        );

      // --------------------------------------------------------
      // VALIDATION
      // --------------------------------------------------------

      if (seconds === null) {
        const errorMessage =
          'Invalid duration. Use a format such as `10s`, `1m`, `1h`, or `max`. Use `off` to disable slowmode.';

        if (isPrefixCommand) {
          await interaction.reply({
            embeds: [
              createEmbed({
                title: 'Invalid Input',
                description: errorMessage,
                color: 'error',
              }),
            ],
          });

          return;
        }

        await InteractionHelper.safeDefer(
          interaction,
          {
            flags: MessageFlags.Ephemeral,
          }
        );

        await replyUserError(
          interaction,
          {
            type: ErrorTypes.VALIDATION,
            message: errorMessage,
          }
        );

        return;
      }

      // --------------------------------------------------------
      // CHANNEL CHECK
      // --------------------------------------------------------

      const channel =
        interaction.channel;

      if (
        !channel ||
        typeof channel.setRateLimitPerUser !==
          'function'
      ) {
        const errorMessage =
          'Slowmode cannot be changed in this channel.';

        if (isPrefixCommand) {
          await interaction.reply({
            embeds: [
              createEmbed({
                title: 'Unable to Set Slowmode',
                description: errorMessage,
                color: 'error',
              }),
            ],
          });

          return;
        }

        await InteractionHelper.safeDefer(
          interaction,
          {
            flags: MessageFlags.Ephemeral,
          }
        );

        await replyUserError(
          interaction,
          {
            type: ErrorTypes.UNKNOWN,
            message: errorMessage,
          }
        );

        return;
      }

      // --------------------------------------------------------
      // SET SLOWMODE
      // --------------------------------------------------------

      await channel.setRateLimitPerUser(
        seconds,
        `Slowmode changed by ${
          interaction.user.tag
        }`
      );

      const durationText =
        formatDuration(seconds);

      // --------------------------------------------------------
      // LOG MODERATION ACTION
      // --------------------------------------------------------

      await logEvent({
        client,
        guild: interaction.guild,
        event: {
          action:
            seconds === 0
              ? 'Channel Slowmode Disabled'
              : 'Channel Slowmode Updated',

          target:
            `${channel} (${channel.id})`,

          executor:
            `${interaction.user.tag} (${interaction.user.id})`,

          reason:
            seconds === 0
              ? 'Slowmode disabled'
              : `Slowmode set to ${durationText}`,

          duration:
            durationText,

          metadata: {
            channelId:
              channel.id,

            slowmodeSeconds:
              seconds,

            moderatorId:
              interaction.user.id,

            commandType:
              isPrefixCommand
                ? 'prefix'
                : 'slash',
          },
        },
      });

      // --------------------------------------------------------
      // RESPONSE
      // --------------------------------------------------------

      const embed =
        createEmbed({
          title:
            seconds === 0
              ? '🔓 Slowmode Disabled'
              : '🐌 Slowmode Updated',

          description:
            seconds === 0
              ? `Slowmode has been **disabled** in ${channel}.`
              : `Slowmode in ${channel} has been set to **${durationText}**.`,

          color:
            'success',
        });

      if (isPrefixCommand) {
        await interaction.reply({
          embeds: [embed],
        });

        return;
      }

      await InteractionHelper.safeDefer(
        interaction,
        {
          flags: MessageFlags.Ephemeral,
        }
      );

      await InteractionHelper.safeEditReply(
        interaction,
        {
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        }
      );

      // Delete the slash-command response after 3 seconds.
      setTimeout(() => {
        interaction
          .deleteReply()
          .catch(() => {});
      }, 3000);
    } catch (error) {
      logger.error(
        'Slowmode command error:',
        error
      );

      const errorMessage =
        'An unexpected error occurred while changing the channel slowmode.';

      if (
        interaction._isPrefixCommand === true
      ) {
        await interaction
          .reply({
            embeds: [
              createEmbed({
                title: 'Error',
                description:
                  errorMessage,
                color: 'error',
              }),
            ],
          })
          .catch(() => {});

        return;
      }

      await replyUserError(
        interaction,
        {
          type: ErrorTypes.UNKNOWN,
          message: errorMessage,
        }
      ).catch(() => {});
    }
  },
};
