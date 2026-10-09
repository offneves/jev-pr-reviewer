import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { ZodError } from "zod";
import { DEFAULT_CONFIG } from "./defaults.js";
import {
    AppConfigSchema,
    ResolvedAppConfigSchema,
    type AppConfig,
    type AppConfigFile,
} from "./schema.js";

export const DEFAULT_CONFIG_FILENAME = "jev-pr-reviewer.config.json";

export class ConfigError extends Error {
    constructor(message: string, cause?: unknown) {
        super(message, { cause });
        this.name = "ConfigError";
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep-merge plain objects; arrays and scalars from `override` replace. */
export function deepMerge<T extends Record<string, unknown>>(
    base: T,
    override: Record<string, unknown>,
): T {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(override)) {
        if (key === "_docs" || key === "description") {
            continue;
        }
        const baseVal = out[key];
        if (isPlainObject(baseVal) && isPlainObject(value)) {
            const { description: _d, _docs: _docs, ...rest } = value;
            out[key] = deepMerge(baseVal, rest);
        } else if (value !== undefined) {
            out[key] = value;
        }
    }
    return out as T;
}

function stripDocs(input: AppConfigFile): Record<string, unknown> {
    const raw = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (key === "_docs" || key === "description") continue;
        if (isPlainObject(value)) {
            const { description: _d, _docs: _docs, ...rest } = value;
            if (Array.isArray(rest.tiers)) {
                out[key] = {
                    ...rest,
                    tiers: rest.tiers.map((tier) => {
                        if (!isPlainObject(tier)) return tier;
                        const { description: _td, ...tRest } = tier;
                        return tRest;
                    }),
                };
            } else {
                out[key] = rest;
            }
        } else {
            out[key] = value;
        }
    }
    return out;
}

function formatZodError(err: ZodError): string {
    return err.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
}

export interface LoadConfigOptions {
    configPath?: string;
    cwd?: string;
}

export async function loadConfig(
    options: LoadConfigOptions = {},
): Promise<AppConfig> {
    const cwd = options.cwd ?? process.cwd();
    let filePath: string | undefined;
    let required = false;

    if (options.configPath) {
        filePath = options.configPath;
        required = true;
    } else {
        const candidate = join(cwd, DEFAULT_CONFIG_FILENAME);
        try {
            await access(candidate, constants.R_OK);
            filePath = candidate;
        } catch {
            filePath = undefined;
        }
    }

    if (!filePath) {
        return ResolvedAppConfigSchema.parse(DEFAULT_CONFIG);
    }

    let text: string;
    try {
        text = await readFile(filePath, "utf8");
    } catch (err) {
        const hint = required
            ? `Failed to read config file: ${filePath}`
            : `Failed to read config file: ${filePath}`;
        throw new ConfigError(hint, err);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        throw new ConfigError(
            `Invalid JSON in config file: ${filePath}`,
            err,
        );
    }

    let fileConfig: AppConfigFile;
    try {
        fileConfig = AppConfigSchema.parse(parsed);
    } catch (err) {
        if (err instanceof ZodError) {
            throw new ConfigError(
                `Invalid config in ${filePath}: ${formatZodError(err)}`,
                err,
            );
        }
        throw err;
    }

    const merged = deepMerge(
        DEFAULT_CONFIG as unknown as Record<string, unknown>,
        stripDocs(fileConfig),
    );

    try {
        return ResolvedAppConfigSchema.parse(merged);
    } catch (err) {
        if (err instanceof ZodError) {
            throw new ConfigError(
                `Invalid config in ${filePath}: ${formatZodError(err)}`,
                err,
            );
        }
        throw err;
    }
}
