import { getColor } from '../../config/bot.js';

import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import {
    createEmbed,
    successEmbed,
    warningEmbed,
} from '../../utils/embeds.js';

import {
    logModerationAction,
    isModerationExempt,
    resolveModerationTarget,
} from '../../utils/moderation.js';

import { logger } from '../../utils/logger.js';
import { WarningService } from '../../services/moderation/warningService.js';
import { ModerationService } from '../../services/moderation/moderationService.js';

import {
    TitanBotError,
    ErrorTypes,
} from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';

// Warning role IDs
const WARNING_ROLES = {
    1: '1537643745720148018',
    2: '1533577410367455242',
    3: '1536917870087376936',
};

// 30 days in milliseconds
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export default {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user')
        .addUserOption((o) =>
            o
                .setName('target')
                .setRequired(true)
                .setDescription('User to warn'),
        )
        .addStringOption((o) =>
            o
                .setName('reason')
                .setRequired(true)
                .setDescription('Reason for the warning'),
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ModerateMembers
        ),

    category: 'moderation',

    async execute(interaction, config, client) {
        const deferSuccess =
            await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn('Warn interaction defer failed', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'warn',
            });
            return;
        }

        const target =
            interaction.options.getUser('target');

        const reason =
            interaction.options.getString('reason');

        const moderator =
            interaction.user;

        const guild =
            interaction.guild;

        const guildId =
            interaction.guildId;

        if (!target) {
            throw new TitanBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'You must specify a user to warn.',
                { subtype: 'invalid_user' },
            );
        }

        if (!guild) {
            throw new TitanBotError(
                'Guild unavailable',
                ErrorTypes.INTERNAL,
                'This command can only be used inside a server.',
            );
        }

        // ============================================
        // MODERATION EXEMPTION
        // ============================================

        if (isModerationExempt(target.id)) {
            throw new TitanBotError(
                'User is moderation exempt',
                ErrorTypes.VALIDATION,
                'This user is exempt from all moderation actions.',
            );
        }

        // ============================================
        // REASON
        // ============================================

        if (!reason) {
            throw new TitanBotError(
                'Missing warning reason',
                ErrorTypes.VALIDATION,
                'You must provide a reason for the warning.',
                { subtype: 'missing_required' },
            );
        }

        // ============================================
        // RESOLVE MEMBER
        // ============================================
        //
        // DO NOT use interaction.options.getMember()
        // as the only lookup.
        //
        // If the user is in the guild but isn't cached,
        // resolveModerationTarget() fetches them.
        //
        // If the user genuinely isn't in the guild,
        // member will simply be null.
        //

        const member =
            await resolveModerationTarget(
                guild,
                target.id
            );

        // ============================================
        // HIERARCHY CHECK
        // ============================================
        //
        // Only perform hierarchy/role operations if
        // the target is actually in the guild.
        //

        if (member) {
            ModerationService.assertModerationHierarchy(
                interaction.member,
                member,
                'warn'
            );
        }

        // ============================================
        // ADD WARNING TO DATABASE
        // ============================================

        const {
            id,
            totalCount,
        } = await WarningService.addWarning({
            guildId,
            userId: target.id,
            moderatorId: moderator.id,
            reason,
            timestamp: Date.now(),
        });

        const warningLevel =
            Math.min(totalCount, 3);

        // ============================================
        // WARNING ROLES
        // ============================================

        if (member) {
            try {
                for (
                    let level = 1;
                    level <= warningLevel;
                    level++
                ) {
                    const roleId =
                        WARNING_ROLES[level];

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
                        userId: target.id,
                        guildId,
                        totalWarnings: totalCount,
                        warningLevel,
                    }
                );
            } catch (roleError) {
                logger.error(
                    `Failed to update warning roles for ${target.tag}`,
                    {
                        userId: target.id,
                        guildId,
                        totalWarnings: totalCount,
                        warningLevel,
                        error: roleError,
                    }
                );

                await InteractionHelper.safeEditReply(
                    interaction,
                    {
                        embeds: [
                            warningEmbed(
                                `⚠️ **Warned** ${target.tag}`,
                                `**Reason:** ${reason}\n` +
                                `**Warning #:** ${totalCount}\n\n` +
                                `⚠️ The warning was recorded, but I could not update the warning roles.\n` +
                                `Make sure I have **Manage Roles** permission and that my bot role is above all three warning roles.`
                            ),
                        ],
                    }
                );

                return;
            }
        } else {
            logger.info(
                `Warning recorded for ${target.tag}, but user is not currently in guild`,
                {
                    userId: target.id,
                    guildId,
                    totalWarnings: totalCount,
                }
            );
        }

        // ============================================
        // THIRD WARNING = 30-DAY BAN
        // ============================================

        let wasBanned = false;

        if (totalCount === 3) {
            try {
                await guild.members.ban(
                    target.id,
                    {
                        reason:
                            `Third warning - ${reason}`,
                        deleteMessageSeconds: 0,
                    }
                );

                wasBanned = true;

                logger.info(
                    `Banned ${target.tag} for 30 days after third warning`,
                    {
                        userId: target.id,
                        guildId,
                        moderatorId: moderator.id,
                        warningId: id,
                        reason,
                        banDuration: '30 days',
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
                                    userId: target.id,
                                    guildId,
                                    warningId: id,
                                }
                            );
                        } catch (unbanError) {
                            logger.error(
                                `Failed to automatically unban ${target.tag} after 30 days`,
                                {
                                    userId: target.id,
                                    guildId,
                                    warningId: id,
                                    error: unbanError,
                                }
                            );
                        }
                    },
                    THIRTY_DAYS
                );
            } catch (banError) {
                logger.error(
                    `Failed to ban ${target.tag} after third warning`,
                    {
                        userId: target.id,
                        guildId,
                        moderatorId: moderator.id,
                        warningId: id,
                        error: banError,
                    }
                );
            }
        }

        // ============================================
        // DM USER
        // ============================================

        try {
            let warningDM;

            if (
                totalCount === 3 &&
                wasBanned
            ) {
                warningDM = createEmbed({
                    title: '🔨 You Have Been Banned',
                    description:
                        `You have received your third warning in **${guild.name}**.\n\n` +
                        `You have been **banned for 30 days**.`,
                })
                    .addFields(
                        {
                            name: 'Reason',
                            value: reason,
                            inline: false,
                        },
                        {
                            name: 'Warning #',
                            value: `${totalCount}`,
                            inline: true,
                        }
                    )
                    .setColor(
                        getColor('error')
                    );
            } else {
                warningDM = createEmbed({
                    title: '⚠️ You Have Been Warned',
                    description:
                        `You have received a warning in **${guild.name}**.`,
                })
                    .addFields(
                        {
                            name: 'Reason',
                            value: reason,
                            inline: false,
                        },
                        {
                            name: 'Warning #',
                            value: `${totalCount}`,
                            inline: true,
                        }
                    )
                    .setColor(
                        getColor('warning')
                    );
            }

            await target.send({
                embeds: [warningDM],
            });

            logger.info(
                `Sent warning DM to ${target.tag}`,
                {
                    userId: target.id,
                    guildId,
                    warningId: id,
                    warningNumber: totalCount,
                    wasBanned,
                }
            );
        } catch (dmError) {
            logger.warn(
                `Could not DM ${target.tag} about their warning`,
                {
                    userId: target.id,
                    guildId,
                    warningId: id,
                    error: dmError,
                }
            );
        }

        // ============================================
        // LOG MODERATION ACTION
        // ============================================

        await logModerationAction({
            client,
            guild,
            event: {
                action: 'User Warned',

                target:
                    `${target.tag} (${target.id})`,

                executor:
                    `${moderator.tag} (${moderator.id})`,

                reason,

                metadata: {
                    userId: target.id,
                    moderatorId: moderator.id,
                    totalWarns: totalCount,
                    warningNumber: totalCount,
                    warningLevel,
                    warningId: id,

                    warningRoles:
                        Object.values(
                            WARNING_ROLES
                        ).slice(
                            0,
                            warningLevel
                        ),

                    bannedFor30Days:
                        wasBanned,
                },
            },
        });

        // ============================================
        // SUCCESS RESPONSE
        // ============================================

        await InteractionHelper.safeEditReply(
            interaction,
            {
                embeds: [
                    successEmbed(
                        totalCount === 3 &&
                        wasBanned
                            ? `🔨 **Banned** ${target.tag}`
                            : `⚠️ **Warned** ${target.tag}`,

                        `**Reason:** ${reason}\n` +
                        `**Warning #:** ${totalCount}` +
                        (
                            totalCount === 3 &&
                            wasBanned
                                ? `\n\n🔨 **This was their third warning. They have been banned for 30 days.**`
                                : ''
                        )
                    ),
                ],
            }
        );
    },
};
