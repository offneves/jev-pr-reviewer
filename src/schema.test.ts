import { describe, expect, it } from "vitest";
import { JevDecisionsSchema } from "./schema.js";

const base = {
    breakingChange: { value: "no" as const, confidence: 0.9 },
    needsHumanReview: { value: "no" as const, confidence: 0.9 },
    riskLevel: { value: "LOW" as const, confidence: 0.9 },
};

describe("JevDecisionsSchema impact axes", () => {
    it("accepts integer impacts 0..100 for scored axes", () => {
        const parsed = JevDecisionsSchema.parse({
            ...base,
            securityImpact: { value: 0, confidence: 0.9 },
            databaseChange: { value: 50, confidence: 0.9 },
            apiImpact: { value: 100, confidence: 0.9 },
            authenticationImpact: { value: 1, confidence: 0.9 },
        });
        expect(parsed.securityImpact.value).toBe(0);
        expect(parsed.apiImpact.value).toBe(100);
    });

    it("rejects impact below 0 or above 100", () => {
        expect(() =>
            JevDecisionsSchema.parse({
                ...base,
                securityImpact: { value: -1, confidence: 0.9 },
                databaseChange: { value: 0, confidence: 0.9 },
                apiImpact: { value: 0, confidence: 0.9 },
                authenticationImpact: { value: 0, confidence: 0.9 },
            }),
        ).toThrow();
        expect(() =>
            JevDecisionsSchema.parse({
                ...base,
                securityImpact: { value: 101, confidence: 0.9 },
                databaseChange: { value: 0, confidence: 0.9 },
                apiImpact: { value: 0, confidence: 0.9 },
                authenticationImpact: { value: 0, confidence: 0.9 },
            }),
        ).toThrow();
    });

    it("rejects yes/no strings on scored axes", () => {
        expect(() =>
            JevDecisionsSchema.parse({
                ...base,
                securityImpact: { value: "yes", confidence: 0.9 },
                databaseChange: { value: 0, confidence: 0.9 },
                apiImpact: { value: 0, confidence: 0.9 },
                authenticationImpact: { value: 0, confidence: 0.9 },
            }),
        ).toThrow();
    });
});
