import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
} from "discord.js";

const PREFIX = ".";

export default {
    name: "role",
    category: "moderation",

    data: new SlashCommandBuilder()
        .setName("role")
        .setDescription("Manage server roles.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)

        // ADD
        .addSubcommand((subcommand) =>
            subcommand
                .setName("add")
                .setDescription("Add a role to a user.")
                .addUserOption((option) =>
                    option
                        .setName("user")
                        .setDescription("The user to give the role to.")
                        .setRequired(true)
                )
                .addRoleOption((option) =>
                    option
                        .setName("role")
                        .setDescription("The role to give.")
                        .setRequired(true)
                )
        )

        // REMOVE
        .addSubcommand((subcommand) =>
            subcommand
                .setName("remove")
                .setDescription("Remove a role from a user.")
                .addUserOption((option) =>
                    option
                        .setName("user")
                        .setDescription("The user to remove the role from.")
                        .setRequired(true)
                )
                .addRoleOption((option) =>
                    option
                        .setName("role")
                        .setDescription("The role to remove.")
                        .setRequired(true)
                )
        )

        // TOGGLE
        .addSubcommand((subcommand) =>
            subcommand
                .setName("toggle")
                .setDescription("Toggle a role on a user.")
                .addUserOption((option) =>
                    option
                        .setName("user")
                        .setDescription("The user.")
                        .setRequired(true)
                )
                .addRoleOption((option) =>
                    option
                        .setName("role")
                        .setDescription("The role to toggle.")
                        .setRequired(true)
                )
        )

        // HAS
        .addSubcommand((subcommand) =>
            subcommand
                .setName("has")
                .setDescription("Check if a user has a role.")
                .addUserOption((option) =>
                    option
                        .setName("user")
                        .setDescription("The user.")
                        .setRequired(true)
                )
                .addRoleOption((option) =>
                    option
                        .setName("role")
                        .setDescription("The role.")
                        .setRequired(true)
                )
        )

        // INFO
        .addSubcommand((subcommand) =>
            subcommand
                .setName("info")
                .setDescription("View information about a role.")
                .addRoleOption((option) =>
                    option
                        .setName("role")
                        .setDescription("The role.")
                        .setRequired(true)
                )
        )

        // LIST
        .addSubcommand((subcommand) =>
            subcommand
                .setName("list")
                .setDescription("List all server roles.")
        )

        // CREATE
        .addSubcommand((subcommand) =>
            subcommand
                .setName("create")
                .setDescription("Create a new role.")
                .addStringOption((option) =>
                    option
                        .setName("name")
                        .setDescription("The name of the new role.")
                        .setRequired(true)
                )
        )

        // DELETE
        .addSubcommand((subcommand) =>
            subcommand
                .setName("delete")
                .setDescription("Delete a role.")
                .addRoleOption((option) =>
                    option
                        .setName("role")
                        .setDescription("The role to delete.")
                        .setRequired(true)
                )
        )

        // RENAME
        .addSubcommand((subcommand) =>
            subcommand
                .setName("rename")
                .setDescription("Rename a role.")
                .addRoleOption((option) =>
                    option
                        .setName("role")
                        .setDescription("The role.")
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option
                        .setName("name")
                        .setDescription("The new role name.")
                        .setRequired(true)
                )
        )

        // COLOR
        .addSubcommand((subcommand) =>
            subcommand
                .setName("color")
                .setDescription("Change a role's color.")
                .addRoleOption((option) =>
                    option
                        .setName("role")
                        .setDescription("The role.")
                        .setRequired(true)
                )
                .addStringOption((option) =>
                    option
                        .setName("color")
                        .setDescription("Hex color, such as #5865F2.")
                        .setRequired(true)
                )
        )

        // HOIST
        .addSubcommand((subcommand) =>
            subcommand
                .setName("hoist")
                .setDescription("Toggle whether a role is displayed separately.")
                .addRoleOption((option) =>
                    option
                        .setName("role")
                        .setDescription("The role.")
                        .setRequired(true)
                )
        )

        // MENTIONABLE
        .addSubcommand((subcommand) =>
            subcommand
                .setName("mentionable")
                .setDescription("Toggle whether a role can be mentioned.")
                .addRoleOption((option) =>
                    option
                        .setName("role")
                        .setDescription("The role.")
                        .setRequired(true)
                )
        ),

    // ═════════════════════════════════════════════════════
    // SLASH COMMANDS
    // ═════════════════════════════════════════════════════

    async execute(interaction, config, client) {
        if (!interaction.guild) return;

        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageRoles
            )
        ) {
            return interaction.reply({
                content:
                    "❌ You need the **Manage Roles** permission to use this command.",
                ephemeral: true,
            });
        }

        const subcommand = interaction.options.getSubcommand();

        const botMember = interaction.guild.members.me;

        if (!botMember) {
            return interaction.reply({
                content: "❌ I couldn't find my member information.",
                ephemeral: true,
            });
        }

        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({
                content:
                    "❌ I don't have the **Manage Roles** permission.",
                ephemeral: true,
            });
        }

        // ─────────────────────────────────────────────
        // ADD
        // ─────────────────────────────────────────────

        if (subcommand === "add") {
            const user = interaction.options.getUser("user");
            const role = interaction.options.getRole("role");

            const member = await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);

            if (!member) {
                return interaction.reply({
                    content: "❌ I couldn't find that member.",
                    ephemeral: true,
                });
            }

            if (!canBotManageRole(botMember, role)) {
                return interaction.reply({
                    content: `❌ I cannot manage ${role}. Make sure my highest role is above it.`,
                    ephemeral: true,
                });
            }

            if (member.roles.cache.has(role.id)) {
                return interaction.reply({
                    content: `⚠️ ${member} already has ${role}.`,
                    ephemeral: true,
                });
            }

            try {
                await member.roles.add(
                    role,
                    `Role added by ${interaction.user.tag}`
                );

                return interaction.reply({
                    embeds: [
                        successEmbed(
                            "Role Added",
                            `Added ${role} to ${member}.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);

                return interaction.reply({
                    content: "❌ I couldn't add that role.",
                    ephemeral: true,
                });
            }
        }

        // ─────────────────────────────────────────────
        // REMOVE
        // ─────────────────────────────────────────────

        if (subcommand === "remove") {
            const user = interaction.options.getUser("user");
            const role = interaction.options.getRole("role");

            const member = await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);

            if (!member) {
                return interaction.reply({
                    content: "❌ I couldn't find that member.",
                    ephemeral: true,
                });
            }

            if (!canBotManageRole(botMember, role)) {
                return interaction.reply({
                    content: `❌ I cannot manage ${role}. Make sure my highest role is above it.`,
                    ephemeral: true,
                });
            }

            if (!member.roles.cache.has(role.id)) {
                return interaction.reply({
                    content: `⚠️ ${member} doesn't have ${role}.`,
                    ephemeral: true,
                });
            }

            try {
                await member.roles.remove(
                    role,
                    `Role removed by ${interaction.user.tag}`
                );

                return interaction.reply({
                    embeds: [
                        successEmbed(
                            "Role Removed",
                            `Removed ${role} from ${member}.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);

                return interaction.reply({
                    content: "❌ I couldn't remove that role.",
                    ephemeral: true,
                });
            }
        }

        // ─────────────────────────────────────────────
        // TOGGLE
        // ─────────────────────────────────────────────

        if (subcommand === "toggle") {
            const user = interaction.options.getUser("user");
            const role = interaction.options.getRole("role");

            const member = await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);

            if (!member) {
                return interaction.reply({
                    content: "❌ I couldn't find that member.",
                    ephemeral: true,
                });
            }

            if (!canBotManageRole(botMember, role)) {
                return interaction.reply({
                    content: `❌ I cannot manage ${role}.`,
                    ephemeral: true,
                });
            }

            try {
                if (member.roles.cache.has(role.id)) {
                    await member.roles.remove(
                        role,
                        `Role toggled by ${interaction.user.tag}`
                    );

                    return interaction.reply({
                        embeds: [
                            successEmbed(
                                "Role Toggled",
                                `Removed ${role} from ${member}.`
                            ),
                        ],
                    });
                }

                await member.roles.add(
                    role,
                    `Role toggled by ${interaction.user.tag}`
                );

                return interaction.reply({
                    embeds: [
                        successEmbed(
                            "Role Toggled",
                            `Added ${role} to ${member}.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);

                return interaction.reply({
                    content: "❌ I couldn't toggle that role.",
                    ephemeral: true,
                });
            }
        }

        // ─────────────────────────────────────────────
        // HAS
        // ─────────────────────────────────────────────

        if (subcommand === "has") {
            const user = interaction.options.getUser("user");
            const role = interaction.options.getRole("role");

            const member = await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);

            if (!member) {
                return interaction.reply({
                    content: "❌ I couldn't find that member.",
                    ephemeral: true,
                });
            }

            const hasRole = member.roles.cache.has(role.id);

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(hasRole ? 0x57f287 : 0xed4245)
                        .setTitle("Role Check")
                        .setDescription(
                            `${member} ${
                                hasRole ? "has" : "does not have"
                            } ${role}.`
                        ),
                ],
            });
        }

        // ─────────────────────────────────────────────
        // INFO
        // ─────────────────────────────────────────────

        if (subcommand === "info") {
            const role = interaction.options.getRole("role");

            const embed = new EmbedBuilder()
                .setColor(role.color || 0x5865f2)
                .setTitle("Role Information")
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
                    }
                )
                .setFooter({
                    text: `Created ${role.createdAt.toLocaleDateString()}`,
                });

            return interaction.reply({
                embeds: [embed],
            });
        }

        // ─────────────────────────────────────────────
        // LIST
        // ─────────────────────────────────────────────

        if (subcommand === "list") {
            const roles = interaction.guild.roles.cache
                .filter((role) => role.id !== interaction.guild.id)
                .sort((a, b) => b.position - a.position);

            const roleList = roles
                .map((role) => `${role} — \`${role.id}\``)
                .slice(0, 50)
                .join("\n");

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x5865f2)
                        .setTitle("Server Roles")
                        .setDescription(
                            roleList || "This server has no roles."
                        )
                        .setFooter({
                            text: `${roles.size} roles total`,
                        }),
                ],
            });
        }

        // ─────────────────────────────────────────────
        // CREATE
        // ─────────────────────────────────────────────

        if (subcommand === "create") {
            const name = interaction.options.getString("name");

            if (interaction.guild.roles.cache.some(
                (role) => role.name.toLowerCase() === name.toLowerCase()
            )) {
                return interaction.reply({
                    content: `❌ A role named **${name}** already exists.`,
                    ephemeral: true,
                });
            }

            try {
                const role = await interaction.guild.roles.create({
                    name,
                    reason: `Created by ${interaction.user.tag}`,
                });

                return interaction.reply({
                    embeds: [
                        successEmbed(
                            "Role Created",
                            `Created ${role}.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);

                return interaction.reply({
                    content: "❌ I couldn't create that role.",
                    ephemeral: true,
                });
            }
        }

        // ─────────────────────────────────────────────
        // DELETE
        // ─────────────────────────────────────────────

        if (subcommand === "delete") {
            const role = interaction.options.getRole("role");

            if (!canBotManageRole(botMember, role)) {
                return interaction.reply({
                    content: `❌ I cannot delete ${role}. Make sure my highest role is above it.`,
                    ephemeral: true,
                });
            }

            try {
                const name = role.name;

                await role.delete(
                    `Deleted by ${interaction.user.tag}`
                );

                return interaction.reply({
                    embeds: [
                        successEmbed(
                            "Role Deleted",
                            `Deleted the role **${name}**.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);

                return interaction.reply({
                    content: "❌ I couldn't delete that role.",
                    ephemeral: true,
                });
            }
        }

        // ─────────────────────────────────────────────
        // RENAME
        // ─────────────────────────────────────────────

        if (subcommand === "rename") {
            const role = interaction.options.getRole("role");
            const name = interaction.options.getString("name");

            if (!canBotManageRole(botMember, role)) {
                return interaction.reply({
                    content: `❌ I cannot rename ${role}.`,
                    ephemeral: true,
                });
            }

            try {
                const oldName = role.name;

                await role.setName(
                    name,
                    `Renamed by ${interaction.user.tag}`
                );

                return interaction.reply({
                    embeds: [
                        successEmbed(
                            "Role Renamed",
                            `Renamed **${oldName}** to **${name}**.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);

                return interaction.reply({
                    content: "❌ I couldn't rename that role.",
                    ephemeral: true,
                });
            }
        }

        // ─────────────────────────────────────────────
        // COLOR
        // ─────────────────────────────────────────────

        if (subcommand === "color") {
            const role = interaction.options.getRole("role");
            const color = interaction.options.getString("color");

            if (!/^#?[0-9A-F]{6}$/i.test(color)) {
                return interaction.reply({
                    content:
                        "❌ Please provide a valid 6-digit hex color, such as `#5865F2`.",
                    ephemeral: true,
                });
            }

            if (!canBotManageRole(botMember, role)) {
                return interaction.reply({
                    content: `❌ I cannot modify ${role}.`,
                    ephemeral: true,
                });
            }

            try {
                const normalizedColor = color.startsWith("#")
                    ? color
                    : `#${color}`;

                await role.setColor(
                    normalizedColor,
                    `Color changed by ${interaction.user.tag}`
                );

                return interaction.reply({
                    embeds: [
                        successEmbed(
                            "Role Color Changed",
                            `Changed ${role}'s color to \`${normalizedColor}\`.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);

                return interaction.reply({
                    content: "❌ I couldn't change that role's color.",
                    ephemeral: true,
                });
            }
        }

        // ─────────────────────────────────────────────
        // HOIST
        // ─────────────────────────────────────────────

        if (subcommand === "hoist") {
            const role = interaction.options.getRole("role");

            if (!canBotManageRole(botMember, role)) {
                return interaction.reply({
                    content: `❌ I cannot modify ${role}.`,
                    ephemeral: true,
                });
            }

            try {
                await role.setHoist(
                    !role.hoist,
                    `Hoist toggled by ${interaction.user.tag}`
                );

                return interaction.reply({
                    embeds: [
                        successEmbed(
                            "Role Hoist Toggled",
                            `${role} is now **${
                                role.hoist ? "hoisted" : "not hoisted"
                            }**.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);

                return interaction.reply({
                    content: "❌ I couldn't change that role's hoist setting.",
                    ephemeral: true,
                });
            }
        }

        // ─────────────────────────────────────────────
        // MENTIONABLE
        // ─────────────────────────────────────────────

        if (subcommand === "mentionable") {
            const role = interaction.options.getRole("role");

            if (!canBotManageRole(botMember, role)) {
                return interaction.reply({
                    content: `❌ I cannot modify ${role}.`,
                    ephemeral: true,
                });
            }

            try {
                await role.setMentionable(
                    !role.mentionable,
                    `Mentionable toggled by ${interaction.user.tag}`
                );

                return interaction.reply({
                    embeds: [
                        successEmbed(
                            "Role Mentionability Toggled",
                            `${role} is now **${
                                role.mentionable
                                    ? "mentionable"
                                    : "not mentionable"
                            }**.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);

                return interaction.reply({
                    content:
                        "❌ I couldn't change that role's mentionability.",
                    ephemeral: true,
                });
            }
        }
    },

    // ═════════════════════════════════════════════════════
    // PREFIX COMMANDS
    // ═════════════════════════════════════════════════════

    async executePrefix(message, args, config, client) {
        if (!message.guild) return;

        if (
            !message.member.permissions.has(
                PermissionFlagsBits.ManageRoles
            )
        ) {
            return message.reply(
                "❌ You need the **Manage Roles** permission to use this command."
            );
        }

        const subcommand = args.shift()?.toLowerCase();

        if (!subcommand || subcommand === "help") {
            return message.reply({
                embeds: [prefixHelpEmbed()],
            });
        }

        const botMember = message.guild.members.me;

        if (!botMember) {
            return message.reply(
                "❌ I couldn't find my member information."
            );
        }

        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply(
                "❌ I don't have the **Manage Roles** permission."
            );
        }

        // .role add @user @role
        if (subcommand === "add") {
            const member = await resolveMember(message, args[0]);
            const role = findRole(message.guild, args.slice(1).join(" "));

            if (!member) {
                return message.reply(
                    "❌ Usage: `.role add @user @role`"
                );
            }

            if (!role) {
                return message.reply(
                    "❌ I couldn't find that role."
                );
            }

            if (!canBotManageRole(botMember, role)) {
                return message.reply(
                    `❌ I cannot manage ${role}. Make sure my highest role is above it.`
                );
            }

            if (member.roles.cache.has(role.id)) {
                return message.reply(
                    `⚠️ ${member} already has ${role}.`
                );
            }

            try {
                await member.roles.add(
                    role,
                    `Role added by ${message.author.tag}`
                );

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Added",
                            `Added ${role} to ${member}.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);
                return message.reply(
                    "❌ I couldn't add that role."
                );
            }
        }

        // .role remove @user @role
        if (subcommand === "remove") {
            const member = await resolveMember(message, args[0]);
            const role = findRole(message.guild, args.slice(1).join(" "));

            if (!member) {
                return message.reply(
                    "❌ Usage: `.role remove @user @role`"
                );
            }

            if (!role) {
                return message.reply(
                    "❌ I couldn't find that role."
                );
            }

            if (!canBotManageRole(botMember, role)) {
                return message.reply(
                    `❌ I cannot manage ${role}.`
                );
            }

            if (!member.roles.cache.has(role.id)) {
                return message.reply(
                    `⚠️ ${member} doesn't have ${role}.`
                );
            }

            try {
                await member.roles.remove(
                    role,
                    `Role removed by ${message.author.tag}`
                );

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Removed",
                            `Removed ${role} from ${member}.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);
                return message.reply(
                    "❌ I couldn't remove that role."
                );
            }
        }

        // .role toggle @user @role
        if (subcommand === "toggle") {
            const member = await resolveMember(message, args[0]);
            const role = findRole(message.guild, args.slice(1).join(" "));

            if (!member) {
                return message.reply(
                    "❌ Usage: `.role toggle @user @role`"
                );
            }

            if (!role) {
                return message.reply(
                    "❌ I couldn't find that role."
                );
            }

            if (!canBotManageRole(botMember, role)) {
                return message.reply(
                    `❌ I cannot manage ${role}.`
                );
            }

            try {
                if (member.roles.cache.has(role.id)) {
                    await member.roles.remove(role);

                    return message.reply({
                        embeds: [
                            successEmbed(
                                "Role Toggled",
                                `Removed ${role} from ${member}.`
                            ),
                        ],
                    });
                }

                await member.roles.add(role);

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Toggled",
                            `Added ${role} to ${member}.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);
                return message.reply(
                    "❌ I couldn't toggle that role."
                );
            }
        }

        // .role has @user @role
        if (subcommand === "has") {
            const member = await resolveMember(message, args[0]);
            const role = findRole(message.guild, args.slice(1).join(" "));

            if (!member || !role) {
                return message.reply(
                    "❌ Usage: `.role has @user @role`"
                );
            }

            const hasRole = member.roles.cache.has(role.id);

            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(hasRole ? 0x57f287 : 0xed4245)
                        .setTitle("Role Check")
                        .setDescription(
                            `${member} ${
                                hasRole ? "has" : "does not have"
                            } ${role}.`
                        ),
                ],
            });
        }

        // .role list
        if (subcommand === "list") {
            const roles = message.guild.roles.cache
                .filter((role) => role.id !== message.guild.id)
                .sort((a, b) => b.position - a.position);

            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x5865f2)
                        .setTitle("Server Roles")
                        .setDescription(
                            roles
                                .map((role) => `${role} — \`${role.id}\``)
                                .slice(0, 50)
                                .join("\n") || "No roles found."
                        )
                        .setFooter({
                            text: `${roles.size} roles total`,
                        }),
                ],
            });
        }

        // .role create <name>
        if (subcommand === "create") {
            const name = args.join(" ").trim();

            if (!name) {
                return message.reply(
                    "❌ Usage: `.role create <name>`"
                );
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
                return message.reply(
                    "❌ I couldn't create that role."
                );
            }
        }

        // .role delete @role
        if (subcommand === "delete") {
            const role = findRole(message.guild, args.join(" "));

            if (!role) {
                return message.reply(
                    "❌ I couldn't find that role."
                );
            }

            if (!canBotManageRole(botMember, role)) {
                return message.reply(
                    `❌ I cannot delete ${role}.`
                );
            }

            try {
                const name = role.name;

                await role.delete(
                    `Deleted by ${message.author.tag}`
                );

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Deleted",
                            `Deleted the role **${name}**.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);
                return message.reply(
                    "❌ I couldn't delete that role."
                );
            }
        }

        // .role rename @role <name>
        if (subcommand === "rename") {
            const role = findRole(message.guild, args[0]);
            const name = args.slice(1).join(" ");

            if (!role || !name) {
                return message.reply(
                    "❌ Usage: `.role rename @role <new name>`"
                );
            }

            if (!canBotManageRole(botMember, role)) {
                return message.reply(
                    `❌ I cannot rename ${role}.`
                );
            }

            try {
                const oldName = role.name;

                await role.setName(
                    name,
                    `Renamed by ${message.author.tag}`
                );

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Renamed",
                            `Renamed **${oldName}** to **${name}**.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);
                return message.reply(
                    "❌ I couldn't rename that role."
                );
            }
        }

        // .role color @role #5865F2
        if (subcommand === "color") {
            const role = findRole(message.guild, args[0]);
            const color = args[1];

            if (!role || !color) {
                return message.reply(
                    "❌ Usage: `.role color @role #5865F2`"
                );
            }

            if (!/^#?[0-9A-F]{6}$/i.test(color)) {
                return message.reply(
                    "❌ Please provide a valid hex color."
                );
            }

            if (!canBotManageRole(botMember, role)) {
                return message.reply(
                    `❌ I cannot modify ${role}.`
                );
            }

            const normalized = color.startsWith("#")
                ? color
                : `#${color}`;

            try {
                await role.setColor(normalized);

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Color Changed",
                            `Changed ${role}'s color to \`${normalized}\`.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);
                return message.reply(
                    "❌ I couldn't change that role's color."
                );
            }
        }

        // .role info @role
        if (subcommand === "info") {
            const role = findRole(message.guild, args.join(" "));

            if (!role) {
                return message.reply(
                    "❌ I couldn't find that role."
                );
            }

            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(role.color || 0x5865f2)
                        .setTitle("Role Information")
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
                            }
                        ),
                ],
            });
        }

        // .role hoist @role
        if (subcommand === "hoist") {
            const role = findRole(message.guild, args.join(" "));

            if (!role) {
                return message.reply(
                    "❌ I couldn't find that role."
                );
            }

            if (!canBotManageRole(botMember, role)) {
                return message.reply(
                    `❌ I cannot modify ${role}.`
                );
            }

            try {
                await role.setHoist(!role.hoist);

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Hoist Toggled",
                            `${role} is now **${
                                role.hoist ? "hoisted" : "not hoisted"
                            }**.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);
                return message.reply(
                    "❌ I couldn't change that role."
                );
            }
        }

        // .role mentionable @role
        if (subcommand === "mentionable") {
            const role = findRole(message.guild, args.join(" "));

            if (!role) {
                return message.reply(
                    "❌ I couldn't find that role."
                );
            }

            if (!canBotManageRole(botMember, role)) {
                return message.reply(
                    `❌ I cannot modify ${role}.`
                );
            }

            try {
                await role.setMentionable(!role.mentionable);

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Mentionability Toggled",
                            `${role} is now **${
                                role.mentionable
                                    ? "mentionable"
                                    : "not mentionable"
                            }**.`
                        ),
                    ],
                });
            } catch (error) {
                console.error(error);
                return message.reply(
                    "❌ I couldn't change that role."
                );
            }
        }

        return message.reply(
            `❌ Unknown role command. Use \`${PREFIX}role help\`.`
        );
    },
};

// ═════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════

async function resolveMember(message, input) {
    if (!input) return null;

    const mention = input.match(/^<@!?(\d+)>$/);

    if (mention) {
        return message.guild.members
            .fetch(mention[1])
            .catch(() => null);
    }

    if (/^\d{17,20}$/.test(input)) {
        return message.guild.members
            .fetch(input)
            .catch(() => null);
    }

    const lower = input.toLowerCase();

    return (
        message.guild.members.cache.find(
            (member) =>
                member.user.username.toLowerCase() === lower ||
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

function prefixHelpEmbed() {
    return new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Role Commands")
        .setDescription("Manage server roles.")
        .addFields(
            {
                name: "User Roles",
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
                    "`.role rename @role <name>`\n" +
                    "`.role color @role #5865F2`\n" +
                    "`.role hoist @role`\n" +
                    "`.role mentionable @role`",
            },
            {
                name: "Information",
                value:
                    "`.role info @role`\n" +
                    "`.role list`",
            }
        );
}
