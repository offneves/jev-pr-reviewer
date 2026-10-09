import { describe, expect, it, vi } from "vitest";
import { JEV_DECISION_KEYS } from "./questions.js";
import { createTypeSafeJevClient } from "./typeSafeClient.js";

describe("createTypeSafeJevClient", () => {
    it("fails with a clear message when TYPESAFE_API_KEY is missing", () => {
        expect(() => createTypeSafeJevClient({})).toThrow(/TYPESAFE_API_KEY/);
    });

    it("builds questions covering all decision keys", async () => {
        const { buildJevQuestions } = await import("./questions.js");
        const questions = buildJevQuestions();
        for (const key of JEV_DECISION_KEYS) {
            expect(questions).toHaveProperty(key);
        }
    });

    it("rejects unexpected riskLevel values from the SDK", async () => {
        vi.resetModules();
        vi.doMock("@typesafe-ai/sdk", () => ({
            TypeSafeClient: class {
                async systemOne() {
                    return {
                        answers: {
                            breakingChange: { choice: "no", confidence: 0.9 },
                            securityImpact: { score: 0, confidence: 0.9 },
                            databaseChange: { score: 0, confidence: 0.9 },
                            apiImpact: { score: 0, confidence: 0.9 },
                            authenticationImpact: { score: 0, confidence: 0.9 },
                            needsHumanReview: { choice: "no", confidence: 0.9 },
                            riskLevel: { choice: "UNKNOWN", confidence: 0.9 },
                        },
                    };
                }
            },
            choice: (instructions: string, criteria: Record<string, unknown>) => ({
                type: "choice",
                instructions,
                criteria,
            }),
            score: (instructions: string, criteria: unknown[]) => ({
                type: "score",
                instructions,
                criteria,
            }),
        }));

        const { createTypeSafeJevClient: create } = await import(
            "./typeSafeClient.js"
        );
        const client = create({ TYPESAFE_API_KEY: "test-key" });
        await expect(
            client.evaluate({
                files: [],
                additions: 0,
                deletions: 0,
                diffText: "",
                truncated: false,
            }),
        ).rejects.toThrow();
        vi.doUnmock("@typesafe-ai/sdk");
        vi.resetModules();
    });

    it("maps score answers to 0–100 impacts", async () => {
        vi.resetModules();
        vi.doMock("@typesafe-ai/sdk", () => ({
            TypeSafeClient: class {
                async systemOne() {
                    return {
                        answers: {
                            breakingChange: { choice: "no", confidence: 0.9 },
                            securityImpact: { score: 8.4, confidence: 0.91 },
                            databaseChange: { score: 0, confidence: 0.9 },
                            apiImpact: { score: 10, confidence: 0.88 },
                            authenticationImpact: { score: 5, confidence: 0.87 },
                            needsHumanReview: { choice: "yes", confidence: 0.9 },
                            riskLevel: { choice: "HIGH", confidence: 0.9 },
                        },
                    };
                }
            },
            choice: (instructions: string, criteria: Record<string, unknown>) => ({
                type: "choice",
                instructions,
                criteria,
            }),
            score: (instructions: string, criteria: unknown[]) => ({
                type: "score",
                instructions,
                criteria,
            }),
        }));

        const { createTypeSafeJevClient: create } = await import(
            "./typeSafeClient.js"
        );
        const client = create({ TYPESAFE_API_KEY: "test-key" });
        const decisions = await client.evaluate({
            files: [],
            additions: 0,
            deletions: 0,
            diffText: "",
            truncated: false,
        });
        expect(decisions.securityImpact.value).toBe(84);
        expect(decisions.apiImpact.value).toBe(100);
        expect(decisions.authenticationImpact.value).toBe(50);
        expect(decisions.databaseChange.value).toBe(0);
        vi.doUnmock("@typesafe-ai/sdk");
        vi.resetModules();
    });

    it("does not include API key material in rethrown errors", async () => {
        vi.resetModules();
        vi.doMock("@typesafe-ai/sdk", () => ({
            TypeSafeClient: class {
                async systemOne() {
                    throw new Error("auth failed with TYPESAFE_API_KEY=sk-secret-value");
                }
            },
            choice: (instructions: string, criteria: Record<string, unknown>) => ({
                type: "choice",
                instructions,
                criteria,
            }),
            score: (instructions: string, criteria: unknown[]) => ({
                type: "score",
                instructions,
                criteria,
            }),
        }));

        const { createTypeSafeJevClient: create } = await import(
            "./typeSafeClient.js"
        );
        const client = create({ TYPESAFE_API_KEY: "sk-secret-value" });
        await expect(
            client.evaluate({
                files: [],
                additions: 0,
                deletions: 0,
                diffText: "",
                truncated: false,
            }),
        ).rejects.toSatisfy((err: unknown) => {
            const message = (err as Error).message;
            expect(message).toContain("[REDACTED]");
            expect(message).not.toContain("sk-secret-value");
            return true;
        });
        vi.doUnmock("@typesafe-ai/sdk");
        vi.resetModules();
    });
});
