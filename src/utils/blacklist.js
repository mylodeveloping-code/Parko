import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const blacklistFile = path.join(__dirname, '../../data/blacklist.json');

// Make sure the data directory/file exists
const dataDir = path.dirname(blacklistFile);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(blacklistFile)) {
  fs.writeFileSync(blacklistFile, JSON.stringify([], null, 2));
}

function loadBlacklist() {
  try {
    return JSON.parse(fs.readFileSync(blacklistFile, 'utf8'));
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
  const blacklist = loadBlacklist();
  return blacklist.includes(userId);
}

export function addToBlacklist(userId) {
  const blacklist = loadBlacklist();

  if (!blacklist.includes(userId)) {
    blacklist.push(userId);
    saveBlacklist(blacklist);
    return true;
  }

  return false;
}

export function removeFromBlacklist(userId) {
  const blacklist = loadBlacklist();
  const index = blacklist.indexOf(userId);

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