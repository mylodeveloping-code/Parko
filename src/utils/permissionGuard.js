import { PermissionFlagsBits } from 'discord.js';
import { logger } from './logger.js';
import { replyUserError, ErrorTypes } from './errorHandler.js';
import { isBotOwner, getBotMessage } from '../config/bot.js';

/**
 * Read default_member_permissions from a SlashCommandBuilder (or its JSON).
 *
 * @param {import('discord.js').SlashCommandBuilder | object} commandData
 * @returns {bigint | null}
 */
export function getCommandDefaultPermissions(commandData) {
    if (!commandData) {
        return null;
    }

    let json = commandData;

    try {
        if (typeof commandData.toJSON === 'function') {
            json = commandData.toJSON();
        }
    } catch (error) {
        logger.warn(
            '[PERMISSION_GUARD] Failed to serialize command permissions',
            {
                error: error?.message,
            }
        );

        return null;
    }

    const value = json?.default_member_permissions;

    // null, undefined, empty string, or "0" means no permission gate.
    if (
        value == null ||
        value === '' ||
        value === '0' ||
        value === 0
    ) {
        return null;
    }

    try {
        return BigInt(value);
    } catch (error) {
        logger.warn(
            '[PERMISSION_GUARD] Invalid default_member_permissions value',
            {
                value,
                error: error?.message,
            }
        );

        // Never break command execution because of malformed
        // permission metadata.
        return null;
    }
}

// ============================================================
// ROLE HELPERS
// ============================================================

function normalizeRoleId(role) {
    if (!role) {
        return null;
    }

    if (typeof role === 'string') {
        return role;
    }

    if (
        typeof role === 'object' &&
        role.id
    ) {
        return role.id;
    }

    return null;
}

function isModerationCategory(category) {
    return String(category || '').trim().toLowerCase() === 'moderation';
}

// ============================================================
// MODERATOR ROLE
// ============================================================

export function memberHasConfiguredModeratorRole(
    member,
    guildConfig
) {
    if (!member || !guildConfig) {
        return false;
    }

    const modRoleId = normalizeRoleId(
        guildConfig.modRole
    );

    if (!modRoleId) {
        return false;
    }

    return Boolean(
        member.roles?.cache?.has?.(modRoleId)
    );
}

// ============================================================
// MODERATION COMMAND ACCESS
// ============================================================

export function memberHasModerationCommandAccess(
    member,
    guildConfig,
    requiredPermissions = null
) {
    if (!member) {
        return false;
    }

    // Guild owner always has moderation access.
    if (
        member.guild?.ownerId &&
        member.guild.ownerId === member.id
    ) {
        return true;
    }

    // Administrator always has moderation access.
    if (
        member.permissions?.has?.(
            PermissionFlagsBits.Administrator
        )
    ) {
        return true;
    }

    // Configured moderator role bypasses the native
    // Discord permission requirement.
    if (
        memberHasConfiguredModeratorRole(
            member,
            guildConfig
        )
    ) {
        return true;
    }

    // Otherwise honor the command's required permission.
    if (requiredPermissions != null) {
        return Boolean(
            member.permissions?.has?.(
                requiredPermissions
            )
        );
    }

    return false;
}

// ============================================================
// COMMAND DEFAULT PERMISSIONS
// ============================================================

export function memberMeetsCommandPermissions(
    member,
    permissionBitfield,
    options = {}
) {
    // IMPORTANT:
    // A command without default_member_permissions is public.
    if (permissionBitfield == null) {
        return true;
    }

    if (!member) {
        return false;
    }

    const {
        guildConfig = null,
        commandCategory = null,
    } = options;

    // Moderation commands use the custom moderation system.
    if (
        isModerationCategory(commandCategory)
    ) {
        return memberHasModerationCommandAccess(
            member,
            guildConfig,
            permissionBitfield
        );
    }

    // Guild owner bypass.
    if (
        member.guild?.ownerId &&
        member.guild.ownerId === member.id
    ) {
        return true;
    }

    // Normal Discord permission check.
    return Boolean(
        member.permissions?.has?.(
            permissionBitfield
        )
    );
}

// ============================================================
// CHECK MODERATION PERMISSIONS
// ============================================================

export async function checkModerationPermissions(
    interaction,
    guildConfig,
    requiredPermissions,
    errorMessage =
        'You do not have permission to use this command.'
) {
    if (
        memberHasModerationCommandAccess(
            interaction.member,
            guildConfig,
            requiredPermissions
        )
    ) {
        return true;
    }

    await replyUserError(
        interaction,
        {
            type: ErrorTypes.PERMISSION,

            message: errorMessage,

            context: {
                source:
                    'permissionGuard.checkModerationPermissions',
            },
        }
    );

    logger.warn(
        '[PERMISSION_DENIED] Moderation command blocked',
        {
            userId: interaction.user?.id,
            guildId: interaction.guildId,
            command: interaction.commandName,
        }
    );

    return false;
}

// ============================================================
// DEFAULT COMMAND PERMISSION ENFORCEMENT
// ============================================================

export async function enforceDefaultCommandPermissions(
    interaction,
    command,
    context = {}
) {
    // Bot owner bypass.
    if (
        isBotOwner(
            interaction.user?.id
        )
    ) {
        return true;
    }

    const requiredPermissions =
        getCommandDefaultPermissions(
            command?.data
        );

    // NO permission requirement = allow the command.
    if (requiredPermissions == null) {
        return true;
    }

    const member =
        interaction.member;

    if (
        memberMeetsCommandPermissions(
            member,
            requiredPermissions,
            {
                guildConfig:
                    context.guildConfig ?? null,

                commandCategory:
                    command?.category ?? null,
            }
        )
    ) {
        return true;
    }

    const commandName =
        command?.data?.name ??
        interaction.commandName ??
        'command';

    await replyUserError(
        interaction,
        {
            type: ErrorTypes.PERMISSION,

            message:
                getBotMessage('noPermission'),

            context: {
                source:
                    context.source ??
                    'permissionGuard.enforceDefaultCommandPermissions',

                commandName,

                requiredPermissions:
                    requiredPermissions.toString(),
            },
        }
    );

    logger.warn(
        '[PERMISSION_DENIED] Command blocked by default_member_permissions',
        {
            userId:
                interaction.user?.id,

            guildId:
                interaction.guildId,

            command:
                commandName,

            requiredPermissions:
                requiredPermissions.toString(),
        }
    );

    return false;
}

// ============================================================
// BASIC PERMISSION HELPERS
// ============================================================

export function isAdmin(member) {
    if (!member) {
        return false;
    }

    return Boolean(
        member.permissions?.has?.(
            PermissionFlagsBits.Administrator
        )
    );
}

export function isModerator(
    member,
    guildConfig = null
) {
    if (!member) {
        return false;
    }

    if (
        memberHasConfiguredModeratorRole(
            member,
            guildConfig
        )
    ) {
        return true;
    }

    return Boolean(
        member.permissions?.has?.(
            PermissionFlagsBits.Administrator
        ) ||
        member.permissions?.has?.(
            PermissionFlagsBits.ManageGuild
        )
    );
}

export function hasPermission(
    member,
    permissions
) {
    if (!member) {
        return false;
    }

    return Boolean(
        member.permissions?.has?.(
            permissions
        )
    );
}

// ============================================================
// BOT PERMISSIONS
// ============================================================

export function botHasPermission(
    channel,
    permissions
) {
    if (
        !channel ||
        !channel.guild
    ) {
        return false;
    }

    const botMember =
        channel.guild.members.me;

    if (!botMember) {
        return false;
    }

    const channelPermissions =
        channel.permissionsFor(botMember);

    if (!channelPermissions) {
        return false;
    }

    return channelPermissions.has(
        permissions
    );
}

// ============================================================
// USER PERMISSIONS
// ============================================================

export async function checkUserPermissions(
    interaction,
    requiredPermissions,
    errorMessage =
        'You do not have permission to use this command.'
) {
    const member =
        interaction.member;

    if (!member) {
        await replyUserError(
            interaction,
            {
                type: ErrorTypes.PERMISSION,

                message: errorMessage,

                context: {
                    source:
                        'permissionGuard.checkUserPermissions',
                },
            }
        );

        return false;
    }

    if (
        !member.permissions?.has?.(
            requiredPermissions
        )
    ) {
        await replyUserError(
            interaction,
            {
                type: ErrorTypes.PERMISSION,

                message: errorMessage,

                context: {
                    source:
                        'permissionGuard.checkUserPermissions',
                },
            }
        );

        logger.warn(
            '[PERMISSION_DENIED] User attempted command',
            {
                userId:
                    member.id,

                guildId:
                    interaction.guildId,

                command:
                    interaction.commandName,
            }
        );

        return false;
    }

    return true;
}

// ============================================================
// BOT PERMISSIONS CHECK
// ============================================================

export async function checkBotPermissions(
    interaction,
    requiredPermissions,
    channel = null
) {
    const targetChannel =
        channel ||
        interaction.channel;

    if (
        !targetChannel ||
        !targetChannel.guild
    ) {
        await replyUserError(
            interaction,
            {
                type: ErrorTypes.UNKNOWN,

                message:
                    'Could not determine channel.',

                context: {
                    source:
                        'permissionGuard.checkBotPermissions',
                },
            }
        );

        return false;
    }

    const botMember =
        targetChannel.guild.members.me;

    if (!botMember) {
        await replyUserError(
            interaction,
            {
                type: ErrorTypes.UNKNOWN,

                message:
                    'Could not find bot member in this guild.',

                context: {
                    source:
                        'permissionGuard.checkBotPermissions',
                },
            }
        );

        return false;
    }

    const permissions =
        targetChannel.permissionsFor(
            botMember
        );

    if (!permissions) {
        await replyUserError(
            interaction,
            {
                type: ErrorTypes.PERMISSION,

                message:
                    'Could not determine my permissions in this channel.',

                context: {
                    source:
                        'permissionGuard.checkBotPermissions',
                },
            }
        );

        return false;
    }

    const missingPerms = [];

    const permArray =
        Array.isArray(requiredPermissions)
            ? requiredPermissions
            : [requiredPermissions];

    for (const perm of permArray) {
        if (!permissions.has(perm)) {
            missingPerms.push(perm);
        }
    }

    if (missingPerms.length > 0) {
        await replyUserError(
            interaction,
            {
                type: ErrorTypes.PERMISSION,

                message:
                    `I need the following permissions in ${targetChannel}: ${missingPerms.join(', ')}`,

                context: {
                    source:
                        'permissionGuard.checkBotPermissions',

                    subtype:
                        'bot_permission',
                },
            }
        );

        logger.warn(
            '[BOT_PERMISSION_DENIED] Bot missing permissions',
            {
                permissions: missingPerms,
                channelId:
                    targetChannel.id,
            }
        );

        return false;
    }

    return true;
}

// ============================================================
// PERMISSION AUDIT
// ============================================================

function hashUserId(userId) {
    const value = String(userId || '');

    let hash = 0;

    for (
        let i = 0;
        i < value.length;
        i++
    ) {
        hash =
            ((hash << 5) - hash) +
            value.charCodeAt(i);

        hash =
            hash & hash;
    }

    return Math.abs(hash)
        .toString(16)
        .substring(0, 8);
}

export function auditPermissionCheck(
    userId,
    action,
    allowed,
    reason = null
) {
    const userHash =
        hashUserId(userId);

    if (allowed) {
        logger.debug(
            '[PERMISSION_AUDIT] Permission granted',
            {
                action,
                userHash,
            }
        );

        return;
    }

    logger.warn(
        '[PERMISSION_AUDIT] Permission denied',
        {
            action,
            userHash,
            reason:
                reason ||
                'insufficient_permissions',
        }
    );
}

// ============================================================
// DEFAULT EXPORT
// ============================================================

export default {
    isAdmin,
    isModerator,
    hasPermission,
    botHasPermission,

    getCommandDefaultPermissions,

    memberHasConfiguredModeratorRole,
    memberHasModerationCommandAccess,
    memberMeetsCommandPermissions,

    checkModerationPermissions,
    enforceDefaultCommandPermissions,

    checkUserPermissions,
    checkBotPermissions,

    auditPermissionCheck,
};