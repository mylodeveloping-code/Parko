import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
                JSON.stringify([], null, 2),
                'utf8'
            );
        }
    } catch (error) {
        console.error(
            'Failed to initialize blacklist file:',
            error
        );
    }
}

function readBlacklist() {
    ensureBlacklistFile();

    try {
        const data = fs.readFileSync(
            BLACKLIST_FILE,
            'utf8'
        );

        const parsed = JSON.parse(data);

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.map(String);
    } catch (error) {
        console.error(
            'Failed to read blacklist:',
            error
        );

        return [];
    }
}

function saveBlacklist(blacklist) {
    ensureBlacklistFile();

    try {
        fs.writeFileSync(
            BLACKLIST_FILE,
            JSON.stringify(
                [...new Set(blacklist.map(String))],
                null,
                2
            ),
            'utf8'
        );

        return true;
    } catch (error) {
        console.error(
            'Failed to save blacklist:',
            error
        );

        return false;
    }
}

/**
 * Check whether a user is blacklisted.
 */
export function isBlacklisted(userId) {
    if (!userId) {
        return false;
    }

    const blacklist = readBlacklist();

    return blacklist.includes(
        String(userId)
    );
}

/**
 * Add a user to the blacklist.
 */
export function blacklistUser(userId) {
    if (!userId) {
        return false;
    }

    const normalizedId =
        String(userId);

    const blacklist =
        readBlacklist();

    if (
        blacklist.includes(
            normalizedId
        )
    ) {
        return false;
    }

    blacklist.push(
        normalizedId
    );

    return saveBlacklist(
        blacklist
    );
}

/**
 * Remove a user from the blacklist.
 */
export function unblacklistUser(userId) {
    if (!userId) {
        return false;
    }

    const normalizedId =
        String(userId);

    const blacklist =
        readBlacklist();

    const filtered =
        blacklist.filter(
            id =>
                id !== normalizedId
        );

    if (
        filtered.length ===
        blacklist.length
    ) {
        return false;
    }

    return saveBlacklist(
        filtered
    );
}

/**
 * Get every blacklisted user ID.
 */
export function getBlacklistedUsers() {
    return readBlacklist();
}