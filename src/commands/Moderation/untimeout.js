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
        .setDescription('Remove timeout from a user')
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
        const deferSuccess =
            await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn('Untimeout interaction defer failed', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'untimeout',
            });

            return;
        }

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
             * Fetch the member directly instead of relying only
             * on getMember(). This makes the command more reliable
             * if the interaction's resolved member is unavailable.
             */
            const member =
                await interaction.guild.members
                    .fetch(targetUser.id)
                    .catch(() => null);

            if (!member) {
                throw new TitanBotError(
                    'Target not found',
                    ErrorTypes.USER_INPUT,
                    'The target user is not currently in this server.'
                );
            }

            /*
             * Check both Discord's actual timeout state and
             * whether our timeout system has saved role data.
             *
             * removeTimeoutUser() handles the saved role state,
             * muted role, timeout, and restoration.
             */
            const currentlyTimedOut =
                member.communicationDisabledUntilTimestamp !== null &&
                member.communicationDisabledUntilTimestamp !== undefined &&
                member.communicationDisabledUntilTimestamp > Date.now();

            const MUTED_ROLE_ID =
                '1537615321438093425';

            const hasMutedRole =
                member.roles.cache.has(
                    MUTED_ROLE_ID
                );

            /*
             * If Discord says the user isn't timed out and they
             * don't have our muted role, there is nothing to remove.
             */
            if (
                !currentlyTimedOut &&
                !hasMutedRole
            ) {
                await InteractionHelper.safeEditReply(
                    interaction,
                    {
                        embeds: [
                            successEmbed(
                                `🔓 **${targetUser.tag}** is not currently timed out.`
                            ),
                        ],
                    }
                );

                return;
            }

            /*
             * Remove timeout, cancel the restoration timer,
             * remove the muted role, and restore previous roles.
             */
            const result =
                await ModerationService.removeTimeoutUser({
                    guild: interaction.guild,
                    member,
                    moderator: interaction.member,
                    reason:
                        `Timeout manually removed by ${interaction.user.tag}`,
                });

            /*
             * Tell the anti-spam system that this timeout was
             * intentionally removed by a moderator.
             */
            try {
                markSpamTimeoutManuallyRemoved(
                    interaction.guild.id,
                    targetUser.id
                );
            } catch (spamError) {
                /*
                 * Anti-spam state failing should NOT make a
                 * successful untimeout fail.
                 */
                logger.error(
                    `Failed to update anti-spam timeout state for ${targetUser.tag} (${targetUser.id}):`,
                    spamError
                );
            }

            logger.info(
                `User ${targetUser.tag} (${targetUser.id}) was manually untimeouted by ${interaction.user.tag} (${interaction.user.id}) in ${interaction.guild.name}.`
            );

            let message =
                `🔓 **Removed timeout** from ${targetUser.tag}`;

            if (
                result &&
                result.restored === false
            ) {
                message +=
                    `\n⚠️ Some previous roles could not be restored because they are no longer manageable by the bot.`;
            }

            await InteractionHelper.safeEditReply(
                interaction,
                {
                    embeds: [
                        successEmbed(message),
                    ],
                }
            );
        } catch (error) {
            logger.error(
                `Failed to untimeout user:`,
                error
            );

            /*
             * If this is one of our known TitanBot errors,
             * let the normal error handler handle it.
             */
            throw error;
        }
    },
};
