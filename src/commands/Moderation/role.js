import {
    PermissionFlagsBits,
    EmbedBuilder,
} from "discord.js";

export default {
    name: "role",
    description: "Manage server roles.",
    usage: ".role <add|remove|toggle|has|info|list|create|delete|rename|color|hoist|mentionable> ...",

    async execute(message, args, config, client) {
        try {
            if (!message.guild) return;

            console.log(
                `[ROLE] Command executed by ${message.author.tag}:`,
                message.content
            );

            const subcommand = args.shift()?.toLowerCase();

            if (!subcommand || subcommand === "help") {
                return sendHelp(message);
            }

            // ─────────────────────────────────────────
            // PERMISSIONS
            // ─────────────────────────────────────────

            if (
                !message.member.permissions.has(
                    PermissionFlagsBits.ManageRoles
                )
            ) {
                return message.reply({
                    content:
                        "❌ You need the **Manage Roles** permission to use this command.",
                });
            }

            const botMember = await message.guild.members.fetch(
                client.user.id
            );

            if (
                !botMember.permissions.has(
                    PermissionFlagsBits.ManageRoles
                )
            ) {
                return message.reply({
                    content:
                        "❌ I don't have the **Manage Roles** permission.",
                });
            }

            // ─────────────────────────────────────────
            // ADD
            // .role add @user @role
            // ─────────────────────────────────────────

            if (subcommand === "add") {
                if (!args[0]) {
                    return message.reply({
                        content:
                            "❌ Usage: `.role add @user @role`",
                    });
                }

                const target = await resolveMember(
                    message.guild,
                    args[0]
                );

                if (!target) {
                    return message.reply({
                        content:
                            "❌ I couldn't find that user.",
                    });
                }

                const roleInput = args
                    .slice(1)
                    .join(" ")
                    .trim();

                if (!roleInput) {
                    return message.reply({
                        content:
                            "❌ Please specify a role.\nUsage: `.role add @user @role`",
                    });
                }

                const role = await findRole(
                    message.guild,
                    roleInput
                );

                if (!role) {
                    return message.reply({
                        content:
                            `❌ I couldn't find the role **${roleInput}**.`,
                    });
                }

                const check = canBotManageRole(
                    botMember,
                    role
                );

                if (!check.canManage) {
                    return message.reply({
                        content: check.message,
                    });
                }

                if (target.roles.cache.has(role.id)) {
                    return message.reply({
                        content:
                            `⚠️ ${target} already has ${role}.`,
                    });
                }

                await target.roles.add(
                    role,
                    `Role added by ${message.author.tag}`
                );

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Added",
                            `Added ${role} to ${target}.`
                        ),
                    ],
                });
            }

            // ─────────────────────────────────────────
            // REMOVE
            // ─────────────────────────────────────────

            if (subcommand === "remove") {
                const target = await resolveMember(
                    message.guild,
                    args[0]
                );

                if (!target) {
                    return message.reply({
                        content:
                            "❌ Usage: `.role remove @user @role`",
                    });
                }

                const roleInput = args
                    .slice(1)
                    .join(" ")
                    .trim();

                if (!roleInput) {
                    return message.reply({
                        content:
                            "❌ Please specify a role.",
                    });
                }

                const role = await findRole(
                    message.guild,
                    roleInput
                );

                if (!role) {
                    return message.reply({
                        content:
                            `❌ I couldn't find the role **${roleInput}**.`,
                    });
                }

                const check = canBotManageRole(
                    botMember,
                    role
                );

                if (!check.canManage) {
                    return message.reply({
                        content: check.message,
                    });
                }

                if (!target.roles.cache.has(role.id)) {
                    return message.reply({
                        content:
                            `⚠️ ${target} doesn't have ${role}.`,
                    });
                }

                await target.roles.remove(
                    role,
                    `Role removed by ${message.author.tag}`
                );

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Removed",
                            `Removed ${role} from ${target}.`
                        ),
                    ],
                });
            }

            // ─────────────────────────────────────────
            // TOGGLE
            // ─────────────────────────────────────────

            if (subcommand === "toggle") {
                const target = await resolveMember(
                    message.guild,
                    args[0]
                );

                const roleInput = args
                    .slice(1)
                    .join(" ")
                    .trim();

                if (!target || !roleInput) {
                    return message.reply({
                        content:
                            "❌ Usage: `.role toggle @user @role`",
                    });
                }

                const role = await findRole(
                    message.guild,
                    roleInput
                );

                if (!role) {
                    return message.reply({
                        content:
                            `❌ I couldn't find the role **${roleInput}**.`,
                    });
                }

                const check = canBotManageRole(
                    botMember,
                    role
                );

                if (!check.canManage) {
                    return message.reply({
                        content: check.message,
                    });
                }

                if (target.roles.cache.has(role.id)) {
                    await target.roles.remove(
                        role,
                        `Role toggled by ${message.author.tag}`
                    );

                    return message.reply({
                        embeds: [
                            successEmbed(
                                "Role Toggled",
                                `Removed ${role} from ${target}.`
                            ),
                        ],
                    });
                }

                await target.roles.add(
                    role,
                    `Role toggled by ${message.author.tag}`
                );

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Toggled",
                            `Added ${role} to ${target}.`
                        ),
                    ],
                });
            }

            // ─────────────────────────────────────────
            // HAS
            // ─────────────────────────────────────────

            if (subcommand === "has") {
                const target = await resolveMember(
                    message.guild,
                    args[0]
                );

                const roleInput = args
                    .slice(1)
                    .join(" ")
                    .trim();

                if (!target || !roleInput) {
                    return message.reply({
                        content:
                            "❌ Usage: `.role has @user @role`",
                    });
                }

                const role = await findRole(
                    message.guild,
                    roleInput
                );

                if (!role) {
                    return message.reply({
                        content:
                            `❌ I couldn't find the role **${roleInput}**.`,
                    });
                }

                const hasRole =
                    target.roles.cache.has(role.id);

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(
                                hasRole
                                    ? 0x57f287
                                    : 0xed4245
                            )
                            .setTitle("Role Check")
                            .setDescription(
                                `${target} ${
                                    hasRole
                                        ? "has"
                                        : "does not have"
                                } ${role}.`
                            ),
                    ],
                });
            }

            // ─────────────────────────────────────────
            // INFO
            // ─────────────────────────────────────────

            if (subcommand === "info") {
                const roleInput = args
                    .join(" ")
                    .trim();

                if (!roleInput) {
                    return message.reply({
                        content:
                            "❌ Usage: `.role info @role`",
                    });
                }

                const role = await findRole(
                    message.guild,
                    roleInput
                );

                if (!role) {
                    return message.reply({
                        content:
                            `❌ I couldn't find the role **${roleInput}**.`,
                    });
                }

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(
                                role.color || 0x5865f2
                            )
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
                                    value: String(
                                        role.position
                                    ),
                                    inline: true,
                                },
                                {
                                    name: "Members",
                                    value: String(
                                        role.members.size
                                    ),
                                    inline: true,
                                },
                                {
                                    name: "Color",
                                    value: role.hexColor,
                                    inline: true,
                                },
                                {
                                    name: "Mentionable",
                                    value: role.mentionable
                                        ? "Yes"
                                        : "No",
                                    inline: true,
                                },
                                {
                                    name: "Hoisted",
                                    value: role.hoist
                                        ? "Yes"
                                        : "No",
                                    inline: true,
                                }
                            ),
                    ],
                });
            }

            // ─────────────────────────────────────────
            // LIST
            // ─────────────────────────────────────────

            if (subcommand === "list") {
                const roles =
                    message.guild.roles.cache
                        .filter(
                            (role) =>
                                role.id !==
                                message.guild.id
                        )
                        .sort(
                            (a, b) =>
                                b.position - a.position
                        );

                const list = roles
                    .map(
                        (role) =>
                            `${role} — \`${role.id}\``
                    )
                    .slice(0, 50)
                    .join("\n");

                return message.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x5865f2)
                            .setTitle("Server Roles")
                            .setDescription(
                                list ||
                                    "No roles found."
                            )
                            .setFooter({
                                text: `${roles.size} roles total`,
                            }),
                    ],
                });
            }

            // ─────────────────────────────────────────
            // CREATE
            // ─────────────────────────────────────────

            if (subcommand === "create") {
                const name = args.join(" ").trim();

                if (!name) {
                    return message.reply({
                        content:
                            "❌ Usage: `.role create <name>`",
                    });
                }

                if (name.length > 100) {
                    return message.reply({
                        content:
                            "❌ Role names cannot be longer than 100 characters.",
                    });
                }

                const existing =
                    message.guild.roles.cache.find(
                        (role) =>
                            role.name.toLowerCase() ===
                            name.toLowerCase()
                    );

                if (existing) {
                    return message.reply({
                        content:
                            `❌ A role named **${name}** already exists.`,
                    });
                }

                const role =
                    await message.guild.roles.create({
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
            }

            // ─────────────────────────────────────────
            // DELETE
            // ─────────────────────────────────────────

            if (subcommand === "delete") {
                const roleInput = args
                    .join(" ")
                    .trim();

                if (!roleInput) {
                    return message.reply({
                        content:
                            "❌ Usage: `.role delete @role`",
                    });
                }

                const role = await findRole(
                    message.guild,
                    roleInput
                );

                if (!role) {
                    return message.reply({
                        content:
                            `❌ I couldn't find the role **${roleInput}**.`,
                    });
                }

                const check = canBotManageRole(
                    botMember,
                    role
                );

                if (!check.canManage) {
                    return message.reply({
                        content: check.message,
                    });
                }

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
            }

            // ─────────────────────────────────────────
            // RENAME
            // ─────────────────────────────────────────

            if (subcommand === "rename") {
                const roleInput = args[0];
                const newName = args
                    .slice(1)
                    .join(" ")
                    .trim();

                if (!roleInput || !newName) {
                    return message.reply({
                        content:
                            "❌ Usage: `.role rename @role <new name>`",
                    });
                }

                const role = await findRole(
                    message.guild,
                    roleInput
                );

                if (!role) {
                    return message.reply({
                        content:
                            `❌ I couldn't find the role **${roleInput}**.`,
                    });
                }

                const check = canBotManageRole(
                    botMember,
                    role
                );

                if (!check.canManage) {
                    return message.reply({
                        content: check.message,
                    });
                }

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
            }

            // ─────────────────────────────────────────
            // COLOR
            // ─────────────────────────────────────────

            if (subcommand === "color") {
                const roleInput = args[0];
                const color = args[1];

                if (!roleInput || !color) {
                    return message.reply({
                        content:
                            "❌ Usage: `.role color @role #5865F2`",
                    });
                }

                const role = await findRole(
                    message.guild,
                    roleInput
                );

                if (!role) {
                    return message.reply({
                        content:
                            `❌ I couldn't find the role **${roleInput}**.`,
                    });
                }

                if (!/^#?[0-9A-F]{6}$/i.test(color)) {
                    return message.reply({
                        content:
                            "❌ Please provide a valid hex color.",
                    });
                }

                const check = canBotManageRole(
                    botMember,
                    role
                );

                if (!check.canManage) {
                    return message.reply({
                        content: check.message,
                    });
                }

                const hex = color.startsWith("#")
                    ? color
                    : `#${color}`;

                await role.setColor(
                    hex,
                    `Color changed by ${message.author.tag}`
                );

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Color Changed",
                            `Changed ${role}'s color to \`${hex}\`.`
                        ),
                    ],
                });
            }

            // ─────────────────────────────────────────
            // HOIST
            // ─────────────────────────────────────────

            if (subcommand === "hoist") {
                const roleInput = args
                    .join(" ")
                    .trim();

                if (!roleInput) {
                    return message.reply({
                        content:
                            "❌ Usage: `.role hoist @role`",
                    });
                }

                const role = await findRole(
                    message.guild,
                    roleInput
                );

                if (!role) {
                    return message.reply({
                        content:
                            `❌ I couldn't find the role **${roleInput}**.`,
                    });
                }

                const check = canBotManageRole(
                    botMember,
                    role
                );

                if (!check.canManage) {
                    return message.reply({
                        content: check.message,
                    });
                }

                const newValue = !role.hoist;

                await role.setHoist(
                    newValue,
                    `Hoist toggled by ${message.author.tag}`
                );

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Hoist Toggled",
                            `${role} is now **${
                                newValue
                                    ? "hoisted"
                                    : "not hoisted"
                            }**.`
                        ),
                    ],
                });
            }

            // ─────────────────────────────────────────
            // MENTIONABLE
            // ─────────────────────────────────────────

            if (subcommand === "mentionable") {
                const roleInput = args
                    .join(" ")
                    .trim();

                if (!roleInput) {
                    return message.reply({
                        content:
                            "❌ Usage: `.role mentionable @role`",
                    });
                }

                const role = await findRole(
                    message.guild,
                    roleInput
                );

                if (!role) {
                    return message.reply({
                        content:
                            `❌ I couldn't find the role **${roleInput}**.`,
                    });
                }

                const check = canBotManageRole(
                    botMember,
                    role
                );

                if (!check.canManage) {
                    return message.reply({
                        content: check.message,
                    });
                }

                const newValue =
                    !role.mentionable;

                await role.setMentionable(
                    newValue,
                    `Mentionable toggled by ${message.author.tag}`
                );

                return message.reply({
                    embeds: [
                        successEmbed(
                            "Role Mentionability Toggled",
                            `${role} is now **${
                                newValue
                                    ? "mentionable"
                                    : "not mentionable"
                            }**.`
                        ),
                    ],
                });
            }

            return message.reply({
                content:
                    `❌ Unknown role subcommand **${subcommand}**.\nUse \`.role help\`.`,
            });
        } catch (error) {
            console.error("[ROLE COMMAND ERROR]", error);

            try {
                return message.reply({
                    content:
                        `❌ An error occurred while running the role command.\n\`${error.message || "Unknown error"}\``,
                });
            } catch {
                return;
            }
        }
    },
};

// ═════════════════════════════════════════════════════
// MEMBER RESOLVER
// ═════════════════════════════════════════════════════

async function resolveMember(guild, input) {
    if (!input) return null;

    const mention = input.match(/^<@!?(\d+)>$/);

    if (mention) {
        try {
            return await guild.members.fetch(mention[1]);
        } catch {
            return null;
        }
    }

    if (/^\d{17,20}$/.test(input)) {
        try {
            return await guild.members.fetch(input);
        } catch {
            return null;
        }
    }

    const lower = input.toLowerCase();

    return (
        guild.members.cache.find(
            (member) =>
                member.user.username.toLowerCase() === lower ||
                member.displayName.toLowerCase() === lower ||
                member.user.tag?.toLowerCase() === lower
        ) || null
    );
}

// ═════════════════════════════════════════════════════
// ROLE RESOLVER
// ═════════════════════════════════════════════════════

async function findRole(guild, input) {
    if (!input) return null;

    const value = input.trim();

    // @Role mention
    const mention = value.match(/^<@&(\d+)>$/);

    if (mention) {
        try {
            return await guild.roles.fetch(mention[1]);
        } catch {
            return null;
        }
    }

    // Role ID
    if (/^\d{17,20}$/.test(value)) {
        try {
            return await guild.roles.fetch(value);
        } catch {
            return null;
        }
    }

    const lower = value.toLowerCase();

    // Cache
    let role = guild.roles.cache.find(
        (r) => r.name.toLowerCase() === lower
    );

    if (role) return role;

    // API
    try {
        const roles = await guild.roles.fetch();

        role = roles.find(
            (r) => r.name.toLowerCase() === lower
        );

        return role || null;
    } catch (error) {
        console.error("[ROLE LOOKUP ERROR]", error);
        return null;
    }
}

// ═════════════════════════════════════════════════════
// ROLE HIERARCHY CHECK
// ═════════════════════════════════════════════════════

function canBotManageRole(botMember, role) {
    if (!role) {
        return {
            canManage: false,
            message: "❌ That role doesn't exist.",
        };
    }

    if (role.managed) {
        return {
            canManage: false,
            message:
                "❌ That role is managed by an integration and cannot be manually managed.",
        };
    }

    if (role.id === botMember.guild.id) {
        return {
            canManage: false,
            message:
                "❌ The @everyone role cannot be managed.",
        };
    }

    const highest = botMember.roles.highest;

    if (!highest) {
        return {
            canManage: false,
            message:
                "❌ I couldn't determine my highest role.",
        };
    }

    console.log(
        `[ROLE HIERARCHY] Bot: ${highest.name} (${highest.position}) | Target: ${role.name} (${role.position})`
    );

    if (highest.position <= role.position) {
        return {
            canManage: false,
            message:
                `❌ I cannot manage **${role.name}**.\n\n` +
                `My highest role: **${highest.name}** (position ${highest.position})\n` +
                `Target role: **${role.name}** (position ${role.position})\n\n` +
                `Move my bot role **above** the target role in Server Settings → Roles.`,
        };
    }

    return {
        canManage: true,
    };
}

// ═════════════════════════════════════════════════════
// EMBED
// ═════════════════════════════════════════════════════

function successEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(`✅ ${title}`)
        .setDescription(description);
}

// ═════════════════════════════════════════════════════
// HELP
// ═════════════════════════════════════════════════════

async function sendHelp(message) {
    return message.reply({
        embeds: [
            new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle("Role Commands")
                .setDescription(
                    "Manage server roles using the commands below."
                )
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
                        name: "Information",
                        value:
                            "`.role info @role`\n" +
                            "`.role list`\n" +
                            "`.role help`",
                    }
                ),
        ],
    });
}
