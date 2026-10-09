import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AnalysisResultSchema, type AnalysisResult } from "../schema.js";
import {
    DisplayConfigError,
    formatAnalyze,
    formatExplain,
    labelForDecision,
    loadDisplayConfig,
    resetDisplayConfigCache,
    type DisplayConfig,
} from "./format.js";

function sampleResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
    return AnalysisResultSchema.parse({
        state: {
            files: ["src/foo.ts"],
            additions: 3,
            deletions: 1,
            diffText: "diff",
            truncated: false,
        },
        decisions: {
            breakingChange: { value: "no", confidence: 0.9 },
            securityImpact: { value: "yes", confidence: 0.9 },
            databaseChange: { value: "no", confidence: 0.9 },
            apiImpact: { value: "yes", confidence: 0.9 },
            authenticationImpact: { value: "no", confidence: 0.9 },
            needsHumanReview: { value: "yes", confidence: 0.9 },
            riskLevel: { value: "HIGH", confidence: 0.9 },
        },
        score: 55,
        riskLevel: "MEDIUM",
        confidence: 0.9,
        action: "REVIEW",
        recommendation: "Security review required",
        contributions: [
            { signal: "security", points: 35, detail: "security=yes (+35)" },
            { signal: "api", points: 15, detail: "api=yes (+15)" },
            { signal: "files", points: 0, detail: "1 files (≤3)" },
            { signal: "lines", points: 0, detail: "4 lines (≤50)" },
            { signal: "database", points: 0, detail: "database=no" },
            { signal: "authentication", points: 0, detail: "authentication=no" },
        ],
        ...overrides,
    });
}

function baseDisplay(overrides: Partial<DisplayConfig> = {}): DisplayConfig {
    return {
        analyze: {
            title: "jev-pr-reviewer · PR Risk Analysis",
            sections: {
                risk: "Risk",
                confidence: "Confidence",
                action: "Action",
                decisions: "Decisions",
                state: "State",
            },
            decisions: {
                order: [
                    "breakingChange",
                    "securityImpact",
                    "databaseChange",
                    "apiImpact",
                    "authenticationImpact",
                    "needsHumanReview",
                    "riskLevel",
                ],
                labels: {
                    breakingChange: "breaking change",
                    securityImpact: "security",
                    databaseChange: "database",
                    apiImpact: "api",
                    authenticationImpact: "authentication",
                    needsHumanReview: "human review",
                    riskLevel: "jev risk",
                },
            },
        },
        explain: {
            title: "jev-pr-reviewer · Score breakdown",
            sections: {
                contributions: "Contributions",
                totalScore: "Total score:",
                riskLevel: "Risk level:",
            },
            signals: {
                order: [
                    "security",
                    "database",
                    "api",
                    "authentication",
                    "files",
                    "lines",
                ],
                labels: {
                    security: "security",
                    database: "database",
                    api: "api",
                    authentication: "authentication",
                    files: "files",
                    lines: "lines",
                },
            },
        },
        ...overrides,
    };
}

describe("formatAnalyze", () => {
    it("includes risk level, confidence %, decision labels, action, and recommendation", () => {
        const text = formatAnalyze(
            sampleResult({ riskLevel: "HIGH", confidence: 0.9 }),
            baseDisplay(),
        );
        expect(text).toContain("HIGH");
        expect(text).toContain("90.0%");
        expect(text).toContain("security");
        expect(text).not.toContain("securityImpact");
        expect(text).toContain("REVIEW");
        expect(text).toContain("Security review required");
    });

    it("uses custom decision labels and order from display config", () => {
        const display = baseDisplay();
        display.analyze.decisions.order = [
            "securityImpact",
            "breakingChange",
            "databaseChange",
            "apiImpact",
            "authenticationImpact",
            "needsHumanReview",
            "riskLevel",
        ];
        display.analyze.decisions.labels.securityImpact = "Segurança";

        const text = formatAnalyze(sampleResult(), display);
        const decisionsIdx = text.indexOf("Decisions");
        const segurancaIdx = text.indexOf("Segurança");
        const breakingIdx = text.indexOf("breaking change");
        expect(segurancaIdx).toBeGreaterThan(decisionsIdx);
        expect(segurancaIdx).toBeLessThan(breakingIdx);
    });

    it("shows APPROVE recommendation phrase when action is APPROVE", () => {
        const text = formatAnalyze(
            sampleResult({
                riskLevel: "LOW",
                action: "APPROVE",
                recommendation: "Automatic approval possible",
                decisions: {
                    breakingChange: { value: "no", confidence: 0.9 },
                    securityImpact: { value: "no", confidence: 0.9 },
                    databaseChange: { value: "no", confidence: 0.9 },
                    apiImpact: { value: "no", confidence: 0.9 },
                    authenticationImpact: { value: "no", confidence: 0.9 },
                    needsHumanReview: { value: "no", confidence: 0.9 },
                    riskLevel: { value: "LOW", confidence: 0.9 },
                },
            }),
            baseDisplay(),
        );
        expect(text).toContain("Automatic approval possible");
    });
});

describe("formatExplain", () => {
    it("lists contribution points and total score", () => {
        const result = sampleResult();
        const text = formatExplain(result, baseDisplay());
        expect(text).toContain("+35");
        expect(text).toContain(`Total score: ${result.score}`);
    });

    it("uses custom signal labels and order from display config", () => {
        const display = baseDisplay();
        display.explain.signals.order = [
            "files",
            "security",
            "database",
            "api",
            "authentication",
            "lines",
        ];
        display.explain.signals.labels.files = "Arquivos";

        const text = formatExplain(sampleResult(), display);
        expect(text).toContain("Arquivos");
        const afterContributions = text.slice(text.indexOf("Contributions"));
        expect(afterContributions.indexOf("Arquivos")).toBeLessThan(
            afterContributions.indexOf("security=yes"),
        );
    });
});

describe("loadDisplayConfig", () => {
    afterEach(() => {
        resetDisplayConfigCache();
    });

    it("loads the default displayConfig.json", async () => {
        const cfg = await loadDisplayConfig();
        expect(cfg.analyze.title).toMatch(/PR Risk Analysis/);
        expect(labelForDecision("securityImpact", cfg)).toBe("security");
    });

    it("rejects invalid display JSON", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-display-"));
        const path = join(dir, "bad.json");
        try {
            await writeFile(path, JSON.stringify({ analyze: {} }), "utf8");
            await expect(loadDisplayConfig(path)).rejects.toBeInstanceOf(
                DisplayConfigError,
            );
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});

describe("AnalysisResult JSON shape", () => {
    it("parses with AnalysisResult schema", () => {
        const result = sampleResult();
        const json = JSON.parse(JSON.stringify(result));
        expect(() => AnalysisResultSchema.parse(json)).not.toThrow();
    });
});
