import { describe, expect, it } from "vitest";
import {
    EVIDENCE_LIMIT,
    SNIPPET_MAX_CHARS,
    buildEvidenceCatalog,
    keepKnownEvidenceIds,
} from "../../src/state/evidence.js";
import { EvidenceItemSchema, JevDecisionsSchema } from "../../src/schema.js";

function fileDiff(path: string, hunks: string[][]): string {
    return [
        `diff --git a/${path} b/${path}`,
        `--- a/${path}`,
        `+++ b/${path}`,
        ...hunks.flatMap((lines, i) => [`@@ -${i * 10 + 1},2 +${i * 10 + 1},2 @@`, ...lines]),
        "",
    ].join("\n");
}

describe("buildEvidenceCatalog (EVID-01)", () => {
    it("creates one item per changed hunk with unique sequential ids", () => {
        const diff = fileDiff("src/ui/a.ts", [[" ctx", "-old", "+new"], ["+more"]]);
        const catalog = buildEvidenceCatalog(diff);
        expect(catalog).toEqual([
            { id: "E1", path: "src/ui/a.ts", snippet: "-old\n+new" },
            { id: "E2", path: "src/ui/a.ts", snippet: "+more" },
        ]);
        for (const item of catalog) expect(() => EvidenceItemSchema.parse(item)).not.toThrow();
    });

    it("lists sensitive-path hunks first", () => {
        const diff = `${fileDiff("src/ui/a.ts", [["+ui"]])}${fileDiff("src/auth/login.ts", [["+auth"]])}`;
        expect(buildEvidenceCatalog(diff).map((e) => [e.id, e.path])).toEqual([
            ["E1", "src/auth/login.ts"],
            ["E2", "src/ui/a.ts"],
        ]);
    });

    it("skips hunks without changed lines", () => {
        expect(buildEvidenceCatalog(fileDiff("a.ts", [[" only context"]]))).toEqual([]);
    });

    it("returns an empty catalog for an empty diff", () => {
        expect(buildEvidenceCatalog("")).toEqual([]);
    });

    it("caps snippets and the number of items", () => {
        const long = `+${"x".repeat(1_000)}`;
        const [item] = buildEvidenceCatalog(fileDiff("a.ts", [[long]]));
        expect(item.snippet.length).toBe(SNIPPET_MAX_CHARS);
        const many = fileDiff(
            "a.ts",
            Array.from({ length: EVIDENCE_LIMIT + 5 }, (_, i) => [`+line${i}`]),
        );
        const catalog = buildEvidenceCatalog(many);
        expect(catalog).toHaveLength(EVIDENCE_LIMIT);
        expect(new Set(catalog.map((e) => e.id)).size).toBe(EVIDENCE_LIMIT);
    });
});

describe("scored decisions evidenceIds (EVID-02)", () => {
    const base = {
        breakingChange: { value: "no", confidence: 0.9 },
        needsHumanReview: { value: "no", confidence: 0.9 },
        riskLevel: { value: "LOW", confidence: 0.9 },
        databaseChange: { value: 0, confidence: 0.9 },
        apiImpact: { value: 0, confidence: 0.9 },
        authenticationImpact: { value: 0, confidence: 0.9 },
    };

    it("keeps evidenceIds on scored axes and defaults missing ones to []", () => {
        const parsed = JevDecisionsSchema.parse({
            ...base,
            securityImpact: { value: 80, confidence: 0.9, evidenceIds: ["E1", "E3"] },
        });
        expect(parsed.securityImpact.evidenceIds).toEqual(["E1", "E3"]);
        expect(parsed.databaseChange.evidenceIds).toEqual([]);
        expect(parsed.apiImpact.evidenceIds).toEqual([]);
        expect(parsed.authenticationImpact.evidenceIds).toEqual([]);
    });
});

describe("keepKnownEvidenceIds (unknown ids edge case)", () => {
    it("drops ids not in the catalog and dedupes", () => {
        const decisions = JevDecisionsSchema.parse({
            ...base(),
            securityImpact: { value: 80, confidence: 0.9, evidenceIds: ["E9", "E1", "E1"] },
            apiImpact: { value: 50, confidence: 0.9, evidenceIds: ["E7"] },
        });
        const out = keepKnownEvidenceIds(decisions, [
            { id: "E1", path: "a.ts", snippet: "+a" },
        ]);
        expect(out.securityImpact.evidenceIds).toEqual(["E1"]);
        expect(out.apiImpact.evidenceIds).toEqual([]);
        expect(out.securityImpact.value).toBe(80);
    });
});

function base() {
    return {
        breakingChange: { value: "no", confidence: 0.9 },
        needsHumanReview: { value: "no", confidence: 0.9 },
        riskLevel: { value: "LOW", confidence: 0.9 },
        databaseChange: { value: 0, confidence: 0.9 },
        apiImpact: { value: 0, confidence: 0.9 },
        authenticationImpact: { value: 0, confidence: 0.9 },
    };
}
