import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import { resetSpamHistory } from '../../events/messageCreate.js';
import { createEmbed } from '../../utils/embeds.js';

export default {
    data: new SlashCommandBuilder()
        .setName('spamreset')
        .setDescription(
            'Reset a member\'s automatic anti-spam history.'
        )
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription(
                    'The member whose anti-spam history should be reset.'
                )
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ModerateMembers
        ),

    async execute(interaction) {
        try {
            const user =
                interaction.options.getUser('user');

            if (!user) {
                return interaction.reply({
                    embeds: [
                        createEmbed({
                            title: 'Error',
                            description:
                                'You must specify a member.',
                            color: 'error',
                        }),
                    ],
                    ephemeral: true,
                });
            }

            if (!interaction.guild) {
                return interaction.reply({
                    embeds: [
                        createEmbed({
                            title: 'Error',
                            description:
                                'This command can only be used in a server.',
                            color: 'error',
                        }),
                    ],
                    ephemeral: true,
                });
            }

            resetSpamHistory(
                interaction.guild.id,
                user.id
            );

            return interaction.reply({
                embeds: [
                    createEmbed({
                        title:
                            'Anti-Spam History Reset',
                        description:
                            `Successfully reset the automatic anti-spam history for **${user.tag}**.\n\n` +
                            `Their next spam offense will start at **Offense #1**, resulting in a **15-minute timeout**.`,
                        color: 'success',
                    }),
                ],
                ephemeral: true,
            });
        } catch (error) {
            console.error(
                'Error resetting anti-spam history:',
                error
            );

            if (interaction.replied || interaction.deferred) {
                return interaction.followUp({
                    content:
                        'An error occurred while resetting the anti-spam history.',
                    ephemeral: true,
                });
            }

            return interaction.reply({
                content:
                    'An error occurred while resetting the anti-spam history.',
                ephemeral: true,
            });
        }
    },
};
