import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import {
    removeFromBlacklist,
    isBlacklisted,
} from '../../utils/blacklist.js';

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
            PermissionFlagsBits.Administrator
        ),

    category: 'moderation',

    async execute(interaction, config, client) {
        const userId =
            interaction.options.getString('user_id');

        if (!userId) {
            await interaction.reply(
                'Usage: `.unbl <user ID>`'
            );
            return;
        }

        if (!/^\d{17,20}$/.test(userId)) {
            await interaction.reply(
                'Please provide a valid Discord user ID.'
            );
            return;
        }

        if (!isBlacklisted(userId)) {
            await interaction.reply(
                `<@${userId}> is not currently blacklisted.`
            );
            return;
        }

        removeFromBlacklist(userId);

        await interaction.reply(
            `<@${userId}> has been removed from the blacklist.`
        );
    },
};