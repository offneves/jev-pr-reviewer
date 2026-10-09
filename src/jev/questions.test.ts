import { describe, expect, it } from "vitest";
import { buildJevQuestions, scoreToImpact } from "./questions.js";

describe("scoreToImpact", () => {
    it("maps 0–10 rubric scores to 0–100 impact", () => {
        expect(scoreToImpact(0)).toBe(0);
        expect(scoreToImpact(10)).toBe(100);
        expect(scoreToImpact(8.4)).toBe(84);
        expect(scoreToImpact(5)).toBe(50);
    });

    it("clamps values outside 0..10 before mapping", () => {
        expect(scoreToImpact(-2)).toBe(0);
        expect(scoreToImpact(12)).toBe(100);
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
