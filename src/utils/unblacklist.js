import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import {
    removeFromBlacklist,
    isBlacklisted,
} from '../../utils/blacklist.js';

function resolveUserId(value) {
    if (!value) {
        return null;
    }

    const stringValue =
        String(value).trim();

    const mentionMatch =
        stringValue.match(
            /^<@!?(\d+)>$/
        );

    if (mentionMatch) {
        return mentionMatch[1];
    }

    if (/^\d{17,20}$/.test(stringValue)) {
        return stringValue;
    }

    return null;
}

export default {
    data: new SlashCommandBuilder()
        .setName('unbl')
        .setDescription(
            'Remove a user from the bot blacklist'
        )
        .addStringOption((option) =>
            option
                .setName('user_id')
                .setDescription(
                    'The Discord user ID to unblacklist'
                )
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        ),

    category: 'moderation',

    async execute(
        interaction,
        config,
        client
    ) {
        const rawUserId =
            interaction.options.getString(
                'user_id'
            );

        const userId =
            resolveUserId(
                rawUserId
            );

        if (!userId) {
            await interaction.reply(
                'Please provide a valid Discord user ID.'
            );

            return;
        }

        if (
            !isBlacklisted(userId)
        ) {
            await interaction.reply(
                `<@${userId}> is not currently blacklisted.`
            );

            return;
        }

        const removed =
            removeFromBlacklist(
                userId
            );

        if (!removed) {
            await interaction.reply(
                'I could not remove that user from the blacklist.'
            );

            return;
        }

        await interaction.reply(
            `<@${userId}> has been removed from the blacklist.`
        );
    },
};