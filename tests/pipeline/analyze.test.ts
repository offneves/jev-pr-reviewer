import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AnalysisResultSchema } from "../../src/schema.js";
import { DEFAULT_CONFIG } from "../../src/config/defaults.js";
import { createMockJevClient } from "../../src/jev/mockClient.js";
import { analyzeDiff } from "../../src/pipeline/analyze.js";
import { summarizeInventory } from "../../src/state/inventory.js";
import type { JevClient } from "../../src/jev/types.js";

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

    it("passes the inventory summary to the JEV client (ENRICH-12)", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-analyze-"));
        const path = join(dir, "sample.diff");
        const seen: unknown[] = [];
        const mock = createMockJevClient();
        const client: JevClient = {
            evaluate: (state, context) => {
                seen.push(context?.inventory);
                return mock.evaluate(state, context);
            },
        };
        try {
            await writeFile(path, SAMPLE, "utf8");
            const result = await analyzeDiff(path, client);
            expect(seen).toEqual([summarizeInventory(result.inventory)]);
            expect(seen[0]).toMatchObject({ files: { total: 1, modified: 1 } });
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it("completes analysis with an empty inventory for an empty diff", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-analyze-"));
        const path = join(dir, "empty.diff");
        try {
            await writeFile(path, "", "utf8");
            const result = await analyzeDiff(path, createMockJevClient());
            expect(result.inventory.files).toEqual([]);
            expect(result.inventory.symbols).toEqual({ added: [], modified: [], removed: [] });
            expect(["APPROVE", "REVIEW", "BLOCK"]).toContain(result.action);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it("blocks a migration diff via gates without changing the score (GATE-01/02/04)", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-analyze-"));
        const path = join(dir, "migration.diff");
        const diff = `diff --git a/db/migrations/0042_users.sql b/db/migrations/0042_users.sql
--- a/db/migrations/0042_users.sql
+++ b/db/migrations/0042_users.sql
@@ -1 +1,2 @@
 -- users
+ALTER TABLE users ADD COLUMN email text;
`;
        try {
            await writeFile(path, diff, "utf8");
            // Cites E1 so the missing-evidence rule does not mask the gate effect.
            const client = createMockJevClient({
                databaseChange: { value: 40, confidence: 0.9, evidenceIds: ["E1"] },
            });
            const gated = await analyzeDiff(path, client);
            const ungated = await analyzeDiff(path, client, {
                ...DEFAULT_CONFIG,
                gates: { rules: [] },
            });
            expect(gated.gates).toEqual([
                {
                    id: "migration-path",
                    severity: "block",
                    matchedPaths: ["db/migrations/0042_users.sql"],
                },
            ]);
            expect(gated.action).toBe("BLOCK");
            expect(ungated.gates).toEqual([]);
            expect(ungated.action).toBe("APPROVE");
            expect(gated.score).toBe(ungated.score);
            expect(gated.contributions).toEqual(ungated.contributions);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it("evaluates gates on the full diff even when JEV saw a truncated window", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-analyze-"));
        const path = join(dir, "secret.diff");
        const diff = `${SAMPLE}diff --git a/src/cfg.ts b/src/cfg.ts
--- a/src/cfg.ts
+++ b/src/cfg.ts
@@ -1 +1 @@
-x
+const key = "AKIAABCDEFGHIJKLMNOP";
`;
        try {
            await writeFile(path, diff, "utf8");
            const result = await analyzeDiff(path, createMockJevClient(), {
                ...DEFAULT_CONFIG,
                diff: { maxChars: 20 },
            });
            expect(result.state.diffText).not.toContain("AKIA");
            expect(result.gates.map((g) => g.id)).toEqual(["secret-inline"]);
            expect(result.action).toBe("BLOCK");
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it("builds the evidence catalog, sends it to JEV and drops unknown ids (EVID-01/02)", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-analyze-"));
        const path = join(dir, "auth.diff");
        const diff = `diff --git a/src/auth/login.ts b/src/auth/login.ts
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -1 +1 @@
-const ttl = 60;
+const ttl = 6000;
`;
        const seen: unknown[] = [];
        const mock = createMockJevClient({
            securityImpact: { value: 80, confidence: 0.9, evidenceIds: ["E9", "E1"] },
        });
        const client: JevClient = {
            evaluate: (state, context) => {
                seen.push(context?.evidence);
                return mock.evaluate(state, context);
            },
        };
        try {
            await writeFile(path, diff, "utf8");
            const result = await analyzeDiff(path, client);
            expect(result.evidence).toEqual([
                { id: "E1", path: "src/auth/login.ts", snippet: "-const ttl = 60;\n+const ttl = 6000;" },
            ]);
            expect(seen).toEqual([result.evidence]);
            expect(result.decisions.securityImpact.evidenceIds).toEqual(["E1"]);
            expect(result.decisions.apiImpact.evidenceIds).toEqual([]);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it("forces REVIEW end to end when a high impact cites only unknown ids", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-analyze-"));
        const path = join(dir, "sample.diff");
        try {
            await writeFile(path, SAMPLE, "utf8");
            const config = {
                ...DEFAULT_CONFIG,
                weights: { security: 0, database: 0, api: 0, authentication: 1 },
                gates: { rules: [] },
            };
            const result = await analyzeDiff(
                path,
                createMockJevClient({
                    apiImpact: { value: 90, confidence: 0.9, evidenceIds: ["E7"] },
                }),
                config,
            );
            expect(result.riskLevel).toBe("LOW");
            expect(result.decisions.apiImpact.evidenceIds).toEqual([]);
            expect(result.action).toBe("REVIEW");
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
