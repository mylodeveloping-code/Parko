import { getColor } from '../../config/bot.js';

import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from 'discord.js';

import {
    createEmbed,
} from '../../utils/embeds.js';

import {
    logEvent,
} from '../../utils/moderation.js';

import {
    logger,
} from '../../utils/logger.js';

import {
    WarningService,
} from '../../services/moderation/warningService.js';

import {
    InteractionHelper,
} from '../../utils/interactionHelper.js';

// Warning role IDs
const WARNING_ROLE_IDS = [
    '1537643745720148018',
    '1533577410367455242',
    '1536917870087376936',
];

export default {
    data: new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('View all warnings for a user')

        .addUserOption((o) =>
            o
                .setName('target')
                .setRequired(true)
                .setDescription(
                    'User to check warnings for'
                )
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.ModerateMembers
        ),

    category: 'moderation',

    async execute(
        interaction,
        config,
        client
    ) {
        const deferSuccess =
            await InteractionHelper.safeDefer(
                interaction
            );

        if (!deferSuccess) {
            logger.warn(
                'Warnings interaction defer failed',
                {
                    userId:
                        interaction.user.id,

                    guildId:
                        interaction.guildId,

                    commandName:
                        'warnings',
                }
            );

            return;
        }

        // ============================================
        // GET USER
        // ============================================

        const target =
            interaction.options.getUser(
                'target'
            );

        const guildId =
            interaction.guildId;

        if (!target) {
            await InteractionHelper.safeEditReply(
                interaction,
                {
                    embeds: [
                        createEmbed({
                            title:
                                'Invalid User',

                            description:
                                'I could not resolve that Discord user.',
                        }).setColor(
                            getColor('error')
                        ),
                    ],
                }
            );

            return;
        }

        // ============================================
        // GET WARNINGS
        // ============================================

        const validWarnings =
            await WarningService.getWarnings(
                guildId,
                target.id
            );

        const totalWarns =
            validWarnings.length;

        // ============================================
        // NO WARNINGS
        // ============================================

        if (totalWarns === 0) {
            await InteractionHelper.safeEditReply(
                interaction,
                {
                    embeds: [
                        createEmbed({
                            title:
                                `Warnings: ${target.tag}`,

                            description:
                                'This user has no recorded warnings.',
                        }).setColor(
                            getColor('success')
                        ),
                    ],
                }
            );

            return;
        }

        // ============================================
        // BUILD EMBED
        // ============================================

        const embed =
            createEmbed({
                title:
                    `Warnings: ${target.tag}`,

                description:
                    `Total Warnings: **${totalWarns}**`,
            }).setColor(
                getColor('warning')
            );

        const warningFields =
            validWarnings
                .map((warning, index) => {
                    const discordTimestamp =
                        Math.floor(
                            warning.timestamp /
                            1000
                        );

                    const reason =
                        String(
                            warning.reason ??
                            'No reason provided'
                        );

                    return {
                        name:
                            `[#${index + 1}] Reason: ` +
                            reason.substring(
                                0,
                                100
                            ),

                        value:
                            `**Moderator:** <@${warning.moderatorId}>\n` +
                            `**Date:** <t:${discordTimestamp}:F> ` +
                            `(<t:${discordTimestamp}:R>)`,

                        inline: false,
                    };
                })
                .slice(0, 25);

        embed.addFields(
            warningFields
        );

        // ============================================
        // BUTTONS
        // ============================================

        const actionRow =
            new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `warning_delete_specific:${target.id}:${interaction.user.id}`
                        )
                        .setLabel(
                            'Delete Specific Warning'
                        )
                        .setStyle(
                            ButtonStyle.Danger
                        ),

                    new ButtonBuilder()
                        .setCustomId(
                            `warning_clear_all:${target.id}:${interaction.user.id}`
                        )
                        .setLabel(
                            'Clear All Warnings'
                        )
                        .setStyle(
                            ButtonStyle.Danger
                        )
                );

        // ============================================
        // LOG
        // ============================================

        await logEvent({
            client,

            guild:
                interaction.guild,

            event: {
                action:
                    'Warnings Viewed',

                target:
                    `${target.tag} (${target.id})`,

                executor:
                    `${interaction.user.tag} (${interaction.user.id})`,

                reason:
                    `Viewed ${totalWarns} warnings`,

                metadata: {
                    userId:
                        target.id,

                    moderatorId:
                        interaction.user.id,

                    totalWarnings:
                        totalWarns,
                },
            },
        });

        // ============================================
        // SEND RESPONSE
        // ============================================

        await InteractionHelper.safeEditReply(
            interaction,
            {
                embeds: [
                    embed,
                ],

                components: [
                    actionRow,
                ],
            }
        );

        // ============================================
        // BUTTON COLLECTOR
        // ============================================

        try {
            const reply =
                await interaction.fetchReply();

            const collector =
                reply.createMessageComponentCollector({
                    filter:
                        (buttonInteraction) => {
                            return (
                                buttonInteraction.customId ===
                                    `warning_clear_all:${target.id}:${interaction.user.id}` &&
                                buttonInteraction.user.id ===
                                    interaction.user.id
                            );
                        },

                    time:
                        15 * 60 * 1000,
                });

            collector.on(
                'collect',
                async (
                    buttonInteraction
                ) => {
                    try {
                        // A user can have warnings even if
                        // they have since left the server.
                        //
                        // Try to fetch the member, but don't
                        // treat failure as a warning-system error.

                        const member =
                            await interaction.guild.members
                                .fetch(
                                    target.id
                                )
                                .catch(
                                    () => null
                                );

                        if (member) {
                            for (
                                const roleId
                                of WARNING_ROLE_IDS
                            ) {
                                if (
                                    member.roles.cache.has(
                                        roleId
                                    )
                                ) {
                                    await member.roles.remove(
                                        roleId,
                                        `All warnings cleared by ${interaction.user.tag}`
                                    );
                                }
                            }

                            logger.info(
                                `Removed warning roles from ${target.tag} after clearing warnings`,
                                {
                                    userId:
                                        target.id,

                                    guildId,

                                    moderatorId:
                                        interaction.user.id,

                                    removedRoles:
                                        WARNING_ROLE_IDS,
                                }
                            );
                        } else {
                            logger.info(
                                `User ${target.id} is no longer in the guild; no warning roles needed removal`,
                                {
                                    userId:
                                        target.id,

                                    guildId,

                                    moderatorId:
                                        interaction.user.id,
                                }
                            );
                        }

                        await buttonInteraction.deferUpdate();

                    } catch (roleError) {
                        logger.error(
                            `Failed to remove warning roles from ${target.tag}`,
                            {
                                userId:
                                    target.id,

                                guildId,

                                moderatorId:
                                    interaction.user.id,

                                error:
                                    roleError,
                            }
                        );

                        await buttonInteraction
                            .deferUpdate()
                            .catch(() => {});
                    }
                }
            );

            collector.on(
                'end',
                () => {
                    logger.debug(
                        `Warning button collector ended for ${target.tag}`
                    );
                }
            );
        } catch (collectorError) {
            logger.error(
                'Failed to create warning button collector',
                {
                    guildId,
                    userId:
                        target.id,
                    error:
                        collectorError,
                }
            );
        }
    },
};
