import {
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from 'discord.js';

import { logger } from '../utils/logger.js';
import { handleInteractionError } from '../utils/errorHandler.js';
import { getGuildMusicData } from '../services/music/playerStore.js';

import {
    getPlayer,
    buildQueueReply,
    destroyPlayerSession,
    setLoopMode,
    applyPause,
    applyResume,
} from '../services/music/musicActions.js';

import {
    canControlMusic,
    VOICE_CHANNEL_DENIAL,
} from '../services/music/permissions.js';

import {
    refreshPlayerMessage,
} from '../services/music/playerHandler.js';

import {
    MUSIC_BUTTON_IDS,
    MUSIC_MODAL_IDS,
    MUSIC_INPUT_IDS,
} from '../services/music/musicEmbeds.js';

import {
    replyUserError,
    ErrorTypes,
} from '../utils/errorHandler.js';

function parseSeekTime(input) {
    if (!input) {
        return null;
    }

    const value = input.trim().toLowerCase();

    // Plain number = seconds.
    if (/^\d+(?:\.\d+)?$/.test(value)) {
        const seconds = Number(value);

        if (!Number.isFinite(seconds) || seconds <= 0) {
            return null;
        }

        return seconds * 1000;
    }

    // Examples:
    // 30s
    // 2m
    // 1h
    // 1m 30s
    // 2h 5m 10s
    const pattern = /(\d+(?:\.\d+)?)\s*(h|m|s)/g;

    let totalMs = 0;
    let matched = false;
    let match;

    while ((match = pattern.exec(value)) !== null) {
        matched = true;

        const amount = Number(match[1]);
        const unit = match[2];

        if (!Number.isFinite(amount) || amount < 0) {
            return null;
        }

        if (unit === 'h') {
            totalMs += amount * 60 * 60 * 1000;
        } else if (unit === 'm') {
            totalMs += amount * 60 * 1000;
        } else if (unit === 's') {
            totalMs += amount * 1000;
        }
    }

    // MM:SS or HH:MM:SS.
    if (!matched && /^\d+(?::\d{1,2}){1,2}$/.test(value)) {
        const parts = value.split(':').map(Number);

        if (parts.some((part) => !Number.isFinite(part))) {
            return null;
        }

        if (parts.length === 2) {
            const [minutes, seconds] = parts;

            if (seconds >= 60) {
                return null;
            }

            totalMs =
                (minutes * 60 + seconds) * 1000;
        } else if (parts.length === 3) {
            const [hours, minutes, seconds] = parts;

            if (minutes >= 60 || seconds >= 60) {
                return null;
            }

            totalMs =
                (
                    hours * 60 * 60 +
                    minutes * 60 +
                    seconds
                ) * 1000;
        }

        matched = true;
    }

    return matched && totalMs > 0
        ? totalMs
        : null;
}

function getCurrentPosition(player) {
    const startTime =
        Number(player?._musicTrackStartTime);

    const startPosition =
        Number(player?._musicTrackStartPosition);

    const pausedAt =
        Number(player?._musicPausedAt);

    if (
        player?.paused &&
        Number.isFinite(pausedAt)
    ) {
        return Math.max(0, pausedAt);
    }

    if (
        Number.isFinite(startTime) &&
        Number.isFinite(startPosition)
    ) {
        return Math.max(
            0,
            startPosition +
                Math.max(
                    0,
                    Date.now() - startTime
                )
        );
    }

    const position =
        Number(player?.position);

    return Number.isFinite(position) &&
        position >= 0
        ? position
        : 0;
}

function updateSeekTiming(
    player,
    newPosition
) {
    player._musicTrackStartPosition =
        newPosition;

    player._musicTrackStartTime =
        Date.now();

    if (player.paused) {
        player._musicPausedAt =
            newPosition;
    } else {
        player._musicPausedAt = null;
    }
}

function buildSeekModal() {
    const modal =
        new ModalBuilder()
            .setCustomId(
                MUSIC_MODAL_IDS.SEEK
            )
            .setTitle(
                'Seek in Current Song'
            );

    const input =
        new TextInputBuilder()
            .setCustomId(
                MUSIC_INPUT_IDS.SEEK_AMOUNT
            )
            .setLabel(
                'How far forward should I skip?'
            )
            .setPlaceholder(
                'Examples: 30, 90s, 1:30, 2m 15s'
            )
            .setStyle(
                TextInputStyle.Short
            )
            .setRequired(true)
            .setMaxLength(20);

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            input
        )
    );

    return modal;
}

async function handleMusicButton(
    interaction,
    client
) {
    const customId =
        interaction.customId;

    // ========================================================
    // SEEK
    //
    // A Seek button must be acknowledged immediately.
    // Do not perform music/player work before opening the modal.
    // The actual validation and seek happen in the modal submit.
    // ========================================================

    if (
        customId ===
        MUSIC_BUTTON_IDS.SEEK
    ) {
        try {
            await interaction.showModal(
                buildSeekModal()
            );
        } catch (error) {
            logger.error(
                'Failed to open music seek modal:',
                error
            );

            // Only attempt another response if Discord has not
            // already accepted the modal interaction.
            if (
                !interaction.replied &&
                !interaction.deferred
            ) {
                await replyUserError(
                    interaction,
                    {
                        type:
                            ErrorTypes.INTERNAL,
                        message:
                            'I could not open the seek menu.',
                    }
                ).catch(() => {});
            }
        }

        return;
    }

    const player =
        getPlayer(
            client,
            interaction.guild.id
        );

    const guildData =
        getGuildMusicData(
            interaction.guild.id
        );

    if (
        customId ===
        MUSIC_BUTTON_IDS.QUEUE
    ) {
        if (!player?.current) {
            return replyUserError(
                interaction,
                {
                    type:
                        ErrorTypes.USER_INPUT,
                    message:
                        'Nothing is playing right now.',
                }
            );
        }

        if (
            !canControlMusic(
                interaction.member,
                player
            )
        ) {
            return replyUserError(
                interaction,
                {
                    type:
                        ErrorTypes.PERMISSION,
                    message:
                        VOICE_CHANNEL_DENIAL,
                }
            );
        }

        guildData.queuePages.set(
            interaction.user.id,
            0
        );

        const payload =
            buildQueueReply(
                client,
                interaction.guild.id,
                0
            );

        return interaction.reply({
            embeds:
                payload.embeds,
            components:
                payload.components,
            flags:
                MessageFlags.Ephemeral,
        });
    }

    const queuePaginationIds = [
        MUSIC_BUTTON_IDS.QUEUE_FIRST,
        MUSIC_BUTTON_IDS.QUEUE_PREV,
        MUSIC_BUTTON_IDS.QUEUE_NEXT,
        MUSIC_BUTTON_IDS.QUEUE_LAST,
    ];

    if (
        queuePaginationIds.includes(
            customId
        )
    ) {
        if (!player?.current) {
            return replyUserError(
                interaction,
                {
                    type:
                        ErrorTypes.USER_INPUT,
                    message:
                        'Nothing is playing right now.',
                }
            );
        }

        if (
            !canControlMusic(
                interaction.member,
                player
            )
        ) {
            return replyUserError(
                interaction,
                {
                    type:
                        ErrorTypes.PERMISSION,
                    message:
                        VOICE_CHANNEL_DENIAL,
                }
            );
        }

        await interaction.deferUpdate();

        const payload =
            buildQueueReply(
                client,
                interaction.guild.id,
                guildData.queuePages.get(
                    interaction.user.id
                ) || 0
            );

        const totalPages =
            payload.totalPages;

        let page =
            payload.page;

        switch (customId) {
            case MUSIC_BUTTON_IDS.QUEUE_FIRST:
                page = 0;
                break;

            case MUSIC_BUTTON_IDS.QUEUE_PREV:
                page = Math.max(
                    0,
                    page - 1
                );
                break;

            case MUSIC_BUTTON_IDS.QUEUE_NEXT:
                page = Math.min(
                    totalPages - 1,
                    page + 1
                );
                break;

            case MUSIC_BUTTON_IDS.QUEUE_LAST:
                page =
                    totalPages - 1;
                break;

            default:
                break;
        }

        guildData.queuePages.set(
            interaction.user.id,
            page
        );

        const updated =
            buildQueueReply(
                client,
                interaction.guild.id,
                page
            );

        return interaction.editReply({
            embeds:
                updated.embeds,
            components:
                updated.components,
        });
    }

    if (!player) {
        return replyUserError(
            interaction,
            {
                type:
                    ErrorTypes.USER_INPUT,
                message:
                    'No music is playing. Use `/play` first.',
            }
        );
    }

    if (
        !canControlMusic(
            interaction.member,
            player
        )
    ) {
        return replyUserError(
            interaction,
            {
                type:
                    ErrorTypes.PERMISSION,
                message:
                    VOICE_CHANNEL_DENIAL,
            }
        );
    }

    await interaction.deferUpdate();

    try {
        switch (customId) {
            case MUSIC_BUTTON_IDS.PAUSE:
                await applyPause(
                    client,
                    interaction.guild.id
                );
                break;

            case MUSIC_BUTTON_IDS.RESUME:
                await applyResume(
                    client,
                    interaction.guild.id
                );
                break;

            case MUSIC_BUTTON_IDS.SKIP:
                // Under track-loop, stop() would replay the same
                // track. Temporarily disable it so skip advances.
                if (
                    player.loop ===
                    'track'
                ) {
                    player.setLoop(
                        'none'
                    );
                }

                player.stop();
                break;

            case MUSIC_BUTTON_IDS.STOP:
                await destroyPlayerSession(
                    client,
                    interaction.guild.id,
                    player,
                    guildData
                );
                break;

            case MUSIC_BUTTON_IDS.SHUFFLE:
                if (
                    player.queue.length >
                    0
                ) {
                    player.queue.shuffle();

                    guildData.shuffle =
                        true;

                    await refreshPlayerMessage(
                        client,
                        interaction.guild.id
                    );
                }
                break;

            case MUSIC_BUTTON_IDS.LOOP: {
                const guildDataLoop =
                    getGuildMusicData(
                        interaction.guild.id
                    );

                const next =
                    guildDataLoop.loop ===
                    'none'
                        ? 'track'
                        : guildDataLoop.loop ===
                          'track'
                            ? 'queue'
                            : 'none';

                await setLoopMode(
                    client,
                    interaction,
                    next
                );

                break;
            }

            case MUSIC_BUTTON_IDS.VOL_DOWN:
                guildData.volume =
                    Math.max(
                        0,
                        guildData.volume - 10
                    );

                player.setVolume(
                    guildData.volume
                );

                await refreshPlayerMessage(
                    client,
                    interaction.guild.id
                );
                break;

            case MUSIC_BUTTON_IDS.VOL_UP:
                guildData.volume =
                    Math.min(
                        100,
                        guildData.volume + 10
                    );

                player.setVolume(
                    guildData.volume
                );

                await refreshPlayerMessage(
                    client,
                    interaction.guild.id
                );
                break;

            default:
                break;
        }
    } catch (error) {
        await handleInteractionError(
            interaction,
            error,
            {
                type: 'button',
                customId:
                    interaction.customId,
                handler: 'music',
            }
        );
    }
}

export const musicButtonHandler = {
    async execute(
        interaction,
        client
    ) {
        try {
            if (!client.riffy) {
                return replyUserError(
                    interaction,
                    {
                        type:
                            ErrorTypes.CONFIGURATION,
                        message:
                            'Music is unavailable — Lavalink is not configured.',
                    }
                );
            }

            await handleMusicButton(
                interaction,
                client
            );
        } catch (error) {
            await handleInteractionError(
                interaction,
                error,
                {
                    handler:
                        'musicButton',
                }
            );
        }
    },
};

export async function handleMusicSeekModal(
    interaction,
    client
) {
    if (
        interaction.customId !==
        MUSIC_MODAL_IDS.SEEK
    ) {
        return false;
    }

    const player =
        getPlayer(
            client,
            interaction.guild.id
        );

    if (!player?.current) {
        await replyUserError(
            interaction,
            {
                type:
                    ErrorTypes.USER_INPUT,
                message:
                    'Nothing is playing right now.',
            }
        );

        return true;
    }

    if (
        !canControlMusic(
            interaction.member,
            player
        )
    ) {
        await replyUserError(
            interaction,
            {
                type:
                    ErrorTypes.PERMISSION,
                message:
                    VOICE_CHANNEL_DENIAL,
            }
        );

        return true;
    }

    const input =
        interaction.fields.getTextInputValue(
            MUSIC_INPUT_IDS.SEEK_AMOUNT
        );

    const skipMs =
        parseSeekTime(input);

    if (!skipMs) {
        await replyUserError(
            interaction,
            {
                type:
                    ErrorTypes.USER_INPUT,
                message:
                    'Invalid time. Use something like `30`, `90s`, `1:30`, or `2m 15s`.',
            }
        );

        return true;
    }

    const duration =
        Number(
            player.current?.info?.length
        );

    const currentPosition =
        getCurrentPosition(
            player
        );

    if (
        !Number.isFinite(duration) ||
        duration <= 0
    ) {
        await replyUserError(
            interaction,
            {
                type:
                    ErrorTypes.USER_INPUT,
                message:
                    'I cannot seek in this track because its duration is unavailable.',
            }
        );

        return true;
    }

    const newPosition =
        Math.min(
            currentPosition +
                skipMs,
            Math.max(
                0,
                duration - 500
            )
        );

    if (
        newPosition <=
        currentPosition
    ) {
        await replyUserError(
            interaction,
            {
                type:
                    ErrorTypes.USER_INPUT,
                message:
                    'That would put the song at the end. Try a smaller amount.',
            }
        );

        return true;
    }

    try {
        await player.seek(
            newPosition
        );

        updateSeekTiming(
            player,
            newPosition
        );

        await interaction.reply({
            content:
                `⏩ Skipped forward **${Math.round(
                    skipMs / 1000
                )} seconds**.`,
            flags:
                MessageFlags.Ephemeral,
        });

        await refreshPlayerMessage(
            client,
            interaction.guild.id
        );

        return true;
    } catch (error) {
        logger.error(
            'Failed to seek music player:',
            error
        );

        await replyUserError(
            interaction,
            {
                type:
                    ErrorTypes.INTERNAL,
                message:
                    'I could not seek in the current song.',
            }
        );

        return true;
    }
}

export default musicButtonHandler;