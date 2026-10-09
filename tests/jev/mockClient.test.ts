import { describe, expect, it } from "vitest";
import { createMockJevClient } from "../../src/jev/mockClient.js";
import { JEV_DECISION_KEYS } from "../../src/jev/questions.js";

const emptyState = {
    files: [],
    additions: 0,
    deletions: 0,
    diffText: "",
    truncated: false,
};

describe("createMockJevClient", () => {
    it("returns all required decision keys with confidence in [0, 1]", async () => {
        const client = createMockJevClient();
        const decisions = await client.evaluate(emptyState);

        for (const key of JEV_DECISION_KEYS) {
            expect(decisions).toHaveProperty(key);
            expect(decisions[key].confidence).toBeGreaterThanOrEqual(0);
            expect(decisions[key].confidence).toBeLessThanOrEqual(1);
        }
        expect(Number.isInteger(decisions.securityImpact.value)).toBe(true);
        expect(Number.isInteger(decisions.databaseChange.value)).toBe(true);
        expect(Number.isInteger(decisions.apiImpact.value)).toBe(true);
        expect(Number.isInteger(decisions.authenticationImpact.value)).toBe(
            true,
        );
        expect(decisions.securityImpact.value).toBe(0);
        expect(decisions.databaseChange.value).toBe(0);
        expect(decisions.apiImpact.value).toBe(0);
        expect(decisions.authenticationImpact.value).toBe(0);
    });

    it("applies configurable overrides without network", async () => {
        const client = createMockJevClient({
            securityImpact: { value: 100, confidence: 0.95 },
            riskLevel: { value: "CRITICAL", confidence: 0.88 },
        });
        const decisions = await client.evaluate(emptyState);
        expect(decisions.securityImpact.value).toBe(100);
        expect(decisions.securityImpact.confidence).toBe(0.95);
        expect(typeof decisions.securityImpact.value).toBe("number");
        expect(decisions.riskLevel.value).toBe("CRITICAL");
    });
});
