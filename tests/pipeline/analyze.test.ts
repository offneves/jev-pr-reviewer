import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AnalysisResultSchema } from "../../src/schema.js";
import { DEFAULT_CONFIG } from "../../src/config/defaults.js";
import { createMockJevClient } from "../../src/jev/mockClient.js";
import { analyzeDiff } from "../../src/pipeline/analyze.js";

const SAMPLE = `diff --git a/src/foo.ts b/src/foo.ts
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1 +1,2 @@
-old
+new
+extra
`;

describe("analyzeDiff", () => {
    it("returns a schema-valid AnalysisResult with MockJevClient", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-analyze-"));
        const path = join(dir, "sample.diff");
        try {
            await writeFile(path, SAMPLE, "utf8");
            const result = await analyzeDiff(
                path,
                createMockJevClient({
                    securityImpact: { value: 100, confidence: 0.9 },
                }),
            );
            expect(() => AnalysisResultSchema.parse(result)).not.toThrow();
            expect(result.state.additions).toBe(2);
            expect(result.truncation).toEqual({
                truncated: false,
                originalChars: SAMPLE.length,
                keptChars: SAMPLE.length,
                prioritizedPaths: [],
            });
            expect(result.inventory.files).toEqual([
                { path: "src/foo.ts", status: "modified", language: "typescript" },
            ]);
            expect(result.inventory.blastRadius.directories).toEqual(["src"]);
            expect(result.decisions.securityImpact.value).toBe(100);
            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(["APPROVE", "REVIEW", "BLOCK"]).toContain(result.action);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it("never APPROVEs a truncated diff even when JEV reports no risk", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-analyze-"));
        const path = join(dir, "big.diff");
        try {
            await writeFile(path, SAMPLE, "utf8");
            const result = await analyzeDiff(path, createMockJevClient(), {
                ...DEFAULT_CONFIG,
                diff: { ...DEFAULT_CONFIG.diff, maxChars: 20 },
            });
            expect(result.truncation.truncated).toBe(true);
            // Inventory still covers the full diff even when JEV sees a cut.
            expect(result.inventory.files.map((f) => f.path)).toEqual(["src/foo.ts"]);
            expect(result.riskLevel).toBe("LOW");
            expect(result.action).toBe("REVIEW");
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
