import {
    SlashCommandBuilder,
    EmbedBuilder,
} from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ip')
        .setDescription('View the Astro MC Minecraft server IP.'),

    category: 'core',

    usage: '',

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🌌 Astro MC')
            .setDescription(
                'Join the Astro MC Minecraft server!'
            )
            .addFields({
                name: '🌐 Server IP',
                value: '`142.44.218.109`',
                inline: false,
            })
            .setFooter({
                text: '🚀 Enjoy Astro MC!',
            });

        await interaction.reply({
            embeds: [embed],
        });
    },
};