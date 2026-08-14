// prefixParser.js

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

    const commandArgs =
        args.slice(1);

    return {
        commandName,
        args: commandArgs,
    };
}

function parseArguments(input) {
    const args = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (
        let i = 0;
        i < input.length;
        i++
    ) {
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
                args.push(current.trim());
                current = '';
            }

            inQuote = true;
            quoteChar = char;

            continue;
        }

        if (/\s/.test(char)) {
            if (current.trim()) {
                args.push(current.trim());
                current = '';
            }

            continue;
        }

        current += char;
    }

    if (current.trim()) {
        args.push(current.trim());
    }

    return args;
}

export function mapArgumentsToOptions(
    args,
    commandData
) {
    const cmdData =
        commandData?.toJSON
            ? commandData.toJSON()
            : commandData;

    /*
     * Commands without SlashCommandBuilder data.
     */
    if (
        !cmdData ||
        !Array.isArray(cmdData.options)
    ) {
        return createOptionsObject(
            args,
            args
        );
    }

    const options = {};

    let subcommandName = null;
    let subcommandGroupName = null;

    const subcommandGroup =
        cmdData.options.find(
            opt => opt.type === 2
        );

    const subcommands =
        cmdData.options.filter(
            opt => opt.type === 1
        );

    const hasSubcommands =
        subcommands.length > 0 &&
        !subcommandGroup;

    let currentArgs = args;
    let optionDefs = [];

    logger.debug(
        `Parsing prefix command: commandName=${cmdData.name}, args=${JSON.stringify(args)}`
    );

    // ============================================================
    // SUBCOMMAND GROUP
    // ============================================================

    if (subcommandGroup) {
        if (args.length > 0) {
            subcommandGroupName =
                args[0].toLowerCase();

            const group =
                subcommandGroup.options?.find(
                    groupOption =>
                        groupOption.name ===
                        subcommandGroupName
                );

            if (
                group &&
                args.length > 1
            ) {
                subcommandName =
                    resolveSubcommandAlias(
                        args[1]
                    );

                const sub =
                    group.options?.find(
                        subOption =>
                            subOption.name ===
                            subcommandName
                    );

                if (sub) {
                    optionDefs =
                        sub.options?.filter(
                            opt =>
                                opt.type !== 1 &&
                                opt.type !== 2
                        ) || [];

                    currentArgs =
                        args.slice(2);
                }
            }
        }
    }

    // ============================================================
    // NORMAL SUBCOMMAND
    // ============================================================

    else if (hasSubcommands) {
        if (args.length > 0) {
            const resolvedSubcommand =
                resolveSubcommandAlias(
                    args[0]
                );

            const sub =
                subcommands.find(
                    option =>
                        option.name ===
                        resolvedSubcommand
                );

            if (sub) {
                subcommandName =
                    resolvedSubcommand;

                optionDefs =
                    sub.options?.filter(
                        opt =>
                            opt.type !== 1 &&
                            opt.type !== 2
                    ) || [];

                currentArgs =
                    args.slice(1);
            }
        }
    }

    // ============================================================
    // NORMAL COMMAND
    // ============================================================

    else {
        optionDefs =
            cmdData.options.filter(
                opt =>
                    opt.type !== 1 &&
                    opt.type !== 2
            );
    }

    // ============================================================
    // MAP ARGUMENTS
    // ============================================================

    for (
        let i = 0;
        i < Math.min(
            currentArgs.length,
            optionDefs.length
        );
        i++
    ) {
        const optionDef =
            optionDefs[i];

        options[optionDef.name] =
            currentArgs[i];
    }

    // ============================================================
    // REQUIRED OPTIONS
    // ============================================================

    const missing = [];

    if (
        subcommandName ||
        (
            !hasSubcommands &&
            !subcommandGroup
        )
    ) {
        for (
            const optionDef of optionDefs
        ) {
            if (
                optionDef.required &&
                !options[optionDef.name]
            ) {
                missing.push({
                    name:
                        optionDef.name,
                    description:
                        optionDef.description,
                    type:
                        optionDef.type,
                });
            }
        }
    }

    // ============================================================
    // REQUIRED SUBCOMMAND
    // ============================================================

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
                    .map(
                        sub => sub.name
                    )
                    .join(', ') ||
                  'none'
                : subcommandGroup?.options
                    ?.map(
                        group => group.name
                    )
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

    else if (
        hasSubcommands &&
        args.length > 0 &&
        !subcommandName
    ) {
        missing.push({
            name: 'subcommand',

            description:
                `Available: ${subcommands
                    .map(
                        sub => sub.name
                    )
                    .join(', ')}`,

            type: 1,
        });
    }

    else if (
        subcommandGroup &&
        subcommandGroupName &&
        !subcommandName
    ) {
        const group =
            subcommandGroup.options?.find(
                groupOption =>
                    groupOption.name ===
                    subcommandGroupName
            );

        const available =
            group?.options
                ?.map(
                    sub => sub.name
                )
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
        args,
        currentArgs,
        options,
        subcommandName,
        subcommandGroupName,
        missing,
        optionDefs
    );
}

// ================================================================
// CREATE OPTIONS OBJECT
// ================================================================

function createOptionsObject(
    originalArgs,
    currentArgs,
    options = {},
    subcommandName = null,
    subcommandGroupName = null,
    missing = [],
    optionDefs = []
) {
    return {
        ...options,

        _positional:
            originalArgs,

        _currentArgs:
            currentArgs,

        /*
         * Generic getter.
         */
        get: name =>
            options[name] ?? null,

        /*
         * String option.
         */
        getString: name =>
            options[name] ?? null,

        /*
         * User option.
         *
         * IMPORTANT:
         * Prefix commands receive the raw mention/string.
         * messageAdapter.js converts this into the actual User.
         */
        getUser: name =>
            options[name] ?? null,

        /*
         * Member option.
         */
        getMember: name =>
            options[name] ?? null,

        /*
         * Channel option.
         */
        getChannel: name =>
            options[name] ?? null,

        /*
         * Role option.
         */
        getRole: name =>
            options[name] ?? null,

        /*
         * Integer option.
         */
        getInteger: name => {
            const value =
                options[name];

            if (
                value === null ||
                value === undefined ||
                value === ''
            ) {
                return null;
            }

            const parsed =
                Number.parseInt(
                    value,
                    10
                );

            return Number.isNaN(parsed)
                ? null
                : parsed;
        },

        /*
         * Boolean option.
         */
        getBoolean: name => {
            const value =
                options[name];

            if (
                typeof value ===
                'boolean'
            ) {
                return value;
            }

            return String(value)
                .toLowerCase() ===
                'true';
        },

        /*
         * Subcommands.
         */
        getSubcommand: () =>
            subcommandName,

        getSubcommandGroup: () =>
            subcommandGroupName,

        /*
         * Required-option validation.
         */
        validateRequired: () => ({
            valid:
                missing.length === 0,

            missing,

            subcommandName,

            subcommandGroupName,

            optionDefs,
        }),
    };
}
