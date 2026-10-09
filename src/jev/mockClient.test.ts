import { describe, expect, it } from "vitest";
import { createMockJevClient } from "./mockClient.js";
import { JEV_DECISION_KEYS } from "./questions.js";

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
    });

    it("applies configurable overrides without network", async () => {
        const client = createMockJevClient({
            securityImpact: { value: "yes", confidence: 0.95 },
            riskLevel: { value: "CRITICAL", confidence: 0.88 },
        });
        const decisions = await client.evaluate(emptyState);
        expect(decisions.securityImpact.value).toBe("yes");
        expect(decisions.securityImpact.confidence).toBe(0.95);
        expect(decisions.riskLevel.value).toBe("CRITICAL");
    });
});
