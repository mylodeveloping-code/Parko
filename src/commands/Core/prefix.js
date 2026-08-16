import {
    SlashCommandBuilder,
    EmbedBuilder,
} from 'discord.js';

import {
    updateGuildConfig,
    getGuildConfig,
} from '../../services/config/guildConfig.js';

const OWNER_ID = '1171948174190067737';

export default {
    data: new SlashCommandBuilder()
        .setName('prefix')
        .setDescription('View or change the bot command prefix.')
        .addStringOption((option) =>
            option
                .setName('prefix')
                .setDescription('The new command prefix.')
                .setRequired(false)
        ),

    category: 'core',

    usage: '[prefix]',

    async execute(interaction, config, client) {
        const userId =
            interaction.user?.id ||
            interaction.author?.id;

        if (userId !== OWNER_ID) {
            const embed = new EmbedBuilder()
                .setTitle('⛔ Permission Denied')
                .setDescription(
                    'You do not have permission to use this command.'
                );

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    embeds: [embed],
                    ephemeral: true,
                }).catch(() => {});
            } else {
                await interaction.reply({
                    embeds: [embed],
                    ephemeral: true,
                }).catch(() => {});
            }

            return;
        }

        const guild =
            interaction.guild;

        if (!guild) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(
                    'This command can only be used inside a server.'
                );

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    embeds: [embed],
                    ephemeral: true,
                }).catch(() => {});
            } else {
                await interaction.reply({
                    embeds: [embed],
                    ephemeral: true,
                }).catch(() => {});
            }

            return;
        }

        let newPrefix = null;

        // Slash-command execution
        if (interaction.options?.getString) {
            newPrefix =
                interaction.options.getString('prefix');
        }

        // Prefix-command execution (.prefix ! etc.)
        if (
            !newPrefix &&
            interaction.prefixArgs
        ) {
            newPrefix =
                interaction.prefixArgs[0] || null;
        }

        const currentConfig =
            await getGuildConfig(
                client,
                guild.id
            );

        // No prefix supplied = show current prefix.
        if (!newPrefix) {
            const currentPrefix =
                currentConfig?.prefix || '.';

            const embed = new EmbedBuilder()
                .setTitle('⚙️ Server Prefix')
                .setDescription(
                    `The current command prefix is \`${currentPrefix}\`.`
                );

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    embeds: [embed],
                });
            } else {
                await interaction.reply({
                    embeds: [embed],
                });
            }

            return;
        }

        newPrefix =
            String(newPrefix).trim();

        // Prefix validation
        if (newPrefix.length > 5) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Invalid Prefix')
                .setDescription(
                    'The prefix must be between **1 and 5 characters** long.'
                );

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    embeds: [embed],
                    ephemeral: true,
                });
            } else {
                await interaction.reply({
                    embeds: [embed],
                    ephemeral: true,
                });
            }

            return;
        }

        if (/\s/.test(newPrefix)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Invalid Prefix')
                .setDescription(
                    'The prefix cannot contain spaces.'
                );

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    embeds: [embed],
                    ephemeral: true,
                });
            } else {
                await interaction.reply({
                    embeds: [embed],
                    ephemeral: true,
                });
            }

            return;
        }

        await updateGuildConfig(
            client,
            guild.id,
            {
                prefix: newPrefix,
            },
            {
                userId,
                command: 'prefix',
            }
        );

        const embed = new EmbedBuilder()
            .setTitle('✅ Prefix Updated')
            .setDescription(
                `The command prefix has been changed from \`${currentConfig?.prefix || '.'}\` to \`${newPrefix}\`.`
            )
            .addFields({
                name: 'Example',
                value: `\`${newPrefix}help\``,
            });

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                embeds: [embed],
            });
        } else {
            await interaction.reply({
                embeds: [embed],
            });
        }
    },
};