import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import {
  restoreTimeoutRoles,
  getTimeoutRoles,
} from '../utils/moderation.js';

export default {
  name: Events.GuildMemberUpdate,
  once: false,

  async execute(oldMember, newMember) {
    try {
      if (!newMember.guild) return;

      // ============================================================
      // AUTOMATIC TIMEOUT EXPIRATION
      // ============================================================
      //
      // Discord fires GuildMemberUpdate when a timeout is removed.
      // We detect:
      //
      //   oldMember = timed out
      //   newMember = no longer timed out
      //
      // Then restore the user's previous roles and remove the
      // custom Muted role.
      //
      const wasTimedOut =
        oldMember.communicationDisabledUntilTimestamp &&
        oldMember.communicationDisabledUntilTimestamp > Date.now();

      const isTimedOut =
        newMember.communicationDisabledUntilTimestamp &&
        newMember.communicationDisabledUntilTimestamp > Date.now();

      if (wasTimedOut && !isTimedOut) {
        logger.info(
          `Detected expired timeout for ${newMember.user.tag} (${newMember.id}) in ${newMember.guild.name}`
        );

        // Make sure this was a timeout managed by our bot.
        const savedTimeout = await getTimeoutRoles(
          newMember.guild.id,
          newMember.id
        );

        if (savedTimeout) {
          const restored = await restoreTimeoutRoles(newMember);

          if (restored) {
            logger.info(
              `Automatically restored roles for ${newMember.user.tag} (${newMember.id}) after timeout expiration`
            );

            // Log the automatic restoration.
            await logEvent({
              client: newMember.client,
              guildId: newMember.guild.id,
              eventType: EVENT_TYPES.MODERATION_UNTIMEOUT,
              data: {
                title: 'Timeout expired',
                lines: [
                  `**User:** ${newMember.user.toString()} (${newMember.user.tag})`,
                  `**ID:** \`${newMember.user.id}\``,
                  `**Action:** Timeout expired automatically`,
                  `**Result:** Previous roles restored and Muted role removed`,
                ],
                thumbnail: newMember.user.displayAvatarURL({
                  dynamic: true,
                }),
                userId: newMember.user.id,
              },
            });
          } else {
            logger.warn(
              `Timeout expired for ${newMember.user.tag} (${newMember.id}), but roles could not be fully restored`
            );
          }
        } else {
          logger.debug(
            `Timeout expired for ${newMember.user.tag} (${newMember.id}), but no saved timeout-role data exists`
          );
        }
      }

      // ============================================================
      // NICKNAME CHANGE LOGGING
      // ============================================================

      if (oldMember.nickname !== newMember.nickname) {
        await logEvent({
          client: newMember.client,
          guildId: newMember.guild.id,
          eventType: EVENT_TYPES.MEMBER_NAME_CHANGE,
          data: {
            title: 'Nickname changed',
            lines: [
              `**User:** ${newMember.user.toString()} (${newMember.user.tag})`,
              `**ID:** \`${newMember.user.id}\``,
              `**Before:** ${oldMember.nickname || '*(no nickname)*'}`,
              `**After:** ${newMember.nickname || '*(no nickname)*'}`,
            ],
            thumbnail: newMember.user.displayAvatarURL({
              dynamic: true,
            }),
            userId: newMember.user.id,
          },
        });
      }

    } catch (error) {
      logger.error(
        'Error in guildMemberUpdate event:',
        error
      );
    }
  },
};
