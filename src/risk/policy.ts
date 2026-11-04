import type { AppConfig } from "../config/schema.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import type { JevDecisions, RiskLevel } from "../schema.js";
import type { RiskBreakdown } from "./calculator.js";
import type { GateResult } from "./gates.js";

export type PolicyAction = "APPROVE" | "REVIEW" | "BLOCK";

export interface PolicyResult {
    action: PolicyAction;
    recommendation: string;
}

const SCORED_KEYS = [
    "securityImpact",
    "databaseChange",
    "apiImpact",
    "authenticationImpact",
] as const;

/**
 * Mean decision confidence. scoredOnly (default) averages the four scored axes;
 * otherwise every decision, advisory included.
 */
export function aggregateConfidence(decisions: JevDecisions, scoredOnly = true): number {
    const values = scoredOnly
        ? SCORED_KEYS.map((k) => decisions[k].confidence)
        : Object.values(decisions).map((d) => d.confidence);
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

function actionFromLevel(level: RiskLevel): PolicyAction {
    switch (level) {
        case "LOW":
            return "APPROVE";
        case "MEDIUM":
        case "HIGH":
            return "REVIEW";
        case "CRITICAL":
            return "BLOCK";
    }
}

export function hasSecurityImpact(decisions: JevDecisions): boolean {
    return decisions.securityImpact.value >= 1;
}

function recommendationFor(
    action: PolicyAction,
    securityImpactPresent: boolean,
    recommendations: AppConfig["recommendations"],
): string {
    if (securityImpactPresent) {
        return recommendations.blockOrSecurity;
    }
    if (action === "APPROVE") return recommendations.approve;
    if (action === "BLOCK") return recommendations.blockOrSecurity;
    return recommendations.review;
}

export interface PolicyContext {
    /** Diff was cut to fit diff.maxChars: JEV saw a partial PR. */
    truncated?: boolean;
    /** Matched deterministic gates: block forces BLOCK, warn prevents APPROVE. */
    gates?: GateResult[];
}

const SCORED_AXES = [
    "securityImpact",
    "databaseChange",
    "apiImpact",
    "authenticationImpact",
] as const;

/** Scored axes with impact >= minImpact that cite no evidence. */
export function axesMissingEvidence(
    decisions: JevDecisions,
    minImpact: number,
): (typeof SCORED_AXES)[number][] {
    return SCORED_AXES.filter(
        (axis) =>
            decisions[axis].value >= minImpact &&
            (decisions[axis].evidenceIds ?? []).length === 0,
    );
}

export function applyPolicy(
    breakdown: RiskBreakdown,
    decisions: JevDecisions,
    confidence: number,
    config: AppConfig = DEFAULT_CONFIG,
    context: PolicyContext = {},
): PolicyResult {
    let action: PolicyAction =
        confidence < config.confidence.threshold
            ? "REVIEW"
            : actionFromLevel(breakdown.riskLevel);
    if (context.truncated && action === "APPROVE") {
        action = "REVIEW";
    }
    if (
        action === "APPROVE" &&
        axesMissingEvidence(decisions, config.evidence.minImpactForRequiredEvidence).length > 0
    ) {
        action = "REVIEW";
    }
    const gates = context.gates ?? [];
    if (gates.some((g) => g.severity === "block")) {
        action = "BLOCK";
    } else if (gates.some((g) => g.severity === "warn") && action === "APPROVE") {
        action = "REVIEW";
    }

    return {
        action,
        recommendation: recommendationFor(
            action,
            hasSecurityImpact(decisions),
            config.recommendations,
        ),
    };
}
