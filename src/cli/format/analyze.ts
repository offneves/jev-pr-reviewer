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
    disagreementNote,
    gatesSection,
    section,
    truncationWarning,
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

const CITATION_SNIPPET_CHARS = 60;

function citationLines(
    decision: AnalysisResult["decisions"][DecisionKey],
    result: AnalysisResult,
    labelWidth: number,
): string[] {
    const ids = "evidenceIds" in decision ? decision.evidenceIds : [];
    const byId = new Map(result.evidence.map((e) => [e.id, e] as const));
    const indent = " ".repeat(labelWidth + 4);
    return ids.flatMap((id) => {
        const item = byId.get(id);
        if (!item) return [];
        const first = item.snippet.split("\n")[0] ?? "";
        const snippet =
            first.length > CITATION_SNIPPET_CHARS
                ? `${first.slice(0, CITATION_SNIPPET_CHARS - 1)}…`
                : first;
        return [`${indent}${paint(`${id} ${item.path}`, CYAN)}  ${paint(snippet, DIM)}`];
    });
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
        lines.push(...citationLines(decision, result, labelWidth));
    }
    return lines;
}

function symbolSummary(result: AnalysisResult): string {
    const { added, modified, removed } = result.inventory.symbols;
    const total = added.length + modified.length + removed.length;
    return `${total} symbols (+${added.length} ~${modified.length} -${removed.length})`;
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
    const warning = truncationWarning(result);
    if (warning.length > 0) {
        lines.push(...warning);
        lines.push("");
    }
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
    lines.push(`  ${section(sections.summary ?? "Summary")}`);
    for (const bullet of result.summary) {
        lines.push(`  - ${bullet}`);
    }
    lines.push("");
    const note = disagreementNote(result);
    if (note.length > 0) {
        lines.push(...note);
        lines.push("");
    }
    const gates = gatesSection(result);
    if (gates.length > 0) {
        lines.push(...gates);
        lines.push("");
    }
    if (result.hotspots.length > 0) {
        lines.push(`  ${section(sections.hotspots ?? "Hotspots")}`);
        const width = Math.max(...result.hotspots.map((h) => h.path.length));
        for (const h of result.hotspots) {
            lines.push(`  ${padLabel(h.path, width)}  ${paint(h.reason, DIM)}`);
        }
        lines.push("");
    }

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
        `  ${paint(sections.state, DIM)}  ${result.inventory.files.length} files · +${result.state.additions}/-${result.state.deletions} · ${symbolSummary(result)}${truncated}`,
    );

    return lines.join("\n");
}
