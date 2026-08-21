import { readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';
import { Events } from 'discord.js';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REQUIRED_COMMAND_EVENTS = new Set([
    Events.InteractionCreate,
    Events.MessageCreate,
]);

export default async function loadEvents(client) {
    const eventsPath = join(
        __dirname,
        '../../events',
    );

    let eventFiles;

    try {
        const entries = await readdir(
            eventsPath,
            {
                withFileTypes: true,
            },
        );

        eventFiles = entries
            .filter(
                entry =>
                    entry.isFile() &&
                    entry.name.endsWith('.js'),
            )
            .map(
                entry => entry.name,
            );
    } catch (error) {
        logger.error(
            `❌ Failed to read events directory: ${eventsPath}`,
            error?.stack ||
                error?.message ||
                error,
        );

        throw error;
    }

    logger.info(
        `Found ${eventFiles.length} event files to load`,
    );

    /*
     * ------------------------------------------------------------
     * Remove old command-event listeners.
     *
     * This prevents duplicate interaction/message handlers from
     * surviving a reload and causing multiple responses.
     * ------------------------------------------------------------
     */

    client.removeAllListeners(
        Events.InteractionCreate,
    );

    client.removeAllListeners(
        Events.MessageCreate,
    );

    const registeredEvents = new Set();

    for (const file of eventFiles) {
        const filePath = join(
            eventsPath,
            file,
        );

        try {
            const module =
                await import(
                    pathToFileURL(
                        filePath,
                    ).href
                );

            const event =
                module?.default;

            if (
                !event ||
                !event.name ||
                typeof event.execute !==
                    'function'
            ) {
                throw new Error(
                    `Event ${file} is missing required "name" or "execute" properties.`,
                );
            }

            /*
             * ----------------------------------------------------
             * Event wrapper
             * ----------------------------------------------------
             *
             * Your event files use:
             *
             *   execute(interaction, client)
             *
             * or:
             *
             *   execute(message, client)
             *
             * Therefore the client is appended as the final
             * argument.
             */

            const safeExecute =
                async (...args) => {
                    try {
                        logger.debug(
                            `📡 Discord event fired: ${event.name}`,
                        );

                        await event.execute(
                            ...args,
                            client,
                        );
                    } catch (error) {
                        logger.error(
                            `❌ Error executing event ${event.name}:`,
                            error?.stack ||
                                error?.message ||
                                error,
                        );
                    }
                };

            if (event.once) {
                client.once(
                    event.name,
                    safeExecute,
                );

                logger.info(
                    `✅ Registered once event: ${event.name} (${file})`,
                );
            } else {
                client.on(
                    event.name,
                    safeExecute,
                );

                logger.info(
                    `✅ Registered event: ${event.name} (${file})`,
                );
            }

            registeredEvents.add(
                event.name,
            );
        } catch (error) {
            logger.error(
                `❌ Failed to load event ${file}:`,
                error?.stack ||
                    error?.message ||
                    error,
            );

            /*
             * Event-loading failures are fatal.
             *
             * It is much better to stop startup than to have the
             * bot appear online while command events are missing.
             */
            throw error;
        }
    }

    /*
     * ------------------------------------------------------------
     * Verify the two events responsible for commands.
     * ------------------------------------------------------------
     */

    const interactionListeners =
        client.listenerCount(
            Events.InteractionCreate,
        );

    const messageListeners =
        client.listenerCount(
            Events.MessageCreate,
        );

    logger.info(
        `📡 interactionCreate listeners: ${interactionListeners}`,
    );

    logger.info(
        `📡 messageCreate listeners: ${messageListeners}`,
    );

    if (
        !registeredEvents.has(
            Events.InteractionCreate,
        ) ||
        interactionListeners < 1
    ) {
        throw new Error(
            'CRITICAL: interactionCreate is not registered. Slash commands cannot work.',
        );
    }

    if (
        !registeredEvents.has(
            Events.MessageCreate,
        ) ||
        messageListeners < 1
    ) {
        throw new Error(
            'CRITICAL: messageCreate is not registered. Prefix commands cannot work.',
        );
    }

    logger.info(
        '✅ interactionCreate and messageCreate are both registered.',
    );
}