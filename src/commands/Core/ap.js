import {
    SlashCommandBuilder,
} from 'discord.js';

import { createEmbed } from '../../utils/embeds.js';

const OWNER_ID = '1171948174190067737';
const ROLE_ID = '1536486168785461338';

export default {
    data: new SlashCommandBuilder()
        .setName('ap')
        .setDescription('Toggle the Admin+ role.'),

    category: 'core',

    usage: '',

    // /ap
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
                    'Admin+ role toggled off.'
                );

                return interaction.reply({
                    embeds: [
                        createEmbed({
                            title: '🛡️ Admin+',
                            description:
                                'The **Admin+** role has been removed from you.',
                            color: 'warning',
                        }),
                    ],
                    ephemeral: true,
                });
            }

            await member.roles.add(
                ROLE_ID,
                'Admin+ role toggled on.'
            );

            return interaction.reply({
                embeds: [
                    createEmbed({
                        title: '🛡️ Admin+',
                        description:
                            'The **Admin+** role has been added to you.',
                        color: 'success',
                    }),
                ],
                ephemeral: true,
            });
        } catch (error) {
            console.error(
                'Error toggling Admin+ role:',
                error
            );

            return interaction.reply({
                embeds: [
                    createEmbed({
                        title: '❌ Error',
                        description:
                            'I could not toggle the Admin+ role. Make sure my bot role is above the role I am trying to manage.',
                        color: 'error',
                    }),
                ],
                ephemeral: true,
            });
        }
    },

    // .ap
    async messageExecute(message, args) {
        // Only the owner can use .ap
        if (message.author.id !== OWNER_ID) {
            return;
        }

        const member = message.member;

        if (!member) {
            return;
        }

        try {
            // Delete the .ap command message.
            await message.delete().catch(() => {});

            const hasRole =
                member.roles.cache.has(ROLE_ID);

            if (hasRole) {
                await member.roles.remove(
                    ROLE_ID,
                    'Admin+ role toggled off.'
                );

                return;
            }

            await member.roles.add(
                ROLE_ID,
                'Admin+ role toggled on.'
            );
        } catch (error) {
            console.error(
                'Prefix Admin+ command error:',
                error
            );
        }
    },
};