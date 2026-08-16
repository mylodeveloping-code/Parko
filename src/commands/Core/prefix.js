import {
    SlashCommandBuilder,
    EmbedBuilder,
} from 'discord.js';

import {
    getConfigValue,
    setConfigValue,
} from '../../config/guild/guildConfig.js';

import {
    TitanBotError,
    ErrorTypes,
} from '../../utils/errorHandler.js';

const OWNER_ID = '1171948174190067737';

export default {
    data: new SlashCommandBuilder()
        .setName('prefix')
        .setDescription('View or change the server command prefix')
        .addStringOption((option) =>
            option
                .setName('prefix')
                .setDescription('The new command prefix')
                .setRequired(false)
                .setMaxLength(10),
        ),

    category: 'core',

    usage: '[prefix]',

    async execute(interaction, config, client) {
        // Only allow the bot owner to use /prefix.
        if (interaction.user.id !== OWNER_ID) {
            throw new TitanBotError(
                'Missing permission',
                ErrorTypes.PERMISSION,
                'You do not have permission to use this command.',
                { subtype: 'prefix_owner_only' },
            );
        }

        const newPrefix =
            interaction.options.getString('prefix');

        // Get the currently configured prefix.
        const currentPrefix =
            await getConfigValue(
                client,
                interaction.guild.id,
                'prefix',
                '!',
                {
                    userId: interaction.user.id,
                    command: 'prefix',
                },
            );

        // If no new prefix was provided, display
        // the current prefix.
        if (newPrefix === null) {
            const embed =
                new EmbedBuilder()
                    .setTitle('Server Prefix')
                    .setDescription(
                        `The current command prefix is **\`${currentPrefix}\`**.`,
                    );

            await interaction.reply({
                embeds: [embed],
                ephemeral: true,
            });

            return;
        }

        const prefix =
            newPrefix.trim();

        if (!prefix) {
            throw new TitanBotError(
                'Invalid prefix',
                ErrorTypes.USER_INPUT,
                'The prefix cannot be empty.',
                { subtype: 'empty_prefix' },
            );
        }

        if (prefix.length > 10) {
            throw new TitanBotError(
                'Invalid prefix',
                ErrorTypes.USER_INPUT,
                'The prefix cannot be longer than 10 characters.',
                { subtype: 'prefix_too_long' },
            );
        }

        // Save the new prefix using the existing guild
        // configuration system.
        await setConfigValue(
            client,
            interaction.guild.id,
            'prefix',
            prefix,
            {
                userId: interaction.user.id,
                command: 'prefix',
            },
        );

        const embed =
            new EmbedBuilder()
                .setTitle('Prefix Updated')
                .setDescription(
                    `The server command prefix has been changed to **\`${prefix}\`**.`,
                )
                .addFields(
                    {
                        name: 'Previous Prefix',
                        value: `\`${currentPrefix}\``,
                        inline: true,
                    },
                    {
                        name: 'New Prefix',
                        value: `\`${prefix}\``,
                        inline: true,
                    },
                );

        await interaction.reply({
            embeds: [embed],
            ephemeral: true,
        });
    },
};