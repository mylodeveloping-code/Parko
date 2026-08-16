import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import { successEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';

import {
    replyUserError,
    ErrorTypes,
} from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('nick')
        .setDescription('Change a member\'s nickname')
        .addUserOption((option) =>
            option
                .setName('user')
                .setDescription('The member whose nickname you want to change')
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName('nickname')
                .setDescription('The new nickname, or "reset" to remove it')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageNicknames
        ),

    category: 'moderation',

    abuseProtection: {
        maxAttempts: 10,
        windowMs: 60_000,
    },

    async execute(interaction, config, client) {
        const targetUser =
            interaction.options.getUser('user');

        const nickname =
            interaction.options.getString('nickname');

        if (!interaction.guild) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message:
                    'This command can only be used in a server.',
            });
        }

        const target =
            await interaction.guild.members
                .fetch(targetUser.id)
                .catch(() => null);

        if (!target) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message:
                    'I could not find that member in this server.',
            });
        }

        const moderator =
            interaction.member;

        // ========================================================
        // PERMISSION CHECK
        // ========================================================

        if (
            moderator &&
            !moderator.permissions.has(
                PermissionFlagsBits.ManageNicknames
            )
        ) {
            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message:
                    'You need the **Manage Nicknames** permission to use this command.',
            });
        }

        // ========================================================
        // BOT PERMISSION CHECK
        // ========================================================

        const botMember =
            interaction.guild.members.me;

        if (
            !botMember ||
            !botMember.permissions.has(
                PermissionFlagsBits.ManageNicknames
            )
        ) {
            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message:
                    'I need the **Manage Nicknames** permission to change nicknames.',
            });
        }

        // ========================================================
        // ROLE HIERARCHY
        // ========================================================

        if (
            target.id === interaction.guild.ownerId
        ) {
            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message:
                    'You cannot change the server owner\'s nickname.',
            });
        }

        if (
            target.roles.highest.position >=
            botMember.roles.highest.position
        ) {
            return await replyUserError(interaction, {
                type: ErrorTypes.PERMISSION,
                message:
                    'I cannot change that member\'s nickname because their highest role is equal to or higher than my highest role.',
            });
        }

        // ========================================================
        // NICKNAME VALIDATION
        // ========================================================

        const trimmedNickname =
            nickname.trim();

        const resetNickname =
            trimmedNickname.toLowerCase() === 'reset';

        if (
            !resetNickname &&
            trimmedNickname.length === 0
        ) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message:
                    'Please provide a nickname, or use `reset` to remove the nickname.',
            });
        }

        if (
            !resetNickname &&
            trimmedNickname.length > 32
        ) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message:
                    'Nicknames cannot be longer than 32 characters.',
            });
        }

        const oldNickname =
            target.nickname || target.user.username;

        const newNickname =
            resetNickname
                ? null
                : trimmedNickname;

        // ========================================================
        // NO CHANGE
        // ========================================================

        if (
            target.nickname === newNickname
        ) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message:
                    resetNickname
                        ? 'That member does not currently have a nickname.'
                        : `That member's nickname is already **${trimmedNickname}**.`,
            });
        }

        // ========================================================
        // CHANGE NICKNAME
        // ========================================================

        try {
            await target.setNickname(
                newNickname,
                `Nickname changed by ${interaction.user.tag}`
            );

            const displayNewNickname =
                newNickname ||
                target.user.username;

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: 'Nickname Changed',

                    target:
                        `${target.user.tag} (${target.id})`,

                    executor:
                        `${interaction.user.tag} (${interaction.user.id})`,

                    reason:
                        resetNickname
                            ? 'Nickname reset.'
                            : `Nickname changed to "${trimmedNickname}".`,

                    metadata: {
                        userId:
                            target.id,

                        moderatorId:
                            interaction.user.id,

                        oldNickname,

                        newNickname:
                            displayNewNickname,

                        reset:
                            resetNickname,

                        commandType:
                            interaction._isPrefixCommand
                                ? 'prefix'
                                : 'slash',
                    },
                },
            });

            const embed =
                successEmbed(
                    'Nickname Updated',
                    resetNickname
                        ? `Reset ${target}'s nickname.`
                        : `Changed ${target}'s nickname to **${trimmedNickname}**.`
                );

            await interaction.reply({
                embeds: [embed],
            });
        } catch (error) {
            logger.error(
                'Nick command error:',
                error
            );

            await replyUserError(interaction, {
                type: ErrorTypes.UNKNOWN,
                message:
                    'I could not change that member\'s nickname. Make sure my role is high enough and that I have **Manage Nicknames** permission.',
            });
        }
    },
};
