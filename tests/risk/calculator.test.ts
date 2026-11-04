import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config/defaults.js";
import type { AppConfig } from "../../src/config/schema.js";
import type { JevDecisions, PrState } from "../../src/schema.js";
import { calculateRisk } from "../../src/risk/calculator.js";
import {
    aggregateConfidence,
    applyPolicy,
    axesMissingEvidence,
} from "../../src/risk/policy.js";

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

    it("maps HIGH risk level to REVIEW when confidence is high and security is 0", () => {
        const config: AppConfig = {
            ...DEFAULT_CONFIG,
            weights: { security: 0, database: 1, api: 1, authentication: 1 },
        };
        const highOnly = decisions({
            databaseChange: { value: 70, confidence: 0.9 },
            apiImpact: { value: 70, confidence: 0.9 },
            authenticationImpact: { value: 70, confidence: 0.9 },
        });
        const hb = calculateRisk(state(), highOnly, config);
        expect(hb.score).toBe(70);
        expect(hb.riskLevel).toBe("HIGH");
        const policy = applyPolicy(hb, highOnly, 0.9, config);
        expect(policy.action).toBe("REVIEW");
        expect(policy.recommendation).toBe("Human review recommended");
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

});

describe("security hold threshold (SECPOL-01/02/03)", () => {
    // weights 0/0/0/1 keep risk LOW so APPROVE is the provisional action.
    const authOnly: AppConfig = {
        ...DEFAULT_CONFIG,
        weights: { security: 0, database: 0, api: 0, authentication: 1 },
    };

    function withSecurity(value: number, config = authOnly) {
        const d = decisions({
            securityImpact: { value, confidence: 0.9, evidenceIds: ["E1"] },
        });
        return applyPolicy(calculateRisk(state(), d, config), d, 0.95, config);
    }

    it("defaults securityHoldMinImpact to 30", () => {
        expect(DEFAULT_CONFIG.policy.securityHoldMinImpact).toBe(30);
    });

    it.each([0, 1, 29])("uses the approve text below the threshold (impact %i)", (value) => {
        const policy = withSecurity(value);
        expect(policy.action).toBe("APPROVE");
        expect(policy.recommendation).toBe("Automatic approval possible");
    });

    it.each([30, 100])("uses blockOrSecurity text at or above the threshold (impact %i)", (value) => {
        expect(withSecurity(value).recommendation).toBe("Security review required");
    });

    it("honors a configured threshold, including 0", () => {
        const zero: AppConfig = { ...authOnly, policy: { securityHoldMinImpact: 0 } };
        expect(withSecurity(0, zero).recommendation).toBe("Security review required");
        const fifty: AppConfig = { ...authOnly, policy: { securityHoldMinImpact: 50 } };
        expect(withSecurity(49, fifty).recommendation).toBe("Automatic approval possible");
        expect(withSecurity(50, fifty).recommendation).toBe("Security review required");
    });
});

describe("applyPolicy with truncated diff (TRUNC-02/03)", () => {
    it("emits REVIEW instead of APPROVE when truncated with LOW risk and high confidence", () => {
        const d = decisions();
        const breakdown = calculateRisk(state({ truncated: true }), d);
        expect(breakdown.riskLevel).toBe("LOW");
        const policy = applyPolicy(breakdown, d, 0.95, DEFAULT_CONFIG, {
            truncated: true,
        });
        expect(policy.action).toBe("REVIEW");
        expect(policy.recommendation).toBe("Human review recommended");
    });

    it("still emits BLOCK when truncated and risk is CRITICAL", () => {
        const d = decisions({
            securityImpact: { value: 100, confidence: 0.96 },
            databaseChange: { value: 100, confidence: 0.96 },
            apiImpact: { value: 100, confidence: 0.96 },
            authenticationImpact: { value: 100, confidence: 0.96 },
        });
        const breakdown = calculateRisk(state({ truncated: true }), d);
        const policy = applyPolicy(breakdown, d, 0.96, DEFAULT_CONFIG, {
            truncated: true,
        });
        expect(policy.action).toBe("BLOCK");
    });

    it("keeps APPROVE for LOW risk when not truncated", () => {
        const d = decisions();
        const policy = applyPolicy(calculateRisk(state(), d), d, 0.95, DEFAULT_CONFIG, {
            truncated: false,
        });
        expect(policy.action).toBe("APPROVE");
    });
});

describe("applyPolicy with deterministic gates (GATE-02/03/04)", () => {
    const block = { id: "migration-path", severity: "block" as const, matchedPaths: ["db/m.sql"] };
    const warn = { id: "auth-path", severity: "warn" as const, matchedPaths: ["src/auth/a.ts"] };
    const info = { id: "lockfile-change", severity: "info" as const, matchedPaths: ["package-lock.json"] };

    it("forces BLOCK when a block gate matched, even on LOW risk", () => {
        const d = decisions();
        const breakdown = calculateRisk(state(), d);
        const policy = applyPolicy(breakdown, d, 0.95, DEFAULT_CONFIG, { gates: [block] });
        expect(policy.action).toBe("BLOCK");
        expect(policy.recommendation).toBe("Security review required");
    });

    it("forces BLOCK on a block gate even when confidence is low", () => {
        const d = decisions();
        const policy = applyPolicy(calculateRisk(state(), d), d, 0.3, DEFAULT_CONFIG, {
            gates: [block],
        });
        expect(policy.action).toBe("BLOCK");
    });

    it("turns APPROVE into REVIEW when only a warn gate matched", () => {
        const d = decisions();
        const policy = applyPolicy(calculateRisk(state(), d), d, 0.95, DEFAULT_CONFIG, {
            gates: [warn],
        });
        expect(policy.action).toBe("REVIEW");
        expect(policy.recommendation).toBe("Human review recommended");
    });

    it("leaves a CRITICAL BLOCK untouched when only a warn gate matched", () => {
        const d = decisions({
            securityImpact: { value: 100, confidence: 0.96 },
            databaseChange: { value: 100, confidence: 0.96 },
            apiImpact: { value: 100, confidence: 0.96 },
            authenticationImpact: { value: 100, confidence: 0.96 },
        });
        const policy = applyPolicy(calculateRisk(state(), d), d, 0.96, DEFAULT_CONFIG, {
            gates: [warn],
        });
        expect(policy.action).toBe("BLOCK");
    });

    it("uses BLOCK when both warn and block gates matched", () => {
        const d = decisions();
        const policy = applyPolicy(calculateRisk(state(), d), d, 0.95, DEFAULT_CONFIG, {
            gates: [warn, block],
        });
        expect(policy.action).toBe("BLOCK");
    });

    it("keeps APPROVE when gates are empty or info only", () => {
        const d = decisions();
        const b = calculateRisk(state(), d);
        expect(applyPolicy(b, d, 0.95, DEFAULT_CONFIG, { gates: [] }).action).toBe("APPROVE");
        expect(applyPolicy(b, d, 0.95, DEFAULT_CONFIG, { gates: [info] }).action).toBe("APPROVE");
    });

    it("does not change score or contributions when gates fire", () => {
        const d = decisions({ databaseChange: { value: 40, confidence: 0.9 } });
        const before = calculateRisk(state(), d);
        const snapshot = structuredClone(before);
        applyPolicy(before, d, 0.95, DEFAULT_CONFIG, { gates: [block, warn] });
        expect(before).toEqual(snapshot);
        expect(before.score).toBe(11);
    });
});

describe("applyPolicy missing evidence (EVID-05/06)", () => {
    // weights 0/0/0/1 keep the score LOW while authenticationImpact is high.
    const authOnly: AppConfig = {
        ...DEFAULT_CONFIG,
        weights: { security: 1, database: 0, api: 0, authentication: 0 },
    };

    function lowScoreWithApi(value: number, evidenceIds: string[]) {
        const d = decisions({ apiImpact: { value, confidence: 0.9, evidenceIds } });
        const breakdown = calculateRisk(state(), d, authOnly);
        expect(breakdown.riskLevel).toBe("LOW");
        return applyPolicy(breakdown, d, 0.95, authOnly);
    }

    it("forces REVIEW when a scored axis is at 40 with no evidence", () => {
        expect(lowScoreWithApi(40, []).action).toBe("REVIEW");
    });

    it("does not force REVIEW when the high axis cites evidence", () => {
        expect(lowScoreWithApi(40, ["E1"]).action).toBe("APPROVE");
    });

    it("does not force REVIEW below the threshold", () => {
        expect(lowScoreWithApi(39, []).action).toBe("APPROVE");
    });

    it("leaves BLOCK untouched when evidence is missing", () => {
        const d = decisions({
            securityImpact: { value: 100, confidence: 0.96, evidenceIds: [] },
            databaseChange: { value: 100, confidence: 0.96, evidenceIds: [] },
            apiImpact: { value: 100, confidence: 0.96, evidenceIds: [] },
            authenticationImpact: { value: 100, confidence: 0.96, evidenceIds: [] },
        });
        expect(applyPolicy(calculateRisk(state(), d), d, 0.96).action).toBe("BLOCK");
    });

    it("uses evidence.minImpactForRequiredEvidence from config", () => {
        const config: AppConfig = {
            ...authOnly,
            evidence: { minImpactForRequiredEvidence: 50 },
        };
        const d = decisions({ apiImpact: { value: 45, confidence: 0.9, evidenceIds: [] } });
        expect(applyPolicy(calculateRisk(state(), d, config), d, 0.95, config).action).toBe(
            "APPROVE",
        );
    });

    it("lists the axes missing evidence", () => {
        const d = decisions({
            securityImpact: { value: 70, confidence: 0.9, evidenceIds: ["E1"] },
            apiImpact: { value: 40, confidence: 0.9, evidenceIds: [] },
            databaseChange: { value: 90, confidence: 0.9, evidenceIds: [] },
        });
        expect(axesMissingEvidence(d, 40)).toEqual(["databaseChange", "apiImpact"]);
    });
});

describe("aggregateConfidence scoredOnly (CONF-01/02)", () => {
    const d = decisions({
        securityImpact: { value: 0, confidence: 0.9 },
        databaseChange: { value: 0, confidence: 0.8 },
        apiImpact: { value: 0, confidence: 0.7 },
        authenticationImpact: { value: 0, confidence: 0.6 },
        breakingChange: { value: "no", confidence: 0.1 },
        needsHumanReview: { value: "no", confidence: 0.2 },
        riskLevel: { value: "LOW", confidence: 0.3 },
    });

    it("averages only the four scored axes by default", () => {
        expect(aggregateConfidence(d)).toBeCloseTo(0.75, 10);
        expect(aggregateConfidence(d, true)).toBeCloseTo(0.75, 10);
    });

    it("averages every decision when scoredOnly is false", () => {
        expect(aggregateConfidence(d, false)).toBeCloseTo(3.6 / 7, 10);
    });
});

describe("applyPolicy disagreement with JEV riskLevel (CONF-04/05)", () => {
    function lowAppWithJev(jev: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL", config = DEFAULT_CONFIG) {
        const d = decisions({ riskLevel: { value: jev, confidence: 0.9 } });
        const breakdown = calculateRisk(state(), d, config);
        expect(breakdown.riskLevel).toBe("LOW");
        return applyPolicy(breakdown, d, 0.95, config);
    }

    it.each([
        ["HIGH", 2],
        ["CRITICAL", 3],
    ] as const)("forces REVIEW when app is LOW and JEV says %s", (jev, ranks) => {
        const policy = lowAppWithJev(jev);
        expect(policy.action).toBe("REVIEW");
        expect(policy.disagreement).toEqual({
            appRiskLevel: "LOW",
            jevRiskLevel: jev,
            ranks,
            forcedReview: true,
        });
    });

    it.each(["LOW", "MEDIUM"] as const)(
        "does not force REVIEW when JEV says %s (fewer than 2 ranks)",
        (jev) => {
            const policy = lowAppWithJev(jev);
            expect(policy.action).toBe("APPROVE");
            expect(policy.disagreement).toBeNull();
        },
    );

    it("does not change action when disagreementForceReview is false", () => {
        const config: AppConfig = {
            ...DEFAULT_CONFIG,
            confidence: { ...DEFAULT_CONFIG.confidence, disagreementForceReview: false },
        };
        const policy = lowAppWithJev("CRITICAL", config);
        expect(policy.action).toBe("APPROVE");
        expect(policy.disagreement).toEqual({
            appRiskLevel: "LOW",
            jevRiskLevel: "CRITICAL",
            ranks: 3,
            forcedReview: false,
        });
    });

    it("does not mark forcedReview when low confidence already forced REVIEW", () => {
        const d = decisions({ riskLevel: { value: "CRITICAL", confidence: 0.9 } });
        const policy = applyPolicy(calculateRisk(state(), d), d, 0.5);
        expect(policy.action).toBe("REVIEW");
        expect(policy.disagreement?.forcedReview).toBe(false);
    });

    it("keeps BLOCK when app is CRITICAL and JEV says LOW", () => {
        const d = decisions({
            securityImpact: { value: 100, confidence: 0.96, evidenceIds: ["E1"] },
            databaseChange: { value: 100, confidence: 0.96, evidenceIds: ["E1"] },
            apiImpact: { value: 100, confidence: 0.96, evidenceIds: ["E1"] },
            authenticationImpact: { value: 100, confidence: 0.96, evidenceIds: ["E1"] },
            riskLevel: { value: "LOW", confidence: 0.96 },
        });
        const policy = applyPolicy(calculateRisk(state(), d), d, 0.96);
        expect(policy.action).toBe("BLOCK");
        expect(policy.disagreement).toEqual({
            appRiskLevel: "CRITICAL",
            jevRiskLevel: "LOW",
            ranks: 3,
            forcedReview: false,
        });
    });
});
