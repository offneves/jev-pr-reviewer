import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config/defaults.js";
import type { AppConfig } from "../../src/config/schema.js";
import { createMockJevClient } from "../../src/jev/mockClient.js";
import { analyzeDiff } from "../../src/pipeline/analyze.js";

// Golden regression suite: real fixture diffs + calibrated mock JEV answers.
// Inventory, gates, evidence catalog, truncation and policy all run for real.
const fixture = (name: string) => resolve(process.cwd(), "fixtures/golden", `${name}.diff`);

describe("golden: safe-docs (GOLD-02)", () => {
    it("never BLOCKs a docs-only change and keeps score within MEDIUM", async () => {
        const result = await analyzeDiff(fixture("safe-docs"), createMockJevClient());
        expect(result.inventory.testsOrDocsOnly).toBe(true);
        expect(result.gates).toEqual([]);
        expect(result.score).toBeLessThanOrEqual(DEFAULT_CONFIG.levels.mediumMax);
        expect(result.score).toBe(0);
        expect(result.action).toBe("APPROVE");
    });
});

describe("golden: auth-touch", () => {
    it("warns on the auth path and requires review", async () => {
        const result = await analyzeDiff(
            fixture("auth-touch"),
            createMockJevClient({
                securityImpact: { value: 40, confidence: 0.9, evidenceIds: ["E1"] },
                authenticationImpact: { value: 60, confidence: 0.9, evidenceIds: ["E1"] },
            }),
        );
        expect(result.gates).toEqual([
            { id: "auth-path", severity: "warn", matchedPaths: ["src/auth/login.ts"] },
        ]);
        expect(result.inventory.symbols.modified).toEqual([
            { name: "login", kind: "function", path: "src/auth/login.ts" },
        ]);
        expect(result.score).toBe(24);
        expect(result.riskLevel).toBe("LOW");
        expect(result.action).toBe("REVIEW");
    });
});

describe("golden: block gates (GOLD-03)", () => {
    it("migration matches migration-path and BLOCKs without changing the score", async () => {
        const client = createMockJevClient({
            databaseChange: { value: 50, confidence: 0.9, evidenceIds: ["E1"] },
        });
        const result = await analyzeDiff(fixture("migration"), client);
        const ungated = await analyzeDiff(fixture("migration"), client, {
            ...DEFAULT_CONFIG,
            gates: { rules: [] },
        });
        expect(result.gates).toEqual([
            {
                id: "migration-path",
                severity: "block",
                matchedPaths: ["db/migrations/0042_add_email.sql"],
            },
        ]);
        expect(result.action).toBe("BLOCK");
        expect(result.score).toBe(ungated.score);
        expect(ungated.action).toBe("APPROVE");
    });

    it("secret-leak matches secret-inline and BLOCKs even when JEV sees no risk", async () => {
        const result = await analyzeDiff(fixture("secret-leak"), createMockJevClient());
        expect(result.gates.map((g) => [g.id, g.severity])).toEqual([["secret-inline", "block"]]);
        expect(result.gates[0].matchedPaths).toEqual(["src/config/aws.ts"]);
        expect(result.score).toBe(0);
        expect(result.action).toBe("BLOCK");
    });
});

describe("golden: truncated-large (GOLD-04)", () => {
    it("is truncated and never APPROVEs", async () => {
        const config: AppConfig = { ...DEFAULT_CONFIG, diff: { maxChars: 2_000 } };
        const result = await analyzeDiff(fixture("truncated-large"), createMockJevClient(), config);
        expect(result.state.truncated).toBe(true);
        expect(result.truncation.keptChars).toBeLessThanOrEqual(2_000);
        expect(result.truncation.originalChars).toBeGreaterThan(8_000);
        expect(result.riskLevel).toBe("LOW");
        expect(result.action).toBe("REVIEW");
    });
});
