import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import {
    isBlacklisted,
} from '../../utils/blacklist.js';

import {
    unblacklistUser,
} from '../../utils/unblacklist.js';

import {
    TitanBotError,
    ErrorTypes,
} from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('unbl')
        .setDescription('Remove a user from the bot blacklist')
        .addStringOption((option) =>
            option
                .setName('user_id')
                .setDescription('The Discord user ID to unblacklist')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    category: 'moderation',

    async execute(interaction, config, client) {
        const userId =
            interaction.options
                .getString('user_id')
                ?.trim();

        if (!userId) {
            throw new TitanBotError(
                'Missing user ID',
                ErrorTypes.USER_INPUT,
                'You must provide a Discord user ID.'
            );
        }

        if (!/^\d{17,20}$/.test(userId)) {
            throw new TitanBotError(
                'Invalid user ID',
                ErrorTypes.USER_INPUT,
                'That does not appear to be a valid Discord user ID.'
            );
        }

        if (!isBlacklisted(userId)) {
            throw new TitanBotError(
                'User not blacklisted',
                ErrorTypes.VALIDATION,
                `User ID \`${userId}\` is not currently blacklisted.`
            );
        }

        const removed = unblacklistUser(userId);

        if (!removed) {
            throw new TitanBotError(
                'Unblacklist failed',
                ErrorTypes.INTERNAL,
                'I could not remove that blacklist entry.'
            );
        }

        let userText = `User ID \`${userId}\``;

        try {
            const user = await client.users.fetch(userId);

            userText = `${user} (\`${userId}\`)`;
        } catch {
            // User does not need to be fetchable.
        }

        await InteractionHelper.universalReply(interaction, {
            embeds: [
                successEmbed(
                    `Unblacklisted ${userText}`,
                    `**User:** ${userText}\n**Action:** Removed from the bot blacklist.`,
                ),
            ],
        });
    },
};