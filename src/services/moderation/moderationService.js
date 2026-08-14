import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { logModerationAction } from '../../utils/moderation.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MUTED_ROLE_ID = '1537615321438093425';

const TIMEOUT_ROLES_FILE = path.join(
  __dirname,
  '../../data/timeoutRoles.json'
);

// guildId:userId -> restore timer
const timeoutRestoreTimers = new Map();

// ============================================================
// TIMEOUT ROLE STORAGE
// ============================================================

async function loadTimeoutRoles() {
  try {
    const data = await fs.readFile(
      TIMEOUT_ROLES_FILE,
      'utf8'
    );

    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveTimeoutRoles(data) {
  await fs.mkdir(
    path.dirname(TIMEOUT_ROLES_FILE),
    {
      recursive: true,
    }
  );

  await fs.writeFile(
    TIMEOUT_ROLES_FILE,
    JSON.stringify(data, null, 2),
    'utf8'
  );
}

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
// MODERATION SERVICE
// ============================================================

export class ModerationService {

  // ==========================================================
  // HIERARCHY
  // ==========================================================

  static buildHierarchyMessage({
    actor,
    actorRole,
    targetRole,
    targetLabel,
    action
  }) {
    if (actor === 'moderator') {
      return (
        `You cannot ${action} **${targetLabel}** — their role **${targetRole.name}** is equal to or above yours (**${actorRole.name}**). ` +
        `In **Server Settings → Roles**, drag your moderator role above **${targetRole.name}**.`
      );
    }

    return (
      `I cannot ${action} **${targetLabel}** — my role **${actorRole.name}** is equal to or below theirs (**${targetRole.name}**). ` +
      `In **Server Settings → Roles**, drag my bot role above **${targetRole.name}**.`
    );
  }

  static buildHierarchySkipReason(
    moderator,
    target,
    action,
    actor = 'moderator'
  ) {
    const targetLabel = getTargetLabel(target);
    const targetRole = getHighestRole(target);

    if (actor === 'bot') {
      const botMember =
        target.guild?.members?.me;

      const botRole =
        getHighestRole(botMember);

      if (!botRole || !targetRole) {
        return `Bot role hierarchy blocked ${action} for ${targetLabel}`;
      }

      return (
        `Bot role **${botRole.name}** is too low for **${targetRole.name}** — move the bot role higher`
      );
    }

    const modRole =
      getHighestRole(moderator);

    if (!modRole || !targetRole) {
      return `Role hierarchy blocked ${action} for ${targetLabel}`;
    }

    return (
      `Your role **${modRole.name}** is too low for **${targetRole.name}** — move your role higher`
    );
  }

  static validateHierarchy(
    moderator,
    target,
    action
  ) {
    if (!moderator || !target) {
      return {
        valid: false,
        error:
          'Invalid moderator or target'
      };
    }

    if (
      moderator.guild?.ownerId ===
      moderator.id
    ) {
      return {
        valid: true
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
          'Could not resolve role hierarchy. Try mentioning the user or use the slash command.'
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
            action
          })
      };
    }

    return {
      valid: true
    };
  }

  static validateBotHierarchy(
    target,
    action
  ) {
    if (!target) {
      return {
        valid: false,
        error: 'Invalid target'
      };
    }

    const botMember =
      target.guild?.members?.me;

    if (!botMember) {
      return {
        valid: false,
        error:
          'Bot is not in the guild'
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
          'Could not resolve bot role hierarchy. Check that my role is configured in this server.'
      };
    }

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
            action
          })
      };
    }

    return {
      valid: true
    };
  }

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

  // ==========================================================
  // BAN
  // ==========================================================

  static async banUser({
    guild,
    user,
    moderator,
    reason = 'No reason provided',
    deleteDays = 0
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

      let targetMember = null;

      try {
        targetMember =
          await guild.members
            .fetch(user.id)
            .catch(() => null);
      } catch {
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
            PermissionFlagsBits.Administrator
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
          reason
        }
      );

      const caseId =
        await logModerationAction({
          client: guild.client,
          guild,
          event: {
            action:
              'Member Banned',

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

              permanent:
                true,

              deleteDays
            }
          }
        });

      logger.info(
        `User banned: ${user.tag} by ${moderator.user.tag} in ${guild.name}`
      );

      return {
        caseId,
        user: user.tag,
        reason
      };
    } catch (error) {
      logger.error(
        'Error banning user:',
        error
      );

      throw error;
    }
  }

  // ==========================================================
  // KICK
  // ==========================================================

  static async kickUser({
    guild,
    member,
    moderator,
    reason = 'No reason provided'
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
                moderator.id
            }
          }
        });

      logger.info(
        `User kicked: ${member.user.tag} by ${moderator.user.tag} in ${guild.name}`
      );

      return {
        caseId,
        user: member.user.tag,
        reason
      };
    } catch (error) {
      logger.error(
        'Error kicking user:',
        error
      );

      throw error;
    }
  }

  // ==========================================================
  // TIMEOUT
  // ==========================================================

  static async timeoutUser({
    guild,
    member,
    moderator,
    durationMs,
    reason = 'No reason provided'
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

      this.assertModerationHierarchy(
        moderator,
        member,
        'timeout'
      );

      if (!member.moderatable) {
        const targetLabel =
          getTargetLabel(member);

        throw new TitanBotError(
          'Cannot timeout member',
          ErrorTypes.PERMISSION,
          `I cannot timeout **${targetLabel}**. They may have **Administrator** permission or a managed/integration role. ` +
          'Ensure my bot role is above theirs in **Server Settings → Roles** and that they do not have Admin.'
        );
      }

      const mutedRole =
        guild.roles.cache.get(
          MUTED_ROLE_ID
        );

      if (!mutedRole) {
        throw new TitanBotError(
          'Muted role not found',
          ErrorTypes.CONFIGURATION,
          `The muted role (${MUTED_ROLE_ID}) could not be found.`
        );
      }

      if (!mutedRole.editable) {
        throw new TitanBotError(
          'Cannot manage muted role',
          ErrorTypes.PERMISSION,
          'I cannot manage the muted role. Make sure my bot role is above the muted role.'
        );
      }

      // ======================================================
      // SAVE CURRENT ROLES
      // ======================================================

      const previousRoleIds =
        member.roles.cache
          .filter(
            (role) =>
              role.id !== guild.id
          )
          .filter(
            (role) =>
              role.id !== MUTED_ROLE_ID
          )
          .filter(
            (role) =>
              !role.managed
          )
          .map(
            (role) =>
              role.id
          );

      const timeoutRoles =
        await loadTimeoutRoles();

      const timeoutKey =
        `${guild.id}:${member.id}`;

      const expiresAt =
        Date.now() + durationMs;

      timeoutRoles[timeoutKey] = {
        guildId:
          guild.id,

        userId:
          member.id,

        roleIds:
          previousRoleIds,

        expiresAt
      };

      await saveTimeoutRoles(
        timeoutRoles
      );

      // ======================================================
      // APPLY DISCORD TIMEOUT
      // ======================================================

      await member.timeout(
        durationMs,
        reason
      );

      // ======================================================
      // REMOVE NORMAL ROLES
      // ======================================================

      const rolesToRemove =
        member.roles.cache.filter(
          (role) =>
            role.id !== guild.id &&
            role.id !== MUTED_ROLE_ID &&
            !role.managed &&
            role.editable
        );

      if (rolesToRemove.size > 0) {
        await member.roles.remove(
          rolesToRemove,
          `Timeout: ${reason}`
        );
      }

      // ======================================================
      // ADD MUTED ROLE
      // ======================================================

      if (
        !member.roles.cache.has(
          MUTED_ROLE_ID
        )
      ) {
        await member.roles.add(
          mutedRole,
          `Timeout: ${reason}`
        );
      }

      // ======================================================
      // AUTOMATIC ROLE RESTORATION
      // ======================================================

      this.scheduleTimeoutRoleRestore(
        guild,
        member.id,
        expiresAt
      );

      const durationMinutes =
        Math.floor(
          durationMs / 60000
        );

      const caseId =
        await logModerationAction({
          client: guild.client,
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

              durationMs
            }
          }
        });

      logger.info(
        `User timed out: ${member.user.tag} by ${moderator.user.tag} in ${guild.name}`
      );

      return {
        caseId,
        user:
          member.user.tag,
        duration:
          durationMinutes,
        reason
      };
    } catch (error) {
      logger.error(
        'Error timing out user:',
        error
      );

      throw error;
    }
  }

  // ==========================================================
  // SCHEDULE AUTOMATIC ROLE RESTORATION
  // ==========================================================

  static scheduleTimeoutRoleRestore(
    guild,
    userId,
    expiresAt
  ) {
    const key =
      `${guild.id}:${userId}`;

    /*
     * If an old timer exists for this user,
     * cancel it before creating a new one.
     */
    const existingTimer =
      timeoutRestoreTimers.get(key);

    if (existingTimer) {
      clearTimeout(existingTimer);
      timeoutRestoreTimers.delete(key);
    }

    const remainingMs =
      Math.max(
        0,
        expiresAt - Date.now()
      );

    /*
     * Node.js setTimeout cannot safely handle delays
     * larger than this value.
     */
    const MAX_TIMEOUT =
      2147483647;

    const delay =
      Math.min(
        remainingMs,
        MAX_TIMEOUT
      );

    const timer =
      setTimeout(
        async () => {
          timeoutRestoreTimers.delete(
            key
          );

          /*
           * If the timeout is longer than the maximum
           * Node.js timer, schedule the remaining time.
           */
          if (
            remainingMs >
            MAX_TIMEOUT
          ) {
            this.scheduleTimeoutRoleRestore(
              guild,
              userId,
              expiresAt
            );

            return;
          }

          try {
            const member =
              await guild.members
                .fetch(userId)
                .catch(
                  () => null
                );

            if (!member) {
              logger.warn(
                `Could not restore timeout roles for ${userId}: member is no longer in ${guild.name}.`
              );

              return;
            }

            /*
             * Check whether the user is STILL timed out.
             *
             * This prevents an old timer from restoring roles
             * if the timeout was extended or changed.
             */
            const stillTimedOut =
              member.communicationDisabledUntilTimestamp &&
              member.communicationDisabledUntilTimestamp >
                Date.now();

            if (stillTimedOut) {
              logger.info(
                `Timeout for ${member.user.tag} was extended. Skipping old role restoration timer.`
              );

              return;
            }

            /*
             * Restore the saved roles.
             */
            await this.restoreTimeoutRoles(
              guild,
              member
            );

            logger.info(
              `Automatically restored roles for ${member.user.tag} after their timeout expired.`
            );
          } catch (error) {
            logger.error(
              `Failed to automatically restore timeout roles for ${userId}:`,
              error
            );
          }
        },
        delay
      );

    timeoutRestoreTimers.set(
      key,
      timer
    );
  }

  // ==========================================================
  // RESTORE TIMEOUT ROLES
  // ==========================================================

  static async restoreTimeoutRoles(
    guild,
    member
  ) {
    const timeoutRoles =
      await loadTimeoutRoles();

    const key =
      `${guild.id}:${member.id}`;

    const saved =
      timeoutRoles[key];

    /*
     * If there is no saved timeout record,
     * do nothing.
     *
     * This is important because an old timer should never
     * remove a muted role that belongs to a different timeout.
     */
    if (!saved) {
      return false;
    }

    /*
     * Cancel any scheduled restore timer.
     */
    const existingTimer =
      timeoutRestoreTimers.get(key);

    if (existingTimer) {
      clearTimeout(existingTimer);

      timeoutRestoreTimers.delete(
        key
      );
    }

    // ========================================================
    // REMOVE MUTED ROLE
    // ========================================================

    if (
      member.roles.cache.has(
        MUTED_ROLE_ID
      )
    ) {
      try {
        await member.roles.remove(
          MUTED_ROLE_ID,
          'Timeout ended'
        );
      } catch (error) {
        logger.warn(
          `Could not remove muted role from ${member.user.tag}:`,
          error
        );
      }
    }

    // ========================================================
    // RESTORE PREVIOUS ROLES
    // ========================================================

    const rolesToRestore =
      saved.roleIds
        .map(
          (roleId) =>
            guild.roles.cache.get(
              roleId
            )
        )
        .filter(
          (role) =>
            role &&
            !role.managed &&
            role.editable
        );

    if (
      rolesToRestore.length > 0
    ) {
      try {
        await member.roles.add(
          rolesToRestore,
          'Timeout ended - restoring previous roles'
        );
      } catch (error) {
        logger.error(
          `Could not restore roles for ${member.user.tag}:`,
          error
        );
      }
    }

    // ========================================================
    // DELETE SAVED RECORD
    // ========================================================

    delete timeoutRoles[key];

    await saveTimeoutRoles(
      timeoutRoles
    );

    logger.info(
      `Restored previous roles for ${member.user.tag} after timeout in ${guild.name}.`
    );

    return true;
  }

  // ==========================================================
  // MANUALLY REMOVE TIMEOUT
  // ==========================================================

  static async removeTimeoutUser({
    guild,
    member,
    moderator,
    reason = 'Timeout removed by moderator'
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

      if (!member.moderatable) {
        const targetLabel =
          getTargetLabel(member);

        throw new TitanBotError(
          'Cannot modify member',
          ErrorTypes.PERMISSION,
          `I cannot modify **${targetLabel}**. They may have **Administrator** permission or a managed/integration role. ` +
          'Ensure my bot role is above theirs in **Server Settings → Roles**.'
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

      /*
       * Remove the Discord timeout.
       */
      await member.timeout(
        null,
        reason
      );

      /*
       * Restore their old roles immediately.
       */
      await this.restoreTimeoutRoles(
        guild,
        member
      );

      await logModerationAction({
        client: guild.client,
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
              moderator.id
          }
        }
      });

      logger.info(
        `Timeout removed: ${member.user.tag} by ${moderator.user.tag} in ${guild.name}`
      );

      return {
        user:
          member.user.tag
      };
    } catch (error) {
      logger.error(
        'Error removing timeout:',
        error
      );

      throw error;
    }
  }

  // ==========================================================
  // UNBAN
  // ==========================================================

  static async unbanUser({
    guild,
    user,
    moderator,
    reason = 'No reason provided'
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
          client: guild.client,
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
                moderator.id
            }
          }
        });

      logger.info(
        `User unbanned: ${user.tag} by ${moderator.user.tag} in ${guild.name}`
      );

      return {
        caseId,
        user:
          user.tag,
        reason
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
