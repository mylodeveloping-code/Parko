import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const blacklistFile = path.join(__dirname, '../../data/blacklist.json');

const dataDir = path.dirname(blacklistFile);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(blacklistFile)) {
  fs.writeFileSync(blacklistFile, '[]', 'utf8');
}

function loadBlacklist() {
  try {
    const data = fs.readFileSync(blacklistFile, 'utf8');
    const blacklist = JSON.parse(data);

    return Array.isArray(blacklist) ? blacklist : [];
  } catch (error) {
    console.error('Failed to load blacklist:', error);
    return [];
  }
}

function saveBlacklist(blacklist) {
  try {
    fs.writeFileSync(
      blacklistFile,
      JSON.stringify(blacklist, null, 2),
      'utf8'
    );
  } catch (error) {
    console.error('Failed to save blacklist:', error);
  }
}

export function isBlacklisted(userId) {
  return loadBlacklist().includes(String(userId));
}

export function addToBlacklist(userId) {
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
  userId = String(userId);

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