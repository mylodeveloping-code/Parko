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
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({
                content: '❌ You do not have permission to use this command.',
            });
        }

        const userId = args[0];

        // Check for a user ID
        if (!userId) {
            return message.reply({
                content:
                    '❌ Please provide a Discord user ID.\n\nExample: `.bl 1335665701444386896`',
            });
        }

        // Validate Discord snowflake
        if (!/^\d{17,20}$/.test(userId)) {
            return message.reply({
                content: '❌ That is not a valid Discord user ID.',
            });
        }

        // Prevent blacklisting yourself
        if (userId === message.author.id) {
            return message.reply({
                content: '❌ You cannot blacklist yourself.',
            });
        }

        // Check if already blacklisted
        if (isBlacklisted(userId)) {
            return message.reply({
                content: `⚠️ <@${userId}> is already blacklisted.`,
            });
        }

        // Add user to blacklist
        addToBlacklist(userId);

        return message.reply({
            content: `✅ <@${userId}> has been blacklisted and can no longer use ${message.client.user.username}.`,
        });
    },
};