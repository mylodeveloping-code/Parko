import { resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { logger } from './logger.js';

export function parsePrefixCommand(content, prefix) {
    if (!content || !content.startsWith(prefix)) {
        return null;
    }

    const withoutPrefix =
        content.slice(prefix.length).trim();

    if (!withoutPrefix) {
        return null;
    }

    const args =
        parseArguments(withoutPrefix);

    if (args.length === 0) {
        return null;
    }

    const commandName =
        args[0].toLowerCase();

    return {
        commandName,
        args: args.slice(1),
    };
}

function parseArguments(input) {
    const args = [];

    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < input.length; i++) {
        const char = input[i];

        if (inQuote) {
            if (char === quoteChar) {
                inQuote = false;

                if (current.length > 0) {
                    args.push(current);
                }

                current = '';
            } else {
                current += char;
            }

            continue;
        }

        if (
            char === '"' ||
            char === "'"
        ) {
            if (current.trim()) {
                args.push(
                    current.trim(),
                );

                current = '';
            }

            inQuote = true;
            quoteChar = char;

            continue;
        }

        if (/\s/.test(char)) {
            if (current.trim()) {
                args.push(
                    current.trim(),
                );

                current = '';
            }

            continue;
        }

        current += char;
    }

    if (current.trim()) {
        args.push(
            current.trim(),
        );
    }

    return args;
}

// ============================================================
// MAP PREFIX ARGUMENTS TO OPTIONS
// ============================================================

export function mapArgumentsToOptions(
    args,
    commandData,
) {
    const options = {};

    let subcommandName = null;
    let subcommandGroupName = null;

    const cmdData =
        commandData?.toJSON
            ? commandData.toJSON()
            : commandData;

    if (
        !cmdData ||
        !cmdData.options
    ) {
        return createOptionsObject(
            options,
            args,
            null,
            null,
            [],
            [],
        );
    }

    const subcommandGroup =
        cmdData.options.find(
            opt => opt.type === 2,
        );

    const subcommands =
        cmdData.options.filter(
            opt => opt.type === 1,
        );

    const hasSubcommands =
        subcommands.length > 0 &&
        !subcommandGroup;

    let currentArgs = args;
    let optionDefs = [];

    logger.debug(
        `Parsing prefix command: commandName=${cmdData.name}, commandArgs=${JSON.stringify(args)}`,
    );

    // =========================================================
    // SUBCOMMAND GROUP
    // =========================================================

    if (subcommandGroup) {
        if (args.length > 0) {
            subcommandGroupName =
                args[0].toLowerCase();

            const group =
                subcommandGroup.options?.find(
                    g =>
                        g.name.toLowerCase() ===
                        subcommandGroupName,
                );

            if (
                group &&
                args.length > 1
            ) {
                subcommandName =
                    resolveSubcommandAlias(
                        args[1],
                    );

                const sub =
                    group.options?.find(
                        s =>
                            s.name.toLowerCase() ===
                            subcommandName.toLowerCase(),
                    );

                if (sub) {
                    optionDefs =
                        sub.options?.filter(
                            opt =>
                                opt.type !== 1 &&
                                opt.type !== 2,
                        ) || [];

                    currentArgs =
                        args.slice(2);
                }
            }
        }
    }

    // =========================================================
    // NORMAL SUBCOMMAND
    // =========================================================

    else if (hasSubcommands) {
        if (args.length > 0) {
            const resolvedSubcommand =
                resolveSubcommandAlias(
                    args[0],
                );

            const sub =
                subcommands.find(
                    s =>
                        s.name.toLowerCase() ===
                        resolvedSubcommand.toLowerCase(),
                );

            if (sub) {
                subcommandName =
                    sub.name;

                optionDefs =
                    sub.options?.filter(
                        opt =>
                            opt.type !== 1 &&
                            opt.type !== 2,
                    ) || [];

                currentArgs =
                    args.slice(1);

                logger.debug(
                    `Found subcommand ${subcommandName}, optionDefs: ${optionDefs.length}`,
                );
            }
        }
    }

    // =========================================================
    // NORMAL COMMAND OPTIONS
    // =========================================================

    else {
        optionDefs =
            cmdData.options.filter(
                opt =>
                    opt.type !== 1 &&
                    opt.type !== 2,
            );
    }

    // =========================================================
    // MAP ARGUMENTS
    // =========================================================

    for (
        let i = 0;
        i <
        Math.min(
            currentArgs.length,
            optionDefs.length,
        );
        i++
    ) {
        const optionDef =
            optionDefs[i];

        options[optionDef.name] =
            currentArgs[i];
    }

    // =========================================================
    // REQUIRED OPTIONS
    // =========================================================

    const missing = [];

    if (
        subcommandName ||
        (
            !hasSubcommands &&
            !subcommandGroup
        )
    ) {
        for (const opt of optionDefs) {
            if (
                opt.required &&
                !options[opt.name]
            ) {
                missing.push({
                    name:
                        opt.name,

                    description:
                        opt.description,

                    type:
                        opt.type,
                });
            }
        }
    }

    // =========================================================
    // MISSING SUBCOMMAND
    // =========================================================

    if (
        (
            hasSubcommands ||
            subcommandGroup
        ) &&
        !subcommandName &&
        !subcommandGroupName
    ) {
        const available =
            hasSubcommands
                ? subcommands
                    .map(s => s.name)
                    .join(', ') ||
                  'none'
                : subcommandGroup?.options
                    ?.map(g => g.name)
                    .join(', ') ||
                  'none';

        missing.push({
            name:
                subcommandGroup
                    ? 'subcommand group'
                    : 'subcommand',

            description:
                `Available: ${available}`,

            type: 1,
        });
    }

    // =========================================================
    // INVALID SUBCOMMAND
    // =========================================================

    else if (
        hasSubcommands &&
        args.length > 0 &&
        !subcommandName
    ) {
        missing.push({
            name:
                'subcommand',

            description:
                `Available: ${subcommands
                    .map(s => s.name)
                    .join(', ')}`,

            type: 1,
        });
    }

    // =========================================================
    // INVALID GROUP SUBCOMMAND
    // =========================================================

    else if (
        subcommandGroup &&
        subcommandGroupName &&
        !subcommandName
    ) {
        const group =
            subcommandGroup.options?.find(
                g =>
                    g.name.toLowerCase() ===
                    subcommandGroupName.toLowerCase(),
            );

        const available =
            group?.options
                ?.map(s => s.name)
                .join(', ') ||
            'none';

        missing.push({
            name:
                'subcommand',

            description:
                `Available: ${available}`,

            type: 1,
        });
    }

    return createOptionsObject(
        options,
        args,
        subcommandName,
        subcommandGroupName,
        missing,
        optionDefs,
    );
}

// ============================================================
// INTERACTION-STYLE OPTIONS
// ============================================================

function createOptionsObject(
    options,
    args,
    subcommandName,
    subcommandGroupName,
    missing = [],
    optionDefs = [],
) {
    const getValue = name =>
        options[name] ?? null;

    return {
        ...options,

        _positional:
            args,

        get:
            name =>
                getValue(name),

        getString:
            name =>
                getValue(name),

        // Raw value. messageAdapter resolves type-6
        // options into actual Discord User objects.
        getUser:
            name =>
                getValue(name),

        getMember:
            name =>
                getValue(name),

        getChannel:
            name =>
                getValue(name),

        getRole:
            name =>
                getValue(name),

        getInteger:
            name => {
                const value =
                    getValue(name);

                if (
                    value === null ||
                    value === undefined
                ) {
                    return null;
                }

                const parsed =
                    Number.parseInt(
                        value,
                        10,
                    );

                return Number.isNaN(parsed)
                    ? null
                    : parsed;
            },

        getBoolean:
            name =>
                String(
                    getValue(name),
                ).toLowerCase() ===
                'true',

        getSubcommand:
            () =>
                subcommandName,

        getSubcommandGroup:
            () =>
                subcommandGroupName,

        validateRequired:
            () => ({
                valid:
                    missing.length === 0,

                missing,

                subcommandName,

                subcommandGroupName,

                optionDefs,
            }),
    };
}
