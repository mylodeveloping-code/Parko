import { readdir } from 'fs/promises';
import { join } from 'path';
import {
    fileURLToPath,
    pathToFileURL,
} from 'url';
import { dirname } from 'path';

import { logger } from '../../utils/logger.js';

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    dirname(__filename);

export default async function loadEvents(client) {
    const eventsPath =
        join(
            __dirname,
            '../../events'
        );

    let eventFiles;

    try {
        const entries =
            await readdir(
                eventsPath,
                {
                    withFileTypes: true,
                }
            );

        eventFiles =
            entries
                .filter(
                    entry =>
                        entry.isFile() &&
                        entry.name.endsWith('.js')
                )
                .map(
                    entry =>
                        entry.name
                );
    } catch (error) {
        logger.error(
            `❌ Failed to read events directory "${eventsPath}": ${
                error?.stack ||
                error?.message ||
                String(error)
            }`
        );

        throw error;
    }

    logger.info(
        `Found ${eventFiles.length} event files to load`
    );

    /*
     * We only remove the two command-related events here.
     *
     * This prevents duplicate handlers without disturbing any
     * other Discord listeners that may have been installed
     * elsewhere during startup.
     */

    client.removeAllListeners(
        'interactionCreate'
    );

    client.removeAllListeners(
        'messageCreate'
    );

    let loadedCount = 0;

    for (const file of eventFiles) {
        const filePath =
            join(
                eventsPath,
                file
            );

        try {
            const module =
                await import(
                    pathToFileURL(
                        filePath
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
                logger.warn(
                    `⚠️ Event ${file} is missing required "name" or "execute" properties.`
                );

                continue;
            }

            const safeExecute =
                async (...args) => {
                    try {
                        await event.execute(
                            ...args,
                            client
                        );
                    } catch (error) {
                        logger.error(
                            `❌ Error executing event ${event.name}: ${
                                error?.stack ||
                                error?.message ||
                                String(error)
                            }`
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
             * IMPORTANT:
             *
             * Put the COMPLETE import error directly into the
             * log string. Your logger currently isn't reliably
             * printing errors passed as a second argument here.
             */
            const errorText =
                error?.stack ||
                error?.message ||
                String(error);

            logger.error(
                `❌ ERROR IMPORTING EVENT ${file}\n${errorText}`
            );

            /*
             * Do not silently continue for interactionCreate or
             * messageCreate. Those are required for commands.
             */
            if (
                file === 'interactionCreate.js' ||
                file === 'messageCreate.js'
            ) {
                throw error;
            }

            logger.warn(
                `⚠️ Skipping failed optional event: ${file}`
            );
        }
    }

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
            'interactionCreate.js loaded but registered 0 interactionCreate listeners.'
        );
    }

    if (
        messageListeners === 0
    ) {
        throw new Error(
            'messageCreate.js loaded but registered 0 messageCreate listeners.'
        );
    }

    logger.info(
        `✅ Event loading complete: ${loadedCount}/${eventFiles.length} events registered.`
    );
}