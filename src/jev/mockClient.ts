import {
    JevDecisionsSchema,
    type Impact,
    type JevDecisions,
    type YesNo,
    type RiskLevel,
} from "../schema.js";
import type { JevClient } from "./types.js";

type DecisionOverrides = {
    [K in keyof JevDecisions]?: Partial<JevDecisions[K]> & {
        value?: JevDecisions[K]["value"];
    };
};

const DEFAULTS: JevDecisions = {
    breakingChange: { value: "no", confidence: 0.9 },
    securityImpact: { value: 0, confidence: 0.9 },
    databaseChange: { value: 0, confidence: 0.9 },
    apiImpact: { value: 0, confidence: 0.9 },
    authenticationImpact: { value: 0, confidence: 0.9 },
    needsHumanReview: { value: "no", confidence: 0.9 },
    riskLevel: { value: "LOW", confidence: 0.9 },
};

function mergeDecision<T extends YesNo | RiskLevel | Impact>(
    base: { value: T; confidence: number },
    override?: Partial<{ value: T; confidence: number }>,
): { value: T; confidence: number } {
    return {
        value: (override?.value ?? base.value) as T,
        confidence: override?.confidence ?? base.confidence,
    };
}

export type MockProfile = "default" | "busy" | "critical";

const PROFILES: Record<MockProfile, DecisionOverrides> = {
    default: {},
    busy: {
        breakingChange: { value: "yes", confidence: 0.82 },
        securityImpact: { value: 70, confidence: 0.88 },
        databaseChange: { value: 60, confidence: 0.91 },
        apiImpact: { value: 55, confidence: 0.86 },
        authenticationImpact: { value: 50, confidence: 0.84 },
        needsHumanReview: { value: "yes", confidence: 0.93 },
        riskLevel: { value: "HIGH", confidence: 0.87 },
    },
    critical: {
        breakingChange: { value: "yes", confidence: 0.96 },
        securityImpact: { value: 95, confidence: 0.97 },
        databaseChange: { value: 90, confidence: 0.95 },
        apiImpact: { value: 85, confidence: 0.94 },
        authenticationImpact: { value: 90, confidence: 0.96 },
        needsHumanReview: { value: "yes", confidence: 0.98 },
        riskLevel: { value: "CRITICAL", confidence: 0.97 },
    },
};

export function createMockJevClient(
    answers?: DecisionOverrides,
    profile: MockProfile = "default",
): JevClient {
    const profileAnswers = PROFILES[profile] ?? {};
    const mergedAnswers: DecisionOverrides = { ...profileAnswers, ...answers };

    return {
        async evaluate() {
            const merged: JevDecisions = {
                breakingChange: mergeDecision(
                    DEFAULTS.breakingChange,
                    mergedAnswers.breakingChange,
                ),
                securityImpact: mergeDecision(
                    DEFAULTS.securityImpact,
                    mergedAnswers.securityImpact,
                ),
                databaseChange: mergeDecision(
                    DEFAULTS.databaseChange,
                    mergedAnswers.databaseChange,
                ),
                apiImpact: mergeDecision(DEFAULTS.apiImpact, mergedAnswers.apiImpact),
                authenticationImpact: mergeDecision(
                    DEFAULTS.authenticationImpact,
                    mergedAnswers.authenticationImpact,
                ),
                needsHumanReview: mergeDecision(
                    DEFAULTS.needsHumanReview,
                    mergedAnswers.needsHumanReview,
                ),
                riskLevel: mergeDecision(DEFAULTS.riskLevel, mergedAnswers.riskLevel),
            };
            return JevDecisionsSchema.parse(merged);
        },
    };
}
