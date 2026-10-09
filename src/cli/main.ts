import { defineCommand, runCommand } from "citty";
import { loadEnv } from "../loadEnv.js";
import { loadConfig, ConfigError } from "../config/loadConfig.js";
import type { AppConfig } from "../config/schema.js";
import { AnalysisResultSchema } from "../schema.js";
import { createMockJevClient, type MockProfile } from "../jev/mockClient.js";
import { createTypeSafeJevClient } from "../jev/typeSafeClient.js";
import type { JevClient } from "../jev/types.js";
import { analyzeDiff } from "../pipeline/analyze.js";
import { DiffFileError } from "../state/buildState.js";
import { fetchMrDiff, MrDiffError } from "../git/fetchMrDiff.js";
import { parseMrTarget } from "../git/parseMrTarget.js";
import {
    DisplayConfigError,
    formatAnalyze,
    formatExplain,
    getDisplayConfig,
} from "./format.js";

import type { DisplayConfig } from "./format.js";

loadEnv();

function parseProfile(value: unknown): MockProfile {
    if (value === "busy" || value === "critical" || value === "default") {
        return value;
    }
    return "default";
}

function resolveClient(mock: boolean, profile: MockProfile): JevClient {
    if (mock) {
        return createMockJevClient(undefined, profile);
    }
    return createTypeSafeJevClient();
}

async function resolveAppConfig(configPath?: string): Promise<AppConfig> {
    return loadConfig({
        configPath: configPath || undefined,
    });
}

async function runAnalyze(
    path: string,
    json: boolean,
    mock: boolean,
    profile: MockProfile,
    config: AppConfig,
    display: DisplayConfig,
) {
    const result = await analyzeDiff(path, resolveClient(mock, profile), config);
    if (json) {
        process.stdout.write(`${JSON.stringify(AnalysisResultSchema.parse(result), null, 4)}\n`);
        return;
    }
    process.stdout.write(`${formatAnalyze(result, display)}\n`);
}

async function runExplain(
    path: string,
    mock: boolean,
    profile: MockProfile,
    config: AppConfig,
    display: DisplayConfig,
) {
    const result = await analyzeDiff(path, resolveClient(mock, profile), config);
    process.stdout.write(`${formatExplain(result, display)}\n`);
}

async function runMr(options: {
    target: string;
    base?: string;
    json: boolean;
    explain: boolean;
    mock: boolean;
    profile: MockProfile;
    config: AppConfig;
    display: DisplayConfig;
}) {
    const parsed = parseMrTarget(options.target);
    const base = options.base ?? options.config.cli.defaultBaseBranch;
    const fetched = await fetchMrDiff({
        mrNumber: parsed.number,
        mrRef: parsed.ref,
        base,
    });
    try {
        process.stderr.write(`Fetched MR !${parsed.number} via ${fetched.source}\n`);
        
        if (options.explain) {
            await runExplain(fetched.path,options.mock,options.profile,options.config,options.display);
            return;
        }

        await runAnalyze(fetched.path,options.json,options.mock,options.profile,options.config,options.display);
    } finally {
        await fetched.cleanup();
    }
}

const mockArgs = {
    mock: {
        type: "boolean" as const,
        description: "Use MockJevClient (no network)",
        default: false,
    },
    profile: {
        type: "enum" as const,
        description: "Mock decision profile: default | busy | critical",
        options: ["default", "busy", "critical"],
        default: "default",
    },
    config: {
        type: "string" as const,
        description: "Path to jev-pr-reviewer.config.json (policy file)",
        required: false,
    },
};

const main = defineCommand({
    meta: {
        name: "jev-pr-reviewer",
        description: "Analyze PR diffs with JEV decisions and code-owned risk policy",
    },
    subCommands: {
        analyze: defineCommand({
            meta: {
                name: "analyze",
                description: "Analyze a local .diff file",
            },
            args: {
                path: {
                    type: "positional",
                    description: "Path to the .diff file",
                    required: true,
                },
                json: {
                    type: "boolean",
                    description: "Emit AnalysisResult JSON",
                    default: false,
                },
                ...mockArgs,
            },
            async run({ args }) {
                const config = await resolveAppConfig(args.config ? String(args.config) : undefined);
                const display = await getDisplayConfig();
                await runAnalyze(
                    String(args.path),
                    Boolean(args.json),
                    Boolean(args.mock),
                    parseProfile(args.profile),
                    config,
                    display,
                );
            },
        }),
        explain: defineCommand({
            meta: {
                name: "explain",
                description: "Explain score contributions for a .diff file",
            },
            args: {
                path: {
                    type: "positional",
                    description: "Path to the .diff file",
                    required: true,
                },
                ...mockArgs,
            },
            async run({ args }) {
                const config = await resolveAppConfig(args.config ? String(args.config) : undefined);
                const display = await getDisplayConfig();
                await runExplain(
                    String(args.path),
                    Boolean(args.mock),
                    parseProfile(args.profile),
                    config,
                    display,
                );
            },
        }),
        mr: defineCommand({
            meta: {
                name: "mr",
                description:
                    "Fetch a GitLab MR (number or URL) and analyze it",
            },
            args: {
                target: {
                    type: "positional",
                    description:
                        "MR number or GitLab URL (e.g. 123 or https://gitlab.com/g/p/-/merge_requests/123)",
                    required: true,
                },
                base: {
                    type: "string",
                    description:
                        "Base branch for git fallback (overrides config cli.defaultBaseBranch)",
                    required: false,
                },
                json: {
                    type: "boolean",
                    description: "Emit AnalysisResult JSON",
                    default: false,
                },
                explain: {
                    type: "boolean",
                    description: "Show score breakdown instead of analyze report",
                    default: false,
                },
                ...mockArgs,
            },
            async run({ args }) {
                const config = await resolveAppConfig(
                    args.config ? String(args.config) : undefined,
                );
                const display = await getDisplayConfig();
                await runMr({
                    target: String(args.target),
                    base: args.base ? String(args.base) : undefined,
                    json: Boolean(args.json),
                    explain: Boolean(args.explain),
                    mock: Boolean(args.mock),
                    profile: parseProfile(args.profile),
                    config,
                    display,
                });
            },
        }),
    },
});

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
    try {
        await runCommand(main, { rawArgs: argv });
    } catch (err) {
        const message =
            err instanceof DiffFileError ||
            err instanceof MrDiffError ||
            err instanceof ConfigError ||
            err instanceof DisplayConfigError
                ? err.message
                : err instanceof Error
                    ? err.message
                    : String(err);
        process.stderr.write(`${message}\n`);
        process.exitCode = 1;
    }
}
