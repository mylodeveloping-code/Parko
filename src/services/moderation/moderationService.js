// moderationService.js

import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import {
  logModerationAction,
  saveTimeoutRoles,
  getTimeoutRoles,
  deleteTimeoutRoles,
  MUTED_ROLE_ID,
} from '../../utils/moderation.js';

function getTargetLabel(target) {
  return target.user?.tag ?? target.displayName ?? 'this user';
}

function getHighestRole(member) {
  return member?.roles?.highest ?? null;
}

export class ModerationService {

  static buildHierarchyMessage({ actor, actorRole, targetRole, targetLabel, action }) {
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

  static buildHierarchySkipReason(moderator, target, action, actor = 'moderator') {
    const targetLabel = getTargetLabel(target);
    const targetRole = getHighestRole(target);

    if (actor === 'bot') {
      const botMember = target.guild?.members?.me;
      const botRole = getHighestRole(botMember);

      if (!botRole || !targetRole) {
        return `Bot role hierarchy blocked ${action} for ${targetLabel}`;
      }

      return `Bot role **${botRole.name}** is too low for **${targetRole.name}** — move the bot role higher`;
    }

    const modRole = getHighestRole(moderator);

    if (!modRole || !targetRole) {
      return `Role hierarchy blocked ${action} for ${targetLabel}`;
    }

    return `Your role **${modRole.name}** is too low for **${targetRole.name}** — move your role higher`;
  }

  static validateHierarchy(moderator, target, action) {
    if (!moderator || !target) {
      return { valid: false, error: 'Invalid moderator or target' };
    }

    if (moderator.guild?.ownerId === moderator.id) {
      return { valid: true };
    }

    const modRole = getHighestRole(moderator);
    const targetRole = getHighestRole(target);

    if (!modRole || !targetRole) {
      return {
        valid: false,
        error: 'Could not resolve role hierarchy. Try mentioning the user or use the slash command.',
      };
    }

    if (modRole.position <= targetRole.position) {
      return {
        valid: false,
        error: this.buildHierarchyMessage({
          actor: 'moderator',
          actorRole: modRole,
          targetRole,
          targetLabel: getTargetLabel(target),
          action,
        }),
      };
    }

    return { valid: true };
  }

  static validateBotHierarchy(target, action) {
    if (!target) {
      return { valid: false, error: 'Invalid target' };
    }

    const botMember = target.guild?.members?.me;

    if (!botMember) {
      return { valid: false, error: 'Bot is not in the guild' };
    }

    const botRole = getHighestRole(botMember);
    const targetRole = getHighestRole(target);

    if (!botRole || !targetRole) {
      return {
        valid: false,
        error: 'Could not resolve bot role hierarchy. Check that my role is configured in this server.',
      };
    }

    if (botRole.position <= targetRole.position) {
      return {
        valid: false,
        error: this.buildHierarchyMessage({
          actor: 'bot',
          actorRole: botRole,
          targetRole,
          targetLabel: getTargetLabel(target),
          action,
        }),
      };
    }

    return { valid: true };
  }

  static assertModerationHierarchy(moderator, target, action) {
    const botCheck = this.validateBotHierarchy(target, action);

    if (!botCheck.valid) {
      throw new TitanBotError(
        botCheck.error,
        ErrorTypes.PERMISSION,
        botCheck.error
      );
    }

    const modCheck = this.validateHierarchy(moderator, target, action);

    if (!modCheck.valid) {
      throw new TitanBotError(
        modCheck.error,
        ErrorTypes.PERMISSION,
        modCheck.error
      );
    }
  }

  static async banUser({
    guild,
    user,
    moderator,
    reason = 'No reason provided',
    deleteDays = 0
  }) {
    try {
      if (!guild || !user || !moderator) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Guild, user, and moderator are required'
        );
      }

      let targetMember = null;

      try {
        targetMember = await guild.members.fetch(user.id).catch(() => null);
      } catch (err) {
        logger.debug('Target not in guild, proceeding with ban');
      }

      if (targetMember) {
        this.assertModerationHierarchy(moderator, targetMember, 'ban');
      } else {
        const isOwner = guild.ownerId === moderator.id;

        const hasHighPerms = moderator.permissions.has([
          PermissionFlagsBits.ManageGuild,
          PermissionFlagsBits.Administrator
        ]);

        if (!isOwner && !hasHighPerms) {
          throw new TitanBotError(
            'You do not have sufficient permissions to ban users who are not in the server.',
            ErrorTypes.PERMISSION,
            'You need "Manage Server" or "Administrator" permissions to ban users not currently in the guild.'
          );
        }
      }

      await guild.members.ban(user.id, { reason });

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Banned',
          target: `${user.tag} (${user.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: user.id,
            moderatorId: moderator.id,
            permanent: true,
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
      logger.error('Error banning user:', error);
      throw error;
    }
  }

  static async kickUser({
    guild,
    member,
    moderator,
    reason = 'No reason provided'
  }) {
    try {
      if (!guild || !member || !moderator) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Guild, member, and moderator are required'
        );
      }

      this.assertModerationHierarchy(moderator, member, 'kick');

      if (!member.kickable) {
        const targetLabel = getTargetLabel(member);

        throw new TitanBotError(
          'Cannot kick member',
          ErrorTypes.PERMISSION,
          `I cannot kick **${targetLabel}**. They may have **Administrator** permission or a managed/integration role. ` +
          'Ensure my bot role is above theirs in **Server Settings → Roles** and that they do not have Admin.'
        );
      }

      await member.kick(reason);

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Kicked',
          target: `${member.user.tag} (${member.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: member.id,
            moderatorId: moderator.id
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
      logger.error('Error kicking user:', error);
      throw error;
    }
  }

  static async timeoutUser({
    guild,
    member,
    moderator,
    durationMs,
    reason = 'No reason provided'
  }) {
    try {
      if (!guild || !member || !moderator || !durationMs) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Guild, member, moderator, and duration are required'
        );
      }

      this.assertModerationHierarchy(moderator, member, 'timeout');

      if (!member.moderatable) {
        const targetLabel = getTargetLabel(member);

        throw new TitanBotError(
          'Cannot timeout member',
          ErrorTypes.PERMISSION,
          `I cannot timeout **${targetLabel}**. They may have **Administrator** permission or a managed/integration role. ` +
          'Ensure my bot role is above theirs in **Server Settings → Roles** and that they do not have Admin.'
        );
      }

      const mutedRole = guild.roles.cache.get(MUTED_ROLE_ID);

      if (!mutedRole) {
        throw new TitanBotError(
          'Muted role not found',
          ErrorTypes.CONFIGURATION,
          `The Muted role (${MUTED_ROLE_ID}) could not be found.`
        );
      }

      if (!mutedRole.editable) {
        throw new TitanBotError(
          'Muted role not manageable',
          ErrorTypes.PERMISSION,
          'I cannot manage the Muted role. Make sure my bot role is above the Muted role.'
        );
      }

      /*
       * If the user is not already timed out, save their current roles.
       * This prevents a second timeout from overwriting the original roles.
       */
      if (!member.isCommunicationDisabled()) {
        const previousRoleIds = member.roles.cache
          .filter(role => role.id !== guild.id)
          .filter(role => role.id !== MUTED_ROLE_ID)
          .filter(role => !role.managed)
          .map(role => role.id);

        const saved = await saveTimeoutRoles(
          guild.id,
          member.id,
          previousRoleIds
        );

        if (!saved) {
          throw new TitanBotError(
            'Could not save previous roles',
            ErrorTypes.DATABASE,
            'I could not save the user\'s previous roles, so the timeout was not applied.'
          );
        }
      }

      /*
       * Remove all manageable roles except @everyone,
       * then add the Muted role.
       */
      const rolesToRemove = member.roles.cache
        .filter(role => role.id !== guild.id)
        .filter(role => role.id !== MUTED_ROLE_ID)
        .filter(role => !role.managed)
        .filter(role => role.editable);

      if (rolesToRemove.size > 0) {
        await member.roles.remove(
          rolesToRemove,
          'Applying timeout mute role'
        );
      }

      if (!member.roles.cache.has(MUTED_ROLE_ID)) {
        await member.roles.add(
          mutedRole,
          'Applying timeout mute role'
        );
      }

      await member.timeout(durationMs, reason);

      const durationMinutes = Math.floor(durationMs / 60000);

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Timed Out',
          target: `${member.user.tag} (${member.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          duration: `${durationMinutes} minutes`,
          metadata: {
            userId: member.id,
            moderatorId: moderator.id,
            durationMs
          }
        }
      });

      logger.info(
        `User timed out and muted: ${member.user.tag} by ${moderator.user.tag} in ${guild.name}`
      );

      return {
        caseId,
        user: member.user.tag,
        duration: durationMinutes,
        reason
      };
    } catch (error) {
      logger.error('Error timing out user:', error);
      throw error;
    }
  }

  static async removeTimeoutUser({
    guild,
    member,
    moderator,
    reason = 'Timeout removed by moderator'
  }) {
    try {
      if (!guild || !member || !moderator) {
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
        const targetLabel = getTargetLabel(member);

        throw new TitanBotError(
          'Cannot modify member',
          ErrorTypes.PERMISSION,
          `I cannot modify **${targetLabel}**. They may have **Administrator** permission or a managed/integration role. ` +
          'Ensure my bot role is above theirs in **Server Settings → Roles**.'
        );
      }

      if (!member.isCommunicationDisabled()) {
        throw new TitanBotError(
          'User not timed out',
          ErrorTypes.VALIDATION,
          `${member.user.tag} is not currently timed out`
        );
      }

      await member.timeout(null, reason);

      const saved = await getTimeoutRoles(
        guild.id,
        member.id
      );

      const mutedRole = guild.roles.cache.get(MUTED_ROLE_ID);

      if (
        mutedRole &&
        member.roles.cache.has(MUTED_ROLE_ID) &&
        mutedRole.editable
      ) {
        await member.roles.remove(
          mutedRole,
          'Removing timeout mute role'
        );
      }

      if (saved?.roleIds?.length) {
        const rolesToRestore = saved.roleIds
          .map(roleId => guild.roles.cache.get(roleId))
          .filter(role => role)
          .filter(role => !role.managed)
          .filter(role => role.editable);

        if (rolesToRestore.length > 0) {
          await member.roles.add(
            rolesToRestore,
            'Restoring roles after timeout'
          );
        }
      }

      await deleteTimeoutRoles(
        guild.id,
        member.id
      );

      await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Untimeouted',
          target: `${member.user.tag} (${member.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: member.id,
            moderatorId: moderator.id
          }
        }
      });

      logger.info(
        `Timeout removed and roles restored: ${member.user.tag} by ${moderator.user.tag} in ${guild.name}`
      );

      return {
        user: member.user.tag
      };
    } catch (error) {
      logger.error('Error removing timeout:', error);
      throw error;
    }
  }

  static async unbanUser({
    guild,
    user,
    moderator,
    reason = 'No reason provided'
  }) {
    try {
      if (!guild || !user || !moderator) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Guild, user, and moderator are required'
        );
      }

      const bans = await guild.bans.fetch();
      const banInfo = bans.get(user.id);

      if (!banInfo) {
        throw new TitanBotError(
          'User not banned',
          ErrorTypes.VALIDATION,
          `${user.tag} is not currently banned from this server`
        );
      }

      await guild.members.unban(user.id, reason);

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Unbanned',
          target: `${user.tag} (${user.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: user.id,
            moderatorId: moderator.id
          }
        }
      });

      logger.info(
        `User unbanned: ${user.tag} by ${moderator.user.tag} in ${guild.name}`
      );

      return {
        caseId,
        user: user.tag,
        reason
      };
    } catch (error) {
      logger.error('Error unbanning user:', error);
      throw error;
    }
  }
}
