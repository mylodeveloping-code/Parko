import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { markSpamTimeoutManuallyRemoved } from '../../events/messageCreate.js';

export default {
    data: new SlashCommandBuilder()
        .setName('untimeout')
        .setDescription('Remove a timeout from a user')
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('User to untimeout')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ModerateMembers
        ),

    // IMPORTANT:
    // This allows the prefix version to be used.
    // The prefix command will be:
    // .unmute @user
    prefixAliases: ['unmute'],

    category: 'moderation',

    async execute(interaction, config, client) {
        try {
            const targetUser =
                interaction.options.getUser('target');

            if (!targetUser) {
                throw new TitanBotError(
                    'Missing target user',
                    ErrorTypes.USER_INPUT,
                    'You must specify a user to untimeout.',
                    {
                        subtype: 'invalid_user',
                    }
                );
            }

            const member =
                interaction.options.getMember('target') ||
                await interaction.guild.members
                    .fetch(targetUser.id)
                    .catch(() => null);

            if (!member) {
                throw new TitanBotError(
                    'Target not found',
                    ErrorTypes.USER_INPUT,
                    'That user is not currently in this server.'
                );
            }

            /*
             * Check whether the user actually has a timeout
             * OR still has the special muted role.
             *
             * This is important because your bot uses both:
             *
             * 1. Discord's native timeout
             * 2. Your MUTED_ROLE_ID
             */
            const currentlyTimedOut =
                member.communicationDisabledUntilTimestamp !== null &&
                member.communicationDisabledUntilTimestamp !== undefined &&
                member.communicationDisabledUntilTimestamp > Date.now();

            const hasMutedRole =
                member.roles.cache.has(
                    '1537615321438093425'
                );

            if (!currentlyTimedOut && !hasMutedRole) {
                await InteractionHelper.universalReply(
                    interaction,
                    {
                        embeds: [
                            successEmbed(
                                `🔓 **${targetUser.tag}** is not currently muted or timed out.`
                            ),
                        ],
                    }
                );

                return;
            }

            /*
             * Remove the Discord timeout and restore the
             * user's previous roles.
             */
            await ModerationService.removeTimeoutUser({
                guild: interaction.guild,
                member,
                moderator: interaction.member,
                reason:
                    `Timeout removed by ${interaction.user.tag}`,
            });

            /*
             * Tell anti-spam that the timeout was manually
             * removed so stale anti-spam state doesn't
             * immediately interfere with the user.
             */
            try {
                markSpamTimeoutManuallyRemoved(
                    interaction.guild.id,
                    targetUser.id
                );
            } catch (spamError) {
                logger.error(
                    `Failed to update anti-spam timeout state for ${targetUser.tag}:`,
                    spamError
                );
            }

            logger.info(
                `User ${targetUser.tag} (${targetUser.id}) was untimeouted by ${interaction.user.tag} (${interaction.user.id}).`
            );

            await InteractionHelper.universalReply(
                interaction,
                {
                    embeds: [
                        successEmbed(
                            `🔓 **Removed timeout** from ${targetUser.tag}`
                        ),
                    ],
                }
            );
        } catch (error) {
            logger.error(
                'Failed to untimeout user:',
                error
            );

            throw error;
        }
    },
};
