import { describe, expect, it } from "vitest";
import { ChangeInventorySchema, JevDecisionsSchema } from "../src/schema.js";

const base = {
    breakingChange: { value: "no" as const, confidence: 0.9 },
    needsHumanReview: { value: "no" as const, confidence: 0.9 },
    riskLevel: { value: "LOW" as const, confidence: 0.9 },
};

describe("JevDecisionsSchema impact axes", () => {
    it("accepts integer impacts 0..100 for scored axes", () => {
        const parsed = JevDecisionsSchema.parse({
            ...base,
            securityImpact: { value: 0, confidence: 0.9 },
            databaseChange: { value: 50, confidence: 0.9 },
            apiImpact: { value: 100, confidence: 0.9 },
            authenticationImpact: { value: 1, confidence: 0.9 },
        });
        expect(parsed.securityImpact.value).toBe(0);
        expect(parsed.apiImpact.value).toBe(100);
    });

    it("rejects impact below 0 or above 100", () => {
        expect(() =>
            JevDecisionsSchema.parse({
                ...base,
                securityImpact: { value: -1, confidence: 0.9 },
                databaseChange: { value: 0, confidence: 0.9 },
                apiImpact: { value: 0, confidence: 0.9 },
                authenticationImpact: { value: 0, confidence: 0.9 },
            }),
        ).toThrow();
        expect(() =>
            JevDecisionsSchema.parse({
                ...base,
                securityImpact: { value: 101, confidence: 0.9 },
                databaseChange: { value: 0, confidence: 0.9 },
                apiImpact: { value: 0, confidence: 0.9 },
                authenticationImpact: { value: 0, confidence: 0.9 },
            }),
        ).toThrow();
    });

    it("rejects yes/no strings on scored axes", () => {
        expect(() =>
            JevDecisionsSchema.parse({
                ...base,
                securityImpact: { value: "yes", confidence: 0.9 },
                databaseChange: { value: 0, confidence: 0.9 },
                apiImpact: { value: 0, confidence: 0.9 },
                authenticationImpact: { value: 0, confidence: 0.9 },
            }),
        ).toThrow();
    });
});

describe("ChangeInventorySchema (ENRICH-01)", () => {
    const inventory = () => ({
        files: [
            { path: "src/A.java", status: "added", language: "java" },
            { path: "src/b.ts", status: "renamed", language: "typescript" },
        ],
        symbols: {
            added: [{ name: "A", kind: "class", path: "src/A.java" }],
            modified: [{ name: "run", kind: "method", path: "src/A.java" }],
            removed: [],
        },
        sensitive: [{ path: "db/migrations/1.sql", category: "migration" }],
        blastRadius: { directories: ["src"] },
        testsOrDocsOnly: false,
    });

    it("accepts a full inventory shape", () => {
        const parsed = ChangeInventorySchema.parse(inventory());
        expect(parsed.files[1].status).toBe("renamed");
        expect(parsed.symbols.modified[0].kind).toBe("method");
        expect(parsed.sensitive[0].category).toBe("migration");
    });

    it("rejects an unknown file status", () => {
        const bad = inventory();
        (bad.files[0] as { status: string }).status = "copied";
        expect(() => ChangeInventorySchema.parse(bad)).toThrow();
    });

    it("rejects an unknown symbol kind", () => {
        const bad = inventory();
        (bad.symbols.added[0] as { kind: string }).kind = "variable";
        expect(() => ChangeInventorySchema.parse(bad)).toThrow();
    });
});
