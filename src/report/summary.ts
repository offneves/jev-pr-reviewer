// SPEC_DEVIATION: design.md places these in src/cli/summary.ts.
// Reason: the pipeline needs them for --json; src/report keeps pipeline free of CLI imports.
import type { AppConfig } from "../config/schema.js";
import type { AnalysisResult, ChangeInventory, GateResultJson } from "../schema.js";
import { axesMissingEvidence } from "../risk/policy.js";
import { splitFiles } from "../state/inventory.js";

export const HOTSPOT_LIMIT = 5;

export type SummaryInput = Omit<AnalysisResult, "summary" | "hotspots">;

export interface Hotspot {
    path: string;
    reason: string;
}

const AXIS_LABEL = {
    securityImpact: "security",
    databaseChange: "database",
    apiImpact: "api",
    authenticationImpact: "authentication",
} as const;

function plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function shapeBullet(r: SummaryInput): string {
    const files = r.inventory.files;
    if (files.length === 0) {
        return "No file changes detected in the diff";
    }
    const count = (status: string) => files.filter((f) => f.status === status).length;
    const parts = [
        ["added", count("added")],
        ["modified", count("modified")],
        ["deleted", count("deleted")],
        ["renamed", count("renamed")],
    ]
        .filter(([, n]) => (n as number) > 0)
        .map(([label, n]) => `${n} ${label}`);
    const { added, modified, removed } = r.inventory.symbols;
    const symbols = added.length + modified.length + removed.length;
    const dirs = r.inventory.blastRadius.directories.length;
    const dirLabel = `${dirs} ${dirs === 1 ? "directory" : "directories"}`;
    return `${plural(files.length, "file")} (${parts.join(", ")}) in ${dirLabel}; +${r.state.additions}/-${r.state.deletions} lines; ${plural(symbols, "symbol")} changed`;
}

function impactBullet(r: SummaryInput): string {
    const top = (Object.keys(AXIS_LABEL) as (keyof typeof AXIS_LABEL)[])
        .map((axis) => ({ axis, value: r.decisions[axis].value }))
        .filter((a) => a.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 2)
        .map((a) => `${AXIS_LABEL[a.axis]} ${a.value}`);
    const tail = `score ${r.score}, ${r.riskLevel}`;
    return top.length > 0
        ? `Top impacts: ${top.join(", ")} (${tail})`
        : `JEV reported no impact on scored axes (${tail})`;
}

function gateLabel(g: GateResultJson): string {
    return `${g.id} (${g.severity})`;
}

function actionBullet(r: SummaryInput, config: AppConfig): string {
    const reasons: string[] = [];
    const acting = r.gates.filter((g) => g.severity !== "info");
    if (acting.length > 0) reasons.push(`gates ${acting.map(gateLabel).join(", ")}`);
    if (r.truncation.truncated) reasons.push("diff truncated");
    if (r.confidence < config.confidence.threshold) {
        reasons.push(`low confidence ${(r.confidence * 100).toFixed(0)}%`);
    }
    if (r.disagreement?.forcedReview) {
        reasons.push(`JEV risk ${r.disagreement.jevRiskLevel} disagrees with ${r.disagreement.appRiskLevel}`);
    }
    const missing = axesMissingEvidence(r.decisions, config.evidence.minImpactForRequiredEvidence);
    if (missing.length > 0) {
        reasons.push(`no evidence for ${missing.map((a) => AXIS_LABEL[a]).join(", ")}`);
    }
    return reasons.length > 0
        ? `Action ${r.action}: ${reasons.join("; ")}`
        : `Action ${r.action} from risk level ${r.riskLevel}; no gates or overrides`;
}

/** Exactly three app-composed bullets: change shape, top impacts, action reasons. */
export function buildSummary(r: SummaryInput, config: AppConfig): [string, string, string] {
    return [shapeBullet(r), impactBullet(r), actionBullet(r, config)];
}

const SEVERITY_WEIGHT = { block: 100, warn: 50, info: 10 } as const;
const SENSITIVE_WEIGHT = 30;
const LINE_CAP = 50;
const SYMBOL_WEIGHT = 5;

function changedLineCounts(diffText: string): Map<string, number> {
    const counts = new Map<string, number>();
    for (const chunk of splitFiles(diffText)) {
        let inHunk = false;
        let n = 0;
        for (const line of chunk.lines) {
            if (line.startsWith("@@")) inHunk = true;
            else if (inHunk && (line.startsWith("+") || line.startsWith("-"))) n += 1;
        }
        counts.set(chunk.path, (counts.get(chunk.path) ?? 0) + n);
    }
    return counts;
}

/**
 * Top files to review first. Heuristic score: strongest matched gate severity
 * (block 100 / warn 50 / info 10), else 30 for a sensitive category, plus changed
 * lines (capped at 50) plus 5 per changed symbol. Ties sort by path.
 */
export function buildHotspots(
    inventory: ChangeInventory,
    diffText: string,
    gates: GateResultJson[],
): Hotspot[] {
    const lines = changedLineCounts(diffText);
    const symbolCount = new Map<string, number>();
    const { added, modified, removed } = inventory.symbols;
    for (const s of [...added, ...modified, ...removed]) {
        symbolCount.set(s.path, (symbolCount.get(s.path) ?? 0) + 1);
    }
    const scored = inventory.files.map((file) => {
        const fileGates = gates.filter((g) => g.matchedPaths.includes(file.path));
        const strongest = fileGates
            .map((g) => SEVERITY_WEIGHT[g.severity])
            .reduce((a, b) => Math.max(a, b), 0);
        const category = inventory.sensitive.find((s) => s.path === file.path)?.category;
        const changed = lines.get(file.path) ?? 0;
        const symbols = symbolCount.get(file.path) ?? 0;
        const score =
            (strongest || (category ? SENSITIVE_WEIGHT : 0)) +
            Math.min(changed, LINE_CAP) +
            symbols * SYMBOL_WEIGHT;
        const reason = [
            ...fileGates.map(gateLabel),
            ...(fileGates.length === 0 && category ? [`sensitive: ${category}`] : []),
            plural(changed, "changed line"),
            ...(symbols > 0 ? [plural(symbols, "symbol")] : []),
            file.status === "modified" ? [] : [file.status],
        ].flat();
        return { path: file.path, reason: reason.join("; "), score };
    });
    return scored
        .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
        .slice(0, HOTSPOT_LIMIT)
        .map(({ path, reason }) => ({ path, reason }));
}
