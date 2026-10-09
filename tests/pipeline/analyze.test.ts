import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AnalysisResultSchema } from "../../src/schema.js";
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
            expect(result.decisions.securityImpact.value).toBe(100);
            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(["APPROVE", "REVIEW", "BLOCK"]).toContain(result.action);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
