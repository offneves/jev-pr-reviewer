import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import type { AppConfig } from "../config/schema.js";
import type { JevDecisions, PrState } from "../schema.js";
import { calculateRisk } from "./calculator.js";
import { aggregateConfidence, applyPolicy } from "./policy.js";

function decisions(partial: Partial<JevDecisions> = {}): JevDecisions {
    const base: JevDecisions = {
        breakingChange: { value: "no", confidence: 0.9 },
        securityImpact: { value: "no", confidence: 0.9 },
        databaseChange: { value: "no", confidence: 0.9 },
        apiImpact: { value: "no", confidence: 0.9 },
        authenticationImpact: { value: "no", confidence: 0.9 },
        needsHumanReview: { value: "no", confidence: 0.9 },
        riskLevel: { value: "LOW", confidence: 0.9 },
    };
    return { ...base, ...partial };
}

function state(partial: Partial<PrState> = {}): PrState {
    return {
        files: [],
        additions: 0,
        deletions: 0,
        diffText: "",
        truncated: false,
        ...partial,
    };
}

describe("calculateRisk", () => {
    it("sums discrete weights to the expected score and level", () => {
        const breakdown = calculateRisk(
            state({
                files: Array.from({ length: 11 }, (_, i) => `f${i}.ts`),
                additions: 100,
                deletions: 110,
            }),
            decisions({
                securityImpact: { value: "yes", confidence: 0.9 },
                databaseChange: { value: "yes", confidence: 0.9 },
                apiImpact: { value: "yes", confidence: 0.9 },
                authenticationImpact: { value: "yes", confidence: 0.9 },
            }),
        );
        expect(breakdown.score).toBe(100);
        expect(breakdown.riskLevel).toBe("CRITICAL");
    });

    it("clamps score at 100 before level mapping", () => {
        const breakdown = calculateRisk(
            state({
                files: Array.from({ length: 12 }, (_, i) => `f${i}.ts`),
                additions: 300,
                deletions: 0,
            }),
            decisions({
                securityImpact: { value: "yes", confidence: 0.9 },
                databaseChange: { value: "yes", confidence: 0.9 },
                apiImpact: { value: "yes", confidence: 0.9 },
                authenticationImpact: { value: "yes", confidence: 0.9 },
            }),
        );
        expect(breakdown.score).toBe(100);
        expect(breakdown.riskLevel).toBe("CRITICAL");
    });

    it("maps score bands LOW / MEDIUM / HIGH / CRITICAL", () => {
        const low = calculateRisk(state(), decisions());
        expect(low.score).toBe(0);
        expect(low.riskLevel).toBe("LOW");

        const medium = calculateRisk(
            state(),
            decisions({ securityImpact: { value: "yes", confidence: 0.9 } }),
        );
        expect(medium.score).toBe(35);
        expect(medium.riskLevel).toBe("MEDIUM");

        const high = calculateRisk(
            state(),
            decisions({
                securityImpact: { value: "yes", confidence: 0.9 },
                databaseChange: { value: "yes", confidence: 0.9 },
                apiImpact: { value: "yes", confidence: 0.9 },
            }),
        );
        expect(high.score).toBe(75);
        expect(high.riskLevel).toBe("HIGH");

        const critical = calculateRisk(
            state({
                files: Array.from({ length: 11 }, (_, i) => `f${i}.ts`),
                additions: 201,
            }),
            decisions({
                securityImpact: { value: "yes", confidence: 0.9 },
                databaseChange: { value: "yes", confidence: 0.9 },
                apiImpact: { value: "yes", confidence: 0.9 },
                authenticationImpact: { value: "yes", confidence: 0.9 },
            }),
        );
        expect(critical.score).toBe(100);
        expect(critical.riskLevel).toBe("CRITICAL");
    });
});

describe("applyPolicy", () => {
    it("maps LOW→APPROVE, MEDIUM→REVIEW, HIGH→REVIEW when confidence ≥ 0.70", () => {
        const lowD = decisions();
        const lowPolicy = applyPolicy(calculateRisk(state(), lowD), lowD, 0.9);
        expect(lowPolicy.action).toBe("APPROVE");
        expect(lowPolicy.recommendation).toBe("Automatic approval possible");

        const medDec = decisions({
            securityImpact: { value: "yes", confidence: 0.9 },
        });
        const medBreakdown = calculateRisk(state(), medDec);
        expect(medBreakdown.riskLevel).toBe("MEDIUM");
        const medPolicy = applyPolicy(medBreakdown, medDec, 0.9);
        expect(medPolicy.action).toBe("REVIEW");
        expect(medPolicy.recommendation).toBe("Security review required");

        const highNoSec = decisions({
            databaseChange: { value: "yes", confidence: 0.9 },
            apiImpact: { value: "yes", confidence: 0.9 },
            authenticationImpact: { value: "yes", confidence: 0.9 },
        });
        const highBreakdown = calculateRisk(
            state({
                files: Array.from({ length: 11 }, (_, i) => `f${i}.ts`),
                additions: 201,
            }),
            highNoSec,
        );
        expect(highBreakdown.riskLevel).toBe("HIGH");
        const highPolicy = applyPolicy(highBreakdown, highNoSec, 0.9);
        expect(highPolicy.action).toBe("REVIEW");
        expect(highPolicy.recommendation).toBe("Human review recommended");
    });

    it("maps CRITICAL with high confidence to BLOCK and security phrase", () => {
        const d = decisions({
            securityImpact: { value: "yes", confidence: 0.96 },
            databaseChange: { value: "yes", confidence: 0.96 },
            apiImpact: { value: "yes", confidence: 0.96 },
            authenticationImpact: { value: "yes", confidence: 0.96 },
            breakingChange: { value: "no", confidence: 0.96 },
            needsHumanReview: { value: "yes", confidence: 0.96 },
            riskLevel: { value: "CRITICAL", confidence: 0.96 },
        });
        const breakdown = calculateRisk(
            state({
                files: Array.from({ length: 11 }, (_, i) => `f${i}.ts`),
                additions: 201,
            }),
            d,
        );
        const confidence = aggregateConfidence(d);
        expect(confidence).toBeGreaterThanOrEqual(0.7);
        const policy = applyPolicy(breakdown, d, confidence);
        expect(policy.action).toBe("BLOCK");
        expect(policy.recommendation).toContain("Security review required");
    });

    it("forces REVIEW when aggregated confidence is below 0.70", () => {
        const d = decisions({
            securityImpact: { value: "yes", confidence: 0.52 },
            databaseChange: { value: "yes", confidence: 0.52 },
            apiImpact: { value: "yes", confidence: 0.52 },
            authenticationImpact: { value: "yes", confidence: 0.52 },
            breakingChange: { value: "no", confidence: 0.52 },
            needsHumanReview: { value: "yes", confidence: 0.52 },
            riskLevel: { value: "CRITICAL", confidence: 0.52 },
        });
        const breakdown = calculateRisk(
            state({
                files: Array.from({ length: 11 }, (_, i) => `f${i}.ts`),
                additions: 201,
            }),
            d,
        );
        const confidence = aggregateConfidence(d);
        expect(confidence).toBeLessThan(0.7);
        const policy = applyPolicy(breakdown, d, confidence);
        expect(policy.action).toBe("REVIEW");
    });

    it("uses configured weights and recommendation strings", () => {
        const config: AppConfig = {
            ...DEFAULT_CONFIG,
            weights: {
                ...DEFAULT_CONFIG.weights,
                security: 10,
            },
            recommendations: {
                approve: "OK to merge",
                review: "Please look",
                blockOrSecurity: "Security hold",
            },
        };
        const d = decisions({
            securityImpact: { value: "yes", confidence: 0.9 },
        });
        const breakdown = calculateRisk(state(), d, config);
        expect(breakdown.score).toBe(10);
        const policy = applyPolicy(breakdown, d, 0.9, config);
        expect(policy.recommendation).toBe("Security hold");

        const approvePolicy = applyPolicy(
            calculateRisk(state(), decisions(), config),
            decisions(),
            0.9,
            config,
        );
        expect(approvePolicy.action).toBe("APPROVE");
        expect(approvePolicy.recommendation).toBe("OK to merge");

        const medConfig: AppConfig = {
            ...config,
            levels: { lowMax: 5, mediumMax: 20, highMax: 80 },
        };
        const reviewPolicy = applyPolicy(
            calculateRisk(
                state(),
                decisions({ apiImpact: { value: "yes", confidence: 0.9 } }),
                medConfig,
            ),
            decisions({ apiImpact: { value: "yes", confidence: 0.9 } }),
            0.9,
            medConfig,
        );
        expect(reviewPolicy.action).toBe("REVIEW");
        expect(reviewPolicy.recommendation).toBe("Please look");
    });

    it("uses configured file and line tiers", () => {
        const config: AppConfig = {
            ...DEFAULT_CONFIG,
            files: {
                tiers: [
                    { max: 1, points: 0 },
                    { above: 1, points: 40 },
                ],
            },
            lines: {
                tiers: [
                    { max: 10, points: 0 },
                    { above: 10, points: 7 },
                ],
            },
        };
        const breakdown = calculateRisk(
            state({
                files: ["a.ts", "b.ts"],
                additions: 20,
                deletions: 0,
            }),
            decisions(),
            config,
        );
        expect(breakdown.score).toBe(47);
        expect(
            breakdown.contributions.find((c) => c.signal === "files")?.points,
        ).toBe(40);
        expect(
            breakdown.contributions.find((c) => c.signal === "lines")?.points,
        ).toBe(7);
    });

    it("uses configured level bounds", () => {
        const config: AppConfig = {
            ...DEFAULT_CONFIG,
            levels: { lowMax: 5, mediumMax: 10, highMax: 15 },
        };
        const breakdown = calculateRisk(
            state(),
            decisions({ apiImpact: { value: "yes", confidence: 0.9 } }),
            config,
        );
        expect(breakdown.score).toBe(15);
        expect(breakdown.riskLevel).toBe("HIGH");
        const low = calculateRisk(state(), decisions(), config);
        expect(low.riskLevel).toBe("LOW");
    });

    it("uses configured confidence threshold", () => {
        const config: AppConfig = {
            ...DEFAULT_CONFIG,
            confidence: { threshold: 0.95 },
        };
        const d = decisions({
            securityImpact: { value: "yes", confidence: 0.9 },
            databaseChange: { value: "yes", confidence: 0.9 },
            apiImpact: { value: "yes", confidence: 0.9 },
            authenticationImpact: { value: "yes", confidence: 0.9 },
            breakingChange: { value: "no", confidence: 0.9 },
            needsHumanReview: { value: "yes", confidence: 0.9 },
            riskLevel: { value: "CRITICAL", confidence: 0.9 },
        });
        const breakdown = calculateRisk(
            state({
                files: Array.from({ length: 11 }, (_, i) => `f${i}.ts`),
                additions: 201,
            }),
            d,
            config,
        );
        const confidence = aggregateConfidence(d);
        expect(confidence).toBeLessThan(0.95);
        expect(applyPolicy(breakdown, d, confidence, config).action).toBe(
            "REVIEW",
        );
    });
});
