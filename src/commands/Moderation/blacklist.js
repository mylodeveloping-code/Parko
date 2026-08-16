import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import {
    blacklistUser,
    isBlacklisted,
} from '../../utils/blacklist.js';

import {
    TitanBotError,
    ErrorTypes,
} from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('bl')
        .setDescription(
            'Blacklist a user from using the bot'
        )
        .addStringOption((option) =>
            option
                .setName('user_id')
                .setDescription(
                    'The Discord user ID to blacklist'
                )
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    category: 'moderation',

    async execute(
        interaction,
        config,
        client
    ) {
        const userId =
            interaction.options
                .getString('user_id')
                ?.trim();

        if (!userId) {
            throw new TitanBotError(
                'Missing user ID',
                ErrorTypes.USER_INPUT,
                'You must provide a Discord user ID.'
            );
        }

        if (!/^\d{17,20}$/.test(userId)) {
            throw new TitanBotError(
                'Invalid user ID',
                ErrorTypes.USER_INPUT,
                'That does not appear to be a valid Discord user ID.'
            );
        }

        if (
            userId ===
            interaction.user.id
        ) {
            throw new TitanBotError(
                'Cannot blacklist self',
                ErrorTypes.VALIDATION,
                'You cannot blacklist yourself.'
            );
        }

        if (
            client.user &&
            userId === client.user.id
        ) {
            throw new TitanBotError(
                'Cannot blacklist bot',
                ErrorTypes.VALIDATION,
                'You cannot blacklist the bot.'
            );
        }

        if (isBlacklisted(userId)) {
            throw new TitanBotError(
                'Already blacklisted',
                ErrorTypes.VALIDATION,
                `User ID \`${userId}\` is already blacklisted.`
            );
        }

        const saved =
            blacklistUser(userId);

        if (!saved) {
            throw new TitanBotError(
                'Blacklist failed',
                ErrorTypes.INTERNAL,
                'I could not save that blacklist entry.'
            );
        }

        let userText =
            `User ID \`${userId}\``;

        try {
            const user =
                await client.users.fetch(
                    userId
                );

            userText =
                `**${user.tag}** (\`${userId}\`)`;
        } catch {
            // User does not need to be fetchable.
        }

        await InteractionHelper.universalReply(
            interaction,
            {
                embeds: [
                    successEmbed(
                        '🚫 User Blacklisted',
                        `${userText} has been blacklisted and no longer has permission to use any commands from this bot.`
                    ),
                ],
            }
        );
    },
};