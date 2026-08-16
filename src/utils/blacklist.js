import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import {
    addToBlacklist,
    isBlacklisted,
} from '../../utils/blacklist.js';

export default {
    data: new SlashCommandBuilder()
        .setName('bl')
        .setDescription('Blacklist a user from using the bot')
        .addStringOption((option) =>
            option
                .setName('user_id')
                .setDescription('The Discord user ID to blacklist')
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
                'Usage: `.bl <user ID>`'
            );
            return;
        }

        if (!/^\d{17,20}$/.test(userId)) {
            await interaction.reply(
                'Please provide a valid Discord user ID.'
            );
            return;
        }

        if (isBlacklisted(userId)) {
            await interaction.reply(
                `<@${userId}> is already blacklisted.`
            );
            return;
        }

        addToBlacklist(userId);

        await interaction.reply(
            `<@${userId}> has been added to the blacklist.`
        );
    },
};