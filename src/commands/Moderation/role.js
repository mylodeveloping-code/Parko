import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("role")
        .setDescription("Toggle a role for a user")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("The user to toggle the role for")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("role")
                .setDescription("The name of the role to toggle")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    category: "moderation",

    async execute(interaction, config, client) {
        const target = interaction.options.getMember("target");
        const roleName = interaction.options.getString("role");

        if (!target) {
            throw new TitanBotError(
                "Missing target member",
                ErrorTypes.USER_INPUT,
                "That user could not be found in this server.",
                { subtype: "invalid_user" },
            );
        }

        if (!roleName) {
            throw new TitanBotError(
                "Missing role",
                ErrorTypes.USER_INPUT,
                "You must specify a role name.",
                { subtype: "invalid_role" },
            );
        }

        const role = interaction.guild.roles.cache.find(
            (r) => r.name.toLowerCase() === roleName.toLowerCase(),
        );

        if (!role) {
            throw new TitanBotError(
                "Role not found",
                ErrorTypes.USER_INPUT,
                `I couldn't find a role named **${roleName}**.`,
                { subtype: "role_not_found" },
            );
        }

        if (role.id === interaction.guild.id) {
            throw new TitanBotError(
                "Cannot manage everyone role",
                ErrorTypes.VALIDATION,
                "You cannot toggle the @everyone role.",
            );
        }

        if (role.managed) {
            throw new TitanBotError(
                "Cannot manage managed role",
                ErrorTypes.VALIDATION,
                "I cannot manage this role because it is managed by an integration.",
            );
        }

        const botMember = interaction.guild.members.me;

        if (!botMember) {
            throw new TitanBotError(
                "Bot member unavailable",
                ErrorTypes.INTERNAL,
                "I could not determine my role hierarchy.",
            );
        }

        if (role.position >= botMember.roles.highest.position) {
            throw new TitanBotError(
                "Role too high",
                ErrorTypes.PERMISSION,
                "I cannot manage that role because it is higher than or equal to my highest role.",
            );
        }

        if (
            interaction.member.id !== interaction.guild.ownerId &&
            role.position >= interaction.member.roles.highest.position
        ) {
            throw new TitanBotError(
                "Role too high",
                ErrorTypes.PERMISSION,
                "You cannot manage a role that is higher than or equal to your highest role.",
            );
        }

        const hasRole = target.roles.cache.has(role.id);

        if (hasRole) {
            await target.roles.remove(
                role,
                `Role toggled by ${interaction.user.tag}`,
            );

            await InteractionHelper.universalReply(interaction, {
                embeds: [
                    successEmbed(
                        "➖ **Role Removed**",
                        `Removed **${role.name}** from **${target.user.tag}**.`,
                    ),
                ],
            });
        } else {
            await target.roles.add(
                role,
                `Role toggled by ${interaction.user.tag}`,
            );

            await InteractionHelper.universalReply(interaction, {
                embeds: [
                    successEmbed(
                        "➕ **Role Added**",
                        `Added **${role.name}** to **${target.user.tag}**.`,
                    ),
                ],
            });
        }
    },
};