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
            } else if (option.type === 2) {
                if (option.options) {
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

            const commandName =
                path.basename(filePath, '.js');

            const commandDir =
                path.dirname(filePath);

            const category =
                path.basename(commandDir);

            const commandModule =
                await import(
                    `file://${filePath}`
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

            command.category = category;
            command.filePath = normalizedPath;

            const primaryCommandName =
                command.data.name;

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
            }

            const subcommands =
                getSubcommandInfo(
                    command.data.toJSON(),
                );

            logger.info(
                `Loaded command: ${primaryCommandName} from ${normalizedPath} (category: ${category})`,
            );

            if (subcommands.length > 0) {
                logger.info(
                    `  - Subcommands: ${subcommands.join(', ')}`,
                );
            }
        } catch (error) {
            logger.error(
                `Error loading command from ${filePath}:`,
                error,
            );
        }
    }

    const uniqueCommands = new Set();

    for (const [name, command] of client.commands) {
        if (
            command.data &&
            command.data.name
        ) {
            uniqueCommands.add(
                command.data.name,
            );
        }
    }

    logger.info(
        `Loaded ${uniqueCommands.size} commands`,
    );

    // Explicit diagnostic for /role
    if (client.commands.has('role')) {
        logger.info(
            '✅ /role command successfully loaded',
        );
    } else {
        logger.error(
            '❌ /role command was NOT found in the commands folder',
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
                `Command missing data or toJSON method: ${command}`,
            );

            continue;
        }

        const commandName =
            command.data.name;

        if (
            registeredNames.has(
                commandName,
            )
        ) {
            logger.debug(
                `Skipping duplicate command: ${commandName}`,
            );

            continue;
        }

        registeredNames.add(
            commandName,
        );

        const commandJson =
            command.data.toJSON();

        commands.push(commandJson);

        totalSubcommands +=
            getSubcommandInfo(
                commandJson,
            ).length;
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
                `Command ${cmd.name} has name longer than 32 chars`,
            );
        }

        if (
            cmd.description &&
            cmd.description.length > 110
        ) {
            validationErrors.push(
                `Command ${cmd.name} has description longer than 110 chars`,
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
                    `Command ${cmd.name} option ${option.name} has name longer than 32 chars`,
                );
            }

            if (
                option.description &&
                option.description.length > 110
            ) {
                validationErrors.push(
                    `Command ${cmd.name} option ${option.name} has description longer than 110 chars`,
                );
            }
        }
    }

    if (validationErrors.length > 0) {
        logger.error(
            'Command validation failed:',
        );

        validationErrors.forEach(
            (error) =>
                logger.error(
                    `  - ${error}`,
                ),
        );

        throw new Error(
            `Command validation failed with ${validationErrors.length} errors`,
        );
    }
}

function prepareCommandsForRegistration(commands) {
    if (
        commands.length >=
        COMMAND_COUNT_WARN_THRESHOLD
    ) {
        logger.warn(
            `Command count (${commands.length}) is near Discord's ${MAX_COMMANDS} command limit`,
        );
    }

    if (
        commands.length <=
        MAX_COMMANDS
    ) {
        return commands;
    }

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
            'CLIENT_ID is required for slash command registration',
        );
    }

    if (!guildId) {
        throw new Error(
            'GUILD_ID is required for guild slash command registration',
        );
    }

    if (!client.rest) {
        throw new Error(
            'Discord REST client is not available',
        );
    }

    logger.info(
        `Registering ${commands.length} slash commands to guild ${guildId}...`,
    );

    await client.rest.put(
        `/applications/${clientId}/guilds/${guildId}/commands`,
        {
            body: commands,
        },
    );

    logger.info(
        `✅ Successfully registered ${commands.length} slash commands to guild ${guildId}`,
    );

    if (
        commands.some(
            (command) =>
                command.name === 'role',
        )
    ) {
        logger.info(
            '✅ /role was included in guild command registration',
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
            'CLIENT_ID is required for slash command registration',
        );
    }

    if (!client.rest) {
        throw new Error(
            'Discord REST client is not available',
        );
    }

    logger.info(
        `Registering ${commands.length} global slash commands...`,
    );

    await client.rest.put(
        `/applications/${clientId}/commands`,
        {
            body: commands,
        },
    );

    logger.info(
        `✅ Successfully registered ${commands.length} global slash commands`,
    );
}

export async function registerCommands(
    client,
    options = {},
) {
    const {
        clientId = null,
        guildId =
            botConfig.bot?.guildId ||
            process.env.GUILD_ID,
    } = options;

    try {
        const {
            commands,
        } = collectCommandPayloads(
            client,
        );

        validateCommands(
            commands,
        );

        const commandsToRegister =
            prepareCommandsForRegistration(
                commands,
            );

        if (guildId) {
            await registerGuildCommands(
                client,
                clientId,
                guildId,
                commandsToRegister,
            );
        } else {
            logger.warn(
                '⚠️ GUILD_ID not configured. Falling back to global command registration.',
            );

            await registerGlobalCommands(
                client,
                clientId,
                commandsToRegister,
            );
        }
    } catch (error) {
        logger.error(
            'Error registering commands:',
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

        const newCommand =
            (
                await import(
                    moduleUrl.href
                )
            ).default;

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