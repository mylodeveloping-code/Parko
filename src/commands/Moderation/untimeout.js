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

    async execute(interaction, config, client) {
        try {
            let targetUser = null;
            let member = null;

            // ====================================================
            // GET TARGET
            // ====================================================

            /*
             * Normal slash-command path.
             */
            try {
                targetUser =
                    interaction.options.getUser('target');
            } catch {
                targetUser = null;
            }

            /*
             * Normal slash-command / mock-interaction member path.
             */
            try {
                member =
                    interaction.options.getMember('target');
            } catch {
                member = null;
            }

            /*
             * PREFIX COMMAND FALLBACK
             *
             * For:
             * .unmute @user
             * .untimeout @user
             *
             * messageAdapter.js provides _hoistedOptions.
             */
            if (
                interaction._isPrefixCommand &&
                (!targetUser || !member)
            ) {
                const rawTarget =
                    interaction.options?._hoistedOptions?.[0]?.value;

                if (rawTarget && interaction.guild) {
                    const mentionMatch =
                        String(rawTarget).match(
                            /^<@!?(\d+)>$/
                        );

                    const userId =
                        mentionMatch
                            ? mentionMatch[1]
                            : String(rawTarget).replace(
                                /^\D+/,
                                ''
                            );

                    if (/^\d+$/.test(userId)) {
                        member =
                            await interaction.guild.members
                                .fetch(userId)
                                .catch(() => null);

                        if (member) {
                            targetUser = member.user;
                        }
                    }
                }
            }

            /*
             * If we still don't have a member, try fetching
             * using the target user's ID.
             */
            if (
                !member &&
                targetUser &&
                interaction.guild
            ) {
                member =
                    await interaction.guild.members
                        .fetch(targetUser.id)
                        .catch(() => null);
            }

            if (!targetUser && member) {
                targetUser = member.user;
            }

            if (!targetUser) {
                throw new TitanBotError(
                    'Missing target user',
                    ErrorTypes.USER_INPUT,
                    'You must specify a user to untimeout.'
                );
            }

            if (!member) {
                throw new TitanBotError(
                    'Target not found',
                    ErrorTypes.USER_INPUT,
                    'That user is not currently in this server.'
                );
            }

            // ====================================================
            // CHECK TIMEOUT / MUTED ROLE
            // ====================================================

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

            // ====================================================
            // REMOVE TIMEOUT
            // ====================================================

            const result =
                await ModerationService.removeTimeoutUser({
                    guild: interaction.guild,
                    member,
                    moderator: interaction.member,
                    reason:
                        `Timeout removed by ${interaction.user.tag}`,
                });

            // ====================================================
            // UPDATE ANTI-SPAM STATE
            // ====================================================

            try {
                markSpamTimeoutManuallyRemoved(
                    interaction.guild.id,
                    targetUser.id
                );
            } catch (spamError) {
                logger.error(
                    `Failed to update anti-spam timeout state for ${targetUser.tag} (${targetUser.id}):`,
                    spamError
                );
            }

            logger.info(
                `User ${targetUser.tag} (${targetUser.id}) was manually untimeouted by ${interaction.user.tag} (${interaction.user.id}).`
            );

            // ====================================================
            // SUCCESS RESPONSE
            // ====================================================

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
