import {
    PermissionFlagsBits,
    EmbedBuilder,
} from "discord.js";

export default {
    name: "role",
    description: "Manage server roles.",
    usage: ".role <add|remove|toggle|has|info|list|create|delete|rename|color|hoist|mentionable> ...",

    async execute(message, args, config, client) {
        if (!message.guild) return;

        const subcommand = args.shift()?.toLowerCase();

        if (!subcommand) {
            return sendHelp(message);
        }

        // ─────────────────────────────────────────────
        // Permission helper
        // ─────────────────────────────────────────────

        const canManageRoles = message.member.permissions.has(
            PermissionFlagsBits.ManageRoles
        );

        if (!canManageRoles) {
            return message.reply({
                content: "❌ You need the **Manage Roles** permission to use this command.",
            });
        }

        // ─────────────────────────────────────────────
        // Bot permission / hierarchy helper
        // ─────────────────────────────────────────────

        const botMember = message.guild.members.me;

        if (!botMember) {
            return message.reply({
                content: "❌ I couldn't find my member information in this server.",
            });
        }

        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply({
                content: "❌ I don't have the **Manage Roles** permission.",
            });
        }

        // ─────────────────────────────────────────────
        // ADD
        // .role add @user @role
        // ─────────────────────────────────────────────

        if (subcommand === "add") {
            const target = await resolveMember(message, args[0]);

            if (!target) {
                return message.reply({
                    content: "❌ Please specify a valid user.\nUsage: `.role add @user @role`",
                });
            }

            const roleInput = args.slice(1).join(" ");

            if (!roleInput) {
                return message.reply({
                    content: "❌ Please specify a role.\nUsage: `.role add @user @role`",
                });
            }

            const role = findRole(message.guild, roleInput);

            if (!role) {
                return message.reply({
                    content: `❌ I couldn't find the role **${roleInput}**.`,
                });
            }

            if (!canBotManageRole(botMember, role)) {
                return message.reply({
                    content: `❌ I cannot manage ${role}. Make sure my highest role is above it.`,
                });
            }

            if (target.roles.cache.has(role.id)) {
                return message.reply({
                    content: `⚠️ ${target} already has ${role}.`,
                });
            }

            try {
                await target.roles.add(role);

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Added",
                            `Added ${role} to ${target}.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);

                return message.reply({
                    content: "❌ I couldn't add that role to the user.",
                });
            }
        }

        // ─────────────────────────────────────────────
        // REMOVE
        // .role remove @user @role
        // ─────────────────────────────────────────────

        if (subcommand === "remove") {
            const target = await resolveMember(message, args[0]);

            if (!target) {
                return message.reply({
                    content: "❌ Please specify a valid user.\nUsage: `.role remove @user @role`",
                });
            }

            const roleInput = args.slice(1).join(" ");

            if (!roleInput) {
                return message.reply({
                    content: "❌ Please specify a role.\nUsage: `.role remove @user @role`",
                });
            }

            const role = findRole(message.guild, roleInput);

            if (!role) {
                return message.reply({
                    content: `❌ I couldn't find the role **${roleInput}**.`,
                });
            }

            if (!canBotManageRole(botMember, role)) {
                return message.reply({
                    content: `❌ I cannot manage ${role}. Make sure my highest role is above it.`,
                });
            }

            if (!target.roles.cache.has(role.id)) {
                return message.reply({
                    content: `⚠️ ${target} doesn't have ${role}.`,
                });
            }

            try {
                await target.roles.remove(role);

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Removed",
                            `Removed ${role} from ${target}.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);

                return message.reply({
                    content: "❌ I couldn't remove that role from the user.",
                });
            }
        }

        // ─────────────────────────────────────────────
        // TOGGLE
        // .role toggle @user @role
        // ─────────────────────────────────────────────

        if (subcommand === "toggle") {
            const target = await resolveMember(message, args[0]);

            if (!target) {
                return message.reply({
                    content: "❌ Please specify a valid user.\nUsage: `.role toggle @user @role`",
                });
            }

            const roleInput = args.slice(1).join(" ");

            if (!roleInput) {
                return message.reply({
                    content: "❌ Please specify a role.\nUsage: `.role toggle @user @role`",
                });
            }

            const role = findRole(message.guild, roleInput);

            if (!role) {
                return message.reply({
                    content: `❌ I couldn't find the role **${roleInput}**.`,
                });
            }

            if (!canBotManageRole(botMember, role)) {
                return message.reply({
                    content: `❌ I cannot manage ${role}. Make sure my highest role is above it.`,
                });
            }

            try {
                if (target.roles.cache.has(role.id)) {
                    await target.roles.remove(role);

                    return message.reply({
                        embeds: [
                            successEmbed(
                                "Role Toggled",
                                `Removed ${role} from ${target}.`
                            ),
                        ],
                    });
                }

                await target.roles.add(role);

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Toggled",
                            `Added ${role} to ${target}.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);

                return message.reply({
                    content: "❌ I couldn't toggle that role.",
                });
            }
        }

        // ─────────────────────────────────────────────
        // HAS
        // .role has @user @role
        // ─────────────────────────────────────────────

        if (subcommand === "has") {
            const target = await resolveMember(message, args[0]);

            if (!target) {
                return message.reply({
                    content: "❌ Please specify a valid user.\nUsage: `.role has @user @role`",
                });
            }

            const roleInput = args.slice(1).join(" ");

            if (!roleInput) {
                return message.reply({
                    content: "❌ Please specify a role.\nUsage: `.role has @user @role`",
                });
            }

            const role = findRole(message.guild, roleInput);

            if (!role) {
                return message.reply({
                    content: `❌ I couldn't find the role **${roleInput}**.`,
                });
            }

            const hasRole = target.roles.cache.has(role.id);

            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(hasRole ? 0x57f287 : 0xed4245)
                        .setTitle("Role Check")
                        .setDescription(
                            `${target} ${hasRole ? "has" : "does not have"} ${role}.`
                        ),
                ],
            });
        }

        // ─────────────────────────────────────────────
        // INFO
        // .role info @role
        // ─────────────────────────────────────────────

        if (subcommand === "info") {
            const roleInput = args.join(" ");

            if (!roleInput) {
                return message.reply({
                    content: "❌ Please specify a role.\nUsage: `.role info @role`",
                });
            }

            const role = findRole(message.guild, roleInput);

            if (!role) {
                return message.reply({
                    content: `❌ I couldn't find the role **${roleInput}**.`,
                });
            }

            const embed = new EmbedBuilder()
                .setColor(role.color || 0x5865f2)
                .setTitle(`Role Information`)
                .addFields(
                    {
                        name: "Name",
                        value: role.name,
                        inline: true,
                    },
                    {
                        name: "ID",
                        value: role.id,
                        inline: true,
                    },
                    {
                        name: "Position",
                        value: `${role.position}`,
                        inline: true,
                    },
                    {
                        name: "Members",
                        value: `${role.members.size}`,
                        inline: true,
                    },
                    {
                        name: "Color",
                        value: role.hexColor,
                        inline: true,
                    },
                    {
                        name: "Mentionable",
                        value: role.mentionable ? "Yes" : "No",
                        inline: true,
                    },
                    {
                        name: "Hoisted",
                        value: role.hoist ? "Yes" : "No",
                        inline: true,
                    },
                )
                .setFooter({
                    text: `Created ${role.createdAt.toLocaleDateString()}`,
                });

            return message.reply({
                embeds: [embed],
            });
        }

        // ─────────────────────────────────────────────
        // LIST
        // .role list
        // ─────────────────────────────────────────────

        if (subcommand === "list") {
            const roles = message.guild.roles.cache
                .filter((role) => role.id !== message.guild.id)
                .sort((a, b) => b.position - a.position);

            if (!roles.size) {
                return message.reply({
                    content: "❌ This server doesn't have any roles.",
                });
            }

            const roleList = roles
                .map(
                    (role) =>
                        `${role} — \`${role.id}\``
                )
                .slice(0, 50)
                .join("\n");

            const embed = new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle(`Server Roles`)
                .setDescription(roleList)
                .setFooter({
                    text: `${roles.size} roles total`,
                });

            return message.reply({
                embeds: [embed],
            });
        }

        // ─────────────────────────────────────────────
        // CREATE
        // .role create <name>
        // ─────────────────────────────────────────────

        if (subcommand === "create") {
            const name = args.join(" ").trim();

            if (!name) {
                return message.reply({
                    content: "❌ Please specify a role name.\nUsage: `.role create <name>`",
                });
            }

            if (name.length > 100) {
                return message.reply({
                    content: "❌ Role names cannot be longer than 100 characters.",
                });
            }

            if (
                message.guild.roles.cache.some(
                    (role) => role.name.toLowerCase() === name.toLowerCase()
                )
            ) {
                return message.reply({
                    content: `❌ A role named **${name}** already exists.`,
                });
            }

            try {
                const role = await message.guild.roles.create({
                    name,
                    reason: `Created by ${message.author.tag}`,
                });

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Created",
                            `Created ${role}.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);

                return message.reply({
                    content: "❌ I couldn't create that role.",
                });
            }
        }

        // ─────────────────────────────────────────────
        // DELETE
        // .role delete @role
        // ─────────────────────────────────────────────

        if (subcommand === "delete") {
            const roleInput = args.join(" ");

            if (!roleInput) {
                return message.reply({
                    content: "❌ Please specify a role.\nUsage: `.role delete @role`",
                });
            }

            const role = findRole(message.guild, roleInput);

            if (!role) {
                return message.reply({
                    content: `❌ I couldn't find the role **${roleInput}**.`,
                });
            }

            if (role.managed) {
                return message.reply({
                    content: "❌ I cannot delete a managed/integration role.",
                });
            }

            if (!canBotManageRole(botMember, role)) {
                return message.reply({
                    content: `❌ I cannot delete ${role}. Make sure my highest role is above it.`,
                });
            }

            try {
                const roleName = role.name;

                await role.delete(`Deleted by ${message.author.tag}`);

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Deleted",
                            `Deleted the role **${roleName}**.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);

                return message.reply({
                    content: "❌ I couldn't delete that role.",
                });
            }
        }

        // ─────────────────────────────────────────────
        // RENAME
        // .role rename @role <new name>
        // ─────────────────────────────────────────────

        if (subcommand === "rename") {
            const roleInput = args[0];

            if (!roleInput || args.length < 2) {
                return message.reply({
                    content: "❌ Usage: `.role rename @role <new name>`",
                });
            }

            const role = findRole(message.guild, roleInput);
            const newName = args.slice(1).join(" ").trim();

            if (!role) {
                return message.reply({
                    content: `❌ I couldn't find the role **${roleInput}**.`,
                });
            }

            if (!newName) {
                return message.reply({
                    content: "❌ Please specify a new role name.",
                });
            }

            if (newName.length > 100) {
                return message.reply({
                    content: "❌ Role names cannot be longer than 100 characters.",
                });
            }

            if (!canBotManageRole(botMember, role)) {
                return message.reply({
                    content: `❌ I cannot rename ${role}. Make sure my highest role is above it.`,
                });
            }

            try {
                const oldName = role.name;

                await role.setName(
                    newName,
                    `Renamed by ${message.author.tag}`
                );

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Renamed",
                            `Renamed **${oldName}** to **${newName}**.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);

                return message.reply({
                    content: "❌ I couldn't rename that role.",
                });
            }
        }

        // ─────────────────────────────────────────────
        // COLOR
        // .role color @role #5865F2
        // ─────────────────────────────────────────────

        if (subcommand === "color") {
            const roleInput = args[0];
            const color = args[1];

            if (!roleInput || !color) {
                return message.reply({
                    content: "❌ Usage: `.role color @role #5865F2`",
                });
            }

            const role = findRole(message.guild, roleInput);

            if (!role) {
                return message.reply({
                    content: `❌ I couldn't find the role **${roleInput}**.`,
                });
            }

            if (!/^#?[0-9A-F]{6}$/i.test(color)) {
                return message.reply({
                    content: "❌ Please provide a valid 6-digit hex color, such as `#5865F2`.",
                });
            }

            if (!canBotManageRole(botMember, role)) {
                return message.reply({
                    content: `❌ I cannot change the color of ${role}.`,
                });
            }

            const normalizedColor = color.startsWith("#")
                ? color
                : `#${color}`;

            try {
                await role.setColor(
                    normalizedColor,
                    `Color changed by ${message.author.tag}`
                );

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Color Changed",
                            `Changed ${role}'s color to \`${normalizedColor}\`.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);

                return message.reply({
                    content: "❌ I couldn't change that role's color.",
                });
            }
        }

        // ─────────────────────────────────────────────
        // HOIST
        // .role hoist @role
        // ─────────────────────────────────────────────

        if (subcommand === "hoist") {
            const roleInput = args.join(" ");

            if (!roleInput) {
                return message.reply({
                    content: "❌ Usage: `.role hoist @role`",
                });
            }

            const role = findRole(message.guild, roleInput);

            if (!role) {
                return message.reply({
                    content: `❌ I couldn't find the role **${roleInput}**.`,
                });
            }

            if (!canBotManageRole(botMember, role)) {
                return message.reply({
                    content: `❌ I cannot modify ${role}.`,
                });
            }

            try {
                await role.setHoist(
                    !role.hoist,
                    `Hoist toggled by ${message.author.tag}`
                );

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Hoist Toggled",
                            `${role} is now **${role.hoist ? "hoisted" : "not hoisted"}**.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);

                return message.reply({
                    content: "❌ I couldn't change that role's hoist setting.",
                });
            }
        }

        // ─────────────────────────────────────────────
        // MENTIONABLE
        // .role mentionable @role
        // ─────────────────────────────────────────────

        if (subcommand === "mentionable") {
            const roleInput = args.join(" ");

            if (!roleInput) {
                return message.reply({
                    content: "❌ Usage: `.role mentionable @role`",
                });
            }

            const role = findRole(message.guild, roleInput);

            if (!role) {
                return message.reply({
                    content: `❌ I couldn't find the role **${roleInput}**.`,
                });
            }

            if (!canBotManageRole(botMember, role)) {
                return message.reply({
                    content: `❌ I cannot modify ${role}.`,
                });
            }

            try {
                await role.setMentionable(
                    !role.mentionable,
                    `Mentionable toggled by ${message.author.tag}`
                );

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Mentionability Toggled",
                            `${role} is now **${role.mentionable ? "mentionable" : "not mentionable"}**.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);

                return message.reply({
                    content: "❌ I couldn't change that role's mentionability.",
                });
            }
        }

        return message.reply({
            content: `❌ Unknown role subcommand **${subcommand}**.\nUse \`.role help\` to see the available commands.`,
        });
    },
};

// ═════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════

async function resolveMember(message, input) {
    if (!input) return null;

    const mention = input.match(/^<@!?(\d+)>$/);

    if (mention) {
        return message.guild.members.fetch(mention[1]).catch(() => null);
    }

    if (/^\d{17,20}$/.test(input)) {
        return message.guild.members.fetch(input).catch(() => null);
    }

    const lower = input.toLowerCase();

    return (
        message.guild.members.cache.find(
            (member) =>
                member.user.username.toLowerCase() === lower ||
                member.user.tag?.toLowerCase() === lower ||
                member.displayName.toLowerCase() === lower
        ) || null
    );
}

function findRole(guild, input) {
    if (!input) return null;

    const mention = input.match(/^<@&(\d+)>$/);

    if (mention) {
        return guild.roles.cache.get(mention[1]) || null;
    }

    if (/^\d{17,20}$/.test(input)) {
        return guild.roles.cache.get(input) || null;
    }

    const lower = input.toLowerCase();

    return (
        guild.roles.cache.find(
            (role) => role.name.toLowerCase() === lower
        ) || null
    );
}

function canBotManageRole(botMember, role) {
    if (role.managed) return false;

    return role.position < botMember.roles.highest.position;
}

function successEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(`✅ ${title}`)
        .setDescription(description);
}

async function sendHelp(message) {
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Role Commands")
        .setDescription("Manage server roles using the commands below.")
        .addFields(
            {
                name: "Member Roles",
                value:
                    "`.role add @user @role`\n" +
                    "`.role remove @user @role`\n" +
                    "`.role toggle @user @role`\n" +
                    "`.role has @user @role`",
            },
            {
                name: "Role Management",
                value:
                    "`.role create <name>`\n" +
                    "`.role delete @role`\n" +
                    "`.role rename @role <new name>`\n" +
                    "`.role color @role #5865F2`\n" +
                    "`.role hoist @role`\n" +
                    "`.role mentionable @role`",
            },
            {
                name: "Role Information",
                value:
                    "`.role info @role`\n" +
                    "`.role list`",
            }
        )
        .setFooter({
            text: "You need the Manage Roles permission to use these commands.",
        });

    return message.reply({
        embeds: [embed],
    });
}
