import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Make the bot say a message.')
        .addStringOption((option) =>
            option
                .setName('message')
                .setDescription('The message for the bot to say.')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageMessages
        ),

    category: 'utility',

    async execute(interaction) {
        const message = interaction.options.getString('message');

        if (!message) {
            await interaction.reply({
                content: 'Please provide a message.',
                ephemeral: true,
            });
            return;
        }

        // Immediately acknowledge the slash command,
        // then send the requested message as the bot.
        await interaction.reply({
            content: 'Message sent.',
            ephemeral: true,
        });

        await interaction.channel.send(message);
    },
};
