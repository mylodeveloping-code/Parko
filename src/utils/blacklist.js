import {
    SlashCommandBuilder,
    PermissionFlagsBits,
} from 'discord.js';

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

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, {
        recursive: true,
    });
}

if (!fs.existsSync(blacklistFile)) {
    fs.writeFileSync(
        blacklistFile,
        JSON.stringify([], null, 2)
    );
}

function loadBlacklist() {
    try {
        const data =
            fs.readFileSync(
                blacklistFile,
                'utf8'
            );

        const parsed =
            JSON.parse(data);

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
        JSON.stringify(
            blacklist,
            null,
            2
        )
    );
}

function resolveUserId(value) {
    if (!value) {
        return null;
    }

    const stringValue =
        String(value).trim();

    const mentionMatch =
        stringValue.match(
            /^<@!?(\d+)>$/
        );

    if (mentionMatch) {
        return mentionMatch[1];
    }

    if (/^\d{17,20}$/.test(stringValue)) {
        return stringValue;
    }

    return null;
}

export function isBlacklisted(userId) {
    if (!userId) {
        return false;
    }

    return loadBlacklist().includes(
        String(userId)
    );
}

export function addToBlacklist(userId) {
    const resolvedId =
        resolveUserId(userId);

    if (!resolvedId) {
        return false;
    }

    const blacklist =
        loadBlacklist();

    if (
        blacklist.includes(
            resolvedId
        )
    ) {
        return false;
    }

    blacklist.push(
        resolvedId
    );

    saveBlacklist(
        blacklist
    );

    return true;
}

export function removeFromBlacklist(userId) {
    const resolvedId =
        resolveUserId(userId);

    if (!resolvedId) {
        return false;
    }

    const blacklist =
        loadBlacklist();

    const index =
        blacklist.indexOf(
            resolvedId
        );

    if (index === -1) {
        return false;
    }

    blacklist.splice(
        index,
        1
    );

    saveBlacklist(
        blacklist
    );

    return true;
}

export function getBlacklist() {
    return loadBlacklist();
}

export default {
    data: new SlashCommandBuilder()
        .setName('bl')
        .setDescription(
            'Blacklist a user from using the bot'
        )
        .addStringOption((option) =>
            option
                .setName('user_id')
                .setDescription(
                    'The Discord user ID to blacklist'
                )
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        ),

    category: 'moderation',

    async execute(
        interaction,
        config,
        client
    ) {
        const rawUserId =
            interaction.options.getString(
                'user_id'
            );

        const userId =
            resolveUserId(
                rawUserId
            );

        if (!userId) {
            await interaction.reply(
                'Please provide a valid Discord user ID.'
            );

            return;
        }

        if (
            isBlacklisted(userId)
        ) {
            await interaction.reply(
                `<@${userId}> is already blacklisted.`
            );

            return;
        }

        const added =
            addToBlacklist(
                userId
            );

        if (!added) {
            await interaction.reply(
                'I could not add that user to the blacklist.'
            );

            return;
        }

        await interaction.reply(
            `<@${userId}> has been blacklisted and can no longer use this bot.`
        );
    },
};