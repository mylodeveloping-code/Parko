import {
    SlashCommandBuilder,
    EmbedBuilder,
} from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('mrr')
        .setDescription('View the Astro MC Media Rank Requirements.'),

    category: 'core',

    usage: '',

    async execute(interaction) {
        const embeds = [
            new EmbedBuilder()
                .setTitle('🎥 Astro MC Media Ranks')
                .setDescription(
                    'Want to create content for **Astro MC**? Our Media Rank system rewards creators as they grow their audience and help bring new players to the server.'
                )
                .addFields({
                    name: '✨ Minor Creator Levels — 1–5',
                    value:
                        '**Level 1 — Media Creator**\n' +
                        '🔹 **50 subscribers**\n' +
                        '**OR** 1K long-form views\n' +
                        '**OR** 3K short-form views\n' +
                        '🎁 **Perk:** Media Rank\n\n' +

                        '**Level 2 — Media Creator+**\n' +
                        '🔹 **100 subscribers**\n' +
                        '**OR** 2K long-form views\n' +
                        '**OR** 5K short-form views\n' +
                        '🎁 **Perks:** Extra backpack space + additional homes\n\n' +

                        '**Level 3 — Media Creator+**\n' +
                        '🔹 **200 subscribers**\n' +
                        '**OR** 5K long-form views\n' +
                        '**OR** 10K short-form views\n' +
                        '🎁 **Perks:** `/nick` command + VIP Room\n\n' +

                        '**Level 4 — Media Creator+**\n' +
                        '🔹 **350 subscribers**\n' +
                        '**OR** 7.5K long-form views\n' +
                        '**OR** 15K short-form views\n\n' +

                        '**Level 5 — Media Creator+**\n' +
                        '🔹 **500 subscribers**\n' +
                        '**OR** 10K long-form views\n' +
                        '**OR** 25K short-form views',
                }),

            new EmbedBuilder()
                .setTitle('⭐ Major Creator Levels — 6–9')
                .setDescription(
                    '**Special Requirement:** No view requirements. You must create **at least 3 videos** featuring Astro MC.'
                )
                .addFields({
                    name: 'Creator Levels',
                    value:
                        '**Level 6**\n' +
                        '🔹 **2K subscribers**\n\n' +

                        '**Level 7**\n' +
                        '🔹 **5K subscribers**\n\n' +

                        '**Level 8**\n' +
                        '🔹 **50K subscribers**\n\n' +

                        '**Level 9**\n' +
                        '🔹 **100K subscribers**',
                }),

            new EmbedBuilder()
                .setTitle('🌌 Mythic Creator — Level 10')
                .setDescription(
                    '**Level 10 — Mythic Creator**\n\n' +
                    '🔹 **1,000,000 subscribers**\n\n' +
                    '🎁 **Reach the highest level of the Astro MC Media Program and earn the exclusive Mythic Creator status.**\n\n' +
                    '🚀 **Create. Explore. Grow. Become part of Astro MC.**'
                ),
        ];

        await interaction.reply({
            embeds,
        });
    },
};