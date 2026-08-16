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
    .addStringOption((option) =>
        option
            .setName('url')
            .setDescription('The YouTube video URL.')
            .setRequired(true),
    );

export async function execute(interaction) {
    try {
        const url =
            interaction.options.getString('url');

        if (!url) {
            return interaction.reply({
                embeds: [
                    createEmbed({
                        title: '❌ Missing YouTube URL',
                        description:
                            'Please provide a YouTube video URL.\n\n' +
                            'Example:\n' +
                            '`https://www.youtube.com/watch?v=...`',
                        color: 'error',
                    }),
                ],
                ephemeral: true,
            });
        }

        if (!isYouTubeUrl(url)) {
            return interaction.reply({
                embeds: [
                    createEmbed({
                        title: '❌ Invalid YouTube URL',
                        description:
                            'Please provide a valid YouTube video URL.\n\n' +
                            'Example:\n' +
                            '`https://www.youtube.com/watch?v=...`',
                        color: 'error',
                    }),
                ],
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        const video =
            await getYouTubeVideoInfo(url);

        if (!video) {
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

        const embed = createEmbed({
            title: video.title || 'YouTube Video',
            description:
                `**Channel:** ${
                    video.author || 'Unknown'
                }\n\n` +
                'Click **Watch on YouTube** below to watch the video.',
            color: 'primary',
            thumbnail: video.thumbnail || null,
            footer: 'YouTube',
        });

        const row =
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('Watch on YouTube')
                    .setStyle(ButtonStyle.Link)
                    .setURL(video.url || url)
                    .setEmoji('▶️'),
            );

        return interaction.editReply({
            embeds: [embed],
            components: [row],
        });
    } catch (error) {
        console.error(
            '❌ YouTube command failed:',
            error,
        );

        try {
            if (
                interaction.deferred ||
                interaction.replied
            ) {
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
                    components: [],
                });
            }

            return interaction.reply({
                embeds: [
                    createEmbed({
                        title: '❌ Could Not Load Video',
                        description:
                            'I could not retrieve information about that YouTube video.\n\n' +
                            'Make sure the URL is correct and the video is publicly accessible.',
                        color: 'error',
                    }),
                ],
                ephemeral: true,
            });
        } catch (replyError) {
            console.error(
                '❌ Failed to send YouTube error response:',
                replyError,
            );
        }
    }
}

export default {
    data,
    execute,
};