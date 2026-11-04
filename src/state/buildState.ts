import { readFile } from "node:fs/promises";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { PrStateSchema, type PrState, type Truncation } from "../schema.js";
import { truncateDiff } from "./truncate.js";

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

export interface DiffInput {
    state: PrState;
    truncation: Truncation;
}

export function buildDiffInput(
    text: string,
    maxChars: number = DEFAULT_CONFIG.diff.maxChars,
): DiffInput {
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

    const { diffText, truncation } = truncateDiff(text, maxChars);

    const state = PrStateSchema.parse({
        files: [...fileSet],
        additions,
        deletions,
        diffText,
        truncated: truncation.truncated,
    });
    return { state, truncation };
}

export function buildStateFromDiffText(
    text: string,
    maxChars: number = DEFAULT_CONFIG.diff.maxChars,
): PrState {
    return buildDiffInput(text, maxChars).state;
}

export async function readDiffInput(
    path: string,
    maxChars: number = DEFAULT_CONFIG.diff.maxChars,
): Promise<DiffInput> {
    let text: string;
    try {
        text = await readFile(path, "utf8");
    } catch (err) {
        throw new DiffFileError(path, err);
    }
    return buildDiffInput(text, maxChars);
}

export async function buildStateFromDiffFile(
    path: string,
    maxChars: number = DEFAULT_CONFIG.diff.maxChars,
): Promise<PrState> {
    return (await readDiffInput(path, maxChars)).state;
}
