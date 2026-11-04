import { describe, expect, it } from "vitest";
import {
    EVIDENCE_MIN_PROBABILITY,
    buildEvidenceQuestions,
    buildJevQuestions,
    evidenceIdsFromProbabilities,
    scoreToImpact,
} from "../../src/jev/questions.js";

describe("scoreToImpact", () => {
    it("maps 0–9 rubric scores to 0–100 impact", () => {
        expect(scoreToImpact(0)).toBe(0);
        expect(scoreToImpact(9)).toBe(100);
        expect(scoreToImpact(4.5)).toBe(50);
        expect(scoreToImpact(8.4)).toBe(93);
    });

    it("clamps values outside 0..9 before mapping", () => {
        expect(scoreToImpact(-2)).toBe(0);
        expect(scoreToImpact(12)).toBe(100);
    });

    it("uses at most 10 score criteria (API limit)", () => {
        const q = buildJevQuestions();
        expect(q.securityImpact.criteria).toHaveLength(10);
    });
});

describe("buildJevQuestions", () => {
    it("uses score questions for the four scored axes", () => {
        const q = buildJevQuestions();
        expect(q.securityImpact.type).toBe("score");
        expect(q.databaseChange.type).toBe("score");
        expect(q.apiImpact.type).toBe("score");
        expect(q.authenticationImpact.type).toBe("score");
        expect(q.breakingChange.type).toBe("choice");
        expect(q.needsHumanReview.type).toBe("choice");
        expect(q.riskLevel.type).toBe("choice");
    });
});

describe("buildEvidenceQuestions", () => {
    const catalog = [
        { id: "E1", path: "src/auth/login.ts", snippet: "+token()" },
        { id: "E2", path: "db/m.sql", snippet: "+ALTER TABLE" },
    ];

    it("asks one choice per scored axis over catalog ids plus NONE", () => {
        const q = buildEvidenceQuestions(catalog);
        expect(Object.keys(q).sort()).toEqual([
            "apiEvidence",
            "authenticationEvidence",
            "databaseEvidence",
            "securityEvidence",
        ]);
        const security = q.securityEvidence as { type: string; criteria: Record<string, unknown> };
        expect(security.type).toBe("choice");
        expect(Object.keys(security.criteria)).toEqual(["NONE", "E1", "E2"]);
        expect(security.criteria.E2).toEqual({ path: "db/m.sql", snippet: "+ALTER TABLE" });
    });

    it("asks nothing when the catalog is empty", () => {
        expect(buildEvidenceQuestions([])).toEqual({});
    });
});

describe("evidenceIdsFromProbabilities", () => {
    const known = new Set(["E1", "E2", "E3", "E4"]);

    it("keeps ids at or above the threshold, highest first", () => {
        expect(
            evidenceIdsFromProbabilities(
                { NONE: 0.3, E1: 0.149, E2: EVIDENCE_MIN_PROBABILITY, E3: 0.4 },
                known,
            ),
        ).toEqual(["E3", "E2"]);
    });

    it("drops NONE and ids outside the catalog", () => {
        expect(evidenceIdsFromProbabilities({ NONE: 0.9, E9: 0.5 }, known)).toEqual([]);
    });

    it("returns at most 3 ids", () => {
        expect(
            evidenceIdsFromProbabilities({ E1: 0.2, E2: 0.25, E3: 0.3, E4: 0.22 }, known),
        ).toEqual(["E3", "E2", "E4"]);
    });

    it("returns [] when the answer is missing", () => {
        expect(evidenceIdsFromProbabilities(undefined, known)).toEqual([]);
    });
});
