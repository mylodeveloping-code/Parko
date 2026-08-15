import { getColor } from '../../config/bot.js';

import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import {
    createEmbed,
    errorEmbed,
    successEmbed,
    infoEmbed,
    warningEmbed,
} from '../../utils/embeds.js';

import {
    logModerationAction,
    isModerationExempt,
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
        .setName("warn")
        .setDescription("Warn a user")
        .addUserOption((o) =>
            o
                .setName("target")
                .setRequired(true)
                .setDescription("User to warn"),
        )
        .addStringOption((o) =>
            o
                .setName("reason")
                .setRequired(true)
                .setDescription("Reason for the warning"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn(`Warn interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'warn',
            });
            return;
        }

        const target = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");
        const reason = interaction.options.getString("reason");
        const moderator = interaction.user;
        const guildId = interaction.guildId;

        if (!target) {
            throw new TitanBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'You must specify a user to warn.',
                { subtype: 'invalid_user' },
            );
        }

        // Moderation exemption
        if (isModerationExempt(target.id)) {
            throw new TitanBotError(
                "User is moderation exempt",
                ErrorTypes.VALIDATION,
                "This user is exempt from all moderation actions.",
            );
        }

        if (!reason) {
            throw new TitanBotError(
                'Missing warning reason',
                ErrorTypes.VALIDATION,
                'You must provide a reason for the warning.',
                { subtype: 'missing_required' },
            );
        }

        if (!member) {
            throw new TitanBotError(
                "Target not found",
                ErrorTypes.USER_INPUT,
                "The target user is not currently in this server."
            );
        }

        ModerationService.assertModerationHierarchy(
            interaction.member,
            member,
            'warn'
        );

        // Add the warning to the database
        const { id, totalCount } = await WarningService.addWarning({
            guildId,
            userId: target.id,
            moderatorId: moderator.id,
            reason,
            timestamp: Date.now(),
        });

        /*
         * WARNING ROLES
         *
         * 1 warning:
         *   Warning 1
         *
         * 2 warnings:
         *   Warning 1 + Warning 2
         *
         * 3 warnings:
         *   Warning 1 + Warning 2 + Warning 3
         *
         * 4+ warnings:
         *   Warning 1 + Warning 2 + Warning 3
         */

        const warningLevel = Math.min(totalCount, 3);

        try {
            // Give every warning role the user has earned.
            for (let level = 1; level <= warningLevel; level++) {
                const roleId = WARNING_ROLES[level];

                if (!member.roles.cache.has(roleId)) {
                    await member.roles.add(
                        roleId,
                        `Warning ${level} role - ${totalCount} total warnings`
                    );
                }
            }

            logger.info(`Updated warning roles for ${target.tag}`, {
                userId: target.id,
                guildId,
                totalWarnings: totalCount,
                warningLevel,
            });
        } catch (roleError) {
            logger.error(`Failed to update warning roles for ${target.tag}`, {
                userId: target.id,
                guildId,
                totalWarnings: totalCount,
                warningLevel,
                error: roleError,
            });

            // The warning was still successfully recorded.
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    warningEmbed(
                        `⚠️ **Warned** ${target.tag}`,
                        `**Reason:** ${reason}\n` +
                        `**Total Warns:** ${totalCount}\n\n` +
                        `⚠️ The warning was recorded, but I could not update the warning roles.\n` +
                        `Make sure I have **Manage Roles** permission and that my bot role is above all three warning roles.`
                    ),
                ],
            });

            return;
        }

        /*
         * DM THE WARNED USER
         *
         * The DM does NOT include the moderator
         * or total warnings.
         *
         * It displays:
         *
         * Warning #
         * 3
         */
        try {
            const warningDM = createEmbed({
                title: '⚠️ You Have Been Warned',
                description:
                    `You have received a warning in **${interaction.guild.name}**.`,
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
                .setColor(getColor('warning'));

            await target.send({
                embeds: [warningDM],
            });

            logger.info(`Sent warning DM to ${target.tag}`, {
                userId: target.id,
                guildId,
                warningId: id,
                warningNumber: totalCount,
            });
        } catch (dmError) {
            // DMs being disabled should NOT cause the warning to fail.
            logger.warn(`Could not DM ${target.tag} about their warning`, {
                userId: target.id,
                guildId,
                warningId: id,
                error: dmError,
            });
        }

        // Log the moderation action
        await logModerationAction({
            client,
            guild: interaction.guild,
            event: {
                action: "User Warned",
                target: `${target.tag} (${target.id})`,
                executor: `${moderator.tag} (${moderator.id})`,
                reason,
                metadata: {
                    userId: target.id,
                    moderatorId: moderator.id,
                    totalWarns: totalCount,
                    warningNumber: totalCount,
                    warningLevel,
                    warningId: id,
                    warningRoles: Object.values(WARNING_ROLES).slice(
                        0,
                        warningLevel
                    ),
                },
            },
        });

        /*
         * THIRD WARNING = 30-DAY BAN
         *
         * The third warning gives the Warning 3 role,
         * then bans the user for 30 days.
         */
        if (totalCount === 3) {
            try {
                await interaction.guild.members.ban(target.id, {
                    reason: `Third warning - ${reason}`,
                    deleteMessageSeconds: 0,
                });

                logger.info(`Banned ${target.tag} for 30 days after third warning`, {
                    userId: target.id,
                    guildId,
                    moderatorId: moderator.id,
                    warningId: id,
                    reason,
                    banDuration: '30 days',
                });

                // Schedule the unban for 30 days from now.
                setTimeout(async () => {
                    try {
                        await interaction.guild.members.unban(
                            target.id,
                            '30-day ban expired after third warning'
                        );

                        logger.info(`Automatically unbanned ${target.tag} after 30 days`, {
                            userId: target.id,
                            guildId,
                            warningId: id,
                        });
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
                }, THIRTY_DAYS);

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

        // Success response
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    `⚠️ **Warned** ${target.tag}`,
                    `**Reason:** ${reason}\n` +
                    `**Total Warns:** ${totalCount}\n` +
                    `**Warning Level:** ${warningLevel}` +
                    (totalCount === 3
                        ? `\n\n🔨 **This was their third warning. They have been banned for 30 days.**`
                        : ''),
                ),
            ],
        });
    },
};
