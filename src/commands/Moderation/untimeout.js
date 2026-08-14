import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import {
    TitanBotError,
    ErrorTypes,
} from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    markSpamTimeoutManuallyRemoved,
} from '../../events/messageCreate.js';

export default {
    data: new SlashCommandBuilder()
        .setName('untimeout')
        .setDescription('Remove timeout from a user')
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('User to untimeout')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ModerateMembers
        ),

    category: 'moderation',

    // =========================================================
    // PREFIX COMMAND SUPPORT
    // =========================================================

    prefix: {
        enabled: true,
        aliases: ['unmute'],
        usage: '.unmute @user',
    },

    // =========================================================
    // SLASH COMMAND
    // =========================================================

    async execute(interaction, config, client) {
        const deferSuccess =
            await InteractionHelper.safeDefer(interaction);

        if (!deferSuccess) {
            logger.warn(
                'Untimeout interaction defer failed',
                {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'untimeout',
                }
            );

            return;
        }

        try {
            const targetUser =
                interaction.options.getUser('target');

            const member =
                interaction.options.getMember('target');

            if (!targetUser) {
                throw new TitanBotError(
                    'Missing target user',
                    ErrorTypes.USER_INPUT,
                    'You must specify a user to untimeout.'
                );
            }

            if (!member) {
                throw new TitanBotError(
                    'Target not found',
                    ErrorTypes.USER_INPUT,
                    'The target user is not currently in this server.'
                );
            }

            await this.removeTimeout({
                guild: interaction.guild,
                member,
                targetUser,
                moderator: interaction.member,
                interaction,
            });
        } catch (error) {
            logger.error(
                'Failed to untimeout user:',
                error
            );

            throw error;
        }
    },

    // =========================================================
    // PREFIX COMMAND
    // =========================================================

    async executePrefix({
        message,
        args,
        client,
    }) {
        try {
            if (!message.guild) {
                return;
            }

            if (
                !message.member.permissions.has(
                    PermissionFlagsBits.ModerateMembers
                )
            ) {
                await message.channel.send({
                    embeds: [
                        successEmbed(
                            '❌ **You do not have permission** to remove timeouts. You need the **Moderate Members** permission.'
                        ),
                    ],
                });

                return;
            }

            const targetUser =
                message.mentions.users.first();

            let member =
                message.mentions.members.first();

            /*
             * Also allow a raw user ID.
             */
            if (!targetUser && args?.[0]) {
                const userId =
                    args[0].replace(/[<@!>]/g, '');

                const fetchedUser =
                    await client.users
                        .fetch(userId)
                        .catch(() => null);

                if (fetchedUser) {
                    const fetchedMember =
                        await message.guild.members
                            .fetch(fetchedUser.id)
                            .catch(() => null);

                    if (fetchedMember) {
                        await this.removeTimeout({
                            guild: message.guild,
                            member: fetchedMember,
                            targetUser: fetchedUser,
                            moderator: message.member,
                            message,
                        });

                        return;
                    }
                }
            }

            if (!targetUser || !member) {
                await message.channel.send({
                    embeds: [
                        successEmbed(
                            '❌ **Usage:** `.unmute @user`'
                        ),
                    ],
                });

                return;
            }

            await this.removeTimeout({
                guild: message.guild,
                member,
                targetUser,
                moderator: message.member,
                message,
            });
        } catch (error) {
            logger.error(
                'Failed to execute prefix unmute command:',
                error
            );

            /*
             * Try to give the user a useful error instead
             * of silently doing nothing.
             */
            try {
                await message.channel.send({
                    embeds: [
                        successEmbed(
                            `❌ **Failed to unmute:** ${
                                error?.message ||
                                'An unknown error occurred.'
                            }`
                        ),
                    ],
                });
            } catch {
                // Ignore reply failure.
            }
        }
    },

    // =========================================================
    // SHARED UNTIMEOUT LOGIC
    // =========================================================

    async removeTimeout({
        guild,
        member,
        targetUser,
        moderator,
        interaction = null,
        message = null,
    }) {
        /*
         * Check the actual Discord timeout state.
         */
        const timeoutUntil =
            member.communicationDisabledUntilTimestamp;

        const currentlyTimedOut =
            timeoutUntil !== null &&
            timeoutUntil !== undefined &&
            timeoutUntil > Date.now();

        /*
         * Also check for our saved timeout role state.
         *
         * This allows the command to restore the user's roles
         * even if Discord's timeout has already expired but
         * our restoration process has not completed yet.
         */
        if (!currentlyTimedOut) {
            const response = {
                embeds: [
                    successEmbed(
                        `🔓 **${targetUser.tag}** is not currently timed out.`
                    ),
                ],
            };

            if (interaction) {
                await InteractionHelper.safeEditReply(
                    interaction,
                    response
                );
            } else if (message) {
                await message.channel
                    .send(response)
                    .catch(() => {});
            }

            return;
        }

        /*
         * Remove the Discord timeout and restore the user's
         * previous roles.
         */
        await ModerationService.removeTimeoutUser({
            guild,
            member,
            moderator,
            reason:
                'Timeout manually removed by moderator',
        });

        /*
         * Tell the anti-spam system that the timeout was
         * manually removed.
         */
        try {
            markSpamTimeoutManuallyRemoved(
                guild.id,
                targetUser.id
            );
        } catch (spamError) {
            logger.error(
                `Failed to update anti-spam timeout state for ${targetUser.tag} (${targetUser.id}):`,
                spamError
            );
        }

        logger.info(
            `User ${targetUser.tag} (${targetUser.id}) was manually untimeouted by ${moderator.user.tag} (${moderator.id}).`
        );

        const response = {
            embeds: [
                successEmbed(
                    `🔓 **Removed timeout** from ${targetUser.tag}`
                ),
            ],
        };

        if (interaction) {
            await InteractionHelper.safeEditReply(
                interaction,
                response
            );
        } else if (message) {
            await message.channel
                .send(response)
                .catch(() => {});
        }
    },
};
