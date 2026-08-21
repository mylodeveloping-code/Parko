import {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    MessageFlags,
} from 'discord.js';

import {
    successEmbed,
} from '../utils/embeds.js';

import {
    WarningService,
} from '../services/moderation/warningService.js';

import {
    InteractionHelper,
} from '../utils/interactionHelper.js';

import {
    logger,
} from '../utils/logger.js';

import {
    replyUserError,
    ErrorTypes,
} from '../utils/errorHandler.js';

// ============================================================
// WARNING ROLE IDS
// ============================================================

const WARNING_ROLE_IDS = [
    // Warning 1
    '1537643745720148018',

    // Warning 2
    '1533577410367455242',

    // Warning 3
    '1536917870087376936',
];

// ============================================================
// REMOVE ALL WARNING ROLES
// ============================================================

async function removeAllWarningRoles(
    guild,
    userId,
    moderatorId
) {
    if (
        !guild ||
        !userId
    ) {
        return {
            success: false,
            removed: [],
        };
    }

    let member;

    try {
        member =
            await guild.members.fetch(
                userId
            );
    } catch (error) {
        /*
         * The user may have left the server.
         * There are no roles to remove in that case.
         */
        if (
            error?.code === 10007
        ) {
            logger.info(
                `User ${userId} is no longer in ${guild.name}; no warning roles to remove.`
            );

            return {
                success: true,
                removed: [],
            };
        }

        logger.error(
            `Failed to fetch ${userId} while removing warning roles:`,
            error
        );

        return {
            success: false,
            removed: [],
        };
    }

    const removed = [];

    // ========================================================
    // REMOVE WARNING 1, WARNING 2, AND WARNING 3 ROLES
    // ========================================================

    for (
        const roleId of WARNING_ROLE_IDS
    ) {
        try {
            if (
                !member.roles.cache.has(
                    roleId
                )
            ) {
                continue;
            }

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
                    `Warning role ${roleId} could not be found in guild ${guild.id}.`
                );

                continue;
            }

            if (
                !role.editable
            ) {
                logger.error(
                    `Cannot remove warning role ${roleId} from ${member.user.tag}: the role is not editable by the bot.`
                );

                continue;
            }

            await member.roles.remove(
                role,
                `All warnings cleared by moderator ${moderatorId}`
            );

            removed.push(
                roleId
            );

            logger.info(
                `Removed warning role ${roleId} from ${member.user.tag}.`,
                {
                    userId:
                        userId,

                    guildId:
                        guild.id,

                    moderatorId:
                        moderatorId,
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
        removed,
    };
}

// ============================================================
// DELETE SPECIFIC WARNING BUTTON
// ============================================================

const warningDeleteSpecificHandler = {
    name:
        'warning_delete_specific',

    async execute(
        interaction,
        client
    ) {
        try {
            const [
                ,
                targetUserId,
                originalModeratorId,
            ] =
                interaction.customId.split(
                    ':'
                );

            if (
                interaction.user.id !==
                originalModeratorId
            ) {
                return await replyUserError(
                    interaction,
                    {
                        type:
                            ErrorTypes.PERMISSION,

                        message:
                            'Only the moderator who viewed these warnings can delete them.',
                    }
                );
            }

            const modal =
                new ModalBuilder()
                    .setCustomId(
                        `warning_delete_modal:${targetUserId}:${interaction.user.id}`
                    )
                    .setTitle(
                        'Delete Warning'
                    );

            const warningNumberInput =
                new TextInputBuilder()
                    .setCustomId(
                        'warning_number'
                    )
                    .setLabel(
                        'Warning Number (#1, #2, etc.)'
                    )
                    .setPlaceholder(
                        'Enter the warning number to delete'
                    )
                    .setRequired(
                        true
                    )
                    .setStyle(
                        TextInputStyle.Short
                    )
                    .setMaxLength(
                        10
                    );

            const actionRow =
                new ActionRowBuilder()
                    .addComponents(
                        warningNumberInput
                    );

            modal.addComponents(
                actionRow
            );

            await interaction.showModal(
                modal
            );
        } catch (error) {
            logger.error(
                'Warning delete specific button error:',
                error
            );

            await replyUserError(
                interaction,
                {
                    type:
                        ErrorTypes.UNKNOWN,

                    message:
                        'Failed to open delete warning modal.',
                }
            );
        }
    },
};

// ============================================================
// CLEAR ALL WARNINGS BUTTON
// ============================================================

const warningClearAllHandler = {
    name:
        'warning_clear_all',

    async execute(
        interaction,
        client
    ) {
        try {
            const [
                ,
                targetUserId,
                originalModeratorId,
            ] =
                interaction.customId.split(
                    ':'
                );

            if (
                interaction.user.id !==
                originalModeratorId
            ) {
                return await replyUserError(
                    interaction,
                    {
                        type:
                            ErrorTypes.PERMISSION,

                        message:
                            'Only the moderator who viewed these warnings can clear them.',
                    }
                );
            }

            const targetUser =
                await client.users.fetch(
                    targetUserId
                ).catch(
                    () => null
                );

            const targetName =
                targetUser
                    ? targetUser.username
                    : 'this user';

            const clearModal =
                new ModalBuilder()
                    .setCustomId(
                        `warning_clear_confirm_modal:${targetUserId}:${interaction.user.id}`
                    )
                    .setTitle(
                        'Clear All Warnings'
                    )
                    .addComponents(
                        new ActionRowBuilder()
                            .addComponents(
                                new TextInputBuilder()
                                    .setCustomId(
                                        'delete_confirmation'
                                    )
                                    .setLabel(
                                        'Type "DELETE" to clear all warnings'
                                    )
                                    .setStyle(
                                        TextInputStyle.Short
                                    )
                                    .setPlaceholder(
                                        'DELETE'
                                    )
                                    .setMaxLength(
                                        6
                                    )
                                    .setMinLength(
                                        6
                                    )
                                    .setRequired(
                                        true
                                    )
                            )
                    );

            await interaction.showModal(
                clearModal
            );
        } catch (error) {
            logger.error(
                'Warning clear all button error:',
                error
            );

            await replyUserError(
                interaction,
                {
                    type:
                        ErrorTypes.UNKNOWN,

                    message:
                        'Failed to open confirmation modal.',
                }
            );
        }
    },
};

// ============================================================
// DELETE SPECIFIC WARNING MODAL
// ============================================================

async function warningDeleteModalHandler(
    interaction,
    client
) {
    try {
        const [
            ,
            targetUserId,
            originalModeratorId,
        ] =
            interaction.customId.split(
                ':'
            );

        if (
            interaction.user.id !==
            originalModeratorId
        ) {
            return await replyUserError(
                interaction,
                {
                    type:
                        ErrorTypes.PERMISSION,

                    message:
                        'Only the original moderator can delete warnings.',
                }
            );
        }

        const warningNumberInput =
            interaction.fields.getTextInputValue(
                'warning_number'
            );

        const warningNumber =
            parseInt(
                warningNumberInput
                    .replace(
                        '#',
                        ''
                    )
                    .trim(),
                10
            );

        if (
            isNaN(
                warningNumber
            ) ||
            warningNumber < 1
        ) {
            return await replyUserError(
                interaction,
                {
                    type:
                        ErrorTypes.VALIDATION,

                    message:
                        'Please enter a valid warning number (e.g., 1, 2, 3).',
                }
            );
        }

        const deferSuccess =
            await InteractionHelper.safeDefer(
                interaction
            );

        if (
            !deferSuccess
        ) {
            return;
        }

        const guildId =
            interaction.guildId;

        const warnings =
            await WarningService.getWarnings(
                guildId,
                targetUserId
            );

        if (
            warningNumber >
            warnings.length
        ) {
            return await replyUserError(
                interaction,
                {
                    type:
                        ErrorTypes.USER_INPUT,

                    message:
                        `Warning #${warningNumber} does not exist. This user only has ${warnings.length} warning(s).`,
                }
            );
        }

        const warningToDelete =
            warnings[
                warningNumber - 1
            ];

        await WarningService.removeWarning(
            guildId,
            targetUserId,
            warningToDelete.id
        );

        const targetUser =
            await client.users.fetch(
                targetUserId
            ).catch(
                () => null
            );

        const targetName =
            targetUser
                ? targetUser.username
                : 'the user';

        logger.info(
            `[MODERATION] Warning deleted for ${targetUserId} in ${guildId} by ${interaction.user.id}`,
            {
                warningId:
                    warningToDelete.id,

                reason:
                    warningToDelete.reason,

                warningNumber,
            }
        );

        await interaction.editReply({
            embeds: [
                successEmbed(
                    '✅ Warning Deleted',
                    `Warning #${warningNumber} for **${targetName}** has been deleted.\n\n**Reason was:** ${warningToDelete.reason.substring(0, 100)}`
                ),
            ],
        });
    } catch (error) {
        logger.error(
            'Warning delete modal handler error:',
            error
        );

        await replyUserError(
            interaction,
            {
                type:
                    ErrorTypes.UNKNOWN,

                message:
                    'Failed to delete warning.',
            }
        );
    }
}

// ============================================================
// CLEAR ALL WARNINGS CONFIRMATION MODAL
// ============================================================

async function warningClearConfirmModalHandler(
    interaction,
    client
) {
    try {
        const [
            ,
            targetUserId,
            originalModeratorId,
        ] =
            interaction.customId.split(
                ':'
            );

        if (
            interaction.user.id !==
            originalModeratorId
        ) {
            return await replyUserError(
                interaction,
                {
                    type:
                        ErrorTypes.PERMISSION,

                    message:
                        'Only the original moderator can clear warnings.',
                }
            );
        }

        const confirmation =
            interaction.fields
                .getTextInputValue(
                    'delete_confirmation'
                )
                .trim();

        if (
            confirmation !==
            'DELETE'
        ) {
            return await replyUserError(
                interaction,
                {
                    type:
                        ErrorTypes.UNKNOWN,

                    message:
                        'You must type "DELETE" exactly to confirm clearing all warnings.',
                }
            );
        }

        await interaction.deferReply({
            flags:
                MessageFlags.Ephemeral,
        });

        const guild =
            interaction.guild;

        const guildId =
            interaction.guildId;

        // ========================================================
        // CLEAR WARNINGS FROM DATABASE
        // ========================================================

        const {
            count,
        } =
            await WarningService.clearWarnings(
                guildId,
                targetUserId
            );

        // ========================================================
        // REMOVE WARNING ROLES
        // ========================================================

        const roleResult =
            await removeAllWarningRoles(
                guild,
                targetUserId,
                interaction.user.id
            );

        // ========================================================
        // GET TARGET NAME
        // ========================================================

        const targetUser =
            await client.users.fetch(
                targetUserId
            ).catch(
                () => null
            );

        const targetName =
            targetUser
                ? targetUser.username
                : 'the user';

        // ========================================================
        // LOG
        // ========================================================

        logger.info(
            `[MODERATION] All warnings cleared for ${targetUserId} in ${guildId} by ${interaction.user.id}`,
            {
                warningCount:
                    count,

                removedWarningRoles:
                    roleResult.removed,

                warningRoleRemovalSuccess:
                    roleResult.success,
            }
        );

        // ========================================================
        // RESPONSE
        // ========================================================

        if (
            roleResult.success
        ) {
            await interaction.editReply({
                embeds: [
                    successEmbed(
                        '✅ Warnings Cleared',
                        `All warnings for **${targetName}** have been cleared. **${count}** warning(s) removed.`
                    ),
                ],
            });
        } else {
            await interaction.editReply({
                embeds: [
                    successEmbed(
                        '⚠️ Warnings Cleared',
                        `All warnings for **${targetName}** have been cleared. **${count}** warning(s) removed.\n\n⚠️ I could not remove one or more warning roles. Check that the bot's highest role is above the Warning 1, Warning 2, and Warning 3 roles.`
                    ),
                ],
            });
        }
    } catch (error) {
        logger.error(
            'Warning clear confirm modal handler error:',
            error
        );

        if (
            !interaction.replied &&
            !interaction.deferred
        ) {
            await replyUserError(
                interaction,
                {
                    type:
                        ErrorTypes.UNKNOWN,

                    message:
                        'Failed to clear warnings.',
                }
            );
        } else {
            await replyUserError(
                interaction,
                {
                    type:
                        ErrorTypes.UNKNOWN,

                    message:
                        'Failed to clear warnings.',
                }
            );
        }
    }
}

// ============================================================
// EXPORTS
// ============================================================

export {
    warningDeleteSpecificHandler,
    warningClearAllHandler,
    warningDeleteModalHandler,
    warningClearConfirmModalHandler,
};

export default {
    name:
        'warning_delete_modal',

    execute:
        warningDeleteModalHandler,
};