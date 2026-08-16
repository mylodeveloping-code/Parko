import { PermissionFlagsBits } from 'discord.js';
import { removeFromBlacklist, isBlacklisted } from '../../utils/blacklist.js';

export default {
    name: 'unbl',
    aliases: ['unblacklist'],
    category: 'moderation',

    async execute(message, args) {
        // Only administrators can use .unbl
        if (
            !message.member.permissions.has(
                PermissionFlagsBits.Administrator
            )
        ) {
            return;
        }

        const userId = args[0];

        if (!userId) {
            await message.channel.send(
                'Usage: `.unbl <user ID>`'
            );
            return;
        }

        // Make sure the ID looks like a Discord user ID
        if (!/^\d{17,20}$/.test(userId)) {
            await message.channel.send(
                'Please provide a valid Discord user ID.'
            );
            return;
        }

        // Make sure the user is actually blacklisted
        if (!isBlacklisted(userId)) {
            await message.channel.send(
                `<@${userId}> is not currently blacklisted.`
            );
            return;
        }

        removeFromBlacklist(userId);

        await message.channel.send(
            `<@${userId}> has been removed from the blacklist.`
        );
    },
};