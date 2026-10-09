import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { fetchMrDiff, MrDiffError } from "./fetchMrDiff.js";
import type { CommandResult, RunCommand } from "./runCommand.js";

function mockRun(
    handlers: Record<string, () => CommandResult | Promise<CommandResult>>,
): RunCommand {
    return async (command, args) => {
        const key = `${command} ${args.join(" ")}`;
        const handler = handlers[key];
        if (!handler) {
            return { code: 1, stdout: "", stderr: `unexpected: ${key}` };
        }
        return handler();
    };
}

describe("fetchMrDiff", () => {
    it("uses glab when available", async () => {
        const diff = "diff --git a/a.ts b/a.ts\n+++ b/a.ts\n+hello\n";
        const run = mockRun({
            "glab --version": () => ({ code: 0, stdout: "glab 1.0", stderr: "" }),
            "glab mr diff 42": () => ({ code: 0, stdout: diff, stderr: "" }),
            "glab mr diff https://gitlab.com/acme/app/-/merge_requests/42": () => ({
                code: 0,
                stdout: diff,
                stderr: "",
            }),
        });

        const fetched = await fetchMrDiff({ mrNumber: 42, run });
        try {
            expect(fetched.source).toBe("glab");
            expect(await readFile(fetched.path, "utf8")).toBe(diff);
        } finally {
            await fetched.cleanup();
        }

        const viaUrl = await fetchMrDiff({
            mrNumber: 42,
            mrRef: "https://gitlab.com/acme/app/-/merge_requests/42",
            run,
        });
        try {
            expect(viaUrl.source).toBe("glab");
        } finally {
            await viaUrl.cleanup();
        }
    });

    it("falls back to git fetch + diff when glab is missing", async () => {
        const diff = "diff --git a/b.ts b/b.ts\n+++ b/b.ts\n+line\n";
        const run = mockRun({
            "glab --version": () => ({ code: 1, stdout: "", stderr: "not found" }),
            "git --version": () => ({ code: 0, stdout: "git version 2", stderr: "" }),
            "git rev-parse --verify main": () => ({
                code: 0,
                stdout: "abc\n",
                stderr: "",
            }),
            "git fetch origin merge-requests/7/head:mr-7": () => ({
                code: 0,
                stdout: "",
                stderr: "",
            }),
            "git diff main...mr-7": () => ({ code: 0, stdout: diff, stderr: "" }),
        });

        const fetched = await fetchMrDiff({ mrNumber: 7, run });
        try {
            expect(fetched.source).toBe("git");
            expect(await readFile(fetched.path, "utf8")).toBe(diff);
        } finally {
            await fetched.cleanup();
        }
    });

    it("rejects invalid MR numbers", async () => {
        await expect(fetchMrDiff({ mrNumber: 0 })).rejects.toBeInstanceOf(MrDiffError);
    });

    it("surfaces git fetch failures", async () => {
        const run = mockRun({
            "glab --version": () => ({ code: 1, stdout: "", stderr: "" }),
            "git --version": () => ({ code: 0, stdout: "git", stderr: "" }),
            "git rev-parse --verify main": () => ({
                code: 0,
                stdout: "abc\n",
                stderr: "",
            }),
            "git fetch origin merge-requests/9/head:mr-9": () => ({
                code: 128,
                stdout: "",
                stderr: "couldn't find remote ref",
            }),
        });

        await expect(fetchMrDiff({ mrNumber: 9, run })).rejects.toSatisfy(
            (err: unknown) => {
                expect(err).toBeInstanceOf(MrDiffError);
                expect((err as Error).message).toContain("git fetch");
                expect((err as Error).message).toContain("couldn't find remote ref");
                return true;
            },
        );
    });
});
