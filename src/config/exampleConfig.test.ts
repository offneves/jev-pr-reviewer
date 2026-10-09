import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("jev-pr-reviewer.config.example.json", () => {
    it("documents relative weights and weighted-average scoring", async () => {
        const text = await readFile(
            resolve(process.cwd(), "jev-pr-reviewer.config.example.json"),
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
