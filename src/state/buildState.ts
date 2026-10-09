import { readFile } from "node:fs/promises";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { PrStateSchema, type PrState } from "../schema.js";

export const DIFF_TEXT_LIMIT = DEFAULT_CONFIG.diff.maxChars;

export class DiffFileError extends Error {
    constructor(
        public readonly path: string,
        cause?: unknown,
    ) {
        super(`Failed to read diff file: ${path}`, { cause });
        this.name = "DiffFileError";
    }
}

export function buildStateFromDiffText(
    text: string,
    maxChars: number = DEFAULT_CONFIG.diff.maxChars,
): PrState {
    const lines = text.split(/\r?\n/);
    let additions = 0;
    let deletions = 0;
    const fileSet = new Set<string>();

    for (const line of lines) {
        if (line.startsWith("+") && !line.startsWith("+++")) {
            additions += 1;
        }
        if (line.startsWith("-") && !line.startsWith("---")) {
            deletions += 1;
        }
        if (line.startsWith("+++ ")) {
            let path = line.slice(4);
            if (path.startsWith("b/")) {
                path = path.slice(2);
            }
            if (path !== "/dev/null") {
                fileSet.add(path);
            }
        }
    }

    const truncated = text.length > maxChars;
    const diffText = truncated ? text.slice(0, maxChars) : text;

    return PrStateSchema.parse({
        files: [...fileSet],
        additions,
        deletions,
        diffText,
        truncated,
    });
}

export async function buildStateFromDiffFile(
    path: string,
    maxChars: number = DEFAULT_CONFIG.diff.maxChars,
): Promise<PrState> {
    try {
        const text = await readFile(path, "utf8");
        return buildStateFromDiffText(text, maxChars);
    } catch (err) {
        throw new DiffFileError(path, err);
    }
}
