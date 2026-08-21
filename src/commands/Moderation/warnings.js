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

// ============================================================
// WARNING ROLES
// ============================================================

const WARNING_ROLE_IDS = [
    '1537643745720148018',
    '1533577410367455242',
    '1536917870087376936',
];

// ============================================================
// REMOVE ALL WARNING ROLES
// ============================================================

async function removeAllWarningRoles(
    guild,
    userId,
    moderatorTag
) {
    if (
        !guild ||
        !userId
    ) {
        return {
            success: false,
            removed: [],
            reason:
                'Missing guild or user ID.',
        };
    }

    // --------------------------------------------------------
    // Fetch a fresh GuildMember
    // --------------------------------------------------------

    let member = null;

    try {
        member =
            await guild.members.fetch(
                userId
            );
    } catch (error) {
        /*
         * The user may have left the server. In that case there
         * are no Discord roles to remove.
         */
        if (
            error?.code === 10007
        ) {
            logger.info(
                `User ${userId} is no longer in ${guild.name}; no warning roles need to be removed.`
            );

            return {
                success: true,
                removed: [],
                reason:
                    'User is no longer in the server.',
            };
        }

        logger.error(
            `Failed to fetch ${userId} while clearing warning roles:`,
            error
        );

        return {
            success: false,
            removed: [],
            reason:
                'Could not fetch the member.',
        };
    }

    if (!member) {
        return {
            success: true,
            removed: [],
            reason:
                'Member not found.',
        };
    }

    const removedRoles = [];

    // --------------------------------------------------------
    // Remove every warning role individually
    // --------------------------------------------------------

    for (
        const roleId of WARNING_ROLE_IDS
    ) {
        try {
            const role =
                guild.roles.cache.get(
                    roleId
                ) ||
                await guild.roles.fetch(
                    roleId
                ).catch(
                    () => null
                );

            if (!role) {
                logger.warn(
                    `Warning role ${roleId} does not exist in guild ${guild.id}.`
                );

                continue;
            }

            if (
                !member.roles.cache.has(
                    roleId
                )
            ) {
                continue;
            }

            if (
                !role.editable
            ) {
                logger.error(
                    `Cannot remove warning role ${roleId} from ${member.user.tag}: role is not editable.`
                );

                continue;
            }

            await member.roles.remove(
                role,
                `All warnings cleared by ${moderatorTag}`
            );

            removedRoles.push(
                roleId
            );

            logger.info(
                `Removed warning role ${roleId} from ${member.user.tag}.`,
                {
                    userId:
                        member.id,

                    guildId:
                        guild.id,

                    moderator:
                        moderatorTag,
                }
            );
        } catch (error) {
            logger.error(
                `Failed to remove warning role ${roleId} from ${member.user?.tag ?? userId}:`,
                error
            );
        }
    }

    return {
        success: true,
        removed: removedRoles,
        reason:
            removedRoles.length > 0
                ? null
                : 'No warning roles were currently assigned.',
    };
}

// ============================================================
// COMMAND
// ============================================================

export default {
    data:
        new SlashCommandBuilder()
            .setName(
                'warnings'
            )

            .setDescription(
                'View all warnings for a user'
            )

            .addUserOption(
                option =>
                    option
                        .setName(
                            'target'
                        )

                        .setRequired(
                            true
                        )

                        .setDescription(
                            'User to check warnings for'
                        )
            )

            .setDefaultMemberPermissions(
                PermissionFlagsBits.ModerateMembers
            ),

    category:
        'moderation',

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

        // ========================================================
        // GET USER
        // ========================================================

        const target =
            interaction.options.getUser(
                'target'
            );

        const guild =
            interaction.guild;

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
                            getColor(
                                'error'
                            )
                        ),
                    ],
                }
            );

            return;
        }

        // ========================================================
        // GET WARNINGS
        // ========================================================

        const validWarnings =
            await WarningService.getWarnings(
                guildId,
                target.id
            );

        const totalWarns =
            validWarnings.length;

        // ========================================================
        // NO WARNINGS
        // ========================================================

        if (
            totalWarns === 0
        ) {
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
                            getColor(
                                'success'
                            )
                        ),
                    ],
                }
            );

            return;
        }

        // ========================================================
        // BUILD EMBED
        // ========================================================

        const embed =
            createEmbed({
                title:
                    `Warnings: ${target.tag}`,

                description:
                    `Total Warnings: **${totalWarns}**`,
            }).setColor(
                getColor(
                    'warning'
                )
            );

        const warningFields =
            validWarnings
                .map(
                    (
                        warning,
                        index
                    ) => {
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

                            inline:
                                false,
                        };
                    }
                )
                .slice(
                    0,
                    25
                );

        embed.addFields(
            warningFields
        );

        // ========================================================
        // BUTTONS
        // ========================================================

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

        // ========================================================
        // LOG
        // ========================================================

        await logEvent({
            client,

            guild,

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

        // ========================================================
        // SEND RESPONSE
        // ========================================================

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

        // ========================================================
        // BUTTON COLLECTOR
        // ========================================================

        try {
            const reply =
                await interaction.fetchReply();

            const collector =
                reply.createMessageComponentCollector({
                    filter:
                        buttonInteraction =>
                            buttonInteraction.user.id ===
                                interaction.user.id &&
                            buttonInteraction.customId ===
                                `warning_clear_all:${target.id}:${interaction.user.id}`,

                    time:
                        15 * 60 * 1000,
                });

            collector.on(
                'collect',
                async buttonInteraction => {
                    try {
                        // ==================================================
                        // ACKNOWLEDGE BUTTON IMMEDIATELY
                        // ==================================================

                        await buttonInteraction.deferUpdate();

                        // ==================================================
                        // CLEAR WARNING ROLES
                        // ==================================================

                        const roleResult =
                            await removeAllWarningRoles(
                                guild,
                                target.id,
                                interaction.user.tag
                            );

                        if (
                            !roleResult.success
                        ) {
                            logger.warn(
                                `Warning roles could not be completely removed from ${target.tag}.`,
                                {
                                    userId:
                                        target.id,

                                    guildId,

                                    moderatorId:
                                        interaction.user.id,

                                    reason:
                                        roleResult.reason,
                                }
                            );

                            return;
                        }

                        logger.info(
                            `Removed all warning roles from ${target.tag} after warnings were cleared.`,
                            {
                                userId:
                                    target.id,

                                guildId,

                                moderatorId:
                                    interaction.user.id,

                                removedRoles:
                                    roleResult.removed,
                            }
                        );

                        // ==================================================
                        // DISABLE THE BUTTONS
                        // ==================================================

                        try {
                            const disabledRow =
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
                                            )

                                            .setDisabled(
                                                true
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

                                            .setDisabled(
                                                true
                                            )
                                    );

                            await interaction.editReply({
                                embeds: [
                                    createEmbed({
                                        title:
                                            `Warnings: ${target.tag}`,

                                        description:
                                            'All warnings have been cleared.',
                                    }).setColor(
                                        getColor(
                                            'success'
                                        )
                                    ),
                                ],

                                components: [
                                    disabledRow,
                                ],
                            });
                        } catch (editError) {
                            logger.debug(
                                'Could not update the warnings message after clearing roles:',
                                editError
                            );
                        }
                    } catch (error) {
                        logger.error(
                            `Failed while clearing warning roles for ${target.tag}:`,
                            {
                                userId:
                                    target.id,

                                guildId,

                                moderatorId:
                                    interaction.user.id,

                                error,
                            }
                        );

                        await buttonInteraction
                            .editReply({
                                content:
                                    '❌ I could not remove the warning roles from this user.',

                                embeds: [],
                                components: [],
                            })
                            .catch(
                                () => {}
                            );
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
        } catch (
            collectorError
        ) {
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