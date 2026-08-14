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

// Prevent multiple restoration timers for the same user.
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

        const parsed = JSON.parse(data);

        if (!parsed || typeof parsed !== 'object') {
            return {};
        }

        return parsed;
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
        target?.user?.tag ??
        target?.displayName ??
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

    // ========================================================
    // HIERARCHY
    // ========================================================

    static buildHierarchyMessage({
        actor,
        actorRole,
        targetRole,
        targetLabel,
        action,
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

    // ========================================================
    // BAN
    // ========================================================

    static async banUser({
        guild,
        user,
        moderator,
        reason = 'No reason provided',
        deleteDays = 0,
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
                        PermissionFlagsBits.Administrator,
                    ]);

                if (!isOwner && !hasHighPerms) {
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
                        metadata: {
                            userId: user.id,
                            moderatorId:
                                moderator.id,
                            permanent: true,
                            deleteDays,
                        },
                    },
                });

            logger.info(
                `User banned: ${user.tag} by ${moderator.user.tag} in ${guild.name}`
            );

            return {
                caseId,
                user: user.tag,
                reason,
            };
        } catch (error) {
            logger.error(
                'Error banning user:',
                error
            );

            throw error;
        }
    }

    // ========================================================
    // KICK
    // ========================================================

    static async kickUser({
        guild,
        member,
        moderator,
        reason = 'No reason provided',
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
                'kick'
            );

            if (!member.kickable) {
                const targetLabel =
                    getTargetLabel(member);

                throw new TitanBotError(
                    'Cannot kick member',
                    ErrorTypes.PERMISSION,
                    `I cannot kick **${targetLabel}**. They may have **Administrator** permission or a managed/integration role. Ensure my bot role is above theirs in **Server Settings → Roles** and that they do not have Admin.`
                );
            }

            await member.kick(reason);

            const caseId =
                await logModerationAction({
                    client: guild.client,
                    guild,
                    event: {
                        action: 'Member Kicked',
                        target:
                            `${member.user.tag} (${member.id})`,
                        executor:
                            `${moderator.user.tag} (${moderator.id})`,
                        reason,
                        metadata: {
                            userId: member.id,
                            moderatorId:
                                moderator.id,
                        },
                    },
                });

            logger.info(
                `User kicked: ${member.user.tag} by ${moderator.user.tag} in ${guild.name}`
            );

            return {
                caseId,
                user: member.user.tag,
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

    // ========================================================
    // TIMEOUT
    // ========================================================

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
                    `I cannot timeout **${targetLabel}**. They may have **Administrator** permission or a managed/integration role. Ensure my bot role is above theirs in **Server Settings → Roles** and that they do not have Admin.`
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

            // ------------------------------------------------
            // SAVE OLD ROLES
            // ------------------------------------------------

            const previousRoleIds =
                member.roles.cache
                    .filter(
                        role =>
                            role.id !== guild.id
                    )
                    .filter(
                        role =>
                            role.id !== MUTED_ROLE_ID
                    )
                    .filter(
                        role =>
                            !role.managed
                    )
                    .map(
                        role =>
                            role.id
                    );

            const timeoutRoles =
                await loadTimeoutRoles();

            const key =
                `${guild.id}:${member.id}`;

            timeoutRoles[key] = {
                guildId: guild.id,
                userId: member.id,
                roleIds: previousRoleIds,
                expiresAt:
                    Date.now() + durationMs,
            };

            await saveTimeoutRoles(
                timeoutRoles
            );

            logger.info(
                `Saved ${previousRoleIds.length} previous roles for ${member.user.tag}.`
            );

            // ------------------------------------------------
            // APPLY DISCORD TIMEOUT
            // ------------------------------------------------

            await member.timeout(
                durationMs,
                reason
            );

            // ------------------------------------------------
            // REMOVE NORMAL ROLES
            // ------------------------------------------------

            const rolesToRemove =
                member.roles.cache.filter(
                    role =>
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

            // ------------------------------------------------
            // ADD MUTED ROLE
            // ------------------------------------------------

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

            // ------------------------------------------------
            // SCHEDULE AUTOMATIC RESTORATION
            // ------------------------------------------------

            this.scheduleTimeoutRestoration(
                guild,
                member.id,
                durationMs
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
                            userId: member.id,
                            moderatorId:
                                moderator.id,
                            durationMs,
                        },
                    },
                });

            logger.info(
                `User timed out: ${member.user.tag} by ${moderator.user.tag} in ${guild.name}`
            );

            return {
                caseId,
                user: member.user.tag,
                duration: durationMinutes,
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

    // ========================================================
    // SCHEDULE AUTOMATIC ROLE RESTORATION
    // ========================================================

    static scheduleTimeoutRestoration(
        guild,
        userId,
        durationMs
    ) {
        const key =
            `${guild.id}:${userId}`;

        const existingTimer =
            timeoutRestoreTimers.get(key);

        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        const MAX_TIMEOUT =
            2147483647;

        const delay =
            Math.min(
                Math.max(durationMs, 1000),
                MAX_TIMEOUT
            );

        const timer =
            setTimeout(
                async () => {
                    timeoutRestoreTimers.delete(
                        key
                    );

                    try {
                        const member =
                            await guild.members
                                .fetch(userId)
                                .catch(
                                    () => null
                                );

                        if (!member) {
                            logger.warn(
                                `Could not restore timeout roles for ${userId}: member not found.`
                            );

                            return;
                        }

                        /*
                         * Only restore if the saved timeout
                         * actually expired.
                         */
                        const timeoutRoles =
                            await loadTimeoutRoles();

                        const saved =
                            timeoutRoles[key];

                        if (!saved) {
                            return;
                        }

                        if (
                            Date.now() <
                            saved.expiresAt
                        ) {
                            /*
                             * Timer was capped by Node's
                             * maximum timeout duration.
                             */
                            this.scheduleTimeoutRestoration(
                                guild,
                                userId,
                                saved.expiresAt -
                                    Date.now()
                            );

                            return;
                        }

                        /*
                         * If Discord still says they are timed
                         * out, wait until Discord's timeout ends.
                         */
                        if (
                            member.isCommunicationDisabled()
                        ) {
                            const remaining =
                                member.communicationDisabledUntilTimestamp
                                    ? member.communicationDisabledUntilTimestamp -
                                      Date.now()
                                    : 1000;

                            this.scheduleTimeoutRestoration(
                                guild,
                                userId,
                                Math.max(
                                    remaining,
                                    1000
                                )
                            );

                            return;
                        }

                        await this.restoreTimeoutRoles(
                            guild,
                            member
                        );
                    } catch (error) {
                        logger.error(
                            `Automatic timeout role restoration failed for ${userId}:`,
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

    // ========================================================
    // RESTORE TIMEOUT ROLES
    // ========================================================

    static async restoreTimeoutRoles(
        guild,
        member
    ) {
        try {
            const timeoutRoles =
                await loadTimeoutRoles();

            const key =
                `${guild.id}:${member.id}`;

            const saved =
                timeoutRoles[key];

            /*
             * Always remove the muted role.
             */
            if (
                member.roles.cache.has(
                    MUTED_ROLE_ID
                )
            ) {
                try {
                    await member.roles.remove(
                        MUTED_ROLE_ID,
                        'Timeout ended - removing muted role'
                    );

                    logger.info(
                        `Removed muted role from ${member.user.tag}.`
                    );
                } catch (error) {
                    logger.error(
                        `Failed to remove muted role from ${member.user.tag}:`,
                        error
                    );
                }
            }

            /*
             * If there is no saved role data, we're done.
             */
            if (!saved) {
                logger.warn(
                    `No saved timeout roles found for ${member.user.tag}.`
                );

                return false;
            }

            /*
             * Make sure the roles still exist and are
             * manageable by the bot.
             */
            const rolesToRestore =
                saved.roleIds
                    .map(
                        roleId =>
                            guild.roles.cache.get(
                                roleId
                            )
                    )
                    .filter(
                        role =>
                            role &&
                            !role.managed &&
                            role.editable
                    );

            /*
             * Restore the user's previous roles.
             */
            if (
                rolesToRestore.length > 0
            ) {
                await member.roles.add(
                    rolesToRestore,
                    'Timeout ended - restoring previous roles'
                );

                logger.info(
                    `Restored ${rolesToRestore.length} previous roles for ${member.user.tag}.`
                );
            } else {
                logger.info(
                    `No restorable previous roles found for ${member.user.tag}.`
                );
            }

            /*
             * Delete saved role information ONLY after
             * restoration has been attempted successfully.
             */
            delete timeoutRoles[key];

            await saveTimeoutRoles(
                timeoutRoles
            );

            logger.info(
                `Completed timeout role restoration for ${member.user.tag} in ${guild.name}.`
            );

            return true;
        } catch (error) {
            logger.error(
                `Error restoring timeout roles for ${member?.user?.tag ?? member?.id}:`,
                error
            );

            /*
             * Do NOT delete the saved role data if restoration
             * failed. This allows another attempt later.
             */
            return false;
        }
    }

    // ========================================================
    // MANUAL REMOVE TIMEOUT
    // ========================================================

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

            if (!member.moderatable) {
                const targetLabel =
                    getTargetLabel(member);

                throw new TitanBotError(
                    'Cannot modify member',
                    ErrorTypes.PERMISSION,
                    `I cannot modify **${targetLabel}**. They may have **Administrator** permission or a managed/integration role. Ensure my bot role is above theirs in **Server Settings → Roles**.`
                );
            }

            /*
             * Check whether there is saved role data.
             */
            const timeoutRoles =
                await loadTimeoutRoles();

            const key =
                `${guild.id}:${member.id}`;

            const saved =
                timeoutRoles[key];

            const currentlyTimedOut =
                member.isCommunicationDisabled();

            /*
             * If they're not timed out AND there is no saved
             * timeout state, there is nothing to remove.
             */
            if (
                !currentlyTimedOut &&
                !saved
            ) {
                throw new TitanBotError(
                    'User not timed out',
                    ErrorTypes.VALIDATION,
                    `${member.user.tag} is not currently timed out`
                );
            }

            /*
             * Remove Discord timeout if it exists.
             */
            if (currentlyTimedOut) {
                await member.timeout(
                    null,
                    reason
                );
            }

            /*
             * Cancel automatic restoration timer.
             */
            const existingTimer =
                timeoutRestoreTimers.get(
                    key
                );

            if (existingTimer) {
                clearTimeout(
                    existingTimer
                );

                timeoutRestoreTimers.delete(
                    key
                );
            }

            /*
             * Restore old roles AND remove muted role.
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
                        userId: member.id,
                        moderatorId:
                            moderator.id,
                    },
                },
            });

            logger.info(
                `Timeout removed: ${member.user.tag} by ${moderator.user.tag} in ${guild.name}`
            );

            return {
                user: member.user.tag,
            };
        } catch (error) {
            logger.error(
                'Error removing timeout:',
                error
            );

            throw error;
        }
    }

    // ========================================================
    // RESTORE EXPIRED TIMEOUTS
    // ========================================================

    static async restoreExpiredTimeouts(
        client
    ) {
        try {
            const timeoutRoles =
                await loadTimeoutRoles();

            const now =
                Date.now();

            for (
                const [key, saved]
                of Object.entries(
                    timeoutRoles
                )
            ) {
                if (
                    !saved?.guildId ||
                    !saved?.userId ||
                    !saved?.expiresAt
                ) {
                    continue;
                }

                const guild =
                    client.guilds.cache.get(
                        saved.guildId
                    );

                if (!guild) {
                    continue;
                }

                const member =
                    await guild.members
                        .fetch(saved.userId)
                        .catch(
                            () => null
                        );

                if (!member) {
                    continue;
                }

                /*
                 * If the timeout has already expired,
                 * restore immediately.
                 */
                if (
                    now >=
                    saved.expiresAt
                ) {
                    if (
                        !member.isCommunicationDisabled()
                    ) {
                        await this.restoreTimeoutRoles(
                            guild,
                            member
                        );
                    } else {
                        const remaining =
                            member.communicationDisabledUntilTimestamp -
                            Date.now();

                        this.scheduleTimeoutRestoration(
                            guild,
                            member.id,
                            Math.max(
                                remaining,
                                1000
                            )
                        );
                    }
                } else {
                    /*
                     * Timeout is still active.
                     * Schedule restoration for when it expires.
                     */
                    this.scheduleTimeoutRestoration(
                        guild,
                        member.id,
                        saved.expiresAt -
                            Date.now()
                    );
                }
            }
        } catch (error) {
            logger.error(
                'Error restoring expired timeout roles:',
                error
            );
        }
    }

    // ========================================================
    // UNBAN
    // ========================================================

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
                            userId: user.id,
                            moderatorId:
                                moderator.id,
                        },
                    },
                });

            logger.info(
                `User unbanned: ${user.tag} by ${moderator.user.tag} in ${guild.name}`
            );

            return {
                caseId,
                user: user.tag,
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
