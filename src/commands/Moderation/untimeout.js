import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { markSpamTimeoutManuallyRemoved } from '../../events/messageCreate.js';

const MUTED_ROLE_ID = '1537615321438093425';

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

    category: 'moderation',

    /*
     * This command can be used as a prefix command.
     *
     * Because commandAliases.js already contains:
     *
     * 'unmute': 'untimeout'
     *
     * the following will resolve to this command:
     *
     * .unmute @user
     *
     * We intentionally do NOT add "prefixAliases" here because
     * your command system already handles aliases globally.
     */
    async execute(interaction, config, client) {
        try {
            const targetUser =
                interaction.options.getUser('target');

            if (!targetUser) {
                throw new TitanBotError(
                    'Missing target user',
                    ErrorTypes.USER_INPUT,
                    'You must specify a user to untimeout.'
                );
            }

            /*
             * Get the member from the guild.
             *
             * For prefix commands, messageAdapter.js creates
             * a mock interaction, so getMember('target') can
             * return null if the member is not cached.
             *
             * Therefore we fall back to fetching the member.
             */
            let member =
                interaction.options.getMember('target');

            if (!member && interaction.guild) {
                member =
                    await interaction.guild.members
                        .fetch(targetUser.id)
                        .catch(() => null);
            }

            if (!member) {
                throw new TitanBotError(
                    'Target not found',
                    ErrorTypes.USER_INPUT,
                    'That user is not currently in this server.'
                );
            }

            /*
             * Check both Discord's native timeout and the
             * custom muted role used by your moderation system.
             */
            const timeoutUntil =
                member.communicationDisabledUntilTimestamp;

            const currentlyTimedOut =
                timeoutUntil !== null &&
                timeoutUntil !== undefined &&
                timeoutUntil > Date.now();

            const hasMutedRole =
                member.roles.cache.has(
                    MUTED_ROLE_ID
                );

            if (
                !currentlyTimedOut &&
                !hasMutedRole
            ) {
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
             * Remove the timeout and restore the user's
             * previous roles.
             */
            const result =
                await ModerationService.removeTimeoutUser({
                    guild: interaction.guild,
                    member,
                    moderator: interaction.member,
                    reason:
                        `Timeout removed by ${interaction.user.tag}`,
                });

            /*
             * Tell the anti-spam system that this timeout
             * was manually removed.
             */
            try {
                markSpamTimeoutManuallyRemoved(
                    interaction.guild.id,
                    targetUser.id
                );
            } catch (spamError) {
                /*
                 * The timeout removal already succeeded, so
                 * an anti-spam state error should not make
                 * the command appear to have failed.
                 */
                logger.error(
                    `Failed to update anti-spam timeout state for ${targetUser.tag} (${targetUser.id}):`,
                    spamError
                );
            }

            logger.info(
                `User ${targetUser.tag} (${targetUser.id}) was manually untimeouted by ${interaction.user.tag} (${interaction.user.id}).`
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

            return result;
        } catch (error) {
            logger.error(
                'Failed to untimeout user:',
                error
            );

            throw error;
        }
    },
};
