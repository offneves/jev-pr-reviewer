import type { AnalysisResult, JevDecisions } from "../../schema.js";
import {
    BOLD,
    CYAN,
    DIM,
    YELLOW,
    actionColor,
    boxTitle,
    padLabel,
    paint,
    pct,
    riskColor,
    scoreBar,
    section,
    valueTone,
} from "./shared.js";
import { labelForDecision, type DisplayConfig } from "./types.js";


function decisionKeys(
    result: AnalysisResult,
    display: DisplayConfig,
): (keyof JevDecisions)[] {
    const known = new Set(Object.keys(result.decisions));
    const ordered = display.analyze.decisions.order.filter((k) =>
        known.has(k),
    ) as (keyof JevDecisions)[];
    const extras = (Object.keys(result.decisions) as (keyof JevDecisions)[]).filter(
        (k) => !display.analyze.decisions.order.includes(k),
    );
    return [...ordered, ...extras];
}

export function formatAnalyze(
    result: AnalysisResult,
    display: DisplayConfig,
): string {
    const levelPaint = paint(
        result.riskLevel,
        BOLD,
        riskColor(result.riskLevel),
    );
    const actionPaint = paint(
        result.action,
        BOLD,
        actionColor(result.action),
    );
    const sections = display.analyze.sections;
    const lines: string[] = [];

    lines.push(boxTitle(display.analyze.title));
    lines.push("");
    lines.push(`  ${paint(sections.risk, DIM)}        ${levelPaint}`);
    lines.push(`  ${paint("Score", DIM)}       ${scoreBar(result.score)}  ${paint(String(result.score), BOLD)}/100`);
    lines.push(`  ${paint(sections.confidence, DIM)}  ${paint(pct(result.confidence), BOLD)}`);
    lines.push(`  ${paint(sections.action, DIM)}      ${actionPaint}`);
    lines.push("");
    lines.push(`  ${paint("→", CYAN)} ${paint(result.recommendation, BOLD)}`);
    lines.push("");
    lines.push(`  ${section(sections.decisions)}`);

    const keys = decisionKeys(result, display);
    const labels = keys.map((k) => labelForDecision(k, display));
    const labelWidth = Math.max(...labels.map((l) => l.length), 1);

    for (const key of keys) {
        const decision = result.decisions[key];
        const label = padLabel(labelForDecision(key, display), labelWidth);
        const value = paint(
            String(decision.value).padEnd(8, " "),
            valueTone(String(decision.value)),
        );
        lines.push(`  ${paint(label, DIM)}  ${value}  ${paint(pct(decision.confidence), CYAN)}`);
    }

    const truncated = result.state.truncated ? paint(" · truncated", YELLOW) : "";
    lines.push("");
    lines.push(`  ${paint(sections.state, DIM)}  ${result.state.files.length} files · +${result.state.additions}/-${result.state.deletions}${truncated}`);

    return lines.join("\n");
}
