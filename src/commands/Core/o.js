import {
    SlashCommandBuilder,
} from 'discord.js';

import { createEmbed } from '../../utils/embeds.js';

const OWNER_ID = '1171948174190067737';
const ROLE_ID = '1499091536330231938';

export default {
    data: new SlashCommandBuilder()
        .setName('o')
        .setDescription('Toggle the Owner role.'),

    category: 'core',

    async execute(interaction) {
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({
                embeds: [
                    createEmbed({
                        title: '⛔ Permission Denied',
                        description:
                            'You do not have permission to use this command.',
                        color: 'error',
                    }),
                ],
                ephemeral: true,
            });
        }

        const member = interaction.member;

        if (!member) {
            return interaction.reply({
                embeds: [
                    createEmbed({
                        title: '❌ Error',
                        description:
                            'Could not find your server member information.',
                        color: 'error',
                    }),
                ],
                ephemeral: true,
            });
        }

        const hasRole = member.roles.cache.has(ROLE_ID);

        try {
            if (hasRole) {
                await member.roles.remove(
                    ROLE_ID,
                    'Owner role toggled off.'
                );

                return interaction.reply({
                    embeds: [
                        createEmbed({
                            title: '👑 Owner',
                            description:
                                'The **Owner** role has been removed from you.',
                            color: 'warning',
                        }),
                    ],
                    ephemeral: true,
                });
            }

            await member.roles.add(
                ROLE_ID,
                'Owner role toggled on.'
            );

            return interaction.reply({
                embeds: [
                    createEmbed({
                        title: '👑 Owner',
                        description:
                            'The **Owner** role has been added to you.',
                        color: 'success',
                    }),
                ],
                ephemeral: true,
            });
        } catch (error) {
            console.error('Error toggling Owner role:', error);

            return interaction.reply({
                embeds: [
                    createEmbed({
                        title: '❌ Error',
                        description:
                            'I could not toggle the Owner role. Make sure my bot role is above the role I am trying to manage.',
                        color: 'error',
                    }),
                ],
                ephemeral: true,
            });
        }
    },
};