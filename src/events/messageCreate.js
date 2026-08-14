import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getLevelingConfig, getUserLevelData } from '../services/leveling/leveling.js';
import { addXp } from '../services/leveling/xpSystem.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { parsePrefixCommand } from '../utils/prefixParser.js';
import {
  supportsPrefixExecution,
  executePrefixCommand,
  resolvePrefixAccessKey,
} from '../utils/messageAdapter.js';
import {
  resolveCommandAlias,
  resolveSubcommandAlias,
} from '../config/commands/commandAliases.js';
import { getPrefixRestriction } from '../config/commands/prefixRestrictions.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import {
  getCommandPrefix,
  getBotMessage,
  isBotOwner,
  isCommandCategoryEnabled,
  isMaintenanceMode,
} from '../config/bot.js';
import {
  enforceAbuseProtection,
  formatCooldownDuration,
} from '../utils/abuseProtection.js';
import { createEmbed } from '../utils/embeds.js';
import { isCommandEnabled } from '../services/commandAccessService.js';

import {
  getCountingGameConfig,
  saveCountingGameConfig,
  isValidCountingMessage,
  recordCorrectCount,
} from '../services/countingGameService.js';

import {
  isModerationExempt,
  logModerationAction,
} from '../utils/moderation.js';

import { WarningService } from '../services/moderation/warningService.js';
import { ModerationService } from '../services/moderation/moderationService.js';

const MESSAGE_XP_RATE_LIMIT_ATTEMPTS = 12;
const MESSAGE_XP_RATE_LIMIT_WINDOW_MS = 10000;

// ============================================================
// ANTI-SPAM CONFIGURATION
// ============================================================

const SPAM_MESSAGE_COUNT = 5;
const SPAM_WINDOW_MS = 2500;

const FIRST_TIMEOUT_MS = 15 * 60 * 1000;      // 15 minutes
const SECOND_TIMEOUT_MS = 60 * 60 * 1000;     // 1 hour
const THIRTY_DAY_BAN_MS = 30 * 24 * 60 * 60 * 1000;

// Tracks recent messages from users.
// guildId -> userId -> timestamps[]
const spamTracker = new Map();

// Tracks the escalation level for each user.
// 0 = no offenses
// 1 = received 15 minute timeout
// 2 = received 1 hour timeout
// 3 = received warning #1
// 4 = received warning #2
// 5 = received warning #3 + 30 day ban
//
// guildId -> userId -> offense level
const spamEscalation = new Map();

// Prevents multiple punishments from being processed simultaneously.
const spamProcessing = new Set();

// ============================================================
// MESSAGE CREATE
// ============================================================

export default {
  name: Events.MessageCreate,

  async execute(message, client) {
    try {
      if (message.author.bot || !message.guild) return;

      logger.debug(
        `Message received from ${message.author.tag}: ${message.content}`
      );

      // Check spam before normal message processing.
      await handleAntiSpam(message, client);

      const countingProcessed = await handleCountingGame(message, client);

      if (countingProcessed) {
        return;
      }

      await handlePrefixCommand(message, client);

      await handleLeveling(message, client);
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  },
};

// ============================================================
// ANTI-SPAM
// ============================================================

async function handleAntiSpam(message, client) {
  try {
    const guildId = message.guild.id;
    const userId = message.author.id;

    // Never moderate exempt users.
    if (isModerationExempt(userId)) {
      return;
    }

    const member =
      message.member ||
      await message.guild.members.fetch(userId).catch(() => null);

    if (!member) {
      return;
    }

    // Ignore users who currently have a timeout.
    //
    // Their next spam offense will only count after
    // their current timeout has expired.
    if (
      member.communicationDisabledUntilTimestamp &&
      member.communicationDisabledUntilTimestamp > Date.now()
    ) {
      return;
    }

    const now = Date.now();

    if (!spamTracker.has(guildId)) {
      spamTracker.set(guildId, new Map());
    }

    const guildTracker = spamTracker.get(guildId);

    if (!guildTracker.has(userId)) {
      guildTracker.set(userId, []);
    }

    const timestamps = guildTracker.get(userId);

    // Remove messages outside the 2.5 second window.
    const recentTimestamps = timestamps.filter(
      (timestamp) => now - timestamp <= SPAM_WINDOW_MS
    );

    recentTimestamps.push(now);

    guildTracker.set(userId, recentTimestamps);

    // User hasn't reached the spam threshold.
    if (recentTimestamps.length < SPAM_MESSAGE_COUNT) {
      return;
    }

    // Prevent duplicate processing.
    const processingKey = `${guildId}:${userId}`;

    if (spamProcessing.has(processingKey)) {
      return;
    }

    spamProcessing.add(processingKey);

    // Clear the current burst so another immediate burst
    // doesn't trigger the same offense repeatedly.
    guildTracker.set(userId, []);

    try {
      await processSpamOffense(message, member, client);
    } finally {
      spamProcessing.delete(processingKey);
    }
  } catch (error) {
    logger.error('Error handling anti-spam:', error);
  }
}

// ============================================================
// SPAM ESCALATION
// ============================================================

async function processSpamOffense(message, member, client) {
  const guildId = message.guild.id;
  const userId = message.author.id;

  if (isModerationExempt(userId)) {
    return;
  }

  const escalationKey = `${guildId}:${userId}`;

  let offenseLevel = spamEscalation.get(escalationKey) || 0;

  // Safety check: don't punish someone who is currently timed out.
  if (
    member.communicationDisabledUntilTimestamp &&
    member.communicationDisabledUntilTimestamp > Date.now()
  ) {
    return;
  }

  offenseLevel += 1;
  spamEscalation.set(escalationKey, offenseLevel);

  const target = `${message.author.tag} (${userId})`;
  const executor = `${client.user.tag} (${client.user.id})`;

  // ==========================================================
  // OFFENSE 1 — 15 MINUTE TIMEOUT
  // ==========================================================

  if (offenseLevel === 1) {
    const duration = FIRST_TIMEOUT_MS;

    try {
      await ModerationService.timeoutUser({
        guild: message.guild,
        member,
        moderator: message.guild.members.me,
        durationMs: duration,
        reason: 'Automatic anti-spam: 5 messages within 2.5 seconds.',
      });

      await logModerationAction({
        client,
        guild: message.guild,
        event: {
          action: 'Member Timed Out',
          target,
          executor,
          reason: 'Automatic anti-spam: 5 messages within 2.5 seconds.',
          duration: '15 minutes',
          metadata: {
            userId,
            moderatorId: client.user.id,
            automatic: true,
            spamOffense: 1,
          },
        },
      });

      logger.info(
        `Anti-spam: ${message.author.tag} received a 15 minute timeout.`
      );
    } catch (error) {
      logger.error(
        `Failed to apply 15 minute anti-spam timeout to ${message.author.tag}:`,
        error
      );
    }

    return;
  }

  // ==========================================================
  // OFFENSE 2 — 1 HOUR TIMEOUT
  // ==========================================================

  if (offenseLevel === 2) {
    const duration = SECOND_TIMEOUT_MS;

    try {
      await ModerationService.timeoutUser({
        guild: message.guild,
        member,
        moderator: message.guild.members.me,
        durationMs: duration,
        reason: 'Automatic anti-spam: repeated spam after previous timeout.',
      });

      await logModerationAction({
        client,
        guild: message.guild,
        event: {
          action: 'Member Timed Out',
          target,
          executor,
          reason:
            'Automatic anti-spam: repeated spam after previous timeout.',
          duration: '1 hour',
          metadata: {
            userId,
            moderatorId: client.user.id,
            automatic: true,
            spamOffense: 2,
          },
        },
      });

      logger.info(
        `Anti-spam: ${message.author.tag} received a 1 hour timeout.`
      );
    } catch (error) {
      logger.error(
        `Failed to apply 1 hour anti-spam timeout to ${message.author.tag}:`,
        error
      );
    }

    return;
  }

  // ==========================================================
  // OFFENSE 3 — WARNING #1
  // ==========================================================

  if (offenseLevel === 3) {
    await issueSpamWarning({
      message,
      client,
      member,
      warningNumber: 1,
      reason: 'Automatic anti-spam: repeated spam after previous timeouts.',
    });

    return;
  }

  // ==========================================================
  // OFFENSE 4 — WARNING #2
  // ==========================================================

  if (offenseLevel === 4) {
    await issueSpamWarning({
      message,
      client,
      member,
      warningNumber: 2,
      reason: 'Automatic anti-spam: repeated spam after previous warnings.',
    });

    return;
  }

  // ==========================================================
  // OFFENSE 5 — WARNING #3 + 30 DAY BAN
  // ==========================================================

  if (offenseLevel >= 5) {
    await issueSpamWarning({
      message,
      client,
      member,
      warningNumber: 3,
      reason:
        'Automatic anti-spam: third warning reached after repeated spam.',
    });

    // Check exemption again before the ban.
    if (isModerationExempt(userId)) {
      return;
    }

    try {
      await ModerationService.banUser({
        guild: message.guild,
        user: message.author,
        moderator: message.guild.members.me,
        reason:
          'Automatic anti-spam: third warning reached. 30 day ban.',
      });

      await logModerationAction({
        client,
        guild: message.guild,
        event: {
          action: 'Member Banned',
          target,
          executor,
          reason:
            'Automatic anti-spam: third warning reached. 30 day ban.',
          duration: '30 days',
          metadata: {
            userId,
            moderatorId: client.user.id,
            automatic: true,
            spamOffense: 5,
            banDuration: '30 days',
          },
        },
      });

      logger.info(
        `Anti-spam: ${message.author.tag} received a 30 day ban.`
      );

      // Schedule the unban.
      scheduleAutomaticUnban(
        message.guild.id,
        userId,
        THIRTY_DAY_BAN_MS,
        client
      );
    } catch (error) {
      logger.error(
        `Failed to apply 30 day anti-spam ban to ${message.author.tag}:`,
        error
      );
    }
  }
}

// ============================================================
// SPAM WARNING HANDLER
// ============================================================

async function issueSpamWarning({
  message,
  client,
  member,
  warningNumber,
  reason,
}) {
  const guildId = message.guild.id;
  const userId = message.author.id;

  if (isModerationExempt(userId)) {
    return;
  }

  try {
    const { id, totalCount } = await WarningService.addWarning({
      guildId,
      userId,
      moderatorId: client.user.id,
      reason,
      timestamp: Date.now(),
    });

    await logModerationAction({
      client,
      guild: message.guild,
      event: {
        action: 'User Warned',
        target: `${message.author.tag} (${userId})`,
        executor: `${client.user.tag} (${client.user.id})`,
        reason,
        metadata: {
          userId,
          moderatorId: client.user.id,
          totalWarns: totalCount,
          warningNumber,
          automatic: true,
          spamOffense: warningNumber + 2,
          warningId: id,
        },
      },
    });

    logger.info(
      `Anti-spam: ${message.author.tag} received automatic warning #${warningNumber}.`
    );
  } catch (error) {
    logger.error(
      `Failed to issue anti-spam warning to ${message.author.tag}:`,
      error
    );
  }
}

// ============================================================
// 30 DAY UNBAN
// ============================================================
//
// Node's normal setTimeout cannot safely handle a 30-day
// timeout in one call because of its maximum delay limit.
//
// This schedules the unban in smaller chunks.
//
// IMPORTANT:
// This in-memory timer is lost if the bot completely restarts.
// A persistent scheduler/database system would be needed to
// guarantee unbanning after a restart.
//
// ============================================================

function scheduleAutomaticUnban(guildId, userId, remainingMs, client) {
  const MAX_TIMEOUT = 2147483647;

  const timeout = Math.min(remainingMs, MAX_TIMEOUT);

  setTimeout(async () => {
    if (remainingMs > MAX_TIMEOUT) {
      scheduleAutomaticUnban(
        guildId,
        userId,
        remainingMs - MAX_TIMEOUT,
        client
      );

      return;
    }

    try {
      const guild = client.guilds.cache.get(guildId);

      if (!guild) {
        logger.warn(
          `Could not automatically unban ${userId}: guild ${guildId} not found.`
        );
        return;
      }

      await guild.members.unban(
        userId,
        'Automatic anti-spam: 30 day ban expired.'
      );

      logger.info(
        `Anti-spam: automatically unbanned ${userId} after 30 days.`
      );

      // Reset escalation after the 30 day ban expires.
      spamEscalation.delete(`${guildId}:${userId}`);
      spamTracker.get(guildId)?.delete(userId);
    } catch (error) {
      // User may already be unbanned.
      if (error?.code === 10026) {
        logger.info(
          `User ${userId} was already unbanned when automatic unban was attempted.`
        );

        spamEscalation.delete(`${guildId}:${userId}`);
        spamTracker.get(guildId)?.delete(userId);

        return;
      }

      logger.error(
        `Failed to automatically unban ${userId}:`,
        error
      );
    }
  }, timeout);
}

// ============================================================
// PREFIX COMMANDS
// ============================================================

async function handlePrefixCommand(message, client) {
  try {
    const guildConfig = await getGuildConfig(client, message.guild.id);
    const prefix = guildConfig?.prefix || getCommandPrefix();
    const parsed = parsePrefixCommand(message.content, prefix);

    if (!parsed) {
      return;
    }

    let { commandName, args } = parsed;

    const musicPrefixShortcut = commandName.toLowerCase();

    const MUSIC_PREFIX_SHORTCUTS = new Set([
      'leave',
      'pause',
      'resume',
      'skip',
      'stop',
      'volume',
    ]);

    if (MUSIC_PREFIX_SHORTCUTS.has(musicPrefixShortcut)) {
      commandName = 'music';
      args = [musicPrefixShortcut, ...args];
    }

    logger.info(
      `Prefix command detected: ${commandName}, args: ${args.join(', ')}`
    );

    const resolvedCommandName = resolveCommandAlias(commandName);

    logger.info(
      `Resolved command name: ${resolvedCommandName}`
    );

    const command = client.commands.get(resolvedCommandName);

    if (!command) {
      logger.warn(
        `Command not found: ${resolvedCommandName}`
      );
      return;
    }

    if (
      isMaintenanceMode() &&
      !isBotOwner(message.author.id)
    ) {
      await message.channel.send({
        embeds: [
          createEmbed({
            title: 'Maintenance Mode',
            description: getBotMessage('maintenanceMode'),
            color: 'warning',
          }),
        ],
      }).catch(() => {});

      return;
    }

    if (!isCommandCategoryEnabled(command.category)) {
      await message.channel.send({
        embeds: [
          createEmbed({
            title: 'Feature Disabled',
            description: getBotMessage('commandDisabled'),
            color: 'error',
          }),
        ],
      }).catch(() => {});

      return;
    }

    const restriction = getPrefixRestriction(
      command,
      args,
      resolveSubcommandAlias
    );

    if (
      !supportsPrefixExecution(command) ||
      restriction.blocked
    ) {
      if (restriction.blocked && restriction.reason) {
        const embed = createEmbed({
          title: 'Slash Command Only',
          description:
            `${restriction.reason}\nUse \`/${resolvedCommandName}\` instead.`,
          color: 'info',
        });

        await message.channel.send({
          embeds: [embed],
        }).catch(() => {});
      }

      return;
    }

    if (
      !(await isCommandEnabled(
        client,
        message.guild.id,
        resolvePrefixAccessKey(command.data, args),
        command.category
      ))
    ) {
      const embed = createEmbed({
        title: 'Command Disabled',
        description:
          'This command has been disabled for this server.',
        color: 'error',
      });

      await message.channel.send({
        embeds: [embed],
      }).catch(() => {});

      return;
    }

    const mockInteractionForProtection = {
      guildId: message.guild.id,
      user: message.author,
    };

    const abuseProtection = await enforceAbuseProtection(
      mockInteractionForProtection,
      command,
      resolvedCommandName
    );

    if (!abuseProtection.allowed) {
      const formattedCooldown =
        formatCooldownDuration(
          abuseProtection.remainingMs
        );

      const embed = createEmbed({
        title: 'Command Cooldown',
        description:
          `This command is on cooldown. Please wait ${formattedCooldown} before trying again.`,
        color: 'error',
      });

      await message.channel.send({
        embeds: [embed],
      }).catch(() => {});

      return;
    }

    logger.info(
      `Executing prefix command: ${prefix}${commandName} ` +
      `(resolved to ${resolvedCommandName}) by ${message.author.tag}`
    );

    await executePrefixCommand(
      command,
      message,
      args,
      client,
      prefix,
      guildConfig
    );
  } catch (error) {
    logger.error(
      'Error handling prefix command:',
      error
    );
  }
}

// ============================================================
// COUNTING GAME
// ============================================================

async function handleCountingGame(message, client) {
  try {
    const config = await getCountingGameConfig(
      client,
      message.guild.id
    );

    if (
      !config.enabled ||
      !config.channelId ||
      message.channel.id !== config.channelId
    ) {
      return false;
    }

    const content = message.content.trim();

    const validCount = isValidCountingMessage(
      content,
      config
    );

    const invalidAttempt =
      !validCount ||
      message.author.id === config.lastUserId;

    if (invalidAttempt) {
      await message.delete().catch(() => {});

      await saveCountingGameConfig(
        client,
        message.guild.id,
        {
          ...config,
          nextNumber: 1,
          lastUserId: null,
          currentStreak: 0,
        }
      );

      const failureMessage =
        await message.channel.send(
          `❌ Count broken by <@${message.author.id}>. The sequence has been reset to **1**.`
        );

      setTimeout(() => {
        failureMessage.delete().catch(() => {});
      }, 10000);

      return true;
    }

    await recordCorrectCount(
      client,
      message.guild.id,
      message.author.id
    );

    return true;
  } catch (error) {
    logger.error(
      'Error handling counting game:',
      error
    );

    return false;
  }
}

// ============================================================
// LEVELING
// ============================================================

async function handleLeveling(message, client) {
  try {
    const rateLimitKey =
      `xp-event:${message.guild.id}:${message.author.id}`;

    const canProcess = await checkRateLimit(
      rateLimitKey,
      MESSAGE_XP_RATE_LIMIT_ATTEMPTS,
      MESSAGE_XP_RATE_LIMIT_WINDOW_MS
    );

    if (!canProcess) {
      return;
    }

    const levelingConfig =
      await getLevelingConfig(
        client,
        message.guild.id
      );

    if (!levelingConfig?.enabled) {
      return;
    }

    if (
      levelingConfig.ignoredChannels?.includes(
        message.channel.id
      )
    ) {
      return;
    }

    if (
      levelingConfig.ignoredRoles?.length > 0
    ) {
      const member =
        await message.guild.members.fetch(
          message.author.id
        ).catch(() => null);

      if (
        member &&
        member.roles.cache.some(
          role =>
            levelingConfig.ignoredRoles.includes(
              role.id
            )
        )
      ) {
        return;
      }
    }

    if (
      levelingConfig.blacklistedUsers?.includes(
        message.author.id
      )
    ) {
      return;
    }

    if (
      !message.content ||
      message.content.trim().length === 0
    ) {
      return;
    }

    const userData =
      await getUserLevelData(
        client,
        message.guild.id,
        message.author.id
      );

    const cooldownTime =
      levelingConfig.xpCooldown || 60;

    const now = Date.now();

    const timeSinceLastMessage =
      now - (userData.lastMessage || 0);

    if (
      timeSinceLastMessage <
      cooldownTime * 1000
    ) {
      return;
    }

    const minXP =
      levelingConfig.xpRange?.min ||
      levelingConfig.xpPerMessage?.min ||
      15;

    const maxXP =
      levelingConfig.xpRange?.max ||
      levelingConfig.xpPerMessage?.max ||
      25;

    const safeMinXP = Math.max(1, minXP);

    const safeMaxXP =
      Math.max(safeMinXP, maxXP);

    const xpToGive =
      Math.floor(
        Math.random() *
        (safeMaxXP - safeMinXP + 1)
      ) + safeMinXP;

    let finalXP = xpToGive;

    if (
      levelingConfig.xpMultiplier &&
      levelingConfig.xpMultiplier > 1
    ) {
      finalXP =
        Math.floor(
          finalXP *
          levelingConfig.xpMultiplier
        );
    }

    const result =
      await addXp(
        client,
        message.guild,
        message.member,
        finalXP
      );

    if (result?.leveledUp) {
      logger.info(
        `${message.author.tag} leveled up to level ${result.level} in ${message.guild.name}`
      );
    }
  } catch (error) {
    logger.error(
      'Error handling leveling for message:',
      error
    );
  }
}
