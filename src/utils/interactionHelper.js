import { logger } from './logger.js';
import { MessageFlags } from 'discord.js';
import {
    handleInteractionError,
    createError,
    ErrorTypes,
} from './errorHandler.js';
import { ResponseCoordinator } from './responseCoordinator.js';

const INTERACTION_TIMEOUT_MS = 15 * 60 * 1000;

const INTERACTION_UNAVAILABLE_CODES = new Set([
    10062,
    40060,
    50027,
]);

function isInteractionUnavailableError(error) {
    return INTERACTION_UNAVAILABLE_CODES.has(error?.code);
}

function sanitizeEditReplyOptions(options = {}) {
    if (!options || typeof options !== 'object') {
        return options;
    }

    const {
        ephemeral,
        ...rest
    } = options;

    return rest;
}

export class InteractionHelper {
    static getCoordinator(interaction) {
        return interaction?._responseCoordinator || null;
    }

    static patchInteractionResponses(interaction) {
        if (
            !interaction ||
            interaction.__titanResponsePatched
        ) {
            return;
        }

        const originalReply =
            typeof interaction.reply === 'function'
                ? interaction.reply.bind(interaction)
                : null;

        const originalEditReply =
            typeof interaction.editReply === 'function'
                ? interaction.editReply.bind(interaction)
                : null;

        const originalFollowUp =
            typeof interaction.followUp === 'function'
                ? interaction.followUp.bind(interaction)
                : null;

        if (
            !originalReply ||
            !originalEditReply ||
            !originalFollowUp
        ) {
            return;
        }

        interaction.reply = async (options) => {
            if (
                interaction.deferred &&
                !interaction.replied
            ) {
                return originalEditReply(
                    sanitizeEditReplyOptions(options),
                );
            }

            if (interaction.replied) {
                return originalFollowUp(options);
            }

            return originalReply(options);
        };

        interaction.__titanResponsePatched = true;
    }

    static isInteractionValid(interaction) {
        if (
            !interaction ||
            typeof interaction !== 'object'
        ) {
            return false;
        }

        if (
            !interaction.id ||
            typeof interaction.id !== 'string'
        ) {
            return false;
        }

        if (!interaction.user) {
            return false;
        }

        if (
            interaction.createdTimestamp &&
            Date.now() - interaction.createdTimestamp >
                INTERACTION_TIMEOUT_MS
        ) {
            return false;
        }

        return true;
    }

    static async ensureReady(
        interaction,
        deferOptions = {},
    ) {
        if (!this.isInteractionValid(interaction)) {
            return false;
        }

        if (
            interaction.replied ||
            interaction.deferred
        ) {
            return true;
        }

        if (interaction._isPrefixCommand) {
            const coordinator =
                this.getCoordinator(interaction) ||
                ResponseCoordinator.attach(interaction);

            return coordinator.deferLocal();
        }

        return this.safeDefer(
            interaction,
            deferOptions,
        );
    }

    static async safeDefer(
        interaction,
        options = {},
    ) {
        try {
            if (
                interaction.replied ||
                interaction.deferred
            ) {
                return true;
            }

            if (!this.isInteractionValid(interaction)) {
                logger.warn(
                    `Interaction ${interaction?.id} is invalid before defer.`,
                );

                return false;
            }

            if (interaction._isPrefixCommand) {
                const coordinator =
                    this.getCoordinator(interaction) ||
                    ResponseCoordinator.attach(interaction);

                return coordinator.deferLocal();
            }

            await interaction.deferReply(options);

            return true;
        } catch (error) {
            if (
                isInteractionUnavailableError(error)
            ) {
                logger.warn(
                    `Interaction ${interaction?.id} unavailable during defer: ${error.message}`,
                );

                return false;
            }

            if (
                error?.name ===
                    'InteractionAlreadyReplied' ||
                error?.code === 40060
            ) {
                return true;
            }

            logger.error(
                'Failed to defer interaction:',
                error,
            );

            return false;
        }
    }

    static async safeReply(
        interaction,
        options,
    ) {
        try {
            if (!this.isInteractionValid(interaction)) {
                return false;
            }

            if (interaction._isPrefixCommand) {
                const coordinator =
                    this.getCoordinator(interaction) ||
                    ResponseCoordinator.attach(interaction);

                if (coordinator.hasResponded()) {
                    await coordinator.edit(
                        sanitizeEditReplyOptions(options),
                    );
                } else {
                    await coordinator.respond(options);
                }

                return true;
            }

            if (
                interaction.deferred &&
                !interaction.replied
            ) {
                await interaction.editReply(
                    sanitizeEditReplyOptions(options),
                );

                return true;
            }

            if (interaction.replied) {
                await interaction.followUp(options);

                return true;
            }

            await interaction.reply(options);

            return true;
        } catch (error) {
            if (
                isInteractionUnavailableError(error)
            ) {
                logger.warn(
                    `Interaction ${interaction?.id} unavailable during reply: ${error.message}`,
                );

                return false;
            }

            logger.error(
                'Failed to send interaction reply:',
                error,
            );

            return false;
        }
    }

    static async safeEditReply(
        interaction,
        options,
    ) {
        try {
            if (!this.isInteractionValid(interaction)) {
                return false;
            }

            if (interaction._isPrefixCommand) {
                const coordinator =
                    this.getCoordinator(interaction) ||
                    ResponseCoordinator.attach(interaction);

                await coordinator.edit(
                    sanitizeEditReplyOptions(options),
                );

                return true;
            }

            if (
                !interaction.deferred &&
                !interaction.replied
            ) {
                return this.safeReply(
                    interaction,
                    options,
                );
            }

            await interaction.editReply(
                sanitizeEditReplyOptions(options),
            );

            return true;
        } catch (error) {
            if (
                isInteractionUnavailableError(error)
            ) {
                return false;
            }

            if (error?.code === 10008) {
                try {
                    await interaction.followUp(options);
                    return true;
                } catch {
                    return false;
                }
            }

            if (
                error?.name ===
                    'InteractionNotReplied' ||
                error?.message?.includes(
                    'not been sent or deferred',
                )
            ) {
                return this.safeReply(
                    interaction,
                    options,
                );
            }

            logger.error(
                'Failed to edit interaction reply:',
                error,
            );

            return false;
        }
    }

    static async safeShowModal(
        interaction,
        modal,
    ) {
        try {
            if (!this.isInteractionValid(interaction)) {
                return false;
            }

            if (
                interaction.replied ||
                interaction.deferred
            ) {
                logger.warn(
                    `Interaction ${interaction.id} was already acknowledged; cannot show modal.`,
                );

                return false;
            }

            await interaction.showModal(modal);

            return true;
        } catch (error) {
            if (
                isInteractionUnavailableError(error)
            ) {
                return false;
            }

            logger.error(
                'Failed to show modal:',
                error,
            );

            return false;
        }
    }

    static async universalReply(
        interaction,
        options,
    ) {
        if (interaction._isPrefixCommand) {
            const coordinator =
                this.getCoordinator(interaction) ||
                ResponseCoordinator.attach(interaction);

            if (coordinator.hasResponded()) {
                await coordinator.edit(
                    sanitizeEditReplyOptions(options),
                );
            } else {
                await coordinator.respond(options);
            }

            return true;
        }

        if (
            interaction.deferred &&
            !interaction.replied
        ) {
            return this.safeEditReply(
                interaction,
                options,
            );
        }

        if (interaction.replied) {
            try {
                await interaction.followUp(options);
                return true;
            } catch {
                return false;
            }
        }

        return this.safeReply(
            interaction,
            options,
        );
    }

    static async safeExecute(
        interaction,
        commandFunction,
        errorEmbed,
        options = {},
    ) {
        const {
            autoDefer = !interaction?._isPrefixCommand,
            deferOptions = {},
        } = options;

        if (!this.isInteractionValid(interaction)) {
            return;
        }

        if (
            autoDefer &&
            !interaction.replied &&
            !interaction.deferred
        ) {
            const deferred =
                await this.safeDefer(
                    interaction,
                    deferOptions,
                );

            if (!deferred) {
                logger.warn(
                    `Interaction ${interaction.id} could not be acknowledged.`,
                );

                return;
            }
        }

        try {
            await commandFunction();
        } catch (error) {
            logger.error(
                'Error executing command:',
                error,
            );

            const errorToHandle =
                typeof errorEmbed === 'string'
                    ? createError(
                          error.message ||
                              'Command failed',
                          ErrorTypes.UNKNOWN,
                          errorEmbed,
                          {
                              expected: true,
                          },
                      )
                    : error;

            await handleInteractionError(
                interaction,
                errorToHandle,
                {
                    source:
                        'interactionHelper.safeExecute',
                },
            );
        }
    }
}

export function withSafeExecuteDecorator(
    target,
    propertyName,
    descriptor,
) {
    const originalMethod =
        descriptor.value;

    descriptor.value = async function (
        interaction,
        config,
        client,
    ) {
        await InteractionHelper.safeExecute(
            interaction,
            () =>
                originalMethod.call(
                    this,
                    interaction,
                    config,
                    client,
                ),
            null,
            {
                autoDefer:
                    !interaction?._isPrefixCommand,
            },
        );
    };

    return descriptor;
}