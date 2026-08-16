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

/**
 * Build the YouTube response.
 *
 * This is shared by both:
 *   /youtube <url>
 *   .youtube <url>
 */
async function handleYouTube(interaction, url) {
    try {
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
                ephemeral: !interaction._isPrefixCommand,
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
                ephemeral: !interaction._isPrefixCommand,
            });
        }

        /*
         * Prefix commands use the local ResponseCoordinator.
         * Do not call Discord's real deferReply() for them.
         */
        if (!interaction._isPrefixCommand) {
            await interaction.deferReply();
        }

        const video =
            await getYouTubeVideoInfo(url);

        if (!video) {
            const response = {
                embeds: [
                    createEmbed({
                        title: '❌ Could Not Load Video',
                        description:
                            'I could not retrieve information about that YouTube video.\n\n' +
                            'Make sure the URL is correct and the video is publicly accessible.',
                        color: 'error',
                    }),
                ],
            };

            if (
                interaction.deferred ||
                interaction.replied ||
                interaction._isPrefixCommand
            ) {
                return interaction.editReply(response);
            }

            return interaction.reply(response);
        }

        const embed = createEmbed({
            title:
                video.title ||
                'YouTube Video',

            description:
                `**Channel:** ${
                    video.author ||
                    'Unknown'
                }\n\n` +
                'Click **Watch on YouTube** below to watch the video.',

            color: 'primary',

            thumbnail:
                video.thumbnail ||
                null,

            footer: 'YouTube',
        });

        const row =
            new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel(
                            'Watch on YouTube',
                        )
                        .setStyle(
                            ButtonStyle.Link,
                        )
                        .setURL(
                            video.url ||
                            url,
                        )
                        .setEmoji('▶️'),
                );

        const response = {
            embeds: [embed],
            components: [row],
        };

        if (
            interaction.deferred ||
            interaction.replied ||
            interaction._isPrefixCommand
        ) {
            return interaction.editReply(
                response,
            );
        }

        return interaction.reply(
            response,
        );
    } catch (error) {
        console.error(
            '❌ YouTube command failed:',
            error,
        );

        const response = {
            embeds: [
                createEmbed({
                    title:
                        '❌ Could Not Load Video',

                    description:
                        'I could not retrieve information about that YouTube video.\n\n' +
                        'Make sure the URL is correct and the video is publicly accessible.',

                    color: 'error',
                }),
            ],

            components: [],
        };

        try {
            if (
                interaction.deferred ||
                interaction.replied ||
                interaction._isPrefixCommand
            ) {
                return await interaction.editReply(
                    response,
                );
            }

            return await interaction.reply({
                ...response,
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

/**
 * Slash command:
 *
 * /youtube url:<youtube url>
 */
export async function execute(
    interaction,
    config,
    client,
) {
    const url =
        interaction.options.getString(
            'url',
        );

    return handleYouTube(
        interaction,
        url,
    );
}

/**
 * Prefix command:
 *
 * .youtube <youtube url>
 */
export async function executePrefix(
    message,
    args,
    config,
    client,
) {
    const url =
        args
            ?.join(' ')
            ?.trim();

    /*
     * Create the prefix interaction adapter
     * through the existing message adapter.
     *
     * The adapter marks this as a prefix interaction,
     * allowing InteractionHelper/ResponseCoordinator
     * to send the response back into the message channel.
     */
    const interaction = {
        _isPrefixCommand: true,

        id:
            message.id,

        createdTimestamp:
            message.createdTimestamp ||
            Date.now(),

        user:
            message.author,

        member:
            message.member,

        guild:
            message.guild,

        guildId:
            message.guild?.id,

        channel:
            message.channel,

        client,

        options: {
            getString() {
                return url;
            },
        },

        replied: false,
        deferred: false,

        async reply(options) {
            this.replied = true;

            return message.reply(
                options,
            );
        },

        async editReply(options) {
            return message.channel.send(
                options,
            );
        },

        async followUp(options) {
            return message.channel.send(
                options,
            );
        },
    };

    return handleYouTube(
        interaction,
        url,
    );
}

export default {
    data,
    execute,
    executePrefix,
};