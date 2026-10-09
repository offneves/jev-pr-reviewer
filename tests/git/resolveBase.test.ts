import { describe, expect, it } from "vitest";
import { fetchMrDiff } from "../../src/git/fetchMrDiff.js";
import type { CommandResult, RunCommand } from "../../src/git/runCommand.js";

function mockRun(
    handlers: Record<string, () => CommandResult>,
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

describe("fetchMrDiff base preference", () => {
    it("prefers configured defaultBaseBranch before main", async () => {
        const diff = "diff --git a/x.ts b/x.ts\n+++ b/x.ts\n+x\n";
        const run = mockRun({
            "glab --version": () => ({ code: 1, stdout: "", stderr: "" }),
            "git --version": () => ({ code: 0, stdout: "git", stderr: "" }),
            "git rev-parse --verify develop": () => ({
                code: 0,
                stdout: "abc\n",
                stderr: "",
            }),
            "git fetch origin merge-requests/3/head:mr-3": () => ({
                code: 0,
                stdout: "",
                stderr: "",
            }),
            "git diff develop...mr-3": () => ({
                code: 0,
                stdout: diff,
                stderr: "",
            }),
        });

        const fetched = await fetchMrDiff({
            mrNumber: 3,
            base: "develop",
            run,
        });
        try {
            expect(fetched.source).toBe("git");
        } finally {
            await fetched.cleanup();
        }
    });
});
