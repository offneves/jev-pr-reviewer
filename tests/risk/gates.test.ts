import { describe, expect, it } from "vitest";
import { buildInventory } from "../../src/state/inventory.js";
import {
    DEFAULT_GATE_RULES,
    evaluateGates,
    isValidMatcher,
    type GateRule,
} from "../../src/risk/gates.js";

function fileDiff(path: string, lines: string[], header: string[] = []): string {
    return [
        `diff --git a/${path} b/${path}`,
        ...header,
        `--- a/${path}`,
        `+++ b/${path}`,
        `@@ -1,${lines.length} +1,${lines.length} @@`,
        ...lines,
        "",
    ].join("\n");
}

function gatesFor(diff: string, rules?: GateRule[]) {
    return evaluateGates(buildInventory(diff), diff, rules);
}

const PLAIN = fileDiff("src/ui/Button.tsx", ["-a", "+b"]);

describe("default gate rules (GATE-01)", () => {
    it("blocks an inline secret on an added line", () => {
        const diff = fileDiff("src/config.ts", [
            '+const apiKey = "AKIAABCDEFGHIJKLMNOP";',
        ]);
        expect(gatesFor(diff)).toEqual([
            { id: "secret-inline", severity: "block", matchedPaths: ["src/config.ts"] },
        ]);
    });

    it("blocks a secret-like assignment", () => {
        const diff = fileDiff("src/client.py", ['+password = "hunter2hunter2"']);
        expect(gatesFor(diff).map((g) => [g.id, g.severity])).toEqual([
            ["secret-inline", "block"],
        ]);
    });

    it("does not flag secrets on removed lines or env lookups", () => {
        const diff = fileDiff("src/client.py", [
            '-password = "hunter2hunter2"',
            '+password = os.environ["PASSWORD"]',
        ]);
        expect(gatesFor(diff)).toEqual([]);
    });

    it("blocks migration paths", () => {
        const diff = fileDiff("db/migrations/0042_users.sql", ["+ALTER TABLE users ADD x int;"]);
        expect(gatesFor(diff)).toEqual([
            {
                id: "migration-path",
                severity: "block",
                matchedPaths: ["db/migrations/0042_users.sql"],
            },
        ]);
    });

    it("warns on auth paths", () => {
        const diff = fileDiff("src/auth/login.ts", ["-a", "+b"]);
        expect(gatesFor(diff)).toEqual([
            { id: "auth-path", severity: "warn", matchedPaths: ["src/auth/login.ts"] },
        ]);
    });

    it("warns on secrets paths like .env files", () => {
        const diff = fileDiff(".env.production", ["-A=1", "+A=2"]);
        expect(gatesFor(diff)).toEqual([
            { id: "secrets-path", severity: "warn", matchedPaths: [".env.production"] },
        ]);
    });

    it("warns on CI config and Dockerfile changes", () => {
        const diff = `${fileDiff(".github/workflows/ci.yml", ["-a", "+b"])}${fileDiff("Dockerfile", ["-FROM a", "+FROM b"])}`;
        expect(gatesFor(diff)).toEqual([
            { id: "ci-config-path", severity: "warn", matchedPaths: [".github/workflows/ci.yml"] },
            { id: "docker-file-path", severity: "warn", matchedPaths: ["Dockerfile"] },
        ]);
    });

    it("reports lockfile changes as info", () => {
        const diff = fileDiff("package-lock.json", ["-a", "+b"]);
        expect(gatesFor(diff)).toEqual([
            { id: "lockfile-change", severity: "info", matchedPaths: ["package-lock.json"] },
        ]);
    });

    it("warns when a test file is deleted", () => {
        const diff = fileDiff("tests/user.test.ts", ["-it('x')"], ["deleted file mode 100644"]).replace(
            "+++ b/tests/user.test.ts",
            "+++ /dev/null",
        );
        expect(gatesFor(diff)).toEqual([
            { id: "test-removal", severity: "warn", matchedPaths: ["tests/user.test.ts"] },
        ]);
    });

    it("warns when a test file loses most of its lines", () => {
        const removed = Array.from({ length: 10 }, (_, i) => `-  it("case ${i}")`);
        const diff = fileDiff("src/user.spec.ts", [...removed, "+  it.todo()"]);
        expect(gatesFor(diff).map((g) => g.id)).toEqual(["test-removal"]);
    });

    it("does not flag small test edits", () => {
        const diff = fileDiff("tests/user.test.ts", ["-a", "-b", "+c"]);
        expect(gatesFor(diff)).toEqual([]);
    });
});

describe("gate evaluation edge cases", () => {
    it("returns [] when no rule matches", () => {
        expect(gatesFor(PLAIN)).toEqual([]);
        expect(gatesFor("")).toEqual([]);
    });

    it("keeps rule order and dedupes matched paths", () => {
        const diff = `${fileDiff("db/migrations/1.sql", ['+-- password = "supersecret1"'])}${PLAIN}`;
        expect(gatesFor(diff)).toEqual([
            { id: "secret-inline", severity: "block", matchedPaths: ["db/migrations/1.sql"] },
            { id: "migration-path", severity: "block", matchedPaths: ["db/migrations/1.sql"] },
        ]);
    });

    it("uses custom rules including pathRegex", () => {
        const rules: GateRule[] = [{ id: "ui", severity: "warn", match: "pathRegex:^src/ui/" }];
        expect(gatesFor(PLAIN, rules)).toEqual([
            { id: "ui", severity: "warn", matchedPaths: ["src/ui/Button.tsx"] },
        ]);
    });

    it("default rule ids are unique", () => {
        const ids = DEFAULT_GATE_RULES.map((r) => r.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe("isValidMatcher", () => {
    it.each(["secretLine", "testRemoval", "sensitiveCategory:auth", "pathRegex:^src/"])(
        "accepts %s",
        (m) => expect(isValidMatcher(m)).toBe(true),
    );
    it.each(["sensitiveCategory:nope", "pathRegex:", "pathRegex:(", "anything"])(
        "rejects %s",
        (m) => expect(isValidMatcher(m)).toBe(false),
    );
});
