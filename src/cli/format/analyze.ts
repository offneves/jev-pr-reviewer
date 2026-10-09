import type { AnalysisResult, JevDecisions } from "../../schema.js";
import {
    BOLD,
    CYAN,
    DIM,
    YELLOW,
    boxTitle,
    formatRiskActionLine,
    padLabel,
    paint,
    pct,
    scoreBar,
    section,
    valueTone,
} from "./shared.js";
import { labelForDecision, type DisplayConfig } from "./types.js";

type DecisionKey = keyof JevDecisions;

function keysForGroup(
    result: AnalysisResult,
    order: string[],
): DecisionKey[] {
    const known = new Set(Object.keys(result.decisions));
    return order.filter((k) => known.has(k)) as DecisionKey[];
}

function unknownKeys(
    result: AnalysisResult,
    scoredOrder: string[],
    advisoryOrder: string[],
): DecisionKey[] {
    const listed = new Set([...scoredOrder, ...advisoryOrder]);
    return (Object.keys(result.decisions) as DecisionKey[]).filter(
        (k) => !listed.has(k),
    );
}

function renderDecisionBlock(
    keys: DecisionKey[],
    result: AnalysisResult,
    display: DisplayConfig,
): string[] {
    if (keys.length === 0) return [];
    const labels = keys.map((k) => labelForDecision(k, display));
    const labelWidth = Math.max(...labels.map((l) => l.length), 1);
    const lines: string[] = [];
    for (const key of keys) {
        const decision = result.decisions[key];
        const label = padLabel(labelForDecision(key, display), labelWidth);
        const value = paint(
            String(decision.value).padEnd(8, " "),
            valueTone(String(decision.value)),
        );
        lines.push(
            `  ${paint(label, DIM)}  ${value}  ${paint(pct(decision.confidence), CYAN)}`,
        );
    }
    return lines;
}

export function formatAnalyze(
    result: AnalysisResult,
    display: DisplayConfig,
): string {
    const sections = display.analyze.sections;
    const scoredKeys = keysForGroup(result, display.analyze.scored.order);
    const advisoryKeys = [
        ...keysForGroup(result, display.analyze.advisory.order),
        ...unknownKeys(
            result,
            display.analyze.scored.order,
            display.analyze.advisory.order,
        ),
    ];

    const lines: string[] = [];
    lines.push(boxTitle(display.analyze.title));
    lines.push("");
    lines.push(
        formatRiskActionLine(
            sections.risk,
            result.riskLevel,
            sections.action,
            result.action,
        ),
    );
    lines.push(
        `  ${paint("Score", DIM)}       ${scoreBar(result.score)}  ${paint(String(result.score), BOLD)}/100`,
    );
    lines.push(
        `  ${paint(sections.confidence, DIM)}  ${paint(pct(result.confidence), BOLD)}`,
    );
    lines.push("");
    lines.push(`  ${paint("→", CYAN)} ${paint(result.recommendation, BOLD)}`);
    lines.push("");

    lines.push(`  ${section(sections.scored)}`);
    lines.push(...renderDecisionBlock(scoredKeys, result, display));
    lines.push("");
    lines.push(`  ${section(sections.advisory)}`);
    lines.push(...renderDecisionBlock(advisoryKeys, result, display));

    const truncated = result.state.truncated
        ? paint(" · truncated", YELLOW)
        : "";
    lines.push("");
    lines.push(
        `  ${paint(sections.state, DIM)}  ${result.state.files.length} files · +${result.state.additions}/-${result.state.deletions}${truncated}`,
    );

    return lines.join("\n");
}
