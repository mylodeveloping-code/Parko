import { readdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default async function loadEvents(client) {
    const eventsPath = join(
        __dirname,
        '../../events'
    );

    let eventFiles;

    try {
        eventFiles = await readdir(
            eventsPath
        );
    } catch (error) {
        logger.error(
            `❌ Failed to read events directory: ${eventsPath}`,
            error
        );

        throw error;
    }

    eventFiles = eventFiles.filter(
        file => file.endsWith('.js')
    );

    logger.info(
        `Found ${eventFiles.length} event files to load`
    );

    let loadedCount = 0;

    for (const file of eventFiles) {
        const filePath =
            join(
                eventsPath,
                file
            );

        try {
            /*
             * IMPORTANT:
             * Use pathToFileURL() instead of manually constructing
             * file:// URLs. This works correctly on Windows and Linux.
             */
            const module =
                await import(
                    pathToFileURL(filePath).href
                );

            const event =
                module.default;

            if (
                !event ||
                !event.name ||
                typeof event.execute !== 'function'
            ) {
                throw new Error(
                    `Event ${file} is missing required "name" or "execute" properties.`
                );
            }

            /*
             * Register a wrapper so every event receives:
             *
             *   event.execute(...eventArgs, client)
             */
            const safeExecute =
                async (...args) => {
                    try {
                        await event.execute(
                            ...args,
                            client
                        );
                    } catch (error) {
                        logger.error(
                            `❌ Error executing event ${event.name}:`,
                            error
                        );
                    }
                };

            if (event.once) {
                client.once(
                    event.name,
                    safeExecute
                );

                logger.info(
                    `✅ Registered once event: ${event.name} (${file})`
                );
            } else {
                client.on(
                    event.name,
                    safeExecute
                );

                logger.info(
                    `✅ Registered event: ${event.name} (${file})`
                );
            }

            loadedCount += 1;
        } catch (error) {
            /*
             * THIS IS INTENTIONAL:
             *
             * Event imports are required for the bot's command
             * system to function. Do NOT silently continue.
             *
             * Before, an import failure could leave the bot online
             * with zero message/interaction handlers.
             */
            logger.error(
                `❌ Failed to load required event ${file}:`,
                error?.stack ||
                    error?.message ||
                    error
            );

            throw error;
        }
    }

    logger.info(
        `✅ Successfully registered ${loadedCount}/${eventFiles.length} event files.`
    );

    /*
     * These two events are critical to your command system.
     * Verify that they actually exist after registration.
     */
    const interactionListeners =
        client.listenerCount(
            'interactionCreate'
        );

    const messageListeners =
        client.listenerCount(
            'messageCreate'
        );

    logger.info(
        `📡 interactionCreate listeners: ${interactionListeners}`
    );

    logger.info(
        `📡 messageCreate listeners: ${messageListeners}`
    );

    if (
        interactionListeners === 0
    ) {
        throw new Error(
            'CRITICAL: interactionCreate event was not registered. Slash commands cannot work.'
        );
    }

    if (
        messageListeners === 0
    ) {
        throw new Error(
            'CRITICAL: messageCreate event was not registered. Prefix commands cannot work.'
        );
    }
}