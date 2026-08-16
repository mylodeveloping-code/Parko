import {
    SlashCommandBuilder,
} from 'discord.js';

import { createEmbed } from '../../utils/embeds.js';

const OWNER_ID = '1171948174190067737';
const ROLE_ID = '1498775289516527616';

export default {
    data: new SlashCommandBuilder()
        .setName('a')
        .setDescription('Toggle the Admin Perms role.'),

    category: 'core',

    usage: '',

    // /a
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

        const hasRole =
            member.roles.cache.has(ROLE_ID);

        try {
            if (hasRole) {
                await member.roles.remove(
                    ROLE_ID,
                    'Admin Perms role toggled off.'
                );

                return interaction.reply({
                    embeds: [
                        createEmbed({
                            title: '🛡️ Admin Perms',
                            description:
                                'The **Admin Perms** role has been removed from you.',
                            color: 'warning',
                        }),
                    ],
                    ephemeral: true,
                });
            }

            await member.roles.add(
                ROLE_ID,
                'Admin Perms role toggled on.'
            );

            return interaction.reply({
                embeds: [
                    createEmbed({
                        title: '🛡️ Admin Perms',
                        description:
                            'The **Admin Perms** role has been added to you.',
                        color: 'success',
                    }),
                ],
                ephemeral: true,
            });
        } catch (error) {
            console.error(
                'Error toggling Admin Perms role:',
                error
            );

            return interaction.reply({
                embeds: [
                    createEmbed({
                        title: '❌ Error',
                        description:
                            'I could not toggle the Admin Perms role. Make sure my bot role is above the role I am trying to manage.',
                        color: 'error',
                    }),
                ],
                ephemeral: true,
            });
        }
    },

    // .a
    async messageExecute(message, args) {
        // Only the owner can use .a
        if (message.author.id !== OWNER_ID) {
            return;
        }

        const member = message.member;

        if (!member) {
            return;
        }

        try {
            // Delete the .a command message.
            await message.delete().catch(() => {});

            const hasRole =
                member.roles.cache.has(ROLE_ID);

            if (hasRole) {
                await member.roles.remove(
                    ROLE_ID,
                    'Admin Perms role toggled off.'
                );

                await message.channel.send({
                    embeds: [
                        createEmbed({
                            title: '🛡️ Admin Perms',
                            description:
                                'The **Admin Perms** role has been removed from you.',
                            color: 'warning',
                        }),
                    ],
                });

                return;
            }

            await member.roles.add(
                ROLE_ID,
                'Admin Perms role toggled on.'
            );

            await message.channel.send({
                embeds: [
                    createEmbed({
                        title: '🛡️ Admin Perms',
                        description:
                            'The **Admin Perms** role has been added to you.',
                        color: 'success',
                    }),
                ],
            });
        } catch (error) {
            console.error(
                'Prefix Admin Perms command error:',
                error
            );

            await message.channel.send({
                embeds: [
                    createEmbed({
                        title: '❌ Error',
                        description:
                            'I could not toggle the Admin Perms role. Make sure my bot role is above the role I am trying to manage.',
                        color: 'error',
                    }),
                ],
            }).catch(() => {});
        }
    },
};