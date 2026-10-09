import type { AppConfig } from "../config/schema.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { AnalysisResultSchema, type AnalysisResult } from "../schema.js";
import type { JevClient } from "../jev/types.js";
import { buildStateFromDiffFile } from "../state/buildState.js";
import { calculateRisk } from "../risk/calculator.js";
import { aggregateConfidence, applyPolicy } from "../risk/policy.js";

export async function analyzeDiff(
    path: string,
    client: JevClient,
    config: AppConfig = DEFAULT_CONFIG,
): Promise<AnalysisResult> {
    const state = await buildStateFromDiffFile(path, config.diff.maxChars);
    const decisions = await client.evaluate(state);
    const breakdown = calculateRisk(state, decisions, config);
    const confidence = aggregateConfidence(decisions);
    const policy = applyPolicy(breakdown, decisions, confidence, config);

    return AnalysisResultSchema.parse({
        state,
        decisions,
        score: breakdown.score,
        riskLevel: breakdown.riskLevel,
        confidence,
        action: policy.action,
        recommendation: policy.recommendation,
        contributions: breakdown.contributions,
    });
}
