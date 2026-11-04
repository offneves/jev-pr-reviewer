import { describe, expect, it, vi } from "vitest";
import { JEV_DECISION_KEYS } from "../../src/jev/questions.js";
import { createTypeSafeJevClient } from "../../src/jev/typeSafeClient.js";

describe("createTypeSafeJevClient", () => {
    it("fails with a clear message when TYPESAFE_API_KEY is missing", () => {
        expect(() => createTypeSafeJevClient({})).toThrow(/TYPESAFE_API_KEY/);
    });

    it("builds questions covering all decision keys", async () => {
        const { buildJevQuestions } = await import(
            "../../src/jev/questions.js"
        );
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
            "../../src/jev/typeSafeClient.js"
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
            "../../src/jev/typeSafeClient.js"
        );
        const client = create({ TYPESAFE_API_KEY: "test-key" });
        const decisions = await client.evaluate({
            files: [],
            additions: 0,
            deletions: 0,
            diffText: "",
            truncated: false,
        });
        expect(decisions.securityImpact.value).toBe(93);
        expect(decisions.apiImpact.value).toBe(100);
        expect(decisions.authenticationImpact.value).toBe(56);
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
            "../../src/jev/typeSafeClient.js"
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

    it("sends the inventory summary in the System One state payload (ENRICH-12)", async () => {
        vi.resetModules();
        const calls: { state: Record<string, unknown> }[] = [];
        vi.doMock("@typesafe-ai/sdk", () => ({
            TypeSafeClient: class {
                async systemOne(req: { state: Record<string, unknown> }) {
                    calls.push(req);
                    return {
                        answers: {
                            breakingChange: { choice: "no", confidence: 0.9 },
                            securityImpact: { score: 0, confidence: 0.9 },
                            databaseChange: { score: 0, confidence: 0.9 },
                            apiImpact: { score: 0, confidence: 0.9 },
                            authenticationImpact: { score: 0, confidence: 0.9 },
                            needsHumanReview: { choice: "no", confidence: 0.9 },
                            riskLevel: { choice: "LOW", confidence: 0.9 },
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
            "../../src/jev/typeSafeClient.js"
        );
        const { buildInventory, summarizeInventory } = await import(
            "../../src/state/inventory.js"
        );
        const diff = `diff --git a/src/auth/login.ts b/src/auth/login.ts
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -1 +1,3 @@
 // x
+export function login() {
+}
`;
        const summary = summarizeInventory(buildInventory(diff));
        const client = create({ TYPESAFE_API_KEY: "test-key" });
        await client.evaluate(
            {
                files: ["src/auth/login.ts"],
                additions: 2,
                deletions: 0,
                diffText: diff,
                truncated: false,
            },
            { inventory: summary },
        );
        expect(calls).toHaveLength(1);
        expect(calls[0].state.diffText).toBe(diff);
        expect(calls[0].state.inventory).toEqual({
            files: { total: 1, added: 0, modified: 1, deleted: 0, renamed: 0 },
            languages: ["typescript"],
            symbols: {
                added: ["src/auth/login.ts#login (function)"],
                modified: [],
                removed: [],
                totalChanged: 1,
            },
            sensitive: [{ path: "src/auth/login.ts", category: "auth" }],
            blastRadius: ["src/auth"],
            testsOrDocsOnly: false,
        });
        vi.doUnmock("@typesafe-ai/sdk");
        vi.resetModules();
    });

    it("maps evidence choice probabilities to evidenceIds (EVID-02)", async () => {
        vi.resetModules();
        const requests: { questions: Record<string, { criteria: Record<string, unknown> }> }[] = [];
        vi.doMock("@typesafe-ai/sdk", () => ({
            TypeSafeClient: class {
                async systemOne(req: { questions: Record<string, { criteria: Record<string, unknown> }> }) {
                    requests.push(req);
                    return {
                        answers: {
                            breakingChange: { choice: "no", confidence: 0.9 },
                            securityImpact: { score: 7, confidence: 0.9 },
                            databaseChange: { score: 0, confidence: 0.9 },
                            apiImpact: { score: 0, confidence: 0.9 },
                            authenticationImpact: { score: 0, confidence: 0.9 },
                            needsHumanReview: { choice: "no", confidence: 0.9 },
                            riskLevel: { choice: "LOW", confidence: 0.9 },
                            securityEvidence: {
                                choice: "E2",
                                confidence: 0.6,
                                probabilities: { NONE: 0.05, E1: 0.3, E2: 0.6, E9: 0.5 },
                            },
                            databaseEvidence: {
                                choice: "NONE",
                                confidence: 0.9,
                                probabilities: { NONE: 0.9, E1: 0.05, E2: 0.05 },
                            },
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
            "../../src/jev/typeSafeClient.js"
        );
        const client = create({ TYPESAFE_API_KEY: "test-key" });
        const decisions = await client.evaluate(
            { files: [], additions: 0, deletions: 0, diffText: "", truncated: false },
            {
                evidence: [
                    { id: "E1", path: "src/auth/a.ts", snippet: "+a" },
                    { id: "E2", path: "src/auth/b.ts", snippet: "+b" },
                ],
            },
        );
        expect(Object.keys(requests[0].questions.securityEvidence.criteria)).toEqual([
            "NONE",
            "E1",
            "E2",
        ]);
        expect(decisions.securityImpact.evidenceIds).toEqual(["E2", "E1"]);
        expect(decisions.databaseChange.evidenceIds).toEqual([]);
        expect(decisions.apiImpact.evidenceIds).toEqual([]);
        vi.doUnmock("@typesafe-ai/sdk");
        vi.resetModules();
    });

    it("does not ask evidence questions without a catalog", async () => {
        vi.resetModules();
        const requests: { questions: Record<string, unknown> }[] = [];
        vi.doMock("@typesafe-ai/sdk", () => ({
            TypeSafeClient: class {
                async systemOne(req: { questions: Record<string, unknown> }) {
                    requests.push(req);
                    return {
                        answers: {
                            breakingChange: { choice: "no", confidence: 0.9 },
                            securityImpact: { score: 0, confidence: 0.9 },
                            databaseChange: { score: 0, confidence: 0.9 },
                            apiImpact: { score: 0, confidence: 0.9 },
                            authenticationImpact: { score: 0, confidence: 0.9 },
                            needsHumanReview: { choice: "no", confidence: 0.9 },
                            riskLevel: { choice: "LOW", confidence: 0.9 },
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
            "../../src/jev/typeSafeClient.js"
        );
        const decisions = await create({ TYPESAFE_API_KEY: "k" }).evaluate({
            files: [],
            additions: 0,
            deletions: 0,
            diffText: "",
            truncated: false,
        });
        expect(Object.keys(requests[0].questions)).not.toContain("securityEvidence");
        expect(decisions.securityImpact.evidenceIds).toEqual([]);
        vi.doUnmock("@typesafe-ai/sdk");
        vi.resetModules();
    });
});
