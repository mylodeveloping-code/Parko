import { EmbedBuilder } from 'discord.js';

import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import { getColor } from '../../config/bot.js';

import {
    createEmbed,
} from '../../utils/embeds.js';

import {
    logModerationAction,
    isModerationExempt,
    resolveModerationTarget,
} from '../../utils/moderation.js';

import { logger } from '../../utils/logger.js';

import {
    WarningService,
} from '../../services/moderation/warningService.js';

import {
    TitanBotError,
    ErrorTypes,
} from '../../utils/errorHandler.js';

import {
    InteractionHelper,
} from '../../utils/interactionHelper.js';

const WARNING_ROLES = {
    1: '1537643745720148018',
    2: '1533577410367455242',
    3: '1536917870087376936',
};

const THIRTY_DAYS =
    30 * 24 * 60 * 60 * 1000;

// ============================================================
// CLEAN WARNING EMBEDS
// ============================================================
//
// These deliberately build the embed locally instead of using
// the older branded successEmbed()/warningEmbed() helpers.
// That prevents the old "Parko" branding from appearing here.
// ============================================================

function cleanSuccessEmbed(
    title,
    description
) {
    return new EmbedBuilder()
        .setColor(
            getColor('success')
        )
        .setTitle(
            `✅ ${title}`
        )
        .setDescription(
            description
        );
}

function cleanWarningEmbed(
    title,
    description
) {
    return new EmbedBuilder()
        .setColor(
            getColor('warning')
        )
        .setTitle(
            title
        )
        .setDescription(
            description
        );
}

export default {
    data:
        new SlashCommandBuilder()
            .setName('warn')
            .setDescription(
                'Warn a user'
            )

            .addUserOption(
                option =>
                    option
                        .setName(
                            'target'
                        )
                        .setRequired(
                            true
                        )
                        .setDescription(
                            'User to warn'
                        )
            )

            .addStringOption(
                option =>
                    option
                        .setName(
                            'reason'
                        )
                        .setRequired(
                            true
                        )
                        .setDescription(
                            'Reason for the warning'
                        )
            )

            .setDefaultMemberPermissions(
                PermissionFlagsBits.ModerateMembers
            ),

    category:
        'moderation',

    async execute(
        interaction,
        config,
        client
    ) {
        const deferSuccess =
            await InteractionHelper.safeDefer(
                interaction
            );

        if (!deferSuccess) {
            logger.warn(
                'Warn interaction defer failed',
                {
                    userId:
                        interaction.user.id,

                    guildId:
                        interaction.guildId,

                    commandName:
                        'warn',
                }
            );

            return;
        }

        const target =
            interaction.options.getUser(
                'target'
            );

        const reason =
            interaction.options.getString(
                'reason'
            );

        const moderator =
            interaction.user;

        const guild =
            interaction.guild;

        const guildId =
            interaction.guildId;

        // ========================================================
        // BASIC VALIDATION
        // ========================================================

        if (!target) {
            throw new TitanBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'You must specify a user to warn.',
                {
                    subtype:
                        'invalid_user',
                }
            );
        }

        if (!guild) {
            throw new TitanBotError(
                'Guild unavailable',
                ErrorTypes.INTERNAL,
                'This command can only be used inside a server.'
            );
        }

        // ========================================================
        // MODERATION EXEMPTION
        // ========================================================

        if (
            isModerationExempt(
                target.id
            )
        ) {
            throw new TitanBotError(
                'User is moderation exempt',
                ErrorTypes.VALIDATION,
                'This user is exempt from all moderation actions.'
            );
        }

        // ========================================================
        // REASON
        // ========================================================

        if (!reason) {
            throw new TitanBotError(
                'Missing warning reason',
                ErrorTypes.VALIDATION,
                'You must provide a reason for the warning.',
                {
                    subtype:
                        'missing_required',
                }
            );
        }

        // ========================================================
        // RESOLVE MEMBER
        // ========================================================

        const member =
            await resolveModerationTarget(
                guild,
                target.id
            );

        /*
         * IMPORTANT:
         *
         * There is intentionally NO moderation-hierarchy check
         * here.
         *
         * Warnings are stored in the warning database and do not
         * require the bot to modify the target's permissions,
         * timeout, kick, or role hierarchy.
         *
         * This allows the server owner to receive warnings too.
         */

        const isServerOwner =
            target.id ===
            guild.ownerId;

        // ========================================================
        // DATABASE WARNING
        // ========================================================

        const {
            id,
            totalCount,
        } =
            await WarningService.addWarning({
                guildId,

                userId:
                    target.id,

                moderatorId:
                    moderator.id,

                reason,

                timestamp:
                    Date.now(),
            });

        const warningLevel =
            Math.min(
                totalCount,
                3
            );

        // ========================================================
        // WARNING ROLES
        // ========================================================

        let warningRolesUpdated =
            true;

        if (member) {
            try {
                for (
                    let level = 1;
                    level <=
                        warningLevel;
                    level++
                ) {
                    const roleId =
                        WARNING_ROLES[
                            level
                        ];

                    if (
                        !roleId
                    ) {
                        continue;
                    }

                    if (
                        !member.roles.cache.has(
                            roleId
                        )
                    ) {
                        await member.roles.add(
                            roleId,
                            `Warning ${level} role - ${totalCount} total warnings`
                        );
                    }
                }

                logger.info(
                    `Updated warning roles for ${target.tag}`,
                    {
                        userId:
                            target.id,

                        guildId,

                        totalWarnings:
                            totalCount,

                        warningLevel,
                    }
                );
            } catch (roleError) {
                warningRolesUpdated =
                    false;

                logger.warn(
                    `Warning recorded for ${target.tag}, but warning roles could not be updated.`,
                    {
                        userId:
                            target.id,

                        guildId,

                        totalWarnings:
                            totalCount,

                        warningLevel,

                        error:
                            roleError,
                    }
                );
            }
        }

        // ========================================================
        // THIRD WARNING = 30 DAY BAN
        // ========================================================

        let wasBanned =
            false;

        /*
         * Discord does not allow a server owner to be banned.
         *
         * The warning itself is still recorded.
         */
        if (
            totalCount === 3 &&
            !isServerOwner
        ) {
            try {
                await guild.members.ban(
                    target.id,
                    {
                        reason:
                            `Third warning - ${reason}`,

                        deleteMessageSeconds:
                            0,
                    }
                );

                wasBanned =
                    true;

                logger.info(
                    `Banned ${target.tag} for 30 days after third warning`,
                    {
                        userId:
                            target.id,

                        guildId,

                        moderatorId:
                            moderator.id,

                        warningId:
                            id,

                        reason,

                        banDuration:
                            '30 days',
                    }
                );

                setTimeout(
                    async () => {
                        try {
                            await guild.members.unban(
                                target.id,
                                '30-day ban expired after third warning'
                            );

                            logger.info(
                                `Automatically unbanned ${target.tag} after 30 days`,
                                {
                                    userId:
                                        target.id,

                                    guildId,

                                    warningId:
                                        id,
                                }
                            );
                        } catch (
                            unbanError
                        ) {
                            logger.error(
                                `Failed to automatically unban ${target.tag} after 30 days`,
                                {
                                    userId:
                                        target.id,

                                    guildId,

                                    warningId:
                                        id,

                                    error:
                                        unbanError,
                                }
                            );
                        }
                    },
                    THIRTY_DAYS
                );
            } catch (
                banError
            ) {
                logger.error(
                    `Failed to ban ${target.tag} after third warning`,
                    {
                        userId:
                            target.id,

                        guildId,

                        moderatorId:
                            moderator.id,

                        warningId:
                            id,

                        error:
                            banError,
                    }
                );
            }
        }

        // ========================================================
        // DM USER
        // ========================================================

        try {
            let warningDM;

            if (
                totalCount === 3 &&
                wasBanned
            ) {
                warningDM =
                    createEmbed({
                        title:
                            '🔨 You Have Been Banned',

                        description:
                            `You have received your third warning in **${guild.name}**.\n\n` +
                            `You have been **banned for 30 days**.`,
                    })
                        .addFields(
                            {
                                name:
                                    'Reason',

                                value:
                                    reason,

                                inline:
                                    false,
                            },

                            {
                                name:
                                    'Warning #',

                                value:
                                    `${totalCount}`,

                                inline:
                                    true,
                            }
                        )
                        .setColor(
                            getColor(
                                'error'
                            )
                        );
            } else {
                warningDM =
                    createEmbed({
                        title:
                            '⚠️ You Have Been Warned',

                        description:
                            `You have received a warning in **${guild.name}**.`,
                    })
                        .addFields(
                            {
                                name:
                                    'Reason',

                                value:
                                    reason,

                                inline:
                                    false,
                            },

                            {
                                name:
                                    'Warning #',

                                value:
                                    `${totalCount}`,

                                inline:
                                    true,
                            }
                        )
                        .setColor(
                            getColor(
                                'warning'
                            )
                        );
            }

            await target.send({
                embeds: [
                    warningDM,
                ],
            });

            logger.info(
                `Sent warning DM to ${target.tag}`,
                {
                    userId:
                        target.id,

                    guildId,

                    warningId:
                        id,

                    warningNumber:
                        totalCount,

                    wasBanned,
                }
            );
        } catch (
            dmError
        ) {
            logger.warn(
                `Could not DM ${target.tag} about their warning`,
                {
                    userId:
                        target.id,

                    guildId,

                    warningId:
                        id,

                    error:
                        dmError,
                }
            );
        }

        // ========================================================
        // LOG MODERATION ACTION
        // ========================================================

        await logModerationAction({
            client,

            guild,

            channel:
                interaction.channel,

            event: {
                action:
                    'User Warned',

                target:
                    `${target.tag} (${target.id})`,

                executor:
                    `${moderator.tag} (${moderator.id})`,

                reason,

                metadata: {
                    userId:
                        target.id,

                    moderatorId:
                        moderator.id,

                    totalWarns:
                        totalCount,

                    warningNumber:
                        totalCount,

                    warningLevel,

                    warningId:
                        id,

                    warningRoles:
                        Object.values(
                            WARNING_ROLES
                        ).slice(
                            0,
                            warningLevel
                        ),

                    warningRolesUpdated,

                    bannedFor30Days:
                        wasBanned,

                    serverOwner:
                        isServerOwner,
                },
            },
        });

        // ========================================================
        // SUCCESS RESPONSE
        // ========================================================

        let description =
            `**Reason:** ${reason}\n` +
            `**Warning #:** ${totalCount}`;

        if (
            isServerOwner
        ) {
            description +=
                '\n\n⚠️ This user is the server owner, so Discord will not allow the 30-day ban.';
        } else if (
            totalCount === 3 &&
            wasBanned
        ) {
            description +=
                '\n\n🔨 **This was their third warning. They have been banned for 30 days.**';
        }

        if (
            !warningRolesUpdated
        ) {
            description +=
                '\n\n⚠️ The warning was recorded, but the warning roles could not be updated.';
        }

        await InteractionHelper.safeEditReply(
            interaction,
            {
                embeds: [
                    cleanSuccessEmbed(
                        `Warned ${target.tag}`,
                        description
                    ),
                ],
            }
        );
    },
};