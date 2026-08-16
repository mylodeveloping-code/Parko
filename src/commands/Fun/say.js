import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Make the bot say a message.')
        .addStringOption((option) =>
            option
                .setName('message')
                .setDescription('The message for the bot to say.')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageMessages
        ),

    category: 'utility',

    // ============================================================
    // /say
    // ============================================================

    async execute(interaction) {
        const message =
            interaction.options.getString('message');

        if (!message) {
            await interaction.reply({
                content: 'Please provide a message.',
                ephemeral: true,
            });

            return;
        }

        /*
         * Defer the slash command so Discord does not time out
         * while the bot sends the message.
         *
         * The acknowledgement is then deleted so the only
         * visible message is the message the bot was told to say.
         */
        await interaction.deferReply({
            ephemeral: true,
        });

        await interaction.channel.send(message);

        await interaction.deleteReply().catch(() => {});
    },

    // ============================================================
    // .say
    // ============================================================

    async messageExecute(message, args) {
        if (!message || !message.channel) {
            return;
        }

        const text =
            Array.isArray(args)
                ? args.join(' ').trim()
                : String(args || '').trim();

        if (!text) {
            return;
        }

        /*
         * Delete the user's .say command FIRST.
         *
         * This only runs for prefix commands.
         * Slash commands never call messageExecute().
         */
        await message.delete().catch(() => {});

        /*
         * Send only the requested message.
         */
        await message.channel.send(text);
    },
};
