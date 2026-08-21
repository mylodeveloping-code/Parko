import {
  PermissionFlagsBits,
} from 'discord.js';

import { logger } from '../../utils/logger.js';

import {
  TitanBotError,
  ErrorTypes,
} from '../../utils/errorHandler.js';

import {
  logModerationAction,
  saveTimeoutRoles,
  restoreTimeoutRoles,
  getMemberRoleIds,
  applyMutedRole,
} from '../../utils/moderation.js';

// ============================================================
// HELPERS
// ============================================================

function getTargetLabel(target) {
  return (
    target.user?.tag ??
    target.displayName ??
    'this user'
  );
}

function getHighestRole(member) {
  return member?.roles?.highest ?? null;
}

// ============================================================
// DURATION PARSER
// ============================================================

function parseDuration(value) {
  if (!value) {
    return null;
  }

  const normalized =
    String(value).trim();

  const match =
    normalized.match(
      /^(\d+)\s*(s|m|h|d|w)$/i
    );

  if (!match) {
    throw new TitanBotError(
      'Invalid duration',
      ErrorTypes.USER_INPUT,
      'Invalid ban length. Use formats like `30m`, `12h`, `7d`, or `2w`.'
    );
  }

  const amount =
    Number(match[1]);

  const unit =
    match[2].toLowerCase();

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  };

  const durationMs =
    amount * multipliers[unit];

  if (
    !Number.isSafeInteger(durationMs) ||
    durationMs <= 0
  ) {
    throw new TitanBotError(
      'Invalid duration',
      ErrorTypes.USER_INPUT,
      'The ban length is too large or invalid.'
    );
  }

  return durationMs;
}

// ============================================================
// MODERATION SERVICE
// ============================================================

export class ModerationService {

  // ==========================================================
  // HIERARCHY MESSAGE
  // ==========================================================

  static buildHierarchyMessage({
    actor,
    actorRole,
    targetRole,
    targetLabel,
    action,
  }) {
    if (actor === 'moderator') {
      return (
        `You cannot ${action} **${targetLabel}** — ` +
        `their role **${targetRole.name}** is equal to or above yours ` +
        `(**${actorRole.name}**). ` +
        `In **Server Settings → Roles**, drag your moderator role ` +
        `above **${targetRole.name}**.`
      );
    }

    return (
      `I cannot ${action} **${targetLabel}** — ` +
      `my role **${actorRole.name}** is equal to or below theirs ` +
      `(**${targetRole.name}**). ` +
      `In **Server Settings → Roles**, drag my bot role ` +
      `above **${targetRole.name}**.`
    );
  }

  // ==========================================================
  // HIERARCHY SKIP REASON
  // ==========================================================

  static buildHierarchySkipReason(
    moderator,
    target,
    action,
    actor = 'moderator'
  ) {
    const targetLabel =
      getTargetLabel(target);

    const targetRole =
      getHighestRole(target);

    if (actor === 'bot') {
      const botMember =
        target.guild?.members?.me;

      const botRole =
        getHighestRole(botMember);

      if (!botRole || !targetRole) {
        return (
          `Bot role hierarchy blocked ` +
          `${action} for ${targetLabel}`
        );
      }

      return (
        `Bot role **${botRole.name}** is too low for ` +
        `**${targetRole.name}** — move the bot role higher`
      );
    }

    const modRole =
      getHighestRole(moderator);

    if (!modRole || !targetRole) {
      return (
        `Role hierarchy blocked ` +
        `${action} for ${targetLabel}`
      );
    }

    return (
      `Your role **${modRole.name}** is too low for ` +
      `**${targetRole.name}** — move your role higher`
    );
  }

  // ==========================================================
  // VALIDATE MODERATOR HIERARCHY
  // ==========================================================

  static validateHierarchy(
    moderator,
    target,
    action
  ) {
    if (!moderator || !target) {
      return {
        valid: false,
        error: 'Invalid moderator or target',
      };
    }

    if (
      moderator.guild?.ownerId ===
      moderator.id
    ) {
      return {
        valid: true,
      };
    }

    const modRole =
      getHighestRole(moderator);

    const targetRole =
      getHighestRole(target);

    if (!modRole || !targetRole) {
      return {
        valid: false,
        error:
          'Could not resolve role hierarchy. Try mentioning the user or use the slash command.',
      };
    }

    if (
      modRole.position <=
      targetRole.position
    ) {
      return {
        valid: false,
        error:
          this.buildHierarchyMessage({
            actor: 'moderator',
            actorRole: modRole,
            targetRole,
            targetLabel:
              getTargetLabel(target),
            action,
          }),
      };
    }

    return {
      valid: true,
    };
  }

  // ==========================================================
  // VALIDATE BOT HIERARCHY
  // ==========================================================

  static validateBotHierarchy(
    target,
    action
  ) {
    if (!target) {
      return {
        valid: false,
        error: 'Invalid target',
      };
    }

    const botMember =
      target.guild?.members?.me;

    if (!botMember) {
      return {
        valid: false,
        error: 'Bot is not in the guild',
      };
    }

    const botRole =
      getHighestRole(botMember);

    const targetRole =
      getHighestRole(target);

    if (!botRole || !targetRole) {
      return {
        valid: false,
        error:
          'Could not resolve bot role hierarchy. Check that my role is configured in this server.',
      };
    }

    /*
     * The bot cannot modify the server owner.
     */
    if (
      target.guild.ownerId ===
      target.id
    ) {
      return {
        valid: false,
        error:
          `I cannot ${action} the server owner.`,
      };
    }

    /*
     * Discord does not allow a bot to manage a role
     * that is equal to or higher than the bot's highest role.
     */
    if (
      botRole.position <=
      targetRole.position
    ) {
      return {
        valid: false,
        error:
          this.buildHierarchyMessage({
            actor: 'bot',
            actorRole: botRole,
            targetRole,
            targetLabel:
              getTargetLabel(target),
            action,
          }),
      };
    }

    return {
      valid: true,
    };
  }

  // ==========================================================
  // ASSERT MODERATION HIERARCHY
  // ==========================================================

  static assertModerationHierarchy(
    moderator,
    target,
    action
  ) {
    const botCheck =
      this.validateBotHierarchy(
        target,
        action
      );

    if (!botCheck.valid) {
      throw new TitanBotError(
        botCheck.error,
        ErrorTypes.PERMISSION,
        botCheck.error
      );
    }

    const modCheck =
      this.validateHierarchy(
        moderator,
        target,
        action
      );

    if (!modCheck.valid) {
      throw new TitanBotError(
        modCheck.error,
        ErrorTypes.PERMISSION,
        modCheck.error
      );
    }
  }

  // ============================================================
  // BAN
  // ============================================================

  static async banUser({
    guild,
    user,
    moderator,
    reason = 'No reason provided',
    deleteDays = 0,
    length = null,
  }) {
    try {
      if (
        !guild ||
        !user ||
        !moderator
      ) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Guild, user, and moderator are required'
        );
      }

      const durationMs =
        parseDuration(length);

      const expiresAt =
        durationMs
          ? Date.now() + durationMs
          : null;

      let targetMember =
        null;

      try {
        targetMember =
          await guild.members
            .fetch(user.id)
            .catch(() => null);
      } catch (err) {
        logger.debug(
          'Target not in guild, proceeding with ban'
        );
      }

      if (targetMember) {
        this.assertModerationHierarchy(
          moderator,
          targetMember,
          'ban'
        );
      } else {
        const isOwner =
          guild.ownerId ===
          moderator.id;

        const hasHighPerms =
          moderator.permissions.has([
            PermissionFlagsBits.ManageGuild,
            PermissionFlagsBits.Administrator,
          ]);

        if (
          !isOwner &&
          !hasHighPerms
        ) {
          throw new TitanBotError(
            'You do not have sufficient permissions to ban users who are not in the server.',
            ErrorTypes.PERMISSION,
            'You need "Manage Server" or "Administrator" permissions to ban users not currently in the guild.'
          );
        }
      }

      await guild.members.ban(
        user.id,
        {
          reason,
          deleteMessageSeconds:
            deleteDays *
            24 *
            60 *
            60,
        }
      );

      const caseId =
        await logModerationAction({
          client: guild.client,
          guild,
          event: {
            action: 'Member Banned',

            target:
              `${user.tag} (${user.id})`,

            executor:
              `${moderator.user.tag} (${moderator.id})`,

            reason,

            duration:
              length ||
              'Permanent',

            metadata: {
              userId: user.id,
              moderatorId:
                moderator.id,

              permanent:
                !durationMs,

              deleteDays,

              durationMs,

              expiresAt,
            },
          },
        });

      logger.info(
        `User banned: ${user.tag} ` +
        `by ${moderator.user.tag} ` +
        `in ${guild.name}` +
        (
          length
            ? ` for ${length}`
            : ' permanently'
        )
      );

      if (durationMs) {
        setTimeout(
          async () => {
            try {
              const bans =
                await guild.bans.fetch();

              const banInfo =
                bans.get(user.id);

              if (!banInfo) {
                logger.info(
                  `Timed ban for ${user.tag} expired, ` +
                  `but user is already unbanned.`
                );

                return;
              }

              await guild.members.unban(
                user.id,
                'Temporary ban expired'
              );

              await logModerationAction({
                client:
                  guild.client,

                guild,

                event: {
                  action:
                    'Temporary Ban Expired',

                  target:
                    `${user.tag} (${user.id})`,

                  executor:
                    `${guild.client.user.tag} ` +
                    `(${guild.client.user.id})`,

                  reason:
                    'Ban duration expired',

                  metadata: {
                    userId:
                      user.id,

                    expiresAt,

                    originalCaseId:
                      caseId,
                  },
                },
              });

              logger.info(
                `Temporary ban expired: ` +
                `${user.tag} in ${guild.name}`
              );
            } catch (error) {
              logger.error(
                `Error automatically unbanning ` +
                `${user.tag}:`,
                error
              );
            }
          },
          durationMs
        );
      }

      return {
        caseId,
        user: user.tag,
        reason,
        length:
          length || null,
        durationMs,
        expiresAt,
      };
    } catch (error) {
      logger.error(
        'Error banning user:',
        error
      );

      throw error;
    }
  }

  // ============================================================
  // KICK
  // ============================================================

  static async kickUser({
    guild,
    member,
    moderator,
    reason = 'No reason provided',
  }) {
    try {
      if (
        !guild ||
        !member ||
        !moderator
      ) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Guild, member, and moderator are required'
        );
      }

      this.assertModerationHierarchy(
        moderator,
        member,
        'kick'
      );

      if (!member.kickable) {
        const targetLabel =
          getTargetLabel(member);

        throw new TitanBotError(
          'Cannot kick member',
          ErrorTypes.PERMISSION,
          `I cannot kick **${targetLabel}**. They may have **Administrator** permission or a managed/integration role. ` +
          'Ensure my bot role is above theirs in **Server Settings → Roles** and that they do not have Admin.'
        );
      }

      await member.kick(reason);

      const caseId =
        await logModerationAction({
          client: guild.client,
          guild,
          event: {
            action:
              'Member Kicked',

            target:
              `${member.user.tag} (${member.id})`,

            executor:
              `${moderator.user.tag} (${moderator.id})`,

            reason,

            metadata: {
              userId:
                member.id,

              moderatorId:
                moderator.id,
            },
          },
        });

      logger.info(
        `User kicked: ${member.user.tag} ` +
        `by ${moderator.user.tag} ` +
        `in ${guild.name}`
      );

      return {
        caseId,
        user:
          member.user.tag,
        reason,
      };
    } catch (error) {
      logger.error(
        'Error kicking user:',
        error
      );

      throw error;
    }
  }

  // ============================================================
  // TIMEOUT
  // ============================================================

  static async timeoutUser({
    guild,
    member,
    moderator,
    durationMs,
    reason = 'No reason provided',
  }) {
    try {
      if (
        !guild ||
        !member ||
        !moderator ||
        !durationMs
      ) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Guild, member, moderator, and duration are required'
        );
      }

      /*
       * IMPORTANT:
       *
       * We still enforce Discord's hierarchy rules.
       *
       * This means the bot must be ABOVE the target's
       * highest role. If the target has Administrator,
       * the Administrator role must therefore also be
       * below the bot's role.
       *
       * The moderator must also be above the target,
       * unless the moderator is the server owner.
       */
      this.assertModerationHierarchy(
        moderator,
        member,
        'timeout'
      );

      const botMember =
        guild.members.me;

      if (!botMember) {
        throw new TitanBotError(
          'Bot member unavailable',
          ErrorTypes.INTERNAL,
          'I could not resolve my bot member in this server.'
        );
      }

      /*
       * A server owner cannot be modified.
       */
      if (
        guild.ownerId ===
        member.id
      ) {
        throw new TitanBotError(
          'Cannot timeout server owner',
          ErrorTypes.PERMISSION,
          'I cannot timeout the server owner.'
        );
      }

      /*
       * ========================================================
       * SAVE ORIGINAL ROLES FIRST
       * ========================================================
       *
       * This must happen BEFORE removing anything.
       *
       * The saved list is later used to restore the user's
       * roles after the timeout expires.
       */

      const previousRoleIds =
        getMemberRoleIds(member);

      const expiresAt =
        Date.now() +
        durationMs;

      const saved =
        await saveTimeoutRoles({
          guildId:
            guild.id,

          userId:
            member.id,

          roleIds:
            previousRoleIds,

          expiresAt,
        });

      if (!saved) {
        throw new TitanBotError(
          'Could not save user roles',
          ErrorTypes.DATABASE,
          'I could not save the user\'s previous roles, so the timeout was cancelled to prevent their roles from being lost.'
        );
      }

      /*
       * ========================================================
       * ADMINISTRATOR SUPPORT
       * ========================================================
       *
       * Discord's native timeout cannot be applied while a
       * member has Administrator permission.
       *
       * Therefore, before calling member.timeout(), we remove
       * every role that the bot can manage.
       *
       * The roles were already saved above, so they can be
       * restored automatically later.
       */

      const removableRoles =
        member.roles.cache.filter(
          (role) =>
            role.id !== guild.id &&
            !role.managed &&
            role.editable &&
            role.position <
              botMember.roles.highest.position
        );

      /*
       * Remove manageable roles.
       *
       * This includes an Administrator role if the bot is
       * positioned above it.
       */
      if (removableRoles.size > 0) {
        try {
          await member.roles.remove(
            removableRoles,
            'Removing roles for timeout/mute'
          );

          logger.info(
            `Removed ${removableRoles.size} role(s) from ` +
            `${member.user.tag} for timeout`,
            {
              userId:
                member.id,

              guildId:
                guild.id,

              rolesRemoved:
                [...removableRoles.values()].map(
                  (role) => role.id
                ),
            }
          );
        } catch (roleError) {
          logger.error(
            `Failed to remove roles from ${member.user.tag} before timeout`,
            {
              userId:
                member.id,

              guildId:
                guild.id,

              error:
                roleError,
            }
          );

          throw new TitanBotError(
            'Could not remove user roles',
            ErrorTypes.PERMISSION,
            'I could not temporarily remove the user\'s roles. Make sure my bot role is above all of the user\'s roles and that I have Manage Roles permission.'
          );
        }
      }

      /*
       * ========================================================
       * APPLY MUTED ROLE
       * ========================================================
       */

      const mutedApplied =
        await applyMutedRole(
          member
        );

      if (!mutedApplied) {
        /*
         * Try to restore the original roles if applying the
         * muted role failed.
         */
        try {
          await restoreTimeoutRoles(
            member
          );
        } catch (restoreError) {
          logger.error(
            'Failed to restore roles after muted role failure',
            restoreError
          );
        }

        throw new TitanBotError(
          'Could not apply muted role',
          ErrorTypes.PERMISSION,
          'I could not apply the Muted role. Check that my bot role is above the Muted role and that I have Manage Roles permission.'
        );
      }

      /*
       * ========================================================
       * DISCORD NATIVE TIMEOUT
       * ========================================================
       *
       * At this point Administrator permissions have been
       * removed (if the user had them), so Discord can apply
       * the native timeout.
       */

      try {
        await member.timeout(
          durationMs,
          reason
        );
      } catch (timeoutError) {
        /*
         * If Discord's native timeout fails, attempt to undo
         * everything we changed.
         */
        logger.error(
          `Native Discord timeout failed for ${member.user.tag}`,
          {
            userId:
              member.id,

            guildId:
              guild.id,

            error:
              timeoutError,
          }
        );

        try {
          await restoreTimeoutRoles(
            member
          );
        } catch (restoreError) {
          logger.error(
            `Failed to restore roles after timeout failure for ${member.user.tag}`,
            restoreError
          );
        }

        throw new TitanBotError(
          'Discord timeout failed',
          ErrorTypes.PERMISSION,
          `I could not apply the Discord timeout to **${getTargetLabel(member)}**. Make sure I have **Moderate Members** and **Manage Roles**, and that my bot role is above the target's roles.`
        );
      }

      const durationMinutes =
        Math.floor(
          durationMs / 60000
        );

      /*
       * ========================================================
       * LOG MODERATION CASE
       * ========================================================
       */

      const caseId =
        await logModerationAction({
          client:
            guild.client,

          guild,

          event: {
            action:
              'Member Timed Out',

            target:
              `${member.user.tag} (${member.id})`,

            executor:
              `${moderator.user.tag} (${moderator.id})`,

            reason,

            duration:
              `${durationMinutes} minutes`,

            metadata: {
              userId:
                member.id,

              moderatorId:
                moderator.id,

              durationMs,

              expiresAt,

              mutedRoleId:
                '1537615321438093425',

              previousRoleIds,

              administratorRolesRemoved:
                removableRoles
                  .filter(
                    (role) =>
                      role.permissions.has(
                        PermissionFlagsBits.Administrator
                      )
                  )
                  .map(
                    (role) =>
                      role.id
                  ),
            },
          },
        });

      logger.info(
        `User timed out and muted: ` +
        `${member.user.tag} by ` +
        `${moderator.user.tag} in ` +
        `${guild.name}`
      );

      /*
       * ========================================================
       * AUTOMATIC EXPIRATION
       * ========================================================
       */

      setTimeout(
        async () => {
          try {
            const currentMember =
              await guild.members
                .fetch(member.id)
                .catch(() => null);

            if (!currentMember) {
              logger.warn(
                `Could not find ${member.user.tag} ` +
                `when timeout expired.`
              );

              return;
            }

            /*
             * Remove the native Discord timeout first.
             */
            try {
              if (
                currentMember.isCommunicationDisabled()
              ) {
                await currentMember.timeout(
                  null,
                  'Timeout duration expired'
                );
              }
            } catch (timeoutError) {
              logger.error(
                `Failed to remove native timeout from ${currentMember.user.tag}`,
                {
                  userId:
                    currentMember.id,

                  guildId:
                    guild.id,

                  error:
                    timeoutError,
                }
              );
            }

            /*
             * Restore the user's original roles.
             *
             * restoreTimeoutRoles() is responsible for removing
             * the Muted role and restoring the saved roles.
             */
            const restored =
              await restoreTimeoutRoles(
                currentMember
              );

            if (restored) {
              logger.info(
                `Timeout expired automatically: ` +
                `${currentMember.user.tag} in ` +
                `${guild.name}. Roles restored.`
              );
            } else {
              logger.warn(
                `Timeout expired for ` +
                `${currentMember.user.tag}, but saved roles ` +
                `could not be restored.`
              );
            }

            await logModerationAction({
              client:
                guild.client,

              guild,

              event: {
                action:
                  'Member Timeout Expired',

                target:
                  `${currentMember.user.tag} ` +
                  `(${currentMember.id})`,

                executor:
                  `${guild.client.user.tag} ` +
                  `(${guild.client.user.id})`,

                reason:
                  'Timeout duration expired',

                metadata: {
                  userId:
                    currentMember.id,

                  expiresAt,

                  rolesRestored:
                    restored,
                },
              },
            });
          } catch (error) {
            logger.error(
              `Error automatically removing expired timeout ` +
              `for ${member.user.tag}:`,
              error
            );
          }
        },
        durationMs
      );

      return {
        caseId,

        user:
          member.user.tag,

        duration:
          durationMinutes,

        reason,
      };
    } catch (error) {
      logger.error(
        'Error timing out user:',
        error
      );

      throw error;
    }
  }

  // ============================================================
  // REMOVE TIMEOUT / RESTORE ROLES
  // ============================================================

  static async removeTimeoutUser({
    guild,
    member,
    moderator,
    reason =
      'Timeout removed by moderator',
  }) {
    try {
      if (
        !guild ||
        !member ||
        !moderator
      ) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Guild, member, and moderator are required'
        );
      }

      this.assertModerationHierarchy(
        moderator,
        member,
        'remove the timeout from'
      );

      if (
        !member.moderatable
      ) {
        const targetLabel =
          getTargetLabel(member);

        throw new TitanBotError(
          'Cannot modify member',
          ErrorTypes.PERMISSION,
          `I cannot modify **${targetLabel}**. Ensure my bot role is above theirs in **Server Settings → Roles**.`
        );
      }

      if (
        !member.isCommunicationDisabled()
      ) {
        throw new TitanBotError(
          'User not timed out',
          ErrorTypes.VALIDATION,
          `${member.user.tag} is not currently timed out`
        );
      }

      await member.timeout(
        null,
        reason
      );

      const restored =
        await restoreTimeoutRoles(
          member
        );

      if (!restored) {
        logger.warn(
          `Timeout removed from ${member.user.tag}, ` +
          `but no saved roles could be restored.`
        );
      }

      await logModerationAction({
        client:
          guild.client,

        guild,

        event: {
          action:
            'Member Untimeouted',

          target:
            `${member.user.tag} (${member.id})`,

          executor:
            `${moderator.user.tag} (${moderator.id})`,

          reason,

          metadata: {
            userId:
              member.id,

            moderatorId:
              moderator.id,

            rolesRestored:
              restored,
          },
        },
      });

      logger.info(
        `Timeout removed and roles restored: ` +
        `${member.user.tag} by ` +
        `${moderator.user.tag} in ` +
        `${guild.name}`
      );

      return {
        user:
          member.user.tag,

        rolesRestored:
          restored,
      };
    } catch (error) {
      logger.error(
        'Error removing timeout:',
        error
      );

      throw error;
    }
  }

  // ============================================================
  // UNBAN
  // ============================================================

  static async unbanUser({
    guild,
    user,
    moderator,
    reason = 'No reason provided',
  }) {
    try {
      if (
        !guild ||
        !user ||
        !moderator
      ) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Guild, user, and moderator are required'
        );
      }

      const bans =
        await guild.bans.fetch();

      const banInfo =
        bans.get(user.id);

      if (!banInfo) {
        throw new TitanBotError(
          'User not banned',
          ErrorTypes.VALIDATION,
          `${user.tag} is not currently banned from this server`
        );
      }

      await guild.members.unban(
        user.id,
        reason
      );

      const caseId =
        await logModerationAction({
          client:
            guild.client,

          guild,

          event: {
            action:
              'Member Unbanned',

            target:
              `${user.tag} (${user.id})`,

            executor:
              `${moderator.user.tag} (${moderator.id})`,

            reason,

            metadata: {
              userId:
                user.id,

              moderatorId:
                moderator.id,
            },
          },
        });

      logger.info(
        `User unbanned: ${user.tag} ` +
        `by ${moderator.user.tag} ` +
        `in ${guild.name}`
      );

      return {
        caseId,

        user:
          user.tag,

        reason,
      };
    } catch (error) {
      logger.error(
        'Error unbanning user:',
        error
      );

      throw error;
    }
  }
}