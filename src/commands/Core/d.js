import {
    SlashCommandBuilder,
} from 'discord.js';

import { createEmbed } from '../../utils/embeds.js';

const OWNER_ID = '1171948174190067737';
const ROLE_ID = '1537545910953967667';

export default {
    data: new SlashCommandBuilder()
        .setName('d')
        .setDescription('Toggle the Developer role.')
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('The user to toggle the role for.')
                .setRequired(false)
        ),

    category: 'core',

    usage: '[user]',

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

        const targetUser =
            interaction.options.getUser('user') || interaction.user;

        let member;

        try {
            member = await interaction.guild.members.fetch(
                targetUser.id
            );
        } catch {
            return interaction.reply({
                embeds: [
                    createEmbed({
                        title: '❌ Error',
                        description:
                            'Could not find that server member.',
                        color: 'error',
                    }),
                ],
                ephemeral: true,
            });
        }

        try {
            const hasRole = member.roles.cache.has(ROLE_ID);

            if (hasRole) {
                await member.roles.remove(
                    ROLE_ID,
                    `Developer role toggled off by ${interaction.user.tag}.`
                );

                return interaction.reply({
                    embeds: [
                        createEmbed({
                            title: '💻 Developer',
                            description:
                                `The **Developer** role has been removed from ${member}.`,
                            color: 'warning',
                        }),
                    ],
                    ephemeral: true,
                });
            }

            await member.roles.add(
                ROLE_ID,
                `Developer role toggled on by ${interaction.user.tag}.`
            );

            return interaction.reply({
                embeds: [
                    createEmbed({
                        title: '💻 Developer',
                        description:
                            `The **Developer** role has been added to ${member}.`,
                        color: 'success',
                    }),
                ],
                ephemeral: true,
            });
        } catch (error) {
            console.error(
                'Error toggling Developer role:',
                error
            );

            return interaction.reply({
                embeds: [
                    createEmbed({
                        title: '❌ Error',
                        description:
                            'I could not toggle the Developer role. Make sure my bot role is above the role I am trying to manage.',
                        color: 'error',
                    }),
                ],
                ephemeral: true,
            });
        }
    },

    async messageExecute(message, args) {
        if (message.author.id !== OWNER_ID) {
            return;
        }

        try {
            await message.delete().catch(() => {});

            let member = message.member;
            const target = message.mentions.members.first();

            if (target) {
                member = target;
            } else if (args?.[0]) {
                const userId = args[0].replace(/[<@!>]/g, '');

                try {
                    member =
                        await message.guild.members.fetch(userId);
                } catch {
                    return;
                }
            }

            if (!member) return;

            const hasRole = member.roles.cache.has(ROLE_ID);

            if (hasRole) {
                await member.roles.remove(
                    ROLE_ID,
                    `Developer role toggled off by ${message.author.tag}.`
                );
            } else {
                await member.roles.add(
                    ROLE_ID,
                    `Developer role toggled on by ${message.author.tag}.`
                );
            }
        } catch (error) {
            console.error(
                'Prefix Developer command error:',
                error
            );
        }
    },
};