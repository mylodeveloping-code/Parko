import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Collection } from 'discord.js';
import { logger } from '../../utils/logger.js';
import botConfig from '../../config/bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_COMMANDS = 100;
const COMMAND_COUNT_WARN_THRESHOLD = 90;

function getSubcommandInfo(commandData) {
    const subcommands = [];

    if (commandData.options) {
        for (const option of commandData.options) {
            if (option.type === 1) {
                subcommands.push(option.name);
            } else if (option.type === 2 && option.options) {
                for (const subOption of option.options) {
                    if (subOption.type === 1) {
                        subcommands.push(
                            `${option.name}/${subOption.name}`,
                        );
                    }
                }
            }
        }
    }

    return subcommands;
}

async function getAllFiles(directory, fileList = []) {
    const files = await fs.readdir(directory, {
        withFileTypes: true,
    });

    for (const file of files) {
        const filePath = path.join(directory, file.name);

        if (file.isDirectory()) {
            if (file.name === 'modules') {
                continue;
            }

            await getAllFiles(filePath, fileList);
        } else if (file.name.endsWith('.js')) {
            fileList.push(filePath);
        }
    }

    return fileList;
}

export async function loadCommands(client) {
    client.commands = new Collection();

    const commandsPath = path.join(
        __dirname,
        '../../commands',
    );

    const commandFiles = await getAllFiles(commandsPath);

    logger.info(
        `Found ${commandFiles.length} command files to load`,
    );

    const uniqueCommandNames = new Set();

    for (const filePath of commandFiles) {
        try {
            const normalizedPath =
                filePath.replace(/\\/g, '/');

            const commandModule = await import(
                pathToFileURL(filePath).href
            );

            const command =
                commandModule.default ||
                commandModule;

            if (!command.data || !command.execute) {
                logger.warn(
                    `Command at ${filePath} is missing required "data" or "execute" property.`,
                );

                continue;
            }

            const commandData =
                typeof command.data.toJSON === 'function'
                    ? command.data.toJSON()
                    : command.data;

            const primaryCommandName =
                commandData.name;

            if (!primaryCommandName) {
                logger.warn(
                    `Command at ${filePath} does not have a valid command name.`,
                );

                continue;
            }

            const commandDir =
                path.dirname(filePath);

            const category =
                path.basename(commandDir);

            command.category = category;
            command.filePath = normalizedPath;

            if (
                !uniqueCommandNames.has(
                    primaryCommandName,
                )
            ) {
                uniqueCommandNames.add(
                    primaryCommandName,
                );

                client.commands.set(
                    primaryCommandName,
                    command,
                );
            } else {
                logger.warn(
                    `Duplicate command detected: ${primaryCommandName} at ${filePath}`,
                );

                continue;
            }

            logger.info(
                `✅ Loaded command: ${primaryCommandName} from ${normalizedPath} (category: ${category})`,
            );

            const subcommands =
                getSubcommandInfo(commandData);

            if (subcommands.length > 0) {
                logger.info(
                    `   └─ Subcommands: ${subcommands.join(', ')}`,
                );
            }
        } catch (error) {
            logger.error(
                `❌ Error loading command from ${filePath}:`,
                error,
            );
        }
    }

    logger.info(
        `Loaded ${client.commands.size} commands`,
    );

    if (client.commands.has('role')) {
        logger.info(
            '✅ /role command was successfully loaded.',
        );
    } else {
        logger.error(
            '❌ /role command was NOT found after loading commands.',
        );
    }

    return client.commands;
}

function collectCommandPayloads(client) {
    const commands = [];
    let totalSubcommands = 0;
    const registeredNames = new Set();

    for (const command of client.commands.values()) {
        if (
            !command.data ||
            typeof command.data.toJSON !== 'function'
        ) {
            logger.warn(
                `Command is missing data or toJSON method.`,
            );

            continue;
        }

        const commandJson =
            command.data.toJSON();

        const commandName =
            commandJson.name;

        if (!commandName) {
            logger.warn(
                'Skipping command without a name.',
            );

            continue;
        }

        if (
            registeredNames.has(commandName)
        ) {
            logger.warn(
                `Skipping duplicate command: ${commandName}`,
            );

            continue;
        }

        registeredNames.add(commandName);

        commands.push(commandJson);

        totalSubcommands +=
            getSubcommandInfo(
                commandJson,
            ).length;

        logger.info(
            `Preparing command for registration: ${commandName}`,
        );
    }

    return {
        commands,
        totalSubcommands,
    };
}

function validateCommands(commands) {
    const validationErrors = [];

    for (const cmd of commands) {
        if (
            cmd.name &&
            cmd.name.length > 32
        ) {
            validationErrors.push(
                `Command ${cmd.name} has a name longer than 32 characters.`,
            );
        }

        if (
            cmd.description &&
            cmd.description.length > 110
        ) {
            validationErrors.push(
                `Command ${cmd.name} has a description longer than 110 characters.`,
            );
        }

        if (!cmd.options) {
            continue;
        }

        for (const option of cmd.options) {
            if (
                option.name &&
                option.name.length > 32
            ) {
                validationErrors.push(
                    `Command ${cmd.name} option ${option.name} has a name longer than 32 characters.`,
                );
            }

            if (
                option.description &&
                option.description.length > 110
            ) {
                validationErrors.push(
                    `Command ${cmd.name} option ${option.name} has a description longer than 110 characters.`,
                );
            }
        }
    }

    if (validationErrors.length > 0) {
        logger.error(
            'Command validation failed:',
        );

        for (const error of validationErrors) {
            logger.error(`  - ${error}`);
        }

        throw new Error(
            `Command validation failed with ${validationErrors.length} errors.`,
        );
    }
}

function prepareCommandsForRegistration(commands) {
    if (
        commands.length >=
        COMMAND_COUNT_WARN_THRESHOLD
    ) {
        logger.warn(
            `Command count (${commands.length}) is near Discord's ${MAX_COMMANDS} command limit.`,
        );
    }

    if (
        commands.length <=
        MAX_COMMANDS
    ) {
        return commands;
    }

    logger.warn(
        `Command count (${commands.length}) exceeds Discord's ${MAX_COMMANDS} command limit. Truncating.`,
    );

    return commands.slice(
        0,
        MAX_COMMANDS,
    );
}

async function registerGuildCommands(
    client,
    clientId,
    guildId,
    commands,
) {
    if (!clientId) {
        throw new Error(
            'CLIENT_ID is required for slash command registration.',
        );
    }

    if (!guildId) {
        throw new Error(
            'GUILD_ID is required for guild command registration.',
        );
    }

    if (!client.rest) {
        throw new Error(
            'Discord REST client is not available.',
        );
    }

    logger.info(
        `Registering ${commands.length} commands to guild ${guildId}...`,
    );

    await client.rest.put(
        `/applications/${clientId}/guilds/${guildId}/commands`,
        {
            body: commands,
        },
    );

    logger.info(
        `✅ Successfully registered ${commands.length} commands to guild ${guildId}.`,
    );

    const roleCommand =
        commands.find(
            (command) =>
                command.name === 'role',
        );

    if (roleCommand) {
        logger.info(
            '✅ /role is included in the registered guild commands.',
        );
    } else {
        logger.error(
            '❌ /role is NOT included in the registered guild commands.',
        );
    }
}

async function registerGlobalCommands(
    client,
    clientId,
    commands,
) {
    if (!clientId) {
        throw new Error(
            'CLIENT_ID is required for slash command registration.',
        );
    }

    if (!client.rest) {
        throw new Error(
            'Discord REST client is not available.',
        );
    }

    logger.info(
        `Registering ${commands.length} global commands...`,
    );

    await client.rest.put(
        `/applications/${clientId}/commands`,
        {
            body: commands,
        },
    );

    logger.info(
        `✅ Successfully registered ${commands.length} global commands.`,
    );

    const roleCommand =
        commands.find(
            (command) =>
                command.name === 'role',
        );

    if (roleCommand) {
        logger.info(
            '✅ /role is included in the registered global commands.',
        );
    } else {
        logger.error(
            '❌ /role is NOT included in the registered global commands.',
        );
    }
}

export async function registerCommands(
    client,
    options = {},
) {
    const clientId =
        options.clientId ||
        botConfig.bot?.clientId ||
        process.env.CLIENT_ID;

    const guildId =
        options.guildId ||
        botConfig.bot?.guildId ||
        process.env.GUILD_ID;

    try {
        const {
            commands,
            totalSubcommands,
        } = collectCommandPayloads(client);

        logger.info(
            `Collected ${commands.length} commands and ${totalSubcommands} subcommands for registration.`,
        );

        validateCommands(
            commands,
        );

        const commandsToRegister =
            prepareCommandsForRegistration(
                commands,
            );

        if (guildId) {
            logger.info(
                `Using GUILD_ID ${guildId} for command registration.`,
            );

            await registerGuildCommands(
                client,
                clientId,
                guildId,
                commandsToRegister,
            );
        } else {
            logger.warn(
                '⚠️ GUILD_ID is not configured. Registering commands globally instead.',
            );

            await registerGlobalCommands(
                client,
                clientId,
                commandsToRegister,
            );
        }
    } catch (error) {
        logger.error(
            '❌ Error registering commands:',
            error,
        );

        throw error;
    }
}

export async function reloadCommand(
    client,
    commandName,
) {
    const command =
        client.commands.get(
            commandName,
        );

    if (!command) {
        return {
            success: false,
            message: `Command "${commandName}" not found`,
        };
    }

    try {
        const commandPath =
            path.resolve(
                command.filePath,
            );

        const moduleUrl =
            pathToFileURL(
                commandPath,
            );

        moduleUrl.searchParams.set(
            't',
            Date.now().toString(),
        );

        const newCommandModule =
            await import(
                moduleUrl.href
            );

        const newCommand =
            newCommandModule.default ||
            newCommandModule;

        client.commands.set(
            commandName,
            newCommand,
        );

        logger.info(
            `Reloaded command: ${commandName}`,
        );

        return {
            success: true,
            message: `Successfully reloaded command "${commandName}"`,
        };
    } catch (error) {
        logger.error(
            `Error reloading command "${commandName}":`,
            error,
        );

        return {
            success: false,
            message: `Error reloading command: ${error.message}`,
        };
    }
}