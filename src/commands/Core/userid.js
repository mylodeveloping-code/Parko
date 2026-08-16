import {
    SlashCommandBuilder,
} from 'discord.js';

import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    TitanBotError,
    ErrorTypes,
} from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('userid')
        .setDescription('Show a user\'s Discord ID')
        .addUserOption((option) =>
            option
                .setName('target')
                .setDescription('The user to get the ID of')
                .setRequired(true),
        ),

    category: 'utility',

    usage: '[target]',

    async execute(interaction, config, client) {
        const target =
            interaction.options.getUser('target');

        if (!target) {
            throw new TitanBotError(
                'Missing user',
                ErrorTypes.USER_INPUT,
                'You must specify a user.',
                { subtype: 'invalid_user' },
            );
        }

        await InteractionHelper.universalReply(
            interaction,
            {
                embeds: [
                    successEmbed(
                        '🆔 **User ID**',
                        `**User:** <@${target.id}>\n` +
                        `**Username:** ${target.username}\n` +
                        `**ID:** \`${target.id}\``,
                    ),
                ],
            },
        );
    },
};