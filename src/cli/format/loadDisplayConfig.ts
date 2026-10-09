import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { DisplayConfigSchema, type DisplayConfig } from "./types.js";


const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DISPLAY_PATH = join(__dirname, "displayConfig.json");

export class DisplayConfigError extends Error {
    constructor(message: string, cause?: unknown) {
        super(message, { cause });
        this.name = "DisplayConfigError";
    }
}

function toDisplayConfigError(path: string, err: unknown): DisplayConfigError {
    if (err instanceof DisplayConfigError) return err;

    if (err instanceof ZodError) {
        const details = err.issues
            .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("; ");

        return new DisplayConfigError(`Invalid display config in ${path}: ${details}`, err);
    }

    const message = err instanceof SyntaxError
            ? `Invalid JSON in display config: ${path}`
            : `Failed to read display config: ${path}`;

    return new DisplayConfigError(message, err);
}

export async function loadDisplayConfig(
    path: string = DEFAULT_DISPLAY_PATH,
): Promise<DisplayConfig> {
    try {
        const text = await readFile(path, "utf8");
        return DisplayConfigSchema.parse(JSON.parse(text));
    } catch (err) {
        throw toDisplayConfigError(path, err);
    }
}

let cached: Promise<DisplayConfig> | undefined;

export function getDisplayConfig(): Promise<DisplayConfig> {
    cached ??= loadDisplayConfig();
    return cached;
}

export function resetDisplayConfigCache(): void {
    cached = undefined;
}
