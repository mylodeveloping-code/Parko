import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import {
    TitanBotError,
    ErrorTypes,
} from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { isModerationExempt } from '../../utils/moderation.js';

import {
    resetSpamHistory,
} from '../../events/messageCreate.js';

export default {
    data: new SlashCommandBuilder()
        .setName("spamreset")
        .setDescription(
            "Reset a user's automatic anti-spam history."
        )
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription(
                    "User whose anti-spam history should be reset"
                )
                .setRequired(true),
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ModerateMembers
        ),

    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess =
            await InteractionHelper.safeDefer(
                interaction
            );

        if (!deferSuccess) {
            logger.warn(
                `Spamreset interaction defer failed`,
                {
                    userId:
                        interaction.user.id,

                    guildId:
                        interaction.guildId,

                    commandName:
                        'spamreset',
                }
            );

            return;
        }

        const targetUser =
            interaction.options.getUser(
                "target"
            );

        if (!targetUser) {
            throw new TitanBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'You must specify a user whose anti-spam history should be reset.',
                {
                    subtype:
                        'invalid_user',
                },
            );
        }

        /*
         * Moderation exemption users are already
         * completely exempt from the anti-spam system.
         *
         * There is no useful history to reset for them.
         */
        if (
            isModerationExempt(
                targetUser.id
            )
        ) {
            throw new TitanBotError(
                "User is moderation exempt",
                ErrorTypes.VALIDATION,
                "This user is exempt from automatic moderation.",
            );
        }

        /*
         * Reset the user's complete automatic
         * anti-spam state.
         *
         * This clears:
         *
         * - Current spam detection
         * - Escalation level
         * - Automatic timeout state
         * - PB Exempt timeout history
         */
        resetSpamHistory(
            interaction.guildId,
            targetUser.id
        );

        logger.info(
            `Anti-spam history manually reset for ${targetUser.tag} (${targetUser.id}) by ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guildId}.`
        );

        await InteractionHelper.safeEditReply(
            interaction,
            {
                embeds: [
                    successEmbed(
                        `🔄 **Reset anti-spam history** for ${targetUser.tag}.`,
                        `Their automatic anti-spam progression has been completely reset.\n\n` +
                        `**Next spam offense:** 15-minute timeout\n` +
                        `**Previous escalation:** Cleared\n` +
                        `**Automatic timeout state:** Cleared`,
                    ),
                ],
            }
        );
    },
};
