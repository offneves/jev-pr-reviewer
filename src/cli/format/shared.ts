import type { AnalysisResult, RiskLevel } from "../../schema.js";

export const RESET = "\x1b[0m";
export const BOLD = "\x1b[1m";
export const DIM = "\x1b[2m";
export const GREEN = "\x1b[32m";
export const YELLOW = "\x1b[33m";
export const RED = "\x1b[31m";
export const CYAN = "\x1b[36m";
export const MAGENTA = "\x1b[35m";
export const WHITE = "\x1b[37m";

export function supportsColor(): boolean {
    if (process.env.NO_COLOR != null) return false;
    if (process.env.FORCE_COLOR != null) return true;
    return Boolean(process.stdout?.isTTY);
}

export function paint(text: string, ...codes: string[]): string {
    if (!supportsColor() || codes.length === 0) return text;
    return `${codes.join("")}${text}${RESET}`;
}

export function pct(confidence: number): string {
    return `${(confidence * 100).toFixed(1)}%`;
}

export function padLabel(label: string, width: number): string {
    return label.padEnd(width, " ");
}

export function boxTitle(title: string, width = 52): string {
    const inner = width - 2;
    const truncated = title.length > inner ? title.slice(0, inner) : title;
    const left = Math.floor((inner - truncated.length) / 2);
    const right = inner - truncated.length - left;
    const padded = `${" ".repeat(left)}${truncated}${" ".repeat(right)}`;
    return [
        paint(`╭${"─".repeat(inner)}╮`, CYAN),
        paint(`│${padded}│`, CYAN),
        paint(`╰${"─".repeat(inner)}╯`, CYAN),
    ].join("\n");
}

export function section(title: string): string {
    return paint(`── ${title} ${"─".repeat(Math.max(0, 40 - title.length))}`, DIM);
}

export function scoreBar(score: number, width = 20): string {
    const filled = Math.round((Math.min(100, score) / 100) * width);
    const empty = width - filled;
    const bar = `${"█".repeat(filled)}${"░".repeat(empty)}`;
    return paint(bar, DIM);
}

export function valueTone(value: string): string {
    if (value === "yes" || value === "CRITICAL" || value === "HIGH") {
        return YELLOW;
    }
    if (value === "no") {
        return DIM;
    }
    return WHITE;
}

export function riskColor(level: RiskLevel): string {
    switch (level) {
        case "LOW":
            return GREEN;
        case "MEDIUM":
            return YELLOW;
        case "HIGH":
            return MAGENTA;
        case "CRITICAL":
            return RED;
    }
}

export function actionColor(action: AnalysisResult["action"]): string {
    switch (action) {
        case "APPROVE":
            return GREEN;
        case "REVIEW":
            return YELLOW;
        case "BLOCK":
            return RED;
    }
}
