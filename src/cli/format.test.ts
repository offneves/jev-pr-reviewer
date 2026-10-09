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
            securityImpact: { value: 100, confidence: 0.9 },
            databaseChange: { value: 0, confidence: 0.9 },
            apiImpact: { value: 100, confidence: 0.9 },
            authenticationImpact: { value: 0, confidence: 0.9 },
            needsHumanReview: { value: "yes", confidence: 0.9 },
            riskLevel: { value: "HIGH", confidence: 0.9 },
        },
        score: 55,
        riskLevel: "MEDIUM",
        confidence: 0.9,
        action: "REVIEW",
        recommendation: "Security review required",
        contributions: [
            { signal: "security", points: 100, detail: "impact 100 (weight 5)" },
            { signal: "database", points: 0, detail: "impact 0 (weight 3)" },
            { signal: "api", points: 100, detail: "impact 100 (weight 2)" },
            {
                signal: "authentication",
                points: 0,
                detail: "impact 0 (weight 1)",
            },
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
                scored: "Scored decisions",
                advisory: "Advisory · not in score",
                state: "State",
            },
            scored: {
                order: [
                    "securityImpact",
                    "databaseChange",
                    "apiImpact",
                    "authenticationImpact",
                ],
                labels: {
                    securityImpact: "security",
                    databaseChange: "database",
                    apiImpact: "api",
                    authenticationImpact: "authentication",
                },
            },
            advisory: {
                order: [
                    "breakingChange",
                    "needsHumanReview",
                    "riskLevel",
                ],
                labels: {
                    breakingChange: "breaking change",
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
                order: ["security", "database", "api", "authentication"],
                labels: {
                    security: "security",
                    database: "database",
                    api: "api",
                    authentication: "authentication",
                },
            },
        },
        ...overrides,
    };
}

describe("formatAnalyze", () => {
    it("shows compact risk/action header, confidence, scored label, recommendation", () => {
        const text = formatAnalyze(
            sampleResult({ riskLevel: "HIGH", confidence: 0.9 }),
            baseDisplay(),
        );
        expect(text).toContain("HIGH");
        expect(text).toContain("REVIEW");
        const riskIdx = text.indexOf("Risk");
        const recIdx = text.indexOf("Security review required");
        expect(riskIdx).toBeGreaterThan(-1);
        expect(riskIdx).toBeLessThan(recIdx);
        expect(text).toContain("90.0%");
        expect(text).toContain("security");
        expect(text).not.toContain("securityImpact");
    });

    it("separates scored and advisory sections", () => {
        const text = formatAnalyze(sampleResult(), baseDisplay());
        expect(text).toContain("Scored decisions");
        expect(text).toMatch(/Advisory.*not in score/i);

        const scoredIdx = text.indexOf("Scored decisions");
        const advisoryIdx = text.indexOf("Advisory");
        expect(scoredIdx).toBeLessThan(advisoryIdx);

        const scoredBlock = text.slice(scoredIdx, advisoryIdx);
        const advisoryBlock = text.slice(advisoryIdx);
        expect(scoredBlock).toContain("security");
        expect(scoredBlock).toContain("database");
        expect(scoredBlock).toContain("api");
        expect(scoredBlock).toContain("authentication");
        expect(scoredBlock).toMatch(/security[\s\S]*?\b100\b/);
        expect(scoredBlock).toMatch(/database[\s\S]*?\b0\b/);
        expect(scoredBlock).toMatch(/api[\s\S]*?\b100\b/);
        expect(scoredBlock).toMatch(/authentication[\s\S]*?\b0\b/);
        expect(scoredBlock).not.toMatch(/\byes\b/);
        expect(scoredBlock).not.toContain("jev risk");
        expect(advisoryBlock).toContain("breaking change");
        expect(advisoryBlock).toContain("human review");
        expect(advisoryBlock).toContain("jev risk");
    });

    it("uses custom scored labels", () => {
        const display = baseDisplay();
        display.analyze.scored.labels.securityImpact = "Segurança";
        const text = formatAnalyze(sampleResult(), display);
        expect(text).toContain("Segurança");
    });

    it("shows APPROVE recommendation phrase when action is APPROVE", () => {
        const text = formatAnalyze(
            sampleResult({
                riskLevel: "LOW",
                action: "APPROVE",
                recommendation: "Automatic approval possible",
                decisions: {
                    breakingChange: { value: "no", confidence: 0.9 },
                    securityImpact: { value: 0, confidence: 0.9 },
                    databaseChange: { value: 0, confidence: 0.9 },
                    apiImpact: { value: 0, confidence: 0.9 },
                    authenticationImpact: { value: 0, confidence: 0.9 },
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
    it("lists contribution impact, weight, and total score", () => {
        const result = sampleResult();
        const text = formatExplain(result, baseDisplay());
        expect(text).toMatch(/\b100\b/);
        expect(text).toContain("weight 5");
        expect(text).toContain("impact 100");
        expect(text).toContain(`Total score: ${result.score}`);
        expect(text).toContain("Score breakdown");
        expect(text).toContain("Contributions");
        expect(text).toMatch(/╭|─/);
    });

    it("preserves display signal order even when points would sort differently", () => {
        const display = baseDisplay();
        display.explain.signals.order = [
            "api",
            "security",
            "database",
            "authentication",
        ];

        const text = formatExplain(sampleResult(), display);
        const afterContributions = text.slice(text.indexOf("Contributions"));
        expect(afterContributions.indexOf("api")).toBeLessThan(
            afterContributions.indexOf("security"),
        );
    });
});

describe("formatAnalyze edges and ANSI", () => {
    it("puts unknown decision keys in advisory", () => {
        const display = baseDisplay();
        display.analyze.scored.order = ["securityImpact"];
        display.analyze.advisory.order = ["breakingChange"];
        const text = formatAnalyze(sampleResult(), display);
        const advisory = text.slice(text.indexOf("Advisory"));
        expect(advisory).toContain("database");
        expect(advisory).toContain("human review");
        expect(advisory).toContain("jev risk");
    });

    it("does not emit ANSI when NO_COLOR is set", () => {
        const prev = process.env.NO_COLOR;
        process.env.NO_COLOR = "1";
        try {
            const text = formatAnalyze(sampleResult(), baseDisplay());
            expect(text).not.toMatch(/\x1b\[/);
        } finally {
            if (prev === undefined) delete process.env.NO_COLOR;
            else process.env.NO_COLOR = prev;
        }
    });
});

describe("loadDisplayConfig", () => {
    afterEach(() => {
        resetDisplayConfigCache();
    });

    it("loads the default displayConfig.json with scored and advisory", async () => {
        const cfg = await loadDisplayConfig();
        expect(cfg.analyze.scored.order).toContain("securityImpact");
        expect(cfg.analyze.advisory.order).toContain("riskLevel");
        expect(labelForDecision("securityImpact", cfg)).toBe("security");
        expect(labelForDecision("breakingChange", cfg)).toBe("breaking change");
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
