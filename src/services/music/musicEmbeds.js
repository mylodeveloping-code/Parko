import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPaginationRow } from '../../utils/components.js';

const QUEUE_PAGE_SIZE = 10;

export const MUSIC_BUTTON_IDS = {
    PAUSE: 'music_pause',
    RESUME: 'music_resume',
    SKIP: 'music_skip',
    SEEK: 'music_seek',
    STOP: 'music_stop',
    SHUFFLE: 'music_shuffle',
    LOOP: 'music_loop',
    VOL_DOWN: 'music_vol_down',
    VOL_UP: 'music_vol_up',
    QUEUE: 'music_queue',
    QUEUE_FIRST: 'music_queue_first',
    QUEUE_PREV: 'music_queue_prev',
    QUEUE_NEXT: 'music_queue_next',
    QUEUE_LAST: 'music_queue_last',
};

export const MUSIC_MODAL_IDS = {
    SEEK: 'music_seek_modal',
};

export const MUSIC_INPUT_IDS = {
    SEEK_AMOUNT: 'music_seek_amount',
};

export function formatDuration(ms) {
    if (!ms || Number.isNaN(ms)) {
        return 'Live';
    }

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getTrackArtwork(track) {
    return track?.info?.artworkUrl || track?.info?.thumbnail || null;
}

function getLoopLabel(loop) {
    switch (loop) {
        case 'track':
            return 'Track';
        case 'queue':
            return 'Queue';
        default:
            return 'Off';
    }
}

function getDisplayedPosition(player) {
    const lavalinkPosition = Number(player?.position);

    const startTime = Number(player?._musicTrackStartTime);
    const startPosition = Number(player?._musicTrackStartPosition);

    if (!Number.isFinite(startTime) || !Number.isFinite(startPosition)) {
        return Number.isFinite(lavalinkPosition) && lavalinkPosition >= 0
            ? lavalinkPosition
            : 0;
    }

    if (player?.paused) {
        const pausedAt = Number(player?._musicPausedAt);

        if (Number.isFinite(pausedAt)) {
            return Math.max(0, pausedAt);
        }

        return Math.max(0, startPosition);
    }

    const elapsed = Date.now() - startTime;
    const calculatedPosition = startPosition + Math.max(0, elapsed);

    const duration = Number(player?.current?.info?.length);

    if (Number.isFinite(duration) && duration > 0) {
        return Math.min(calculatedPosition, duration);
    }

    return calculatedPosition;
}

export function buildNowPlayingEmbed(track, player, guildData) {
    const requester = track?.info?.requester;

    const requesterLabel = requester
        ? (requester.username || requester.tag || 'Unknown')
        : 'Unknown';

    const position = formatDuration(getDisplayedPosition(player));
    const duration = formatDuration(track?.info?.length || 0);

    return createEmbed({
        title: 'Now Playing',
        description: track?.info?.title || 'Unknown track',
        color: 'primary',
        fields: [
            {
                name: 'Artist',
                value: track?.info?.author || 'Unknown',
                inline: true,
            },
            {
                name: 'Requester',
                value: requesterLabel,
                inline: true,
            },
            {
                name: 'Progress',
                value: `${position} / ${duration}`,
                inline: true,
            },
            {
                name: 'Volume',
                value: `${guildData?.volume ?? 75}%`,
                inline: true,
            },
            {
                name: 'Loop',
                value: getLoopLabel(guildData?.loop),
                inline: true,
            },
            {
                name: 'Queue',
                value: `${player?.queue?.length || 0} track(s)`,
                inline: true,
            },
        ],
        thumbnail: getTrackArtwork(track),
        footer: player?.paused ? 'Paused' : 'Playing',
    });
}

export function buildQueueEmbed(queue, currentTrack, page = 0) {
    const totalTracks = queue?.length || 0;
    const totalPages = Math.max(1, Math.ceil(totalTracks / QUEUE_PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const start = safePage * QUEUE_PAGE_SIZE;
    const slice = queue?.slice(start, start + QUEUE_PAGE_SIZE) || [];

    let description = '';

    if (currentTrack) {
        description += `**Now Playing**\n${currentTrack.info?.title || 'Unknown'} — ${currentTrack.info?.author || 'Unknown'}\n\n`;
    }

    if (slice.length === 0) {
        description += 'The queue is empty.';
    } else {
        description += slice
            .map((track, index) => {
                const num = start + index + 1;
                return `${num}. ${track.info?.title || 'Unknown'} — ${track.info?.author || 'Unknown'}`;
            })
            .join('\n');
    }

    return createEmbed({
        title: 'Music Queue',
        description: description.substring(0, 4096),
        color: 'info',
        footer: `Page ${safePage + 1} of ${totalPages} • ${totalTracks} queued`,
    });
}

export function buildPlayerButtonRows(player, guildData) {
    const paused = player?.paused;

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.PAUSE)
            .setLabel('Pause')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⏸️')
            .setDisabled(Boolean(paused)),

        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.RESUME)
            .setLabel('Resume')
            .setStyle(ButtonStyle.Success)
            .setEmoji('▶️')
            .setDisabled(!paused),

        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.SKIP)
            .setLabel('Skip')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⏭️'),

        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.SEEK)
            .setLabel('Seek')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⏩'),

        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.STOP)
            .setLabel('Stop')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('⏹️'),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.SHUFFLE)
            .setLabel('Shuffle')
            .setStyle(guildData?.shuffle ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji('🔀'),

        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.LOOP)
            .setLabel('Loop')
            .setStyle(guildData?.loop !== 'none' ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji('🔁'),

        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.VOL_DOWN)
            .setLabel('Vol -')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔉'),

        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.VOL_UP)
            .setLabel('Vol +')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔊'),

        new ButtonBuilder()
            .setCustomId(MUSIC_BUTTON_IDS.QUEUE)
            .setLabel('Queue')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📋'),
    );

    return [row1, row2];
}

export function buildQueuePaginationRow(page, totalPages) {
    return getPaginationRow('music_queue', page + 1, totalPages);
}

export function getQueuePageSize() {
    return QUEUE_PAGE_SIZE;
}