import {
    SlashCommandBuilder,
    ChannelType,
} from 'discord.js';

import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    TitanBotError,
    ErrorTypes,
} from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('channelinfo')
        .setDescription('Show information about a channel')
        .addChannelOption((option) =>
            option
                .setName('channel')
                .setDescription(
                    'The channel to get information about',
                )
                .setRequired(false),
        ),

    category: 'utility',

    usage: '[channel]',

    async execute(interaction, config, client) {
        const channel =
            interaction.options.getChannel('channel') ||
            interaction.channel;

        if (!channel) {
            throw new TitanBotError(
                'Channel not found',
                ErrorTypes.USER_INPUT,
                'I could not find that channel.',
            );
        }

        const typeNames = {
            [ChannelType.GuildText]:
                'Text Channel',

            [ChannelType.GuildVoice]:
                'Voice Channel',

            [ChannelType.GuildCategory]:
                'Category',

            [ChannelType.GuildAnnouncement]:
                'Announcement Channel',

            [ChannelType.GuildStageVoice]:
                'Stage Channel',

            [ChannelType.GuildForum]:
                'Forum Channel',

            [ChannelType.GuildMedia]:
                'Media Channel',
        };

        const channelType =
            typeNames[channel.type] ||
            'Unknown';

        const createdTimestamp =
            Math.floor(
                channel.createdTimestamp / 1000,
            );

        const description =
            `**Name:** ${channel.name || 'N/A'}\n` +
            `**Mention:** ${channel}\n` +
            `**ID:** \`${channel.id}\`\n` +
            `**Type:** ${channelType}\n` +
            `**Created:** <t:${createdTimestamp}:F>\n` +
            `**Created:** <t:${createdTimestamp}:R>`;

        await InteractionHelper.universalReply(
            interaction,
            {
                embeds: [
                    successEmbed(
                        '📺 **Channel Information**',
                        description,
                    ),
                ],
            },
        );
    },
};