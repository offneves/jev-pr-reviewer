import type { AnalysisResult, ScoreContribution } from "../../schema.js";
import {
    BOLD,
    DIM,
    YELLOW,
    boxTitle,
    padLabel,
    paint,
    riskColor,
    scoreBar,
    section,
} from "./shared.js";
import { labelForSignal, type DisplayConfig } from "./types.js";


function orderedContributions(
    result: AnalysisResult,
    display: DisplayConfig,
): ScoreContribution[] {
    const bySignal = new Map(
        result.contributions.map((c) => [c.signal, c] as const),
    );
    const ordered: ScoreContribution[] = [];
    for (const signal of display.explain.signals.order) {
        const item = bySignal.get(signal);
        if (item) {
            ordered.push(item);
            bySignal.delete(signal);
        }
    }
    for (const leftover of bySignal.values()) {
        ordered.push(leftover);
    }
    return ordered;
}

export function formatExplain(
    result: AnalysisResult,
    display: DisplayConfig,
): string {
    const sections = display.explain.sections;
    const contributions = orderedContributions(result, display);
    const lines: string[] = [];

    lines.push(boxTitle(display.explain.title));
    lines.push("");
    lines.push(`  ${section(sections.contributions)}`);

    const maxPoints = Math.max(1, ...contributions.map((c) => c.points));
    const displayLabels = contributions.map((c) => labelForSignal(c.signal, display));
    const labelWidth = Math.max(...displayLabels.map((l) => l.length), 8);

    for (const c of contributions) {
        const barWidth = 16;
        const filled = Math.round((c.points / Math.max(maxPoints, 100)) * barWidth);
        const bar = `${"▓".repeat(filled)}${"░".repeat(barWidth - filled)}`;
        const impact = paint(
            String(c.points).padStart(3, " "),
            c.points > 0 ? YELLOW : DIM,
        );
        const label = padLabel(labelForSignal(c.signal, display), labelWidth);
        lines.push(
            `  ${paint(label, DIM)}  ${impact}  ${paint(bar, DIM)}  ${paint(c.detail, DIM)}`,
        );
    }

    lines.push("");
    lines.push(`  ${paint(sections.totalScore, BOLD)} ${paint(String(result.score), BOLD)}  ${scoreBar(result.score)}`);
    lines.push(`  ${paint(sections.riskLevel, BOLD)}  ${paint(result.riskLevel, BOLD, riskColor(result.riskLevel))}`);

    return lines.join("\n");
}
