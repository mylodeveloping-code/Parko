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

import { logModerationAction } from '../../utils/moderation.js';
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
         * 1 warning  -> Warning 1
         * 2 warnings -> Warning 2
         * 3+ warnings -> Warning 3
         */
        const warningLevel = Math.min(totalCount, 3);
        const newWarningRoleId = WARNING_ROLES[warningLevel];

        try {
            // Get all warning roles from the guild
            const warningRoleIds = Object.values(WARNING_ROLES);

            // Remove any old warning roles first
            for (const roleId of warningRoleIds) {
                if (member.roles.cache.has(roleId) && roleId !== newWarningRoleId) {
                    await member.roles.remove(
                        roleId,
                        `Updating warning level to Warning ${warningLevel}`
                    );
                }
            }

            // Add the new warning role
            if (!member.roles.cache.has(newWarningRoleId)) {
                await member.roles.add(
                    newWarningRoleId,
                    `Warning level ${warningLevel} (${totalCount} total warnings)`
                );
            }

            logger.info(`Updated warning role for ${target.tag}`, {
                userId: target.id,
                guildId,
                totalWarnings: totalCount,
                warningLevel,
                roleId: newWarningRoleId,
            });
        } catch (roleError) {
            logger.error(`Failed to update warning role for ${target.tag}`, {
                userId: target.id,
                guildId,
                totalWarnings: totalCount,
                warningLevel,
                roleId: newWarningRoleId,
                error: roleError,
            });

            // The warning itself was still successfully added.
            // Tell the moderator that the role could not be updated.
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    warningEmbed(
                        `⚠️ **Warned** ${target.tag}`,
                        `**Reason:** ${reason}\n` +
                        `**Total Warns:** ${totalCount}\n\n` +
                        `⚠️ The warning was recorded, but I could not update the warning role. ` +
                        `Make sure my bot role is above the Warning 1/2/3 roles and that I have **Manage Roles** permission.`
                    ),
                ],
            });

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
                        warningRoleUpdateFailed: true,
                    },
                },
            });

            return;
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
                    warningRoleId: newWarningRoleId,
                },
            },
        });

        // Success response
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    `⚠️ **Warned** ${target.tag}`,
                    `**Reason:** ${reason}\n` +
                    `**Total Warns:** ${totalCount}\n` +
                    `**Warning Level:** ${warningLevel}`,
                ),
            ],
        });
    },
};
