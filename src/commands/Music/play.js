import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { playQuery, replyMusicSuccess } from '../../services/music/musicActions.js';

export default {
    slashOnly: true,
    category: 'Music',

    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song or add it to the queue')
        .addStringOption((opt) =>
            opt
                .setName('query')
                .setDescription('Song name or URL')
                .setRequired(true),
        ),

    async execute(interaction, config, client) {
        // Respond to Discord immediately so the interaction
        // cannot expire while Lavalink is searching.
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            const query = interaction.options.getString('query', true);

            const result = await playQuery(
                client,
                interaction,
                query,
            );

            await replyMusicSuccess(
                interaction,
                result.embed,
            );
        } catch (error) {
            console.error('[Music] /play error:', error);

            const message =
                error?.userMessage ||
                error?.message ||
                'Something went wrong while trying to play that track.';

            if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({
                    content: `❌ ${message}`,
                }).catch(() => {});
            } else if (!interaction.replied) {
                await interaction.reply({
                    content: `❌ ${message}`,
                    flags: MessageFlags.Ephemeral,
                }).catch(() => {});
            }
        }
    },
};