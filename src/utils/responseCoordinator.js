import { buildUserErrorEmbed } from './embeds.js';

function getCommandJson(commandData) {
    if (commandData?.data) {
        return commandData.data?.toJSON
            ? commandData.data.toJSON()
            : commandData.data;
    }

    return commandData?.toJSON
        ? commandData.toJSON()
        : commandData;
}

export function buildPrefixUsage(
    prefix,
    commandData,
    validation,
) {
    const commandJson =
        getCommandJson(commandData);

    const usageParts = [
        `${prefix}${commandJson?.name || ''}`,
    ];

    if (commandData?.usage) {
        usageParts.push(
            commandData.usage,
        );

        return usageParts
            .filter(Boolean)
            .join(' ');
    }

    if (validation?.subcommandGroupName) {
        usageParts.push(
            validation.subcommandGroupName,
        );
    }

    if (validation?.subcommandName) {
        usageParts.push(
            validation.subcommandName,
        );
    } else if (
        !validation?.subcommandGroupName &&
        commandJson?.options?.some(
            option =>
                option.type === 1,
        )
    ) {
        usageParts.push(
            '[subcommand]',
        );
    }

    for (
        const option
        of validation?.optionDefs || []
    ) {
        usageParts.push(
            `[${option.name}]`,
        );
    }

    return usageParts
        .filter(Boolean)
        .join(' ');
}

export class ResponseCoordinator {
    constructor(
        interaction,
        {
            message = null,
        } = {},
    ) {
        this.interaction =
            interaction;

        this.message =
            message;

        this._replyMessage =
            null;

        this._finalized =
            false;

        this._finalizedReason =
            null;
    }

    // ============================================================
    // ATTACH
    // ============================================================

    static attach(
        interaction,
        options = {},
    ) {
        if (!interaction) {
            return null;
        }

        if (
            interaction._responseCoordinator
        ) {
            return interaction._responseCoordinator;
        }

        const coordinator =
            new ResponseCoordinator(
                interaction,
                options,
            );

        interaction._responseCoordinator =
            coordinator;

        return coordinator;
    }

    // ============================================================
    // TYPE HELPERS
    // ============================================================

    isPrefixInteraction() {
        return Boolean(
            this.interaction?._isPrefixCommand
        );
    }

    isDiscordInteraction() {
        return !this.isPrefixInteraction();
    }

    // ============================================================
    // RESPONSE STATE
    // ============================================================

    hasResponded() {
        if (
            this.isPrefixInteraction()
        ) {
            return Boolean(
                this._replyMessage ||
                this.interaction?._replyMessage ||
                this.interaction?.replied
            );
        }

        return Boolean(
            this.interaction?.replied
        );
    }

    hasBeenAcknowledged() {
        if (
            this.isPrefixInteraction()
        ) {
            return Boolean(
                this.interaction?.deferred ||
                this.hasResponded()
            );
        }

        return Boolean(
            this.interaction?.deferred ||
            this.interaction?.replied
        );
    }

    isUsageFinalized() {
        return (
            this._finalizedReason ===
            'usage'
        );
    }

    markFinalized(
        reason,
    ) {
        this._finalized =
            true;

        this._finalizedReason =
            reason;

        /*
         * A finalized response means that the interaction should
         * be treated as having a response already.
         *
         * This is particularly important for prefix commands,
         * where there is no native Discord interaction state.
         */
        if (
            this.interaction
        ) {
            this.interaction.replied =
                true;
        }
    }

    // ============================================================
    // REPLY MESSAGE
    // ============================================================

    getReplyMessage() {
        return (
            this._replyMessage ||
            this.interaction?._replyMessage ||
            null
        );
    }

    setReplyMessage(
        message,
    ) {
        this._replyMessage =
            message;

        if (
            this.interaction
        ) {
            this.interaction._replyMessage =
                message;

            this.interaction.replied =
                true;

            this.interaction.deferred =
                false;
        }

        return message;
    }

    // ============================================================
    // PREFIX DEFER
    // ============================================================

    async deferLocal() {
        if (
            this.interaction
        ) {
            this.interaction.deferred =
                true;
        }

        return true;
    }

    // ============================================================
    // PREFIX SEND
    // ============================================================

    async sendPrefixPayload(
        payload,
    ) {
        if (
            !this.message?.channel
        ) {
            throw new Error(
                'Prefix command has no message channel.',
            );
        }

        const sent =
            await this.message.channel.send(
                payload,
            );

        this.setReplyMessage(
            sent,
        );

        return sent;
    }

    // ============================================================
    // PREFIX EDIT
    // ============================================================

    async editPrefixMessage(
        payload,
    ) {
        const existing =
            this.getReplyMessage();

        if (
            existing &&
            typeof existing.edit ===
                'function'
        ) {
            try {
                const edited =
                    await existing.edit(
                        payload,
                    );

                this.setReplyMessage(
                    edited,
                );

                return edited;
            } catch {
                /*
                 * If the old response cannot be edited, send a new
                 * message instead.
                 */
            }
        }

        return this.sendPrefixPayload(
            payload,
        );
    }

    // ============================================================
    // RESPOND
    // ============================================================

    async respond(
        payload,
    ) {
        if (
            this.isUsageFinalized()
        ) {
            return this.getReplyMessage();
        }

        // --------------------------------------------------------
        // PREFIX COMMAND
        // --------------------------------------------------------

        if (
            this.isPrefixInteraction()
        ) {
            const existing =
                this.getReplyMessage();

            if (existing) {
                return this.editPrefixMessage(
                    payload,
                );
            }

            return this.sendPrefixPayload(
                payload,
            );
        }

        // --------------------------------------------------------
        // DISCORD INTERACTION
        // --------------------------------------------------------

        if (
            !this.interaction
        ) {
            throw new Error(
                'Cannot respond: interaction is missing.',
            );
        }

        if (
            this.interaction.deferred &&
            !this.interaction.replied
        ) {
            return this.interaction.editReply(
                payload,
            );
        }

        if (
            this.interaction.replied
        ) {
            return this.interaction.followUp(
                payload,
            );
        }

        return this.interaction.reply(
            payload,
        );
    }

    // ============================================================
    // EDIT
    // ============================================================

    async edit(
        payload,
    ) {
        if (
            this.isUsageFinalized()
        ) {
            return this.getReplyMessage();
        }

        // --------------------------------------------------------
        // PREFIX
        // --------------------------------------------------------

        if (
            this.isPrefixInteraction()
        ) {
            return this.editPrefixMessage(
                payload,
            );
        }

        // --------------------------------------------------------
        // DISCORD INTERACTION
        // --------------------------------------------------------

        if (
            !this.interaction
        ) {
            throw new Error(
                'Cannot edit response: interaction is missing.',
            );
        }

        if (
            this.interaction.deferred ||
            this.interaction.replied
        ) {
            return this.interaction.editReply(
                payload,
            );
        }

        return this.interaction.reply(
            payload,
        );
    }

    // ============================================================
    // FOLLOW UP
    // ============================================================

    async followUp(
        payload,
    ) {
        if (
            this.isPrefixInteraction()
        ) {
            if (
                !this.message?.channel
            ) {
                throw new Error(
                    'Prefix command has no message channel.',
                );
            }

            return this.message.channel.send(
                payload,
            );
        }

        if (
            !this.interaction
        ) {
            throw new Error(
                'Cannot follow up: interaction is missing.',
            );
        }

        return this.interaction.followUp(
            payload,
        );
    }

    // ============================================================
    // DELETE REPLY
    // ============================================================

    async deleteReply() {
        const existing =
            this.getReplyMessage();

        if (
            existing &&
            existing.deletable
        ) {
            await existing.delete();
        }

        this._replyMessage =
            null;

        if (
            this.interaction
        ) {
            this.interaction._replyMessage =
                null;

            this.interaction.replied =
                false;
        }

        return null;
    }

    // ============================================================
    // USAGE RESPONSE
    // ============================================================

    async respondUsage(
        usageLine,
    ) {
        const embed =
            buildUserErrorEmbed(
                'validation',
                `Usage\n\`${usageLine}\``,
                {
                    titleOverride:
                        'Wrong Usage',
                },
            );

        const result =
            await this.respond({
                embeds: [embed],
            });

        this.markFinalized(
            'usage',
        );

        return result;
    }

    // ============================================================
    // COMMAND USAGE RESPONSE
    // ============================================================

    async respondUsageFromCommand(
        prefix,
        commandData,
        validation,
    ) {
        const usageLine =
            buildPrefixUsage(
                prefix,
                commandData,
                validation,
            );

        return this.respondUsage(
            usageLine,
        );
    }
}