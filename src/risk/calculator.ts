import type { AppConfig } from "../config/schema.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import type {
    JevDecisions,
    PrState,
    RiskLevel,
    ScoreContribution,
} from "../schema.js";

export interface RiskBreakdown {
    score: number;
    riskLevel: RiskLevel;
    contributions: ScoreContribution[];
}

export function mapScoreToLevel(
    score: number,
    levels: AppConfig["levels"] = DEFAULT_CONFIG.levels,
): RiskLevel {
    if (score <= levels.lowMax) return "LOW";
    if (score <= levels.mediumMax) return "MEDIUM";
    if (score <= levels.highMax) return "HIGH";
    return "CRITICAL";
}

export function calculateRisk(
    state: PrState,
    decisions: JevDecisions,
    config: AppConfig = DEFAULT_CONFIG,
): RiskBreakdown {
    void state;
    const { weights, levels } = config;

    const axes = [
        {
            signal: "security",
            impact: decisions.securityImpact.value,
            weight: weights.security,
        },
        {
            signal: "database",
            impact: decisions.databaseChange.value,
            weight: weights.database,
        },
        {
            signal: "api",
            impact: decisions.apiImpact.value,
            weight: weights.api,
        },
        {
            signal: "authentication",
            impact: decisions.authenticationImpact.value,
            weight: weights.authentication,
        },
    ];

    const weightSum = axes.reduce((sum, a) => sum + a.weight, 0);
    const weighted =
        weightSum === 0
            ? 0
            : axes.reduce((sum, a) => sum + a.impact * a.weight, 0) / weightSum;
    const score = Math.min(100, Math.max(0, Math.round(weighted)));

    const contributions: ScoreContribution[] = axes.map((a) => ({
        signal: a.signal,
        points: a.impact,
        detail: `impact ${a.impact} (weight ${a.weight})`,
    }));

    return {
        score,
        riskLevel: mapScoreToLevel(score, levels),
        contributions,
    };
}
