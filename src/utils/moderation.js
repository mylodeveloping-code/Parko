// moderation.js

import { logEvent as logAuditEvent, EVENT_TYPES } from '../services/loggingService.js';
import { formatLogLine } from './logging/logEmbeds.js';
import { logger } from './logger.js';
import { getFromDb, setInDb, deleteFromDb } from './database.js';

// ============================================================
// MODERATION EXEMPTIONS
// ============================================================

const MODERATION_EXEMPT_IDS = new Set([
  '1171948174190067737', // You
  '1423028927881805874', // Owner
  '1393674823514980352', // Co-Owner
]);

export function isModerationExempt(userId) {
  return MODERATION_EXEMPT_IDS.has(String(userId));
}

// ============================================================
// MUTE / TIMEOUT ROLE CONFIGURATION
// ============================================================

export const MUTED_ROLE_ID = '1537615321438093425';

/**
 * Save the roles a user had before being timed out.
 *
 * This is stored in the database so the roles survive
 * bot restarts.
 */
export async function saveTimeoutRoles({
  guildId,
  userId,
  roleIds,
  expiresAt = null,
}) {
  try {
    const key = `moderation_timeout_roles_${guildId}_${userId}`;

    const data = {
      guildId,
      userId,
      roleIds: Array.isArray(roleIds) ? roleIds : [],
      mutedRoleId: MUTED_ROLE_ID,
      expiresAt,
      savedAt: new Date().toISOString(),
    };

    await setInDb(key, data);

    logger.debug(
      `Saved timeout roles for ${userId} in guild ${guildId}: ${data.roleIds.join(', ')}`
    );

    return true;
  } catch (error) {
    logger.error(
      `Error saving timeout roles for ${userId} in guild ${guildId}:`,
      error
    );

    return false;
  }
}

/**
 * Get the roles a user had before being timed out.
 */
export async function getTimeoutRoles(guildId, userId) {
  try {
    const key = `moderation_timeout_roles_${guildId}_${userId}`;

    const data = await getFromDb(key, null);

    if (!data || !Array.isArray(data.roleIds)) {
      return null;
    }

    return data;
  } catch (error) {
    logger.error(
      `Error getting timeout roles for ${userId} in guild ${guildId}:`,
      error
    );

    return null;
  }
}

/**
 * Delete the saved timeout-role information after
 * the user's original roles have been restored.
 */
export async function deleteTimeoutRoles(guildId, userId) {
  try {
    const key = `moderation_timeout_roles_${guildId}_${userId}`;

    await deleteFromDb(key);

    logger.debug(
      `Deleted saved timeout roles for ${userId} in guild ${guildId}`
    );

    return true;
  } catch (error) {
    logger.error(
      `Error deleting timeout roles for ${userId} in guild ${guildId}:`,
      error
    );

    return false;
  }
}

/**
 * Get all normal roles a member currently has.
 *
 * @param {import('discord.js').GuildMember} member
 */
export function getMemberRoleIds(member) {
  if (!member?.roles?.cache) {
    return [];
  }

  return member.roles.cache
    .filter(role => role.id !== member.guild.id) // @everyone
    .map(role => role.id);
}

/**
 * Remove all removable roles from a member and give them
 * the Muted role.
 *
 * The user's previous roles MUST be saved first.
 */
export async function applyMutedRole(member) {
  if (!member) {
    return false;
  }

  const mutedRole = member.guild.roles.cache.get(MUTED_ROLE_ID);

  if (!mutedRole) {
    logger.error(
      `Muted role ${MUTED_ROLE_ID} was not found in guild ${member.guild.id}`
    );

    return false;
  }

  if (!mutedRole.editable) {
    logger.error(
      `Muted role ${MUTED_ROLE_ID} is not editable in guild ${member.guild.id}`
    );

    return false;
  }

  try {
    // Remove every role except @everyone and the Muted role.
    const rolesToRemove = member.roles.cache.filter(
      role =>
        role.id !== member.guild.id &&
        role.id !== MUTED_ROLE_ID &&
        !role.managed
    );

    if (rolesToRemove.size > 0) {
      await member.roles.remove(
        rolesToRemove,
        'Applying Muted role'
      );
    }

    // Give Muted role if they don't already have it.
    if (!member.roles.cache.has(MUTED_ROLE_ID)) {
      await member.roles.add(
        mutedRole,
        'Applying Muted role'
      );
    }

    return true;
  } catch (error) {
    logger.error(
      `Error applying Muted role to ${member.user?.tag ?? member.id}:`,
      error
    );

    return false;
  }
}

/**
 * Restore the user's exact roles from before the timeout.
 *
 * Roles that no longer exist are simply skipped.
 */
export async function restoreTimeoutRoles(member) {
  if (!member) {
    return false;
  }

  try {
    const saved = await getTimeoutRoles(
      member.guild.id,
      member.id
    );

    if (!saved) {
      logger.debug(
        `No saved timeout roles found for ${member.id} in guild ${member.guild.id}`
      );

      // Still remove Muted if present.
      if (member.roles.cache.has(MUTED_ROLE_ID)) {
        await member.roles.remove(
          MUTED_ROLE_ID,
          'Restoring roles after timeout'
        );
      }

      return false;
    }

    const rolesToRestore = saved.roleIds.filter(roleId => {
      const role = member.guild.roles.cache.get(roleId);

      return (
        role &&
        !role.managed &&
        role.id !== member.guild.id &&
        role.id !== MUTED_ROLE_ID
      );
    });

    // Remove Muted first.
    if (member.roles.cache.has(MUTED_ROLE_ID)) {
      await member.roles.remove(
        MUTED_ROLE_ID,
        'Restoring roles after timeout'
      );
    }

    // Restore the exact roles the user had before.
    if (rolesToRestore.length > 0) {
      await member.roles.add(
        rolesToRestore,
        'Restoring roles after timeout'
      );
    }

    // Delete the saved role data so it isn't reused later.
    await deleteTimeoutRoles(
      member.guild.id,
      member.id
    );

    logger.info(
      `Restored ${rolesToRestore.length} roles for ${member.user?.tag ?? member.id} in ${member.guild.name}`
    );

    return true;
  } catch (error) {
    logger.error(
      `Error restoring timeout roles for ${member.user?.tag ?? member.id}:`,
      error
    );

    return false;
  }
}

// ============================================================
// MODERATION LOGGING
// ============================================================

const ACTION_TO_EVENT_TYPE = {
  'Member Banned': EVENT_TYPES.MODERATION_BAN,
  'Member Kicked': EVENT_TYPES.MODERATION_KICK,
  'Member Timed Out': EVENT_TYPES.MODERATION_TIMEOUT,
  'Member Untimeouted': EVENT_TYPES.MODERATION_UNTIMEOUT,
  'Member Unbanned': EVENT_TYPES.MODERATION_UNBAN,
  'User Warned': EVENT_TYPES.MODERATION_WARN,
  'Warnings Viewed': EVENT_TYPES.MODERATION_WARN,
  'Messages Purged': EVENT_TYPES.MODERATION_PURGE,
  'Channel Locked': EVENT_TYPES.MODERATION_LOCK,
  'Channel Unlocked': EVENT_TYPES.MODERATION_UNLOCK,
  'DM Sent': EVENT_TYPES.MODERATION_DM,
  'Bot Message Sent': EVENT_TYPES.MODERATION_CONFIG,
  'Log Channel Activated': EVENT_TYPES.MODERATION_CONFIG,
  'Log Filter Updated': EVENT_TYPES.MODERATION_CONFIG,
  'Case Created': EVENT_TYPES.MODERATION_CONFIG,
  'Case Updated': EVENT_TYPES.MODERATION_CONFIG,
};

function buildModerationLogData(event) {
  const targetIdMatch = event.target?.match(/\((\d+)\)/);
  const targetId = targetIdMatch?.[1];

  const executorIdMatch = event.executor?.match(/\((\d+)\)/);
  const executorTag = event.executor?.split(' (')[0] || 'Moderator';

  const lines = [];

  if (event.target) {
    lines.push(formatLogLine('User', event.target));
  }

  if (event.reason) {
    const reason =
      event.reason.length > 900
        ? `${event.reason.substring(0, 897)}...`
        : event.reason;

    lines.push(formatLogLine('Reason', reason));
  }

  if (event.duration) {
    lines.push(formatLogLine('Duration', event.duration));
  }

  if (event.caseId) {
    lines.push(
      formatLogLine('Case', `\`${event.caseId}\``)
    );
  }

  const meta = [];

  if (event.metadata) {
    Object.entries(event.metadata).forEach(([key, value]) => {
      if (
        value !== undefined &&
        value !== null &&
        key !== 'userId' &&
        key !== 'moderatorId'
      ) {
        meta.push([
          key.charAt(0).toUpperCase() + key.slice(1),
          String(value),
        ]);
      }
    });
  }

  const title = event.caseId
    ? `${event.action} · Case #${event.caseId}`
    : event.action;

  return {
    title,
    lines,
    meta,
    userId:
      event.metadata?.userId ||
      targetId ||
      undefined,

    thumbnail: targetId
      ? `https://cdn.discordapp.com/embed/avatars/${Number(targetId) % 5}.png`
      : undefined,

    footer: executorIdMatch
      ? {
          text: executorTag,
          iconURL: undefined,
        }
      : undefined,
  };
}

export async function logEvent({
  client,
  guild,
  guildId,
  event,
}) {
  try {
    if (!guild && guildId) {
      guild =
        client.guilds.cache.get(guildId) ||
        await client.guilds.fetch(guildId).catch(() => null);
    }

    if (!guild) {
      logger.warn(
        'logEvent invoked without valid guild or guildId'
      );
      return;
    }

    const eventType =
      ACTION_TO_EVENT_TYPE[event.action] ||
      EVENT_TYPES.MODERATION_CONFIG;

    const data = buildModerationLogData(event);

    await logAuditEvent({
      client,
      guildId: guild.id,
      eventType,
      data,
    });

    logger.info(
      `Moderation action logged: ${event.action} by ${event.executor} on ${event.target} in guild ${guild.id}`
    );
  } catch (error) {
    logger.error(
      'Error logging moderation event:',
      error
    );
  }
}

// ============================================================
// CASE MANAGEMENT
// ============================================================

export async function generateCaseId(client, guildId) {
  try {
    const caseKey = `moderation_cases_${guildId}`;

    const currentCase =
      await getFromDb(caseKey, 0);

    const nextCase = currentCase + 1;

    await setInDb(caseKey, nextCase);

    return nextCase;
  } catch (error) {
    logger.error(
      'Error generating case ID:',
      error
    );

    return Date.now();
  }
}

export async function storeModerationCase({
  guildId,
  caseId,
  caseData,
}) {
  try {
    const caseKey =
      `moderation_case_${guildId}_${caseId}`;

    const caseDataWithTimestamp = {
      ...caseData,
      createdAt: new Date().toISOString(),
      caseId,
    };

    await setInDb(
      caseKey,
      caseDataWithTimestamp
    );

    const caseListKey =
      `moderation_cases_list_${guildId}`;

    const caseList =
      await getFromDb(caseListKey, []);

    caseList.push(caseDataWithTimestamp);

    if (caseList.length > 1000) {
      caseList.splice(
        0,
        caseList.length - 1000
      );
    }

    await setInDb(
      caseListKey,
      caseList
    );

    return true;
  } catch (error) {
    logger.error(
      'Error storing moderation case:',
      error
    );

    return false;
  }
}

export async function getModerationCases(
  guildId,
  filters = {}
) {
  try {
    const {
      userId,
      moderatorId,
      action,
      limit = 50,
      offset = 0,
    } = filters;

    const caseListKey =
      `moderation_cases_list_${guildId}`;

    const caseList =
      await getFromDb(caseListKey, []);

    let filteredCases = caseList;

    if (userId) {
      filteredCases =
        filteredCases.filter(
          (case_) =>
            case_.targetUserId === userId
        );
    }

    if (moderatorId) {
      filteredCases =
        filteredCases.filter(
          (case_) =>
            case_.moderatorId === moderatorId
        );
    }

    if (action) {
      filteredCases =
        filteredCases.filter(
          (case_) =>
            case_.action === action
        );
    }

    filteredCases.sort(
      (a, b) =>
        new Date(b.createdAt) -
        new Date(a.createdAt)
    );

    return filteredCases.slice(
      offset,
      offset + limit
    );
  } catch (error) {
    logger.error(
      'Error getting moderation cases:',
      error
    );

    return [];
  }
}

export async function logModerationAction({
  client,
  guild,
  event,
}) {
  const targetUserId =
    event.metadata?.userId ||
    event.targetUserId;

  // Never create a moderation case for exempt users.
  if (
    targetUserId &&
    isModerationExempt(targetUserId)
  ) {
    logger.info(
      `Moderation action ignored for exempt user ${targetUserId} in guild ${guild.id}`
    );

    return null;
  }

  const caseId =
    await generateCaseId(
      client,
      guild.id
    );

  await storeModerationCase({
    guildId: guild.id,
    caseId,
    caseData: {
      action: event.action,
      target: event.target,
      executor: event.executor,
      reason: event.reason,
      duration: event.duration,
      metadata: event.metadata,
      targetUserId,
      moderatorId:
        event.metadata?.moderatorId,
    },
  });

  await logEvent({
    client,
    guild,
    event: {
      ...event,
      caseId,
    },
  });

  return caseId;
}
