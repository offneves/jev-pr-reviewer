import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    LAST_RESULT_FILENAME,
    readLastResult,
    writeLastResult,
} from "../../src/cli/lastResult.js";
import type { AnalysisResult } from "../../src/schema.js";

let dir: string;
beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "jev-last-"));
});
afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe("lastResult", () => {
    it("writes score, action, riskLevel and timestamp and reads them back", async () => {
        const result = { score: 42, action: "REVIEW", riskLevel: "MEDIUM" } as AnalysisResult;
        await writeLastResult(dir, result, new Date("2026-11-04T12:00:00Z"));
        expect(LAST_RESULT_FILENAME).toBe(".jev-last-result.json");
        expect(JSON.parse(await readFile(join(dir, LAST_RESULT_FILENAME), "utf8"))).toEqual({
            score: 42,
            action: "REVIEW",
            riskLevel: "MEDIUM",
            at: "2026-11-04T12:00:00.000Z",
        });
        expect(await readLastResult(dir)).toMatchObject({ score: 42, action: "REVIEW" });
    });

    it.each([
        ["missing file", null],
        ["corrupt JSON", "{oops"],
        ["wrong shape", JSON.stringify({ score: "high" })],
    ])("returns null for %s", async (_label, content) => {
        if (content !== null) await writeFile(join(dir, LAST_RESULT_FILENAME), content, "utf8");
        expect(await readLastResult(dir)).toBeNull();
    });
});
