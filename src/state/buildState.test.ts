import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    DIFF_TEXT_LIMIT,
    DiffFileError,
    buildStateFromDiffFile,
    buildStateFromDiffText,
} from "./buildState.js";

const SAMPLE = `diff --git a/src/foo.ts b/src/foo.ts
index 111..222 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,2 +1,4 @@
 keep
-removed
+added1
+added2
+added3
`;

describe("buildStateFromDiffText", () => {
    it("parses files, additions, deletions from a unified diff", () => {
        const state = buildStateFromDiffText(SAMPLE);
        expect(state.files).toContain("src/foo.ts");
        expect(state.additions).toBe(3);
        expect(state.deletions).toBe(1);
        expect(state.truncated).toBe(false);
        expect(state.diffText).toBe(SAMPLE);
    });

    it("truncates diffText at 80_000 characters", () => {
        expect(DIFF_TEXT_LIMIT).toBe(80_000);
        const text = "x".repeat(80_000 + 1);
        const state = buildStateFromDiffText(text);
        expect(state.truncated).toBe(true);
        expect(state.diffText.length).toBe(80_000);
    });

    it("truncates at a custom maxChars", () => {
        const state = buildStateFromDiffText("abcdef", 4);
        expect(state.truncated).toBe(true);
        expect(state.diffText).toBe("abcd");
    });

    it("builds empty state for empty diff", () => {
        const state = buildStateFromDiffText("");
        expect(state.files).toEqual([]);
        expect(state.additions).toBe(0);
        expect(state.deletions).toBe(0);
        expect(state.diffText).toBe("");
        expect(state.truncated).toBe(false);
    });
});

describe("buildStateFromDiffFile", () => {
    it("reads an existing file into PrState", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-pr-"));
        const path = join(dir, "sample.diff");
        try {
            await writeFile(path, SAMPLE, "utf8");
            const state = await buildStateFromDiffFile(path);
            expect(state.additions).toBe(3);
            expect(state.deletions).toBe(1);
            expect(state.files).toContain("src/foo.ts");
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it("throws DiffFileError including path when file is missing", async () => {
        const path = "/no/such/file.diff";
        await expect(buildStateFromDiffFile(path)).rejects.toSatisfy((err: unknown) => {
            expect(err).toBeInstanceOf(DiffFileError);
            expect((err as Error).message).toContain(path);
            return true;
        });
    });
});
