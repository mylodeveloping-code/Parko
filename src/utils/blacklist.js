import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const blacklistFile = path.join(
    __dirname,
    '../data/blacklist.json'
);

const dataDir = path.dirname(blacklistFile);

// Make sure the data directory exists.
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Make sure the blacklist file exists.
if (!fs.existsSync(blacklistFile)) {
    fs.writeFileSync(
        blacklistFile,
        JSON.stringify([], null, 2)
    );
}

function loadBlacklist() {
    try {
        const data = fs.readFileSync(
            blacklistFile,
            'utf8'
        );

        const parsed = JSON.parse(data);

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.map(String);
    } catch {
        return [];
    }
}

function saveBlacklist(blacklist) {
    fs.writeFileSync(
        blacklistFile,
        JSON.stringify(blacklist, null, 2)
    );
}

export function isBlacklisted(userId) {
    if (!userId) {
        return false;
    }

    const blacklist = loadBlacklist();

    return blacklist.includes(
        String(userId)
    );
}

export function addToBlacklist(userId) {
    if (!userId) {
        return false;
    }

    userId = String(userId);

    const blacklist = loadBlacklist();

    if (blacklist.includes(userId)) {
        return false;
    }

    blacklist.push(userId);

    saveBlacklist(blacklist);

    return true;
}

export function removeFromBlacklist(userId) {
    if (!userId) {
        return false;
    }

    userId = String(userId);

    const blacklist = loadBlacklist();

    const index =
        blacklist.indexOf(userId);

    if (index === -1) {
        return false;
    }

    blacklist.splice(index, 1);

    saveBlacklist(blacklist);

    return true;
}

export function getBlacklist() {
    return loadBlacklist();
}