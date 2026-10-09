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

function pointsFromTiers(
    value: number,
    tiers: AppConfig["files"]["tiers"],
    signal: string,
): ScoreContribution {
    const orderedMax = tiers
        .filter((t) => t.max !== undefined)
        .sort((a, b) => (a.max ?? 0) - (b.max ?? 0));
    for (const tier of orderedMax) {
        if (value <= (tier.max as number)) {
            return {
                signal,
                points: tier.points,
                detail: `${value} ${signal} (≤${tier.max})`,
            };
        }
    }
    const above = [...tiers].reverse().find((t) => t.above !== undefined);
    if (above) {
        return {
            signal,
            points: above.points,
            detail: `${value} ${signal} (>${above.above})`,
        };
    }
    return { signal, points: 0, detail: `${value} ${signal}` };
}

function yesPoints(
    signal: string,
    yes: boolean,
    weight: number,
): ScoreContribution {
    return {
        signal,
        points: yes ? weight : 0,
        detail: yes ? `${signal} = yes (+${weight})` : `${signal} = no`,
    };
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
    const { weights, files, lines, levels } = config;
    
    const contributions: ScoreContribution[] = [
        yesPoints(
            "security",
            decisions.securityImpact.value >= 1,
            weights.security,
        ),
        yesPoints(
            "database",
            decisions.databaseChange.value >= 1,
            weights.database,
        ),
        yesPoints("api", decisions.apiImpact.value >= 1, weights.api),
        yesPoints(
            "authentication",
            decisions.authenticationImpact.value >= 1,
            weights.authentication,
        ),
        pointsFromTiers(state.files.length, files.tiers, "files"),
        pointsFromTiers(state.additions + state.deletions, lines.tiers, "lines"),
    ];

    const raw = contributions.reduce((sum, c) => sum + c.points, 0);
    const score = Math.min(100, raw);
    return {
        score,
        riskLevel: mapScoreToLevel(score, levels),
        contributions,
    };
}
