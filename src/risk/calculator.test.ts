import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import type { AppConfig } from "../config/schema.js";
import type { JevDecisions, PrState } from "../schema.js";
import { calculateRisk } from "./calculator.js";
import { aggregateConfidence, applyPolicy } from "./policy.js";

function decisions(partial: Partial<JevDecisions> = {}): JevDecisions {
    const base: JevDecisions = {
        breakingChange: { value: "no", confidence: 0.9 },
        securityImpact: { value: 0, confidence: 0.9 },
        databaseChange: { value: 0, confidence: 0.9 },
        apiImpact: { value: 0, confidence: 0.9 },
        authenticationImpact: { value: 0, confidence: 0.9 },
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
    it("computes weighted average for the plan example → score 51", () => {
        const breakdown = calculateRisk(
            state(),
            decisions({
                securityImpact: { value: 85, confidence: 0.9 },
                databaseChange: { value: 40, confidence: 0.9 },
                apiImpact: { value: 10, confidence: 0.9 },
                authenticationImpact: { value: 0, confidence: 0.9 },
            }),
        );
        // (85*5 + 40*3 + 10*2 + 0*1) / 11 = 565/11 ≈ 51.36 → 51
        expect(breakdown.score).toBe(51);
        expect(breakdown.riskLevel).toBe("MEDIUM");
        expect(breakdown.contributions.map((c) => c.signal)).toEqual([
            "security",
            "database",
            "api",
            "authentication",
        ]);
        expect(
            breakdown.contributions.find((c) => c.signal === "files"),
        ).toBeUndefined();
        expect(
            breakdown.contributions.find((c) => c.signal === "lines"),
        ).toBeUndefined();
    });

    it("returns score 0 when all impacts are 0", () => {
        const breakdown = calculateRisk(state(), decisions());
        expect(breakdown.score).toBe(0);
        expect(breakdown.riskLevel).toBe("LOW");
    });

    it("does not add files or lines into the score", () => {
        const breakdown = calculateRisk(
            state({
                files: Array.from({ length: 50 }, (_, i) => `f${i}.ts`),
                additions: 5000,
                deletions: 5000,
            }),
            decisions(),
        );
        expect(breakdown.score).toBe(0);
        expect(breakdown.contributions.every((c) => !["files", "lines"].includes(c.signal))).toBe(
            true,
        );
    });

    it("embeds impact and weight in contribution details", () => {
        const breakdown = calculateRisk(
            state(),
            decisions({ securityImpact: { value: 85, confidence: 0.9 } }),
        );
        const security = breakdown.contributions.find((c) => c.signal === "security");
        expect(security?.points).toBe(85);
        expect(security?.detail).toMatch(/impact 85/);
        expect(security?.detail).toMatch(/weight 5/);
    });

    it("maps score bands LOW / MEDIUM / HIGH / CRITICAL", () => {
        expect(calculateRisk(state(), decisions()).riskLevel).toBe("LOW");

        const medium = calculateRisk(
            state(),
            decisions({
                securityImpact: { value: 85, confidence: 0.9 },
                databaseChange: { value: 40, confidence: 0.9 },
                apiImpact: { value: 10, confidence: 0.9 },
            }),
        );
        expect(medium.score).toBe(51);
        expect(medium.riskLevel).toBe("MEDIUM");

        const high = calculateRisk(
            state(),
            decisions({
                securityImpact: { value: 100, confidence: 0.9 },
                databaseChange: { value: 100, confidence: 0.9 },
                apiImpact: { value: 100, confidence: 0.9 },
                authenticationImpact: { value: 0, confidence: 0.9 },
            }),
        );
        // (100*5+100*3+100*2+0)/11 = 1000/11 ≈ 90.9 → 91 HIGH? highMax 80 → CRITICAL
        expect(high.score).toBe(91);
        expect(high.riskLevel).toBe("CRITICAL");

        const justHigh = calculateRisk(
            state(),
            decisions({
                securityImpact: { value: 80, confidence: 0.9 },
                databaseChange: { value: 80, confidence: 0.9 },
                apiImpact: { value: 80, confidence: 0.9 },
                authenticationImpact: { value: 80, confidence: 0.9 },
            }),
        );
        expect(justHigh.score).toBe(80);
        expect(justHigh.riskLevel).toBe("HIGH");
    });

    it("clamps rounded average to 0..100", () => {
        const breakdown = calculateRisk(
            state(),
            decisions({
                securityImpact: { value: 100, confidence: 0.9 },
                databaseChange: { value: 100, confidence: 0.9 },
                apiImpact: { value: 100, confidence: 0.9 },
                authenticationImpact: { value: 100, confidence: 0.9 },
            }),
        );
        expect(breakdown.score).toBe(100);
        expect(breakdown.riskLevel).toBe("CRITICAL");
    });
});

describe("applyPolicy", () => {
    it("maps LOW→APPROVE, MEDIUM→REVIEW when confidence ≥ 0.70", () => {
        const lowD = decisions();
        const lowPolicy = applyPolicy(calculateRisk(state(), lowD), lowD, 0.9);
        expect(lowPolicy.action).toBe("APPROVE");
        expect(lowPolicy.recommendation).toBe("Automatic approval possible");

        const medDec = decisions({
            securityImpact: { value: 85, confidence: 0.9 },
            databaseChange: { value: 40, confidence: 0.9 },
            apiImpact: { value: 10, confidence: 0.9 },
            authenticationImpact: { value: 0, confidence: 0.9 },
        });
        const medBreakdown = calculateRisk(state(), medDec);
        expect(medBreakdown.score).toBe(51);
        expect(medBreakdown.riskLevel).toBe("MEDIUM");
        const medPolicy = applyPolicy(medBreakdown, medDec, 0.9);
        expect(medPolicy.action).toBe("REVIEW");
        expect(medPolicy.recommendation).toBe("Security review required");
    });

    it("uses human review text when security impact is 0", () => {
        const d = decisions({
            databaseChange: { value: 100, confidence: 0.9 },
            apiImpact: { value: 100, confidence: 0.9 },
            authenticationImpact: { value: 100, confidence: 0.9 },
        });
        const breakdown = calculateRisk(state(), d);
        expect(breakdown.score).toBeGreaterThan(30);
        const policy = applyPolicy(breakdown, d, 0.9);
        expect(policy.action).toBe("REVIEW");
        expect(policy.recommendation).toBe("Human review recommended");
    });

    it("maps CRITICAL with high confidence to BLOCK and security phrase", () => {
        const d = decisions({
            securityImpact: { value: 100, confidence: 0.96 },
            databaseChange: { value: 100, confidence: 0.96 },
            apiImpact: { value: 100, confidence: 0.96 },
            authenticationImpact: { value: 100, confidence: 0.96 },
            breakingChange: { value: "no", confidence: 0.96 },
            needsHumanReview: { value: "yes", confidence: 0.96 },
            riskLevel: { value: "CRITICAL", confidence: 0.96 },
        });
        const breakdown = calculateRisk(state(), d);
        const confidence = aggregateConfidence(d);
        expect(confidence).toBeGreaterThanOrEqual(0.7);
        const policy = applyPolicy(breakdown, d, confidence);
        expect(policy.action).toBe("BLOCK");
        expect(policy.recommendation).toContain("Security review required");
    });

    it("forces REVIEW when aggregated confidence is below 0.70", () => {
        const d = decisions({
            securityImpact: { value: 100, confidence: 0.52 },
            databaseChange: { value: 100, confidence: 0.52 },
            apiImpact: { value: 100, confidence: 0.52 },
            authenticationImpact: { value: 100, confidence: 0.52 },
            breakingChange: { value: "no", confidence: 0.52 },
            needsHumanReview: { value: "yes", confidence: 0.52 },
            riskLevel: { value: "CRITICAL", confidence: 0.52 },
        });
        const breakdown = calculateRisk(state(), d);
        const confidence = aggregateConfidence(d);
        expect(confidence).toBeLessThan(0.7);
        const policy = applyPolicy(breakdown, d, confidence);
        expect(policy.action).toBe("REVIEW");
    });

    it("uses configured relative weights and recommendation strings", () => {
        const config: AppConfig = {
            ...DEFAULT_CONFIG,
            weights: {
                security: 1,
                database: 0,
                api: 0,
                authentication: 0,
            },
            recommendations: {
                approve: "OK to merge",
                review: "Please look",
                blockOrSecurity: "Security hold",
            },
        };
        const d = decisions({
            securityImpact: { value: 40, confidence: 0.9 },
        });
        const breakdown = calculateRisk(state(), d, config);
        expect(breakdown.score).toBe(40);
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
    });

    it("uses configured level bounds", () => {
        const config: AppConfig = {
            ...DEFAULT_CONFIG,
            levels: { lowMax: 5, mediumMax: 10, highMax: 15 },
        };
        const breakdown = calculateRisk(
            state(),
            decisions({
                securityImpact: { value: 0, confidence: 0.9 },
                databaseChange: { value: 0, confidence: 0.9 },
                apiImpact: { value: 33, confidence: 0.9 },
                authenticationImpact: { value: 0, confidence: 0.9 },
            }),
            config,
        );
        // (0+0+33*2+0)/11 ≈ 6 → MEDIUM with custom bounds? 6 > 5 and <= 10 → MEDIUM
        expect(breakdown.score).toBe(6);
        expect(breakdown.riskLevel).toBe("MEDIUM");
        const low = calculateRisk(state(), decisions(), config);
        expect(low.riskLevel).toBe("LOW");
    });

    it("uses configured confidence threshold", () => {
        const config: AppConfig = {
            ...DEFAULT_CONFIG,
            confidence: { threshold: 0.95 },
        };
        const d = decisions({
            securityImpact: { value: 100, confidence: 0.9 },
            databaseChange: { value: 100, confidence: 0.9 },
            apiImpact: { value: 100, confidence: 0.9 },
            authenticationImpact: { value: 100, confidence: 0.9 },
            breakingChange: { value: "no", confidence: 0.9 },
            needsHumanReview: { value: "yes", confidence: 0.9 },
            riskLevel: { value: "CRITICAL", confidence: 0.9 },
        });
        const breakdown = calculateRisk(state(), d, config);
        const confidence = aggregateConfidence(d);
        expect(confidence).toBeLessThan(0.95);
        expect(applyPolicy(breakdown, d, confidence, config).action).toBe(
            "REVIEW",
        );
    });

    it("treats securityImpact >= 1 like former security yes", () => {
        const d = decisions({
            securityImpact: { value: 1, confidence: 0.9 },
        });
        const policy = applyPolicy(calculateRisk(state(), d), d, 0.9);
        expect(policy.recommendation).toBe("Security review required");
    });
});
