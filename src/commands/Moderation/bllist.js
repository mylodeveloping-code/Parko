import { createEmbed } from '../../utils/embeds.js';
import { getBlacklistedUsers } from '../../utils/blacklist.js';

const BLACKLIST_OWNER_ID = '1171948174190067737';

export default {
    name: 'blist',
    aliases: ['blacklist', 'blacklisted'],
    description: 'View all currently blacklisted users.',
    category: 'moderation',

    async execute(message, args, client) {
        // Only the bot owner can view the blacklist.
        if (message.author.id !== BLACKLIST_OWNER_ID) {
            await message.channel.send({
                embeds: [
                    createEmbed({
                        title: '⛔ Permission Denied',
                        description:
                            'Only the bot owner can view the blacklist.',
                        color: 'error',
                    }),
                ],
            }).catch(() => {});

            return;
        }

        try {
            const blacklistedUsers =
                getBlacklistedUsers();

            if (
                !Array.isArray(blacklistedUsers) ||
                blacklistedUsers.length === 0
            ) {
                await message.channel.send({
                    embeds: [
                        createEmbed({
                            title: '📋 Blacklist',
                            description:
                                'There are currently **no blacklisted users**.',
                            color: 'info',
                        }),
                    ],
                }).catch(() => {});

                return;
            }

            const userLines = [];

            for (const userId of blacklistedUsers) {
                let displayName =
                    'Unknown User';

                try {
                    const user =
                        await client.users.fetch(
                            userId
                        );

                    displayName =
                        user.tag ||
                        user.username ||
                        'Unknown User';
                } catch {
                    // The user may no longer be fetchable.
                }

                userLines.push(
                    `🚫 **${displayName}** — \`${userId}\``
                );
            }

            /*
             * Discord embed descriptions have a 4096-character limit.
             * Keep the list within that limit.
             */
            let description =
                userLines.join('\n');

            if (description.length > 4000) {
                description =
                    description.substring(
                        0,
                        3990
                    ) +
                    '\n\n…and more.';
            }

            await message.channel.send({
                embeds: [
                    createEmbed({
                        title:
                            `📋 Blacklisted Users (${blacklistedUsers.length})`,
                        description,
                        color: 'error',
                    }),
                ],
            }).catch(() => {});
        } catch (error) {
            console.error(
                'Error displaying blacklist:',
                error
            );

            await message.channel.send({
                embeds: [
                    createEmbed({
                        title: '❌ Error',
                        description:
                            'I could not retrieve the blacklist right now.',
                        color: 'error',
                    }),
                ],
            }).catch(() => {});
        }
    },
};