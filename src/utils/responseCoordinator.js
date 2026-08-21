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
        usageParts.push(commandData.usage);

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
            (option) => option.type === 1,
        )
    ) {
        usageParts.push('[subcommand]');
    }

    for (
        const option
        of validation?.optionDefs || []
    ) {
        usageParts.push(`[${option.name}]`);
    }

    return usageParts
        .filter(Boolean)
        .join(' ');
}

export class ResponseCoordinator {
    constructor(
        interaction,
        { message = null } = {},
    ) {
        this.interaction = interaction;
        this.message = message;
        this._replyMessage = null;
        this._finalized = false;
        this._finalizedReason = null;
    }

    static attach(
        interaction,
        options = {},
    ) {
        if (interaction._responseCoordinator) {
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

    isPrefixInteraction() {
        return Boolean(
            this.interaction._isPrefixCommand,
        );
    }

    hasResponded() {
        if (this.isPrefixInteraction()) {
            return Boolean(
                this._replyMessage ||
                this.interaction._replyMessage ||
                this.interaction.replied,
            );
        }

        return Boolean(
            this.interaction.replied ||
            this.interaction.deferred,
        );
    }

    isUsageFinalized() {
        return (
            this._finalizedReason ===
            'usage'
        );
    }

    markFinalized(reason) {
        this._finalized = true;
        this._finalizedReason = reason;
    }

    getReplyMessage() {
        return (
            this._replyMessage ||
            this.interaction._replyMessage ||
            null
        );
    }

    setReplyMessage(message) {
        this._replyMessage = message;

        this.interaction._replyMessage =
            message;

        this.interaction.replied = true;
    }

    async deferLocal() {
        if (this.isPrefixInteraction()) {
            this.interaction.deferred = true;
        }

        return true;
    }

    async sendPrefixPayload(payload) {
        if (!this.message?.channel) {
            throw new Error(
                'Prefix command has no message channel.',
            );
        }

        const sent =
            await this.message.channel.send(
                payload,
            );

        this.setReplyMessage(sent);

        return sent;
    }

    async respond(payload) {
        if (this.isUsageFinalized()) {
            return this.getReplyMessage();
        }

        if (this.isPrefixInteraction()) {
            const existing =
                this.getReplyMessage();

            if (existing) {
                return this.edit(payload);
            }

            return this.sendPrefixPayload(
                payload,
            );
        }

        if (
            this.interaction.deferred &&
            !this.interaction.replied
        ) {
            await this.interaction.editReply(
                payload,
            );

            return null;
        }

        if (this.interaction.replied) {
            return this.interaction.followUp(
                payload,
            );
        }

        await this.interaction.reply(
            payload,
        );

        return null;
    }

    async edit(payload) {
        if (this.isUsageFinalized()) {
            return this.getReplyMessage();
        }

        if (this.isPrefixInteraction()) {
            const existing =
                this.getReplyMessage();

            if (existing) {
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
                    return this.sendPrefixPayload(
                        payload,
                    );
                }
            }

            return this.sendPrefixPayload(
                payload,
            );
        }

        if (
            this.interaction.deferred ||
            this.interaction.replied
        ) {
            await this.interaction.editReply(
                payload,
            );

            return null;
        }

        return this.respond(payload);
    }

    async followUp(payload) {
        if (this.isPrefixInteraction()) {
            return this.message.channel.send(
                payload,
            );
        }

        return this.interaction.followUp(
            payload,
        );
    }

    async respondUsage(usageLine) {
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

        this.markFinalized('usage');

        return result;
    }

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