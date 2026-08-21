import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';

const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);

/*
 * Store blacklist data outside src/ so it survives application
 * restarts when the filesystem is persistent.
 *
 * Falls back gracefully if the file cannot be read.
 */

const DATA_DIRECTORY =
    path.join(
        __dirname,
        '../../data'
    );

const BLACKLIST_FILE =
    path.join(
        DATA_DIRECTORY,
        'blacklist.json'
    );

let blacklist =
    new Set();

function ensureDataDirectory() {
    try {
        if (
            !fs.existsSync(
                DATA_DIRECTORY
            )
        ) {
            fs.mkdirSync(
                DATA_DIRECTORY,
                {
                    recursive: true,
                }
            );
        }

        return true;
    } catch {
        return false;
    }
}

function loadBlacklist() {
    try {
        ensureDataDirectory();

        if (
            !fs.existsSync(
                BLACKLIST_FILE
            )
        ) {
            blacklist = new Set();
            return;
        }

        const raw =
            fs.readFileSync(
                BLACKLIST_FILE,
                'utf8'
            );

        const parsed =
            JSON.parse(raw);

        if (Array.isArray(parsed)) {
            blacklist =
                new Set(
                    parsed
                        .map(
                            id =>
                                String(id)
                                    .trim()
                        )
                        .filter(Boolean)
                );
        } else {
            blacklist =
                new Set();
        }
    } catch {
        blacklist =
            new Set();
    }
}

function saveBlacklist() {
    try {
        if (
            !ensureDataDirectory()
        ) {
            return false;
        }

        fs.writeFileSync(
            BLACKLIST_FILE,
            JSON.stringify(
                [...blacklist],
                null,
                2
            ),
            'utf8'
        );

        return true;
    } catch {
        return false;
    }
}

function normalizeUserId(
    userId
) {
    if (
        userId === null ||
        userId === undefined
    ) {
        return null;
    }

    const normalized =
        String(userId).trim();

    if (
        !/^\d{17,20}$/.test(
            normalized
        )
    ) {
        return null;
    }

    return normalized;
}

/**
 * Check whether a Discord user is blacklisted.
 */
export function isBlacklisted(
    userId
) {
    const normalized =
        normalizeUserId(
            userId
        );

    if (!normalized) {
        return false;
    }

    return blacklist.has(
        normalized
    );
}

/**
 * Add a user to the blacklist.
 */
export function blacklistUser(
    userId
) {
    const normalized =
        normalizeUserId(
            userId
        );

    if (!normalized) {
        return false;
    }

    if (
        blacklist.has(
            normalized
        )
    ) {
        return false;
    }

    blacklist.add(
        normalized
    );

    return saveBlacklist();
}

/**
 * Remove a user from the blacklist.
 */
export function unblacklistUser(
    userId
) {
    const normalized =
        normalizeUserId(
            userId
        );

    if (!normalized) {
        return false;
    }

    if (
        !blacklist.has(
            normalized
        )
    ) {
        return false;
    }

    blacklist.delete(
        normalized
    );

    return saveBlacklist();
}

/**
 * Get every blacklisted user ID.
 */
export function getBlacklistedUsers() {
    return [
        ...blacklist,
    ];
}

/**
 * Clear the entire blacklist.
 */
export function clearBlacklist() {
    blacklist.clear();

    return saveBlacklist();
}

/*
 * Load persisted blacklist data once when this module is imported.
 */
loadBlacklist();

export default {
    isBlacklisted,
    blacklistUser,
    unblacklistUser,
    getBlacklistedUsers,
    clearBlacklist,
};