import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("jev-pr-reviewer.config.example.json", () => {
    it("documents weights, tiers, levels, and confidence", async () => {
        const text = await readFile(
            resolve(process.cwd(), "jev-pr-reviewer.config.example.json"),
            "utf8",
        );
        expect(text).toMatch(/weights/i);
        expect(text).toMatch(/Pontos somados/i);
        expect(text).toMatch(/tiers/i);
        expect(text).toMatch(/NÚMERO DE ARQUIVOS/i);
        expect(text).toMatch(/levels/i);
        expect(text).toMatch(/LOW/);
        expect(text).toMatch(/confidence/i);
        expect(text).toMatch(/threshold/i);
        expect(text).toMatch(/REVIEW/);
    });
});
