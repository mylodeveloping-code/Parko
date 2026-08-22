// Player event handlers for Riffy. Adapted from Musicify playerHandler (Apache-2.0).

import { logger } from '../../utils/logger.js';
import {
    getGuildMusicData,
    clearUpdateInterval,
} from './playerStore.js';

import {
    buildNowPlayingEmbed,
    buildPlayerButtonRows,
} from './musicEmbeds.js';

const UPDATE_INTERVAL_MS = 5000;
const IDLE_DISCONNECT_MS = 30 * 1000;

// Prevent multiple refreshes for the same guild from running at once.
const playerMessageLocks = new Set();

function getTrackedPosition(player) {
    const startTime = Number(
        player?._musicTrackStartTime
    );

    const startPosition = Number(
        player?._musicTrackStartPosition
    );

    const pausedAt = Number(
        player?._musicPausedAt
    );

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

    const lavalinkPosition = Number(
        player?.position
    );

    return Number.isFinite(lavalinkPosition) &&
        lavalinkPosition >= 0
        ? lavalinkPosition
        : 0;
}

function syncPlayerTiming(player) {
    if (!player) {
        return;
    }

    const now = Date.now();

    const isPaused = Boolean(
        player.paused
    );

    // First-time initialization.
    if (
        !Number.isFinite(
            Number(player._musicTrackStartTime)
        )
    ) {
        const initialPosition = Number(
            player.position
        );

        player._musicTrackStartPosition =
            Number.isFinite(initialPosition) &&
            initialPosition >= 0
                ? initialPosition
                : 0;

        player._musicTrackStartTime = now;
        player._musicPausedAt = null;
    }

    // Detect when the player was paused.
    if (
        isPaused &&
        !Number.isFinite(
            Number(player._musicPausedAt)
        )
    ) {
        player._musicPausedAt =
            getTrackedPosition(player);

        return;
    }

    // Detect when the player resumed.
    if (
        !isPaused &&
        Number.isFinite(
            Number(player._musicPausedAt)
        )
    ) {
        const pausedPosition = Number(
            player._musicPausedAt
        );

        player._musicTrackStartPosition =
            pausedPosition;

        player._musicTrackStartTime = now;

        player._musicPausedAt = null;
    }
}

/**
 * Edit the existing player message whenever possible.
 *
 * A new message is ONLY created when there is genuinely no
 * existing player message. Temporary API/fetch errors will not
 * cause the bot to forget the message and spam new ones.
 */
async function editOrSendPlayerMessage(
    client,
    guildData,
    channelId,
    embed,
    components
) {
    if (!channelId) {
        return;
    }

    const payload = {
        embeds: [embed],
        components,
    };

    let channel;

    try {
        channel =
            client.channels.cache.get(channelId) ||
            await client.channels.fetch(channelId);
    } catch (error) {
        logger.warn(
            'Failed to fetch music player channel:',
            error?.message || error
        );

        return;
    }

    if (
        !channel ||
        !channel.isTextBased?.()
    ) {
        logger.warn(
            'Music player channel is not text-based.'
        );

        return;
    }

    /*
     * If a player message already exists, edit it.
     *
     * Do NOT clear the stored ID for random failures.
     * Only clear it when Discord confirms the message
     * or channel no longer exists.
     */
    if (guildData.playerMessageId) {
        try {
            const msg =
                await channel.messages.fetch(
                    guildData.playerMessageId
                );

            await msg.edit(payload);

            return;
        } catch (error) {
            const errorCode = error?.code;

            /*
             * Discord error 10008 = Unknown Message
             * Discord error 10003 = Unknown Channel
             *
             * Only in these cases do we forget the old
             * player message and allow a replacement.
             */
            if (
                errorCode === 10008 ||
                errorCode === 10003
            ) {
                guildData.playerMessageId = null;
                guildData.playerChannelId = null;
            } else {
                logger.warn(
                    'Failed to update music player message:',
                    error?.message || error
                );

                return;
            }
        }
    }

    /*
     * There is genuinely no known player message now,
     * so create one.
     */
    try {
        const newMsg =
            await channel.send(payload);

        guildData.playerMessageId =
            newMsg.id;

        guildData.playerChannelId =
            channel.id;
    } catch (error) {
        logger.error(
            'Failed to send music player message:',
            error
        );
    }
}

export async function refreshPlayerMessage(
    client,
    guildId
) {
    /*
     * Prevent overlapping refreshes.
     *
     * Without this lock, several setInterval calls can
     * overlap and all decide that there is no message,
     * causing multiple "Now Playing" messages to be sent.
     */
    if (playerMessageLocks.has(guildId)) {
        return;
    }

    playerMessageLocks.add(guildId);

    try {
        const player =
            client.riffy?.players?.get(
                guildId
            );

        if (!player?.current) {
            return;
        }

        syncPlayerTiming(player);

        const guildData =
            getGuildMusicData(guildId);

        const embed =
            buildNowPlayingEmbed(
                player.current,
                player,
                guildData
            );

        const components =
            buildPlayerButtonRows(
                player,
                guildData
            );

        const channelId =
            guildData.playerChannelId ||
            player.textChannel;

        if (!channelId) {
            return;
        }

        await editOrSendPlayerMessage(
            client,
            guildData,
            channelId,
            embed,
            components
        );
    } catch (error) {
        logger.error(
            'Failed to refresh music player message:',
            error
        );
    } finally {
        playerMessageLocks.delete(guildId);
    }
}

function startUpdateInterval(
    client,
    guildId
) {
    const guildData =
        getGuildMusicData(guildId);

    clearUpdateInterval(guildData);

    guildData.updateInterval =
        setInterval(() => {
            refreshPlayerMessage(
                client,
                guildId
            ).catch((error) => {
                logger.error(
                    'Music player interval refresh failed:',
                    error
                );
            });
        }, UPDATE_INTERVAL_MS);
}

export function setupPlayerHandler(client) {
    if (!client.riffy) {
        logger.warn(
            'Riffy not initialized; music player handlers not attached.'
        );

        return;
    }

    // Lavalink nodes often reconnect repeatedly.
    // Throttle node logs to avoid console spam.
    const nodeLogState = new Map();

    const NODE_LOG_INTERVAL_MS =
        5 * 60 * 1000;

    const shouldLogNodeEvent =
        (nodeName) => {
            const prev =
                nodeLogState.get(nodeName) ?? {
                    lastLogAt: 0,
                    hasConnected: false,
                };

            const now = Date.now();

            if (
                now - prev.lastLogAt <
                NODE_LOG_INTERVAL_MS
            ) {
                return false;
            }

            nodeLogState.set(
                nodeName,
                {
                    ...prev,
                    lastLogAt: now,
                }
            );

            return true;
        };

    const markNodeConnected =
        (nodeName) => {
            const prev =
                nodeLogState.get(nodeName) ?? {
                    lastLogAt: 0,
                    hasConnected: false,
                };

            nodeLogState.set(
                nodeName,
                {
                    ...prev,
                    hasConnected: true,
                }
            );
        };

    client.riffy.on(
        'nodeConnect',
        (node) => {
            const prev =
                nodeLogState.get(node.name) ?? {
                    lastLogAt: 0,
                    hasConnected: false,
                };

            if (prev.hasConnected) {
                return;
            }

            markNodeConnected(node.name);

            logger.info(
                `Lavalink node "${node.name}" connected.`
            );
        }
    );

    client.riffy.on(
        'nodeReconnect',
        () => {
            // Intentionally silent.
        }
    );

    client.riffy.on(
        'nodeError',
        (node, error) => {
            if (
                !shouldLogNodeEvent(
                    node.name
                )
            ) {
                return;
            }

            logger.warn(
                `Lavalink node "${node.name}" error: ${
                    error?.message || error
                }`
            );
        }
    );

    client.riffy.on(
        'nodeDisconnect',
        (node) => {
            if (
                !shouldLogNodeEvent(
                    node.name
                )
            ) {
                return;
            }

            logger.warn(
                `Lavalink node "${node.name}" disconnected.`
            );
        }
    );

    client.riffy.on(
        'trackStart',
        async (player, track) => {
            try {
                const guildData =
                    getGuildMusicData(
                        player.guildId
                    );

                // Reset timing for the new track.
                player._musicTrackStartPosition = 0;

                player._musicTrackStartTime =
                    Date.now();

                player._musicPausedAt = null;

                // Keep Lavalink loop mode synchronized.
                if (
                    guildData.loop &&
                    player.loop !== guildData.loop
                ) {
                    player.setLoop(
                        guildData.loop
                    );
                }

                if (player.previous) {
                    guildData.previousTracks.push(
                        player.previous
                    );

                    if (
                        guildData.previousTracks
                            .length > 20
                    ) {
                        guildData.previousTracks.shift();
                    }
                }

                if (guildData.idleTimeout) {
                    clearTimeout(
                        guildData.idleTimeout
                    );

                    guildData.idleTimeout = null;
                }

                /*
                 * Use refreshPlayerMessage instead of
                 * duplicating the send/edit logic here.
                 *
                 * This also means the same guild lock is
                 * used for trackStart and interval updates.
                 */
                await refreshPlayerMessage(
                    client,
                    player.guildId
                );

                startUpdateInterval(
                    client,
                    player.guildId
                );
            } catch (error) {
                logger.error(
                    'Music trackStart error:',
                    error
                );
            }
        }
    );

    client.riffy.on(
        'queueEnd',
        async (player) => {
            try {
                const guildData =
                    getGuildMusicData(
                        player.guildId
                    );

                clearUpdateInterval(
                    guildData
                );

                if (guildData.autoplay) {
                    player.autoplay(player);
                    return;
                }

                if (
                    guildData.playerMessageId &&
                    guildData.playerChannelId
                ) {
                    try {
                        const channel =
                            client.channels.cache.get(
                                guildData.playerChannelId
                            ) ||
                            await client.channels.fetch(
                                guildData.playerChannelId
                            );

                        if (channel?.isTextBased?.()) {
                            const msg =
                                await channel.messages.fetch(
                                    guildData.playerMessageId
                                );

                            await msg.delete();
                        }
                    } catch {
                        // Message may already be deleted.
                    }
                }

                guildData.playerMessageId = null;
                guildData.playerChannelId = null;

                if (!guildData.twentyFourSeven) {
                    if (guildData.idleTimeout) {
                        clearTimeout(
                            guildData.idleTimeout
                        );
                    }

                    guildData.idleTimeout =
                        setTimeout(() => {
                            try {
                                const currentPlayer =
                                    client.riffy.players.get(
                                        player.guildId
                                    );

                                if (
                                    currentPlayer &&
                                    !currentPlayer.playing &&
                                    !currentPlayer.paused &&
                                    !currentPlayer.current
                                ) {
                                    currentPlayer.destroy();
                                }
                            } catch {
                                // Player already destroyed.
                            }

                            guildData.idleTimeout =
                                null;
                        }, IDLE_DISCONNECT_MS);
                }
            } catch (error) {
                logger.error(
                    'Music queueEnd error:',
                    error
                );
            }
        }
    );

    client.riffy.on(
        'playerDisconnect',
        async (player) => {
            const guildData =
                getGuildMusicData(
                    player.guildId
                );

            clearUpdateInterval(
                guildData
            );

            playerMessageLocks.delete(
                player.guildId
            );

            if (
                guildData.playerMessageId &&
                guildData.playerChannelId
            ) {
                try {
                    const channel =
                        client.channels.cache.get(
                            guildData.playerChannelId
                        ) ||
                        await client.channels.fetch(
                            guildData.playerChannelId
                        );

                    if (channel?.isTextBased?.()) {
                        const msg =
                            await channel.messages.fetch(
                                guildData.playerMessageId
                            );

                        await msg.delete();
                    }
                } catch {
                    // Message may already be deleted.
                }
            }

            guildData.playerMessageId = null;
            guildData.playerChannelId = null;

            guildData.previousTracks = [];

            guildData.autoPaused = false;

            if (guildData.idleTimeout) {
                clearTimeout(
                    guildData.idleTimeout
                );

                guildData.idleTimeout = null;
            }
        }
    );

    client.riffy.on(
        'trackError',
        async (
            player,
            track,
            payload
        ) => {
            logger.error(
                `Track error in ${
                    player.guildId
                } for "${
                    track?.info?.title
                }":`,
                payload?.error || payload
            );

            const guildData =
                getGuildMusicData(
                    player.guildId
                );

            if (
                guildData.playerChannelId
            ) {
                const channel =
                    client.channels.cache.get(
                        guildData.playerChannelId
                    );

                if (channel?.isTextBased?.()) {
                    channel
                        .send(
                            `Failed to play **${
                                track?.info?.title ||
                                'track'
                            }**. Skipping...`
                        )
                        .catch(() => null);
                }
            }
        }
    );

    client.riffy.on(
        'trackStuck',
        async (
            player,
            track,
            payload
        ) => {
            logger.warn(
                `Track stuck in ${
                    player.guildId
                } for "${
                    track?.info?.title
                }" (${
                    payload?.thresholdMs
                }ms)`
            );
        }
    );
}

export async function shutdownMusic(client) {
    if (!client.riffy?.players) {
        return;
    }

    for (
        const player of client.riffy.players.values()
    ) {
        try {
            player.destroy();
        } catch (error) {
            logger.debug(
                'Error destroying music player during shutdown:',
                error.message
            );
        }
    }

    playerMessageLocks.clear();
}