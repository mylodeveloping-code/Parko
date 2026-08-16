import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getBlacklistedUsers } from '../../utils/blacklist.js';

const BLACKLIST_OWNER_ID = '1171948174190067737';

export default {
    data: new SlashCommandBuilder()
        .setName('bllist')
        .setDescription('View all users currently blacklisted from the bot')
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuild
        ),

    category: 'moderation',

    supportsPrefix: true,

    async execute(interaction, config, client) {
        if (interaction.user.id !== BLACKLIST_OWNER_ID) {
            await InteractionHelper.universalReply(
                interaction,
                {
                    embeds: [
                        {
                            title: '⛔ Permission Denied',
                            description:
                                'You do not have permission to view the bot blacklist.',
                            color: 0xff0000,
                        },
                    ],
                    ephemeral: true,
                }
            );

            return;
        }

        const users = getBlacklistedUsers();

        if (!users || users.length === 0) {
            await InteractionHelper.universalReply(
                interaction,
                {
                    embeds: [
                        successEmbed(
                            '📋 Blacklist',
                            'There are currently **no blacklisted users**.'
                        ),
                    ],
                }
            );

            return;
        }

        const lines = [];

        for (let i = 0; i < users.length; i++) {
            const userId = users[i];

            let displayName = 'Unknown User';

            try {
                const user = await client.users.fetch(userId);

                displayName =
                    user.tag ||
                    user.username ||
                    'Unknown User';
            } catch {
                // User may no longer be fetchable.
            }

            lines.push(
                `**${i + 1}.** ${displayName} — \`${userId}\``
            );
        }

        const description =
            `There are currently **${users.length}** blacklisted user${users.length === 1 ? '' : 's'}.\n\n` +
            lines.join('\n');

        await InteractionHelper.universalReply(
            interaction,
            {
                embeds: [
                    successEmbed(
                        '📋 Blacklisted Users',
                        description
                    ),
                ],
            }
        );
    },
};