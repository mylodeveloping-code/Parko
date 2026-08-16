import {
    SlashCommandBuilder,
    EmbedBuilder,
} from 'discord.js';

function getIpEmbed() {
    return new EmbedBuilder()
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
}

export default {
    data: new SlashCommandBuilder()
        .setName('ip')
        .setDescription('View the Astro MC Minecraft server IP.'),

    category: 'core',

    usage: '',

    // /ip
    async execute(interaction) {
        await interaction.reply({
            embeds: [getIpEmbed()],
        });
    },

    // .ip
    async messageExecute(message, args) {
        try {
            // Delete the .ip command message.
            await message.delete().catch(() => {});

            // Send the IP embed.
            await message.channel.send({
                embeds: [getIpEmbed()],
            });
        } catch (error) {
            console.error('Prefix ip command error:', error);
        }
    },
};