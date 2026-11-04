import type { AppConfig } from "../config/schema.js";
import type { AnalysisResult } from "../schema.js";

/** Reasons a result fails --strict; empty means the run is clean. */
export function strictFailures(result: AnalysisResult, config: AppConfig): string[] {
    const reasons: string[] = [];
    if (result.action === "BLOCK") reasons.push("action is BLOCK");
    if (result.state.truncated) reasons.push("diff was truncated");
    if (result.confidence < config.confidence.threshold) {
        reasons.push(
            `confidence ${(result.confidence * 100).toFixed(1)}% is below threshold ${(config.confidence.threshold * 100).toFixed(1)}%`,
        );
    }
    const blockGates = result.gates.filter((g) => g.severity === "block").map((g) => g.id);
    if (blockGates.length > 0) reasons.push(`block gate matched: ${blockGates.join(", ")}`);
    return reasons;
}
