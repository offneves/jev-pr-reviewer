import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config/defaults.js";
import { strictFailures } from "../../src/cli/strict.js";
import type { AnalysisResult } from "../../src/schema.js";

function result(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
    return {
        state: { files: [], additions: 0, deletions: 0, diffText: "", truncated: false },
        gates: [],
        confidence: 0.9,
        action: "APPROVE",
        ...overrides,
    } as AnalysisResult;
}

describe("strictFailures (GOLD-05..08)", () => {
    it("is empty for a clean APPROVE", () => {
        expect(strictFailures(result(), DEFAULT_CONFIG)).toEqual([]);
    });

    it("flags BLOCK", () => {
        expect(strictFailures(result({ action: "BLOCK" }), DEFAULT_CONFIG)).toEqual(["action is BLOCK"]);
    });

    it("flags a truncated diff", () => {
        const r = result({ state: { files: [], additions: 0, deletions: 0, diffText: "", truncated: true } });
        expect(strictFailures(r, DEFAULT_CONFIG)).toEqual(["diff was truncated"]);
    });

    it("flags confidence below threshold but not at threshold", () => {
        expect(strictFailures(result({ confidence: 0.69 }), DEFAULT_CONFIG)).toEqual([
            "confidence 69.0% is below threshold 70.0%",
        ]);
        expect(strictFailures(result({ confidence: 0.7 }), DEFAULT_CONFIG)).toEqual([]);
    });

    it("flags block gates but not warn or info gates", () => {
        const r = result({
            action: "REVIEW",
            gates: [
                { id: "secret-inline", severity: "block", matchedPaths: ["a.ts"] },
                { id: "auth-path", severity: "warn", matchedPaths: ["b.ts"] },
                { id: "lockfile-change", severity: "info", matchedPaths: ["c.json"] },
            ],
        });
        expect(strictFailures(r, DEFAULT_CONFIG)).toEqual(["block gate matched: secret-inline"]);
    });
});
