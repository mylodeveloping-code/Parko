import {
    SlashCommandBuilder,
    EmbedBuilder,
} from 'discord.js';

import {
    TitanBotError,
    ErrorTypes,
} from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('roles')
        .setDescription('List all roles in the server'),

    category: 'utility',

    usage: '',

    async execute(interaction, config, client) {
        const roles =
            [...interaction.guild.roles.cache.values()]
                .filter(
                    (role) =>
                        role.id !==
                        interaction.guild.id,
                )
                .sort(
                    (a, b) =>
                        b.position - a.position,
                );

        if (roles.length === 0) {
            throw new TitanBotError(
                'No roles',
                ErrorTypes.USER_INPUT,
                'This server does not have any roles.',
            );
        }

        const lines = roles.map(
            (role) =>
                `<@&${role.id}> — ` +
                `**${role.name}** ` +
                `(\`${role.id}\`) — ` +
                `**${role.members.size}** member(s)`,
        );

        const chunks = [];
        let currentChunk = '';

        for (const line of lines) {
            const nextChunk = currentChunk
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

        const embeds = chunks.map(
            (chunk, index) =>
                new EmbedBuilder()
                    .setTitle(
                        chunks.length > 1
                            ? `Server Roles (${index + 1}/${chunks.length})`
                            : 'Server Roles',
                    )
                    .setDescription(chunk)
                    .setFooter({
                        text:
                            `${roles.length} role(s)`,
                    }),
        );

        await interaction.reply({
            embeds: embeds.slice(0, 10),
        });

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