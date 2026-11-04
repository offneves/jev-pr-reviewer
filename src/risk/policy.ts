import type { AppConfig } from "../config/schema.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import type { JevDecisions, RiskLevel } from "../schema.js";
import type { RiskBreakdown } from "./calculator.js";

export type PolicyAction = "APPROVE" | "REVIEW" | "BLOCK";

export interface PolicyResult {
    action: PolicyAction;
    recommendation: string;
}

export function aggregateConfidence(decisions: JevDecisions): number {
    const values = Object.values(decisions).map((d) => d.confidence);
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

    return {
        action,
        recommendation: recommendationFor(
            action,
            hasSecurityImpact(decisions),
            config.recommendations,
        ),
    };
}
