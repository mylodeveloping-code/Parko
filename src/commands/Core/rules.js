import {
    SlashCommandBuilder,
    EmbedBuilder,
} from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('rules')
        .setDescription('View the Astro MC server rules.'),

    category: 'core',

    usage: '',

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🌌 Astro MC Rules 🌌')
            .setDescription(
                'Welcome to **Astro MC!** Our goal is to keep the server **fair, friendly, and enjoyable** for everyone. By playing on Astro MC, you agree to follow these rules.'
            )
            .addFields(
                {
                    name: '🛡️ General Rules',
                    value:
                        '⚔️ **1. No Hacking or Cheating**\n' +
                        'Do not use hacks, cheats, or unfair modifications, including **X-Ray, Kill Aura, Reach,** or similar advantages.\n\n' +

                        '🐛 **2. No Exploiting**\n' +
                        'Do not exploit bugs, glitches, or unintended mechanics to gain an unfair advantage.\n\n' +

                        '👥 **3. Respect Everyone**\n' +
                        'Treat all players and staff with respect. Toxic, disrespectful, or disruptive behavior is not tolerated.\n\n' +

                        '🚫 **4. No Harassment or Bullying**\n' +
                        'Harassment, bullying, targeted toxicity, or intentionally making other players uncomfortable is prohibited.\n\n' +

                        '🔞 **5. Keep Chat Appropriate**\n' +
                        'No sexual, inappropriate, excessively offensive, or otherwise unsuitable content.\n\n' +

                        '📛 **6. Keep Names, Skins & Builds Appropriate**\n' +
                        'Inappropriate usernames, skins, builds, or other visual content are not allowed.\n\n' +

                        '🌐 **7. No Advertising**\n' +
                        'Do not advertise other Minecraft servers, Discord servers, websites, or external links without permission.\n\n' +

                        '💬 **8. No Chat Spam**\n' +
                        'Avoid excessive messages, repeated messages, character spam, or intentionally flooding chat.\n\n' +

                        '⚔️ **9. No Spam Killing or Targeting**\n' +
                        'Do not repeatedly kill or intentionally target another player without a legitimate gameplay reason.\n\n' +

                        '🚪 **10. No Combat Logging**\n' +
                        'Do not disconnect from the server during combat to avoid PvP consequences.',
                },
                {
                    name: '🏠 Gameplay & Community',
                    value:
                        '🤝 **11. No Begging**\n' +
                        'Do not repeatedly beg players or staff for items, ranks, perks, or special treatment.\n\n' +

                        '🏠 **12. No Griefing**\n' +
                        'Do not destroy, damage, steal from, or intentionally disrupt another player\'s builds or property.\n\n' +

                        '🗺️ **13. Respect Public Areas**\n' +
                        'Keep spawn and other public areas clean, accessible, and respectful.\n\n' +

                        '⚠️ **14. Do Not Abuse Bugs**\n' +
                        'Even if you discover a bug accidentally, do not take advantage of it. Report it to staff instead.\n\n' +

                        '🛡️ **15. Follow Staff Instructions**\n' +
                        'Staff instructions must be followed. If you disagree with a decision, handle it respectfully through the appropriate channels.\n\n' +

                        '🧠 **16. Use Common Sense**\n' +
                        'Not every situation can be covered by a rule. If something clearly feels unfair, abusive, or against the spirit of Astro MC, **don\'t do it.**',
                }
            )
            .setFooter({
                text: '🌌 Play Fair. Have Fun. Respect Others.',
            });

        await interaction.reply({
            embeds: [embed],
        });
    },
};