import { describe, expect, it } from "vitest";
import { buildJevQuestions, scoreToImpact } from "../../src/jev/questions.js";

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
