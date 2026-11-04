import type { AppConfig } from "../config/schema.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { AnalysisResultSchema, type AnalysisResult } from "../schema.js";
import type { JevClient } from "../jev/types.js";
import { readDiffInput } from "../state/buildState.js";
import { summarizeInventory } from "../state/inventory.js";
import { buildEvidenceCatalog, keepKnownEvidenceIds } from "../state/evidence.js";
import { calculateRisk } from "../risk/calculator.js";
import { aggregateConfidence, applyPolicy } from "../risk/policy.js";
import { evaluateGates } from "../risk/gates.js";
import { buildHotspots, buildSummary, type SummaryInput } from "../report/summary.js";

export async function analyzeDiff(
    path: string,
    client: JevClient,
    config: AppConfig = DEFAULT_CONFIG,
): Promise<AnalysisResult> {
    const { state, truncation, inventory, text } = await readDiffInput(
        path,
        config.diff.maxChars,
    );
    const gates = evaluateGates(inventory, text, config.gates.rules);
    const evidence = buildEvidenceCatalog(text);
    const decisions = keepKnownEvidenceIds(
        await client.evaluate(state, {
            inventory: summarizeInventory(inventory),
            evidence,
        }),
        evidence,
    );
    const breakdown = calculateRisk(state, decisions, config);
    const confidence = aggregateConfidence(decisions, config.confidence.scoredOnly);
    const policy = applyPolicy(breakdown, decisions, confidence, config, {
        truncated: truncation.truncated,
        gates,
        paths: inventory.files.map((f) => f.path),
    });

    const base: SummaryInput = {
        state,
        truncation,
        inventory,
        gates,
        evidence,
        disagreement: policy.disagreement,
        decisions,
        score: breakdown.score,
        riskLevel: breakdown.riskLevel,
        confidence,
        action: policy.action,
        recommendation: policy.recommendation,
        contributions: breakdown.contributions,
    };

    return AnalysisResultSchema.parse({
        ...base,
        summary: buildSummary(base, config),
        hotspots: buildHotspots(inventory, text, gates),
    });
}
