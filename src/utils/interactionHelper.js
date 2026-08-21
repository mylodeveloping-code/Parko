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
    return INTERACTION_UNAVAILABLE_CODES.has(
        error?.code,
    );
}

function sanitizeEditReplyOptions(options = {}) {
    if (
        !options ||
        typeof options !== 'object'
    ) {
        return options;
    }

    const {
        flags,
        ephemeral,
        ...rest
    } = options;

    if (
        flags &&
        (flags & MessageFlags.IsComponentsV2)
    ) {
        rest.flags =
            MessageFlags.IsComponentsV2;
    }

    return rest;
}

export class InteractionHelper {
    static getCoordinator(interaction) {
        return (
            interaction?._responseCoordinator ||
            null
        );
    }

    /*
     * IMPORTANT:
     *
     * Native Discord interactions are no longer patched.
     *
     * Prefix commands use ResponseCoordinator directly.
     * Slash commands use Discord.js directly.
     */
    static patchInteractionResponses() {
        return;
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

        if (
            !interaction.user ||
            typeof interaction.user !== 'object'
        ) {
            return false;
        }

        if (
            interaction.createdTimestamp &&
            Date.now() -
                interaction.createdTimestamp >
                INTERACTION_TIMEOUT_MS
        ) {
            return false;
        }

        return true;
    }

    static async ensureReady(
        interaction,
        deferOptions = {
            flags: MessageFlags.Ephemeral,
        },
    ) {
        if (
            !this.isInteractionValid(
                interaction,
            )
        ) {
            return false;
        }

        if (
            interaction.replied ||
            interaction.deferred
        ) {
            return true;
        }

        if (
            interaction._isPrefixCommand
        ) {
            const coordinator =
                this.getCoordinator(
                    interaction,
                ) ||
                ResponseCoordinator.attach(
                    interaction,
                );

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
                interaction.deferred ||
                interaction.replied
            ) {
                return true;
            }

            if (
                !this.isInteractionValid(
                    interaction,
                )
            ) {
                logger.warn(
                    `Interaction ${interaction.id} is invalid before defer.`,
                );

                return false;
            }

            if (
                interaction._isPrefixCommand
            ) {
                const coordinator =
                    this.getCoordinator(
                        interaction,
                    ) ||
                    ResponseCoordinator.attach(
                        interaction,
                    );

                return coordinator.deferLocal();
            }

            await interaction.deferReply(
                options,
            );

            return true;
        } catch (error) {
            if (
                isInteractionUnavailableError(
                    error,
                )
            ) {
                logger.warn(
                    `Interaction ${interaction.id} unavailable during defer:`,
                    error.message,
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

    static async safeEditReply(
        interaction,
        options,
    ) {
        try {
            if (
                !this.isInteractionValid(
                    interaction,
                )
            ) {
                return false;
            }

            const coordinator =
                this.getCoordinator(
                    interaction,
                );

            if (
                interaction._isPrefixCommand
            ) {
                if (!coordinator) {
                    return this.safeReply(
                        interaction,
                        options,
                    );
                }

                await coordinator.edit(
                    sanitizeEditReplyOptions(
                        options,
                    ),
                );

                return true;
            }

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {
                return this.safeReply(
                    interaction,
                    options,
                );
            }

            await interaction.editReply(
                sanitizeEditReplyOptions(
                    options,
                ),
            );

            return true;
        } catch (error) {
            if (
                isInteractionUnavailableError(
                    error,
                )
            ) {
                logger.warn(
                    `Interaction ${interaction.id} unavailable during edit:`,
                    error.message,
                );

                return false;
            }

            if (
                error?.code === 10008
            ) {
                try {
                    await interaction.followUp(
                        options,
                    );

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
                'Failed to edit reply:',
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
            if (
                !this.isInteractionValid(
                    interaction,
                )
            ) {
                return false;
            }

            const coordinator =
                this.getCoordinator(
                    interaction,
                );

            if (
                interaction._isPrefixCommand
            ) {
                if (!coordinator) {
                    return false;
                }

                if (
                    coordinator.hasResponded()
                ) {
                    await coordinator.edit(
                        sanitizeEditReplyOptions(
                            options,
                        ),
                    );
                } else {
                    await coordinator.respond(
                        options,
                    );
                }

                return true;
            }

            if (
                interaction.deferred &&
                !interaction.replied
            ) {
                await interaction.editReply(
                    sanitizeEditReplyOptions(
                        options,
                    ),
                );

                return true;
            }

            if (interaction.replied) {
                await interaction.followUp(
                    options,
                );

                return true;
            }

            await interaction.reply(
                options,
            );

            return true;
        } catch (error) {
            if (
                isInteractionUnavailableError(
                    error,
                )
            ) {
                return false;
            }

            if (
                error?.code === 40060
            ) {
                return false;
            }

            logger.error(
                'Failed to reply:',
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
            if (
                !this.isInteractionValid(
                    interaction,
                )
            ) {
                return false;
            }

            if (
                interaction.replied ||
                interaction.deferred
            ) {
                logger.warn(
                    `Interaction ${interaction.id} already acknowledged; cannot show modal.`,
                );

                return false;
            }

            await interaction.showModal(
                modal,
            );

            return true;
        } catch (error) {
            if (
                isInteractionUnavailableError(
                    error,
                )
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

    static async safeExecute(
        interaction,
        commandFunction,
        errorEmbed,
        options = {},
    ) {
        const autoDeferDefault =
            !interaction._isPrefixCommand;

        const {
            autoDefer = autoDeferDefault,
            deferOptions = {
                flags:
                    MessageFlags.Ephemeral,
            },
        } = options;

        if (
            !this.isInteractionValid(
                interaction,
            )
        ) {
            return;
        }

        const coordinator =
            this.getCoordinator(
                interaction,
            );

        if (
            autoDefer &&
            !interaction.replied &&
            !interaction.deferred
        ) {
            const deferSuccess =
                await this.safeDefer(
                    interaction,
                    deferOptions,
                );

            if (!deferSuccess) {
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
                typeof errorEmbed ===
                'string'
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

    static async universalReply(
        interaction,
        options,
    ) {
        const coordinator =
            this.getCoordinator(
                interaction,
            );

        if (
            interaction._isPrefixCommand
        ) {
            if (
                coordinator?.hasResponded()
            ) {
                return coordinator.edit(
                    sanitizeEditReplyOptions(
                        options,
                    ),
                );
            }

            if (coordinator) {
                return coordinator.respond(
                    options,
                );
            }

            return this.safeReply(
                interaction,
                options,
            );
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
            return this.safeReply(
                interaction,
                options,
            );
        }

        return this.safeReply(
            interaction,
            options,
        );
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
                    !interaction._isPrefixCommand,
            },
        );
    };

    return descriptor;
}