import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('role')
        .setDescription('Toggle a role for users')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)

        // /role user
        .addSubcommand((subcommand) =>
            subcommand
                .setName('user')
                .setDescription('Toggle a role for a specific user')
                .addUserOption((option) =>
                    option
                        .setName('target')
                        .setDescription('The user to toggle the role for')
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName('role')
                        .setDescription('The name or part of the role name')
                        .setRequired(true),
                ),
        )

        // /role all
        .addSubcommand((subcommand) =>
            subcommand
                .setName('all')
                .setDescription('Toggle a role for everyone in the server')
                .addStringOption((option) =>
                    option
                        .setName('role')
                        .setDescription('The name or part of the role name')
                        .setRequired(true),
                ),
        )

        // /role humans
        .addSubcommand((subcommand) =>
            subcommand
                .setName('humans')
                .setDescription('Toggle a role for all human users')
                .addStringOption((option) =>
                    option
                        .setName('role')
                        .setDescription('The name or part of the role name')
                        .setRequired(true),
                ),
        )

        // /role bots
        .addSubcommand((subcommand) =>
            subcommand
                .setName('bots')
                .setDescription('Toggle a role for all bots')
                .addStringOption((option) =>
                    option
                        .setName('role')
                        .setDescription('The name or part of the role name')
                        .setRequired(true),
                ),
        ),

    category: 'moderation',

    usage: '[user, all, humans, bots]',

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();
        const roleName = interaction.options.getString('role');

        if (!roleName) {
            throw new TitanBotError(
                'Missing role',
                ErrorTypes.USER_INPUT,
                'You must specify a role name.',
                { subtype: 'invalid_role' },
            );
        }

        // Allow partial role-name matching.
        //
        // Example:
        // "Announce" -> "Announcement"
        // "mod" -> "Moderator"
        // "admin" -> "Administrator"
        const searchName = roleName.toLowerCase().trim();

        const role = interaction.guild.roles.cache.find(
            (r) =>
                r.name.toLowerCase().includes(searchName),
        );

        if (!role) {
            throw new TitanBotError(
                'Role not found',
                ErrorTypes.USER_INPUT,
                `I couldn't find a role matching **${roleName}**.`,
                { subtype: 'role_not_found' },
            );
        }

        // Prevent managing @everyone.
        if (role.id === interaction.guild.id) {
            throw new TitanBotError(
                'Cannot manage everyone role',
                ErrorTypes.VALIDATION,
                'You cannot toggle the @everyone role.',
            );
        }

        // Prevent managing integration-managed roles.
        if (role.managed) {
            throw new TitanBotError(
                'Cannot manage managed role',
                ErrorTypes.VALIDATION,
                'I cannot manage this role because it is managed by an integration.',
            );
        }

        const botMember = interaction.guild.members.me;

        if (!botMember) {
            throw new TitanBotError(
                'Bot member unavailable',
                ErrorTypes.INTERNAL,
                'I could not determine my role hierarchy.',
            );
        }

        // Bot cannot manage a role equal to or higher than its highest role.
        if (role.position >= botMember.roles.highest.position) {
            throw new TitanBotError(
                'Role too high',
                ErrorTypes.PERMISSION,
                'I cannot manage that role because it is higher than or equal to my highest role.',
            );
        }

        // User cannot manage a role equal to or higher than their highest role,
        // unless they are the server owner.
        if (
            interaction.member.id !== interaction.guild.ownerId &&
            role.position >= interaction.member.roles.highest.position
        ) {
            throw new TitanBotError(
                'Role too high',
                ErrorTypes.PERMISSION,
                'You cannot manage a role that is higher than or equal to your highest role.',
            );
        }

        // ==========================================
        // /role user
        // ==========================================

        if (subcommand === 'user') {
            const target =
                interaction.options.getMember('target');

            if (!target) {
                throw new TitanBotError(
                    'Missing target member',
                    ErrorTypes.USER_INPUT,
                    'That user could not be found in this server.',
                    { subtype: 'invalid_user' },
                );
            }

            // Prevent modifying users whose highest role is too high.
            if (
                target.id !== interaction.guild.ownerId &&
                target.roles.highest.position >=
                    botMember.roles.highest.position
            ) {
                throw new TitanBotError(
                    'Member too high',
                    ErrorTypes.PERMISSION,
                    'I cannot manage that user because their highest role is higher than or equal to my highest role.',
                );
            }

            const hasRole =
                target.roles.cache.has(role.id);

            if (hasRole) {
                await target.roles.remove(
                    role,
                    `Role toggled by ${interaction.user.tag}`,
                );

                await InteractionHelper.universalReply(
                    interaction,
                    {
                        embeds: [
                            successEmbed(
                                '➖ **Role Removed**',
                                `Removed **${role.name}** from **${target.user.tag}**.`,
                            ),
                        ],
                    },
                );
            } else {
                await target.roles.add(
                    role,
                    `Role toggled by ${interaction.user.tag}`,
                );

                await InteractionHelper.universalReply(
                    interaction,
                    {
                        embeds: [
                            successEmbed(
                                '➕ **Role Added**',
                                `Added **${role.name}** to **${target.user.tag}**.`,
                            ),
                        ],
                    },
                );
            }

            return;
        }

        // ==========================================
        // /role all
        // /role humans
        // /role bots
        // ==========================================

        if (
            subcommand === 'all' ||
            subcommand === 'humans' ||
            subcommand === 'bots'
        ) {
            await interaction.deferReply();

            const members =
                await interaction.guild.members.fetch();

            // First determine which members belong to the selected group.
            let selectedMembers;

            if (subcommand === 'humans') {
                selectedMembers = members.filter(
                    (member) => !member.user.bot,
                );
            } else if (subcommand === 'bots') {
                selectedMembers = members.filter(
                    (member) => member.user.bot,
                );
            } else {
                selectedMembers = members;
            }

            // Only include members the bot is actually able to manage.
            const manageableMembers =
                selectedMembers.filter(
                    (member) =>
                        member.id !==
                            interaction.guild.ownerId &&
                        member.roles.highest.position <
                            botMember.roles.highest.position,
                );

            // Find members in the selected group who do not currently have
            // the role.
            const membersWithoutRole =
                manageableMembers.filter(
                    (member) =>
                        !member.roles.cache.has(role.id),
                );

            // If nobody is missing the role, remove it from everyone
            // in the selected group. Otherwise, add it to everyone missing it.
            const shouldRemove =
                membersWithoutRole.size === 0;

            let changed = 0;
            let skipped = 0;

            for (
                const member of manageableMembers.values()
            ) {
                try {
                    if (shouldRemove) {
                        if (
                            member.roles.cache.has(
                                role.id,
                            )
                        ) {
                            await member.roles.remove(
                                role,
                                `Role toggled for ${subcommand} by ${interaction.user.tag}`,
                            );

                            changed++;
                        }
                    } else {
                        if (
                            !member.roles.cache.has(
                                role.id,
                            )
                        ) {
                            await member.roles.add(
                                role,
                                `Role toggled for ${subcommand} by ${interaction.user.tag}`,
                            );

                            changed++;
                        }
                    }
                } catch {
                    skipped++;
                }
            }

            const action =
                shouldRemove ? 'Removed' : 'Added';

            let groupName;

            if (subcommand === 'humans') {
                groupName = 'human users';
            } else if (subcommand === 'bots') {
                groupName = 'bots';
            } else {
                groupName = 'everyone';
            }

            await interaction.editReply({
                embeds: [
                    successEmbed(
                        shouldRemove
                            ? `➖ **Role Removed From ${groupName}**`
                            : `➕ **Role Added To ${groupName}**`,
                        `${action} **${role.name}** ${
                            shouldRemove
                                ? 'from'
                                : 'to'
                        } **${changed}** ${groupName}.${
                            skipped > 0
                                ? ` Skipped **${skipped}** member(s) that could not be modified.`
                                : ''
                        }`,
                    ),
                ],
            });

            return;
        }
    },
};