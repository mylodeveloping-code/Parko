import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store the blacklist outside src/utils.
const DATA_DIR = path.join(__dirname, '../../data');
const BLACKLIST_FILE = path.join(DATA_DIR, 'blacklist.json');

function ensureBlacklistFile() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, {
                recursive: true,
            });
        }

        if (!fs.existsSync(BLACKLIST_FILE)) {
            fs.writeFileSync(
                BLACKLIST_FILE,
                JSON.stringify(
                    {
                        users: [],
                    },
                    null,
                    2
                ),
                'utf8'
            );
        }
    } catch (error) {
        logger.error(
            'Failed to initialize blacklist file:',
            error
        );
    }
}

function loadBlacklist() {
    ensureBlacklistFile();

    try {
        const raw =
            fs.readFileSync(
                BLACKLIST_FILE,
                'utf8'
            );

        const data =
            JSON.parse(raw);

        if (
            !data ||
            !Array.isArray(data.users)
        ) {
            return [];
        }

        return [
            ...new Set(
                data.users.map(
                    String
                )
            ),
        ];
    } catch (error) {
        logger.error(
            'Failed to load blacklist:',
            error
        );

        return [];
    }
}

function saveBlacklist(users) {
    try {
        ensureBlacklistFile();

        fs.writeFileSync(
            BLACKLIST_FILE,
            JSON.stringify(
                {
                    users: [
                        ...new Set(
                            users.map(
                                String
                            )
                        ),
                    ],
                },
                null,
                2
            ),
            'utf8'
        );

        return true;
    } catch (error) {
        logger.error(
            'Failed to save blacklist:',
            error
        );

        return false;
    }
}

export function isBlacklisted(userId) {
    if (!userId) {
        return false;
    }

    const users =
        loadBlacklist();

    return users.includes(
        String(userId)
    );
}

export function blacklistUser(userId) {
    if (!userId) {
        return false;
    }

    const normalizedId =
        String(userId).trim();

    if (
        isBlacklisted(
            normalizedId
        )
    ) {
        return false;
    }

    const users =
        loadBlacklist();

    users.push(
        normalizedId
    );

    return saveBlacklist(
        users
    );
}

export function getBlacklistedUsers() {
    return loadBlacklist();
}