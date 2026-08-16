import {
    SlashCommandBuilder,
    EmbedBuilder,
} from 'discord.js';

import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('rolelist')
        .setDescription('Show every member who has a role')
        .addStringOption((option) =>
            option
                .setName('role')
                .setDescription('The role name or part of the role name')
                .setRequired(true),
        ),

    category: 'moderation',

    usage: '[role]',

    async execute(interaction, config, client) {
        const roleName =
            interaction.options.getString('role');

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
        // "mod" -> "Moderator
        // "admin" -> "Administrator"
        const searchName =
            roleName.toLowerCase().trim();

        const role =
            interaction.guild.roles.cache.find(
                (r) =>
                    r.name
                        .toLowerCase()
                        .includes(searchName),
            );

        if (!role) {
            throw new TitanBotError(
                'Role not found',
                ErrorTypes.USER_INPUT,
                `I couldn't find a role matching **${roleName}**.`,
                { subtype: 'role_not_found' },
            );
        }

        // Fetch all members so the list includes members
        // that may not currently be cached.
        const members =
            await interaction.guild.members.fetch();

        const roleMembers =
            members.filter((member) =>
                member.roles.cache.has(role.id),
            );

        // No members have the role.
        if (roleMembers.size === 0) {
            const embed =
                new EmbedBuilder()
                    .setTitle('Role List')
                    .setDescription(
                        `**${role.name}** has no members.`,
                    );

            await interaction.reply({
                embeds: [embed],
            });

            return;
        }

        // Create one line for every member.
        const lines =
            roleMembers
                .sort(
                    (a, b) =>
                        a.user.username
                            .localeCompare(
                                b.user.username,
                            ),
                )
                .map(
                    (member) =>
                        `<@${member.id}> ${member.user.username} (${member.id})`,
                );

        // Discord embed descriptions have a 4096-character limit.
        // Split the member list into multiple embeds when necessary.
        const chunks = [];
        let currentChunk = '';

        for (const line of lines) {
            const nextChunk =
                currentChunk
                    ? `${currentChunk}\n${line}`
                    : line;

            if (nextChunk.length > 4000) {
                if (currentChunk) {
                    chunks.push(currentChunk);
                }

                currentChunk = line;
            } else {
                currentChunk = nextChunk;
            }
        }

        if (currentChunk) {
            chunks.push(currentChunk);
        }

        // Discord allows a maximum of 10 embeds per message.
        const embeds = chunks.map(
            (chunk, index) =>
                new EmbedBuilder()
                    .setTitle(
                        chunks.length > 1
                            ? `Role List — ${role.name} (${index + 1}/${chunks.length})`
                            : `Role List — ${role.name}`,
                    )
                    .setDescription(chunk)
                    .setFooter({
                        text: `${roleMembers.size} member(s) with this role`,
                    }),
        );

        // Send the first 10 embeds as the initial response.
        await interaction.reply({
            embeds: embeds.slice(0, 10),
        });

        // If there are more than 10 embeds, send the
        // remaining pages as follow-up messages.
        for (
            let index = 10;
            index < embeds.length;
            index += 10
        ) {
            await interaction.followUp({
                embeds: embeds.slice(
                    index,
                    index + 10,
                ),
            });
        }
    },
};