import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { AnalysisResult } from "../schema.js";

export const LAST_RESULT_FILENAME = ".jev-last-result.json";

const LastResultSchema = z.object({
    score: z.number(),
    action: z.string(),
    riskLevel: z.string().optional(),
    at: z.string().optional(),
});

export type LastResult = z.infer<typeof LastResultSchema>;

/** Previous run in `cwd`; null when missing, unreadable, corrupt or invalid. */
export async function readLastResult(cwd: string): Promise<LastResult | null> {
    try {
        const raw = await readFile(join(cwd, LAST_RESULT_FILENAME), "utf8");
        const parsed = LastResultSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

export async function writeLastResult(
    cwd: string,
    result: AnalysisResult,
    now: Date = new Date(),
): Promise<void> {
    const record: LastResult = {
        score: result.score,
        action: result.action,
        riskLevel: result.riskLevel,
        at: now.toISOString(),
    };
    await writeFile(join(cwd, LAST_RESULT_FILENAME), `${JSON.stringify(record, null, 4)}\n`, "utf8");
}
