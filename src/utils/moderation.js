import {
    EmbedBuilder,
} from 'discord.js';

import {
    logEvent as logAuditEvent,
    EVENT_TYPES,
} from '../services/loggingService.js';

import {
    formatLogLine,
} from './logging/logEmbeds.js';

import {
    logger,
} from './logger.js';

import {
    getFromDb,
    setInDb,
    deleteFromDb,
} from './database.js';

// ============================================================
// MODERATION EXEMPTIONS
// ============================================================

const MODERATION_EXEMPT_IDS =
    new Set([
        '1171948174190067737',
    ]);

export function isModerationExempt(
    userId
) {
    return MODERATION_EXEMPT_IDS.has(
        String(userId)
    );
}

// ============================================================
// MODERATION TARGET RESOLUTION
// ============================================================

export async function resolveModerationTarget(
    guild,
    userId
) {
    if (
        !guild ||
        !userId
    ) {
        return null;
    }

    const id =
        String(userId).trim();

    if (
        !/^\d{17,20}$/.test(id)
    ) {
        return null;
    }

    const cachedMember =
        guild.members.cache.get(
            id
        );

    if (cachedMember) {
        return cachedMember;
    }

    try {
        const member =
            await guild.members.fetch(
                id
            );

        return member || null;
    } catch (error) {
        logger.debug(
            `Unable to resolve member ${id} in guild ${guild.id}:`,
            error
        );

        return null;
    }
}

// ============================================================
// MODERATION USER RESOLUTION
// ============================================================

export async function resolveModerationUser(
    client,
    userId
) {
    if (
        !client ||
        !userId
    ) {
        return null;
    }

    const id =
        String(userId).trim();

    if (
        !/^\d{17,20}$/.test(id)
    ) {
        return null;
    }

    try {
        return await client.users.fetch(
            id
        );
    } catch (error) {
        logger.debug(
            `Unable to resolve Discord user ${id}:`,
            error
        );

        return null;
    }
}

// ============================================================
// MODERATION TARGET DATA
// ============================================================

export async function resolveModerationTargetData(
    client,
    guild,
    userId
) {
    const id =
        String(
            userId ?? ''
        ).trim();

    if (!id) {
        return {
            user: null,
            member: null,
            userId: null,
            inGuild: false,
        };
    }

    const member =
        await resolveModerationTarget(
            guild,
            id
        );

    let user =
        member?.user ??
        null;

    if (!user) {
        user =
            await resolveModerationUser(
                client,
                id
            );
    }

    return {
        user,
        member,
        userId: id,
        inGuild:
            Boolean(member),
    };
}

// ============================================================
// MUTED ROLE
// ============================================================

export const MUTED_ROLE_ID =
    '1537615321438093425';

// ============================================================
// TIMEOUT ROLE STORAGE
// ============================================================

export async function saveTimeoutRoles({
    guildId,
    userId,
    roleIds,
    expiresAt = null,
}) {
    try {
        const key =
            `moderation_timeout_roles_${guildId}_${userId}`;

        const data = {
            guildId,
            userId,
            roleIds:
                Array.isArray(roleIds)
                    ? roleIds
                    : [],
            mutedRoleId:
                MUTED_ROLE_ID,
            expiresAt,
            savedAt:
                new Date().toISOString(),
        };

        await setInDb(
            key,
            data
        );

        logger.debug(
            `Saved timeout roles for ${userId} in guild ${guildId}: ` +
            `${data.roleIds.join(', ')}`
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

// ============================================================
// GET TIMEOUT ROLES
// ============================================================

export async function getTimeoutRoles(
    guildId,
    userId
) {
    try {
        const key =
            `moderation_timeout_roles_${guildId}_${userId}`;

        const data =
            await getFromDb(
                key,
                null
            );

        if (
            !data ||
            !Array.isArray(
                data.roleIds
            )
        ) {
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

// ============================================================
// DELETE TIMEOUT ROLES
// ============================================================

export async function deleteTimeoutRoles(
    guildId,
    userId
) {
    try {
        const key =
            `moderation_timeout_roles_${guildId}_${userId}`;

        await deleteFromDb(
            key
        );

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

// ============================================================
// GET MEMBER ROLE IDS
// ============================================================

export function getMemberRoleIds(
    member
) {
    if (
        !member?.roles?.cache
    ) {
        return [];
    }

    return member.roles.cache
        .filter(
            role =>
                role.id !==
                member.guild.id
        )
        .map(
            role => role.id
        );
}

// ============================================================
// APPLY MUTED ROLE
// ============================================================

export async function applyMutedRole(
    member
) {
    if (!member) {
        return false;
    }

    const mutedRole =
        member.guild.roles.cache.get(
            MUTED_ROLE_ID
        );

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
        const rolesToRemove =
            member.roles.cache.filter(
                role =>
                    role.id !==
                        member.guild.id &&
                    role.id !==
                        MUTED_ROLE_ID &&
                    !role.managed
            );

        if (
            rolesToRemove.size > 0
        ) {
            await member.roles.remove(
                rolesToRemove,
                'Applying Muted role'
            );
        }

        if (
            !member.roles.cache.has(
                MUTED_ROLE_ID
            )
        ) {
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

// ============================================================
// RESTORE TIMEOUT ROLES
// ============================================================

export async function restoreTimeoutRoles(
    member
) {
    if (!member) {
        return false;
    }

    try {
        const saved =
            await getTimeoutRoles(
                member.guild.id,
                member.id
            );

        if (!saved) {
            logger.debug(
                `No saved timeout roles found for ${member.id} in guild ${member.guild.id}`
            );

            if (
                member.roles.cache.has(
                    MUTED_ROLE_ID
                )
            ) {
                await member.roles.remove(
                    MUTED_ROLE_ID,
                    'Restoring roles after timeout'
                );
            }

            return false;
        }

        const rolesToRestore =
            saved.roleIds.filter(
                roleId => {
                    const role =
                        member.guild.roles.cache.get(
                            roleId
                        );

                    return (
                        role &&
                        !role.managed &&
                        role.id !==
                            member.guild.id &&
                        role.id !==
                            MUTED_ROLE_ID
                    );
                }
            );

        if (
            member.roles.cache.has(
                MUTED_ROLE_ID
            )
        ) {
            await member.roles.remove(
                MUTED_ROLE_ID,
                'Restoring roles after timeout'
            );
        }

        if (
            rolesToRestore.length > 0
        ) {
            await member.roles.add(
                rolesToRestore,
                'Restoring roles after timeout'
            );
        }

        await deleteTimeoutRoles(
            member.guild.id,
            member.id
        );

        logger.info(
            `Restored ${rolesToRestore.length} roles for ` +
            `${member.user?.tag ?? member.id} in ${member.guild.name}`
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
// MODERATION NOTIFICATION TEXT
// ============================================================

const MODERATION_NOTIFICATION_TEXT = {
    'Member Banned':
        'has been banned',

    'Member Kicked':
        'has been kicked',

    'Member Timed Out':
        'has been muted',

    'Member Untimeouted':
        'has had their timeout removed',

    'Member Unbanned':
        'has been unbanned',

    'User Warned':
        'has been warned',

    'Warnings Viewed':
        'had their warnings viewed',

    'Messages Purged':
        'had messages purged',

    'Channel Locked':
        'has had their channel locked',

    'Channel Unlocked':
        'has had their channel unlocked',

    'Temporary Ban Expired':
        'has been automatically unbanned',
};

// ============================================================
// RESOLVE MODERATION NOTIFICATION CHANNEL
// ============================================================

async function resolveModerationNotificationChannel({
    guild,
    event,
    channel = null,
}) {
    if (
        !guild ||
        !event
    ) {
        return null;
    }

    // ==========================================================
    // DIRECT CHANNEL
    // ==========================================================

    if (
        channel &&
        typeof channel.send ===
            'function'
    ) {
        return channel;
    }

    if (
        event.channel &&
        typeof event.channel.send ===
            'function'
    ) {
        return event.channel;
    }

    // ==========================================================
    // CHANNEL ID
    // ==========================================================

    const channelId =
        event.metadata?.channelId ||
        event.channelId ||
        null;

    if (channelId) {
        try {
            const resolved =
                guild.channels.cache.get(
                    String(channelId)
                ) ||
                await guild.channels.fetch(
                    String(channelId)
                ).catch(
                    () => null
                );

            if (
                resolved &&
                resolved.isTextBased?.() &&
                typeof resolved.send ===
                    'function'
            ) {
                return resolved;
            }
        } catch (error) {
            logger.debug(
                `Unable to resolve moderation notification channel ${channelId}:`,
                error
            );
        }
    }

    // ==========================================================
    // SYSTEM CHANNEL FALLBACK
    // ==========================================================

    const systemChannel =
        guild.systemChannel;

    if (
        systemChannel &&
        systemChannel.isTextBased?.() &&
        typeof systemChannel.send ===
            'function'
    ) {
        return systemChannel;
    }

    return null;
}

// ============================================================
// SEND MODERATION NOTIFICATION
// ============================================================

export async function sendModerationNotification({
    guild,
    channel = null,
    event,
}) {
    try {
        if (
            !guild ||
            !event
        ) {
            return false;
        }

        const userId =
            event.metadata?.userId ||
            event.targetUserId;

        if (!userId) {
            logger.warn(
                `Cannot send moderation notification for ${event.action}: no target user ID was provided.`
            );

            return false;
        }

        if (
            isModerationExempt(
                userId
            )
        ) {
            return false;
        }

        const actionText =
            MODERATION_NOTIFICATION_TEXT[
                event.action
            ];

        if (!actionText) {
            return false;
        }

        const notificationChannel =
            await resolveModerationNotificationChannel(
                {
                    guild,
                    event,
                    channel,
                }
            );

        if (!notificationChannel) {
            logger.warn(
                `Cannot send moderation notification in ${guild.name}: no usable notification channel was found.`
            );

            return false;
        }

        const userMention =
            `<@${String(userId)}>`;

        /*
         * PUBLIC MODERATION EMBED
         *
         * Example:
         *
         * @Astro has been warned. | 1423028927881805874
         *
         * No reason.
         * No warning number.
         * No server-owner explanation.
         * No bot name.
         */

        const embed =
            new EmbedBuilder()
                .setDescription(
                    `${userMention} ${actionText}. | ${String(userId)}`
                )
                .setColor(
                    0xed4245
                );

        await notificationChannel.send({
            embeds: [
                embed,
            ],

            allowedMentions: {
                users: [
                    String(userId),
                ],
            },
        });

        logger.info(
            `Moderation notification sent: ` +
            `${event.action} for ${userId} in ${guild.name} ` +
            `(channel ${notificationChannel.id})`
        );

        return true;
    } catch (error) {
        logger.error(
            `Error sending moderation notification for ${event?.action ?? 'unknown action'}:`,
            error
        );

        return false;
    }
}

// ============================================================
// MODERATION LOGGING
// ============================================================

const ACTION_TO_EVENT_TYPE = {
    'Member Banned':
        EVENT_TYPES.MODERATION_BAN,

    'Member Kicked':
        EVENT_TYPES.MODERATION_KICK,

    'Member Timed Out':
        EVENT_TYPES.MODERATION_TIMEOUT,

    'Member Untimeouted':
        EVENT_TYPES.MODERATION_UNTIMEOUT,

    'Member Unbanned':
        EVENT_TYPES.MODERATION_UNBAN,

    'User Warned':
        EVENT_TYPES.MODERATION_WARN,

    'Warnings Viewed':
        EVENT_TYPES.MODERATION_WARN,

    'Messages Purged':
        EVENT_TYPES.MODERATION_PURGE,

    'Channel Locked':
        EVENT_TYPES.MODERATION_LOCK,

    'Channel Unlocked':
        EVENT_TYPES.MODERATION_UNLOCK,

    'DM Sent':
        EVENT_TYPES.MODERATION_DM,

    'Bot Message Sent':
        EVENT_TYPES.MODERATION_CONFIG,

    'Log Channel Activated':
        EVENT_TYPES.MODERATION_CONFIG,

    'Log Filter Updated':
        EVENT_TYPES.MODERATION_CONFIG,

    'Case Created':
        EVENT_TYPES.MODERATION_CONFIG,

    'Case Updated':
        EVENT_TYPES.MODERATION_CONFIG,
};

// ============================================================
// BUILD MODERATION LOG DATA
// ============================================================

function buildModerationLogData(
    event
) {
    const targetIdMatch =
        event.target?.match(
            /\((\d+)\)/
        );

    const targetId =
        targetIdMatch?.[1];

    const executorIdMatch =
        event.executor?.match(
            /\((\d+)\)/
        );

    const executorTag =
        event.executor?.split(
            ' ('
        )[0] ||
        'Moderator';

    const lines = [];

    if (
        event.target
    ) {
        lines.push(
            formatLogLine(
                'User',
                event.target
            )
        );
    }

    if (
        event.reason
    ) {
        const reason =
            event.reason.length >
            900
                ? `${event.reason.substring(
                      0,
                      897
                  )}...`
                : event.reason;

        lines.push(
            formatLogLine(
                'Reason',
                reason
            )
        );
    }

    if (
        event.duration
    ) {
        lines.push(
            formatLogLine(
                'Duration',
                event.duration
            )
        );
    }

    if (
        event.caseId
    ) {
        lines.push(
            formatLogLine(
                'Case',
                `\`${event.caseId}\``
            )
        );
    }

    const meta = [];

    if (
        event.metadata
    ) {
        Object.entries(
            event.metadata
        ).forEach(
            ([key, value]) => {
                if (
                    value !==
                        undefined &&
                    value !==
                        null &&
                    key !==
                        'userId' &&
                    key !==
                        'moderatorId'
                ) {
                    meta.push([
                        key
                            .charAt(0)
                            .toUpperCase() +
                            key.slice(
                                1
                            ),

                        String(value),
                    ]);
                }
            }
        );
    }

    const title =
        event.caseId
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

        thumbnail:
            targetId
                ? `https://cdn.discordapp.com/embed/avatars/${Number(targetId) % 5}.png`
                : undefined,

        footer:
            executorIdMatch
                ? {
                      text:
                          executorTag,

                      iconURL:
                          undefined,
                  }
                : undefined,
    };
}

// ============================================================
// LOG EVENT
// ============================================================

export async function logEvent({
    client,
    guild,
    guildId,
    event,
}) {
    try {
        if (
            !guild &&
            guildId
        ) {
            guild =
                client.guilds.cache.get(
                    guildId
                ) ||
                await client.guilds
                    .fetch(
                        guildId
                    )
                    .catch(
                        () => null
                    );
        }

        if (!guild) {
            logger.warn(
                'logEvent invoked without valid guild or guildId'
            );

            return;
        }

        const eventType =
            ACTION_TO_EVENT_TYPE[
                event.action
            ] ||
            EVENT_TYPES.MODERATION_CONFIG;

        const data =
            buildModerationLogData(
                event
            );

        await logAuditEvent({
            client,

            guildId:
                guild.id,

            eventType,

            data,
        });

        logger.info(
            `Moderation action logged: ` +
            `${event.action} by ${event.executor} ` +
            `on ${event.target} in guild ${guild.id}`
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

export async function generateCaseId(
    client,
    guildId
) {
    try {
        const caseKey =
            `moderation_cases_${guildId}`;

        const currentCase =
            await getFromDb(
                caseKey,
                0
            );

        const nextCase =
            currentCase + 1;

        await setInDb(
            caseKey,
            nextCase
        );

        return nextCase;
    } catch (error) {
        logger.error(
            'Error generating case ID:',
            error
        );

        return Date.now();
    }
}

// ============================================================
// STORE MODERATION CASE
// ============================================================

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

            createdAt:
                new Date().toISOString(),

            caseId,
        };

        await setInDb(
            caseKey,
            caseDataWithTimestamp
        );

        const caseListKey =
            `moderation_cases_list_${guildId}`;

        const caseList =
            await getFromDb(
                caseListKey,
                []
            );

        caseList.push(
            caseDataWithTimestamp
        );

        if (
            caseList.length >
            1000
        ) {
            caseList.splice(
                0,
                caseList.length -
                    1000
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

// ============================================================
// GET MODERATION CASES
// ============================================================

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
            await getFromDb(
                caseListKey,
                []
            );

        let filteredCases =
            caseList;

        if (userId) {
            const normalizedUserId =
                String(userId);

            filteredCases =
                filteredCases.filter(
                    case_ =>
                        String(
                            case_.targetUserId
                        ) ===
                        normalizedUserId
                );
        }

        if (
            moderatorId
        ) {
            const normalizedModeratorId =
                String(
                    moderatorId
                );

            filteredCases =
                filteredCases.filter(
                    case_ =>
                        String(
                            case_.moderatorId
                        ) ===
                        normalizedModeratorId
                );
        }

        if (
            action
        ) {
            filteredCases =
                filteredCases.filter(
                    case_ =>
                        case_.action ===
                        action
                );
        }

        filteredCases.sort(
            (a, b) =>
                new Date(
                    b.createdAt
                ) -
                new Date(
                    a.createdAt
                )
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

// ============================================================
// CENTRAL MODERATION ACTION LOGGER
// ============================================================

export async function logModerationAction({
    client,
    guild,
    channel = null,
    event,
}) {
    if (
        !guild ||
        !event
    ) {
        return null;
    }

    const targetUserId =
        event.metadata?.userId ||
        event.targetUserId;

    const normalizedTargetUserId =
        targetUserId
            ? String(
                  targetUserId
              )
            : null;

    // ==========================================================
    // EXEMPTION
    // ==========================================================

    if (
        normalizedTargetUserId &&
        isModerationExempt(
            normalizedTargetUserId
        )
    ) {
        logger.info(
            `Moderation action ignored for exempt user ` +
            `${normalizedTargetUserId} in guild ${guild.id}`
        );

        return null;
    }

    // ==========================================================
    // CREATE CASE ID
    // ==========================================================

    const caseId =
        await generateCaseId(
            client,
            guild.id
        );

    // ==========================================================
    // NORMALIZED EVENT
    // ==========================================================

    const normalizedEvent = {
        ...event,

        channel:
            channel ||
            event.channel ||
            null,

        metadata: {
            ...(event.metadata ||
                {}),

            ...(normalizedTargetUserId
                ? {
                      userId:
                          normalizedTargetUserId,
                  }
                : {}),

            ...(
                channel?.id
                    ? {
                          channelId:
                              String(
                                  channel.id
                              ),
                      }
                    : event.channel?.id
                      ? {
                            channelId:
                                String(
                                    event.channel.id
                                ),
                        }
                      : {}
            ),
        },

        targetUserId:
            normalizedTargetUserId,

        caseId,
    };

    // ==========================================================
    // STORE CASE
    // ==========================================================

    await storeModerationCase({
        guildId:
            guild.id,

        caseId,

        caseData: {
            action:
                event.action,

            target:
                event.target,

            executor:
                event.executor,

            reason:
                event.reason,

            duration:
                event.duration,

            metadata:
                normalizedEvent.metadata,

            targetUserId:
                normalizedTargetUserId,

            moderatorId:
                event.metadata
                    ?.moderatorId
                    ? String(
                          event
                              .metadata
                              .moderatorId
                      )
                    : undefined,

            channelId:
                channel?.id
                    ? String(
                          channel.id
                      )
                    : event.channel?.id
                      ? String(
                            event.channel.id
                        )
                      : event.metadata
                            ?.channelId
                        ? String(
                              event.metadata
                                  .channelId
                          )
                        : undefined,
        },
    });

    // ==========================================================
    // DETAILED AUDIT LOG
    // ==========================================================

    await logEvent({
        client,

        guild,

        event:
            normalizedEvent,
    });

    // ==========================================================
    // PUBLIC MODERATION NOTIFICATION
    // ==========================================================

    await sendModerationNotification({
        guild,

        channel:
            normalizedEvent.channel,

        event:
            normalizedEvent,
    });

    return caseId;
}