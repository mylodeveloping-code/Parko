import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';

import { createEmbed } from '../../utils/embeds.js';
import {
    getYouTubeVideoInfo,
    isYouTubeUrl,
} from '../../services/youtubeService.js';

export const data = new SlashCommandBuilder()
    .setName('youtube')
    .setDescription('Open a YouTube video.')
    .addStringOption(option =>
        option
            .setName('url')
            .setDescription('The YouTube video URL.')
            .setRequired(true)
    );

export async function execute(interaction) {
    const url = interaction.options.getString('url', true);

    if (!isYouTubeUrl(url)) {
        return interaction.reply({
            embeds: [
                createEmbed({
                    title: '❌ Invalid YouTube URL',
                    description:
                        'Please provide a valid YouTube URL.\n\n' +
                        'Example:\n' +
                        '`https://www.youtube.com/watch?v=...`',
                    color: 'error',
                }),
            ],
            ephemeral: true,
        });
    }

    await interaction.deferReply();

    try {
        const video = await getYouTubeVideoInfo(url);

        const embed = createEmbed({
            title: video.title,
            description:
                `**Channel:** ${video.author}\n\n` +
                'Click **Watch on YouTube** below to watch the video.',
            color: 'primary',
            thumbnail: video.thumbnail,
            footer: 'YouTube',
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Watch on YouTube')
                .setStyle(ButtonStyle.Link)
                .setURL(video.url)
                .setEmoji('▶️')
        );

        return interaction.editReply({
            embeds: [embed],
            components: [row],
        });
    } catch (error) {
        console.error('YouTube lookup failed:', error);

        return interaction.editReply({
            embeds: [
                createEmbed({
                    title: '❌ Could Not Load Video',
                    description:
                        'I could not retrieve information about that YouTube video.\n\n' +
                        'Make sure the URL is correct and the video is publicly accessible.',
                    color: 'error',
                }),
            ],
        });
    }
}

export default {
    data,
    execute,
};