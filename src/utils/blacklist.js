import { PermissionFlagsBits } from 'discord.js';
import {
    addToBlacklist,
    removeFromBlacklist,
    isBlacklisted,
} from '../../utils/blacklist.js';

export default {
    name: 'bl',
    aliases: ['blacklist'],
    category: 'moderation',

    async execute(message, args) {
        // Only administrators can use .bl
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
                'Usage: `.bl <user ID>`'
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

        // If already blacklisted, remove them
        if (isBlacklisted(userId)) {
            removeFromBlacklist(userId);

            await message.channel.send(
                `<@${userId}> has been removed from the blacklist.`
            );

            return;
        }

        // Otherwise, add them
        addToBlacklist(userId);

        await message.channel.send(
            `<@${userId}> has been added to the blacklist.`
        );
    },
};