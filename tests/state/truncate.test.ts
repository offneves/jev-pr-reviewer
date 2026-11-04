import { describe, expect, it } from "vitest";
import { buildDiffInput } from "../../src/state/buildState.js";
import { isSensitivePath } from "../../src/state/sensitivePaths.js";

function fileDiff(path: string, body: string): string {
    return [
        `diff --git a/${path} b/${path}`,
        `--- a/${path}`,
        `+++ b/${path}`,
        "@@ -1 +1 @@",
        body,
        "",
    ].join("\n");
}

const FILLER = fileDiff("src/ui/Button.tsx", `+${"x".repeat(2_000)}`);
const AUTH = fileDiff("src/auth/login.ts", "+const token = readToken();");
// Auth hunk sits after the filler: a prefix cut would drop it.
const MIXED = `${FILLER}${AUTH}`;
const MAX = 500;

describe("truncation: sensitive hunk prioritization (TRUNC-05/06/07)", () => {
    it("keeps the sensitive hunk inside the window ahead of non-sensitive content", () => {
        const { state } = buildDiffInput(MIXED, MAX);
        expect(state.truncated).toBe(true);
        expect(state.diffText).toContain("+const token = readToken();");
        expect(state.diffText.startsWith("diff --git a/src/auth/login.ts")).toBe(true);
    });

    it("lists sensitive paths that contributed kept hunks in prioritizedPaths", () => {
        const { truncation } = buildDiffInput(MIXED, MAX);
        expect(truncation.prioritizedPaths).toEqual(["src/auth/login.ts"]);
    });

    it("never exceeds maxChars after truncation", () => {
        for (const max of [10, 120, MAX, 2_100]) {
            const { state, truncation } = buildDiffInput(MIXED, max);
            expect(state.diffText.length).toBeLessThanOrEqual(max);
            expect(truncation.keptChars).toBe(state.diffText.length);
        }
    });
});

describe("truncation budget use", () => {
    it("fills the leftover budget with a cut of an oversized hunk instead of dropping it", () => {
        const { state } = buildDiffInput(MIXED, MAX);
        expect(state.diffText.length).toBe(MAX);
        expect(state.diffText).toContain("diff --git a/src/ui/Button.tsx");
    });

    it("keeps a cut of an oversized sensitive hunk at the front", () => {
        const bigAuth = fileDiff("src/auth/login.ts", `+${"a".repeat(2_000)}`);
        const text = `${FILLER}${bigAuth}`;
        const { state, truncation } = buildDiffInput(text, MAX);
        expect(state.diffText.length).toBe(MAX);
        expect(state.diffText.startsWith("diff --git a/src/auth/login.ts")).toBe(true);
        expect(truncation.prioritizedPaths).toEqual(["src/auth/login.ts"]);
    });
});

describe("truncation maxChars boundary (TRUNC-07)", () => {
    it("keeps a sensitive section whole when maxChars equals its length", () => {
        const { state } = buildDiffInput(MIXED, AUTH.length);
        expect(state.diffText).toBe(AUTH);
    });

    it("cuts a sensitive section that is one char over maxChars", () => {
        const { state } = buildDiffInput(MIXED, AUTH.length - 1);
        expect(state.diffText).toBe(AUTH.slice(0, AUTH.length - 1));
        expect(state.diffText.length).toBe(AUTH.length - 1);
    });
});

describe("prioritizedPaths for header-only cuts (TRUNC-06)", () => {
    it("does not list a sensitive path when only part of its file header was kept", () => {
        const { state, truncation } = buildDiffInput(MIXED, 20);
        expect(state.diffText).toBe(AUTH.slice(0, 20));
        expect(truncation.prioritizedPaths).toEqual([]);
    });
});

describe("truncation metadata (TRUNC-04)", () => {
    it("reports truncated, originalChars, keptChars, prioritizedPaths when cut", () => {
        const { state, truncation } = buildDiffInput(MIXED, MAX);
        expect(truncation).toEqual({
            truncated: true,
            originalChars: MIXED.length,
            keptChars: state.diffText.length,
            prioritizedPaths: ["src/auth/login.ts"],
        });
    });
});

describe("truncation edge cases", () => {
    it("does not truncate when the diff fits within maxChars", () => {
        const { state, truncation } = buildDiffInput(MIXED, MIXED.length);
        expect(state.truncated).toBe(false);
        expect(state.diffText).toBe(MIXED);
        expect(truncation).toEqual({
            truncated: false,
            originalChars: MIXED.length,
            keptChars: MIXED.length,
            prioritizedPaths: [],
        });
    });

    it("cuts a prefix with empty prioritizedPaths when no sensitive paths exist", () => {
        const other = fileDiff("src/ui/Card.tsx", "+card");
        const text = `${FILLER}${other}`;
        const { state, truncation } = buildDiffInput(text, MAX);
        expect(state.truncated).toBe(true);
        expect(state.diffText).toBe(text.slice(0, MAX));
        expect(truncation.prioritizedPaths).toEqual([]);
    });
});

describe("isSensitivePath defaults", () => {
    it.each([
        "src/auth/login.ts",
        "src/main/java/com/acme/AuthService.java",
        "db/migrations/001_init.sql",
        ".env.production",
        ".github/workflows/ci.yml",
        "Dockerfile",
    ])("flags %s", (path) => {
        expect(isSensitivePath(path)).toBe(true);
    });

    it.each(["src/ui/Button.tsx", "docs/author.md", "package-lock.json"])(
        "does not flag %s",
        (path) => {
            expect(isSensitivePath(path)).toBe(false);
        },
    );
});
