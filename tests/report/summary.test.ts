import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config/defaults.js";
import { buildHotspots, buildSummary, type SummaryInput } from "../../src/report/summary.js";
import { buildInventory } from "../../src/state/inventory.js";

const EMPTY_INVENTORY = {
    files: [],
    symbols: { added: [], modified: [], removed: [] },
    sensitive: [],
    blastRadius: { directories: [] },
    testsOrDocsOnly: false,
};

function input(overrides: Partial<SummaryInput> = {}): SummaryInput {
    return {
        state: { files: [], additions: 0, deletions: 0, diffText: "", truncated: false },
        truncation: { truncated: false, originalChars: 0, keptChars: 0, prioritizedPaths: [] },
        inventory: EMPTY_INVENTORY,
        gates: [],
        evidence: [],
        disagreement: null,
        decisions: {
            breakingChange: { value: "no", confidence: 0.9 },
            securityImpact: { value: 0, confidence: 0.9, evidenceIds: [] },
            databaseChange: { value: 0, confidence: 0.9, evidenceIds: [] },
            apiImpact: { value: 0, confidence: 0.9, evidenceIds: [] },
            authenticationImpact: { value: 0, confidence: 0.9, evidenceIds: [] },
            needsHumanReview: { value: "no", confidence: 0.9 },
            riskLevel: { value: "LOW", confidence: 0.9 },
        },
        score: 0,
        riskLevel: "LOW",
        confidence: 0.9,
        action: "APPROVE",
        recommendation: "Automatic approval possible",
        contributions: [],
        ...overrides,
    };
}

function fileDiff(path: string, lines: string[]): string {
    return [`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, "@@ -1 +1 @@", ...lines, ""].join("\n");
}

describe("buildSummary (TRUST-01)", () => {
    it("returns exactly 3 non-empty bullets for an empty diff", () => {
        const summary = buildSummary(input(), DEFAULT_CONFIG);
        expect(summary).toEqual([
            "No file changes detected in the diff",
            "JEV reported no impact on scored axes (score 0, LOW)",
            "Action APPROVE from risk level LOW; no gates or overrides",
        ]);
    });

    it("describes shape, top impacts and action reasons from facts", () => {
        const diff = `${fileDiff("db/migrations/1.sql", ["+ALTER TABLE x;"])}${fileDiff("src/auth/login.ts", ["-a", "+export function login() {"])}`;
        const inventory = buildInventory(diff);
        const summary = buildSummary(
            input({
                inventory,
                state: { files: [], additions: 2, deletions: 1, diffText: diff, truncated: true },
                truncation: { truncated: true, originalChars: 999, keptChars: 500, prioritizedPaths: [] },
                gates: [
                    { id: "migration-path", severity: "block", matchedPaths: ["db/migrations/1.sql"] },
                    { id: "lockfile-change", severity: "info", matchedPaths: ["package-lock.json"] },
                ],
                decisions: {
                    ...input().decisions,
                    securityImpact: { value: 85, confidence: 0.9, evidenceIds: ["E1"] },
                    databaseChange: { value: 60, confidence: 0.9, evidenceIds: [] },
                    apiImpact: { value: 10, confidence: 0.9, evidenceIds: [] },
                },
                score: 63,
                riskLevel: "HIGH",
                action: "BLOCK",
            }),
            DEFAULT_CONFIG,
        );
        expect(summary).toHaveLength(3);
        expect(summary[0]).toBe(
            "2 files (2 modified) in 2 directories; +2/-1 lines; 1 symbol changed",
        );
        expect(summary[1]).toBe("Top impacts: security 85, database 60 (score 63, HIGH)");
        expect(summary[2]).toBe(
            "Action BLOCK: gates migration-path (block); diff truncated; no evidence for database",
        );
    });

    it("lists low confidence and forced disagreement as reasons", () => {
        const summary = buildSummary(
            input({
                confidence: 0.5,
                action: "REVIEW",
                disagreement: { appRiskLevel: "LOW", jevRiskLevel: "CRITICAL", ranks: 3, forcedReview: true },
            }),
            DEFAULT_CONFIG,
        );
        expect(summary[2]).toBe(
            "Action REVIEW: low confidence 50%; JEV risk CRITICAL disagrees with LOW",
        );
    });
});

describe("buildHotspots (TRUST-02)", () => {
    it("ranks gated and sensitive files first and caps at 5", () => {
        const paths = ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"];
        const diff = [
            ...paths.map((p) => fileDiff(p, ["-x", "+y"])),
            fileDiff("src/auth/login.ts", ["-x", "+y"]),
            fileDiff("db/migrations/1.sql", ["+z"]),
        ].join("");
        const inventory = buildInventory(diff);
        const hotspots = buildHotspots(inventory, diff, [
            { id: "migration-path", severity: "block", matchedPaths: ["db/migrations/1.sql"] },
        ]);
        expect(hotspots).toHaveLength(5);
        expect(hotspots[0]).toEqual({
            path: "db/migrations/1.sql",
            reason: "migration-path (block); 1 changed line",
        });
        expect(hotspots[1]).toEqual({
            path: "src/auth/login.ts",
            reason: "sensitive: auth; 2 changed lines",
        });
        expect(hotspots.slice(2).map((h) => h.path)).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
    });

    it("weights changed lines and symbols", () => {
        const diff = `${fileDiff("src/small.ts", ["+a"])}${fileDiff("src/big.py", ["+def run():", "+    pass", "+x = 1"])}`;
        const hotspots = buildHotspots(buildInventory(diff), diff, []);
        expect(hotspots).toEqual([
            { path: "src/big.py", reason: "3 changed lines; 1 symbol" },
            { path: "src/small.ts", reason: "1 changed line" },
        ]);
    });

    it("returns [] for an empty inventory", () => {
        expect(buildHotspots(EMPTY_INVENTORY, "", [])).toEqual([]);
    });
});
