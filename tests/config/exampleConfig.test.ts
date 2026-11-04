import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("jev-pr-reviewer.config.example.json", () => {
    it("documents relative weights and weighted-average scoring", async () => {
        const text = await readFile(
            resolve(
                process.cwd(),
                "config/jev-pr-reviewer.config.example.json",
            ),
            "utf8",
        );
        expect(text).toMatch(/weights/i);
        expect(text).toMatch(/RELATIVOS|relative/i);
        expect(text).toMatch(/média ponderada|weighted/i);
        expect(text).toMatch(/0–100|0-100/);
        expect(text).toMatch(/tiers/i);
        expect(text).toMatch(/levels/i);
        expect(text).toMatch(/LOW/);
        expect(text).toMatch(/confidence/i);
        expect(text).toMatch(/threshold/i);
        expect(text).toMatch(/REVIEW/);
        const parsed = JSON.parse(text) as {
            weights: {
                security: number;
                database: number;
                api: number;
                authentication: number;
            };
        };
        expect(parsed.weights.security).toBe(5);
        expect(parsed.weights.database).toBe(3);
        expect(parsed.weights.api).toBe(2);
        expect(parsed.weights.authentication).toBe(1);
    });
});

describe("example config gates", () => {
    it("loads and lists the default gate rules", async () => {
        const { loadConfig } = await import("../../src/config/loadConfig.js");
        const { DEFAULT_GATE_RULES } = await import("../../src/risk/gates.js");
        const cfg = await loadConfig({
            configPath: resolve(process.cwd(), "config/jev-pr-reviewer.config.example.json"),
        });
        expect(cfg.gates.rules).toEqual(DEFAULT_GATE_RULES);
        expect(cfg.evidence.minImpactForRequiredEvidence).toBe(40);
        expect(cfg.confidence.scoredOnly).toBe(true);
        expect(cfg.confidence.disagreementForceReview).toBe(true);
        expect(cfg.policy).toEqual({ securityHoldMinImpact: 30, neverApproveGlobs: [] });
    });
});

describe("example config security policy docs (SECPOL-04)", () => {
    it("documents securityHoldMinImpact and the 1 to 30 change", async () => {
        const text = await readFile(
            resolve(process.cwd(), "config/jev-pr-reviewer.config.example.json"),
            "utf8",
        );
        const parsed = JSON.parse(text) as {
            policy: { description: string; securityHoldMinImpact: number };
        };
        expect(parsed.policy.securityHoldMinImpact).toBe(30);
        expect(parsed.policy.description).toContain("securityHoldMinImpact");
        expect(parsed.policy.description).toMatch(/>= 1/);
        expect(parsed.policy.description).toContain("neverApproveGlobs");
    });
});
