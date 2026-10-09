import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalysisResultSchema } from "../schema.js";
import { runCli } from "./main.js";

vi.mock("../git/fetchMrDiff.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../git/fetchMrDiff.js")>();
    return {
        ...actual,
        fetchMrDiff: vi.fn(),
    };
});

import { fetchMrDiff } from "../git/fetchMrDiff.js";

const SAMPLE = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -0,0 +1,2 @@
+one
+two
`;

describe("CLI", () => {
    const originalExitCode = process.exitCode;

    afterEach(() => {
        process.exitCode = originalExitCode;
        vi.restoreAllMocks();
    });

    it("analyze prints human-readable risk and decisions with --mock", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-cli-"));
        const path = join(dir, "sample.diff");
        const logs: string[] = [];
        const writeSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation((chunk) => {
                logs.push(String(chunk));
                return true;
            });

        try {
            await writeFile(path, SAMPLE, "utf8");
            await runCli(["analyze", path, "--mock"]);
            const out = logs.join("");
            expect(out).toMatch(/Risk/);
            expect(out).toMatch(/Decisions/);
            expect(out).toMatch(/Action/);
            expect(out).toMatch(/PR Risk Analysis/);
        } finally {
            writeSpy.mockRestore();
            await rm(dir, { recursive: true, force: true });
        }
    });

    it("analyze --json emits schema-valid JSON", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-cli-json-"));
        const path = join(dir, "sample.diff");
        const logs: string[] = [];
        const writeSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation((chunk) => {
                logs.push(String(chunk));
                return true;
            });

        try {
            await writeFile(path, SAMPLE, "utf8");
            await runCli(["analyze", path, "--json", "--mock"]);
            const parsed = JSON.parse(logs.join(""));
            expect(() => AnalysisResultSchema.parse(parsed)).not.toThrow();
        } finally {
            writeSpy.mockRestore();
            await rm(dir, { recursive: true, force: true });
        }
    });

    it("explain lists contributions and total", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-cli-explain-"));
        const path = join(dir, "sample.diff");
        const logs: string[] = [];
        const writeSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation((chunk) => {
                logs.push(String(chunk));
                return true;
            });

        try {
            await writeFile(path, SAMPLE, "utf8");
            await runCli(["explain", path, "--mock"]);
            const out = logs.join("");
            expect(out).toMatch(/\+\d+/);
            expect(out).toMatch(/Total score:/);
        } finally {
            writeSpy.mockRestore();
            await rm(dir, { recursive: true, force: true });
        }
    });

    it("missing diff path writes stderr with path and sets exitCode 1", async () => {
        const path = "/no/such/file.diff";
        const errs: string[] = [];
        const errSpy = vi
            .spyOn(process.stderr, "write")
            .mockImplementation((chunk) => {
                errs.push(String(chunk));
                return true;
            });
        process.exitCode = 0;
        try {
            await runCli(["analyze", path, "--mock"]);
            expect(process.exitCode).toBe(1);
            expect(errs.join("")).toContain(path);
        } finally {
            errSpy.mockRestore();
        }
    });

    it("mr accepts a GitLab MR URL", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-cli-mr-url-"));
        const path = join(dir, "mr-42.diff");
        const cleanup = vi.fn(async () => {
            await rm(dir, { recursive: true, force: true });
        });
        const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

        try {
            await writeFile(path, SAMPLE, "utf8");
            vi.mocked(fetchMrDiff).mockResolvedValue({
                path,
                cleanup,
                source: "glab",
            });
            const url = "https://gitlab.com/acme/app/-/merge_requests/42";
            await runCli(["mr", url, "--mock"]);
            expect(fetchMrDiff).toHaveBeenCalledWith(
                expect.objectContaining({
                    mrNumber: 42,
                    mrRef: "https://gitlab.com/acme/app/-/merge_requests/42",
                }),
            );
        } finally {
            writeSpy.mockRestore();
        }
    });

    it("mr fetches a merge request diff and analyzes it", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-cli-mr-"));
        const path = join(dir, "mr-123.diff");
        const logs: string[] = [];
        const writeSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation((chunk) => {
                logs.push(String(chunk));
                return true;
            });
        const cleanup = vi.fn(async () => {
            await rm(dir, { recursive: true, force: true });
        });

        try {
            await writeFile(path, SAMPLE, "utf8");
            vi.mocked(fetchMrDiff).mockResolvedValue({
                path,
                cleanup,
                source: "glab",
            });
            await runCli(["mr", "123", "--mock"]);
            expect(fetchMrDiff).toHaveBeenCalledWith(
                expect.objectContaining({ mrNumber: 123, mrRef: "123" }),
            );
            expect(logs.join("")).toMatch(/Risk/);
            expect(cleanup).toHaveBeenCalled();
        } finally {
            writeSpy.mockRestore();
        }
    });

    it("mr without --base uses config cli.defaultBaseBranch", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-cli-mr-base-"));
        const path = join(dir, "mr-9.diff");
        const configPath = join(dir, "policy.json");
        const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
        const cleanup = vi.fn(async () => {
            await rm(dir, { recursive: true, force: true });
        });

        try {
            await writeFile(path, SAMPLE, "utf8");
            await writeFile(
                configPath,
                JSON.stringify({
                    cli: { defaultBaseBranch: "develop" },
                }),
                "utf8",
            );
            vi.mocked(fetchMrDiff).mockClear();
            vi.mocked(fetchMrDiff).mockResolvedValue({
                path,
                cleanup,
                source: "glab",
            });
            await runCli(["mr", "9", "--mock", "--config", configPath]);
            expect(fetchMrDiff).toHaveBeenCalledWith(
                expect.objectContaining({
                    mrNumber: 9,
                    base: "develop",
                }),
            );
        } finally {
            writeSpy.mockRestore();
        }
    });

    it("missing TYPESAFE_API_KEY without --mock errors with env var name", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-cli-key-"));
        const path = join(dir, "sample.diff");
        const errs: string[] = [];
        const errSpy = vi
            .spyOn(process.stderr, "write")
            .mockImplementation((chunk) => {
                errs.push(String(chunk));
                return true;
            });
        const prev = process.env.TYPESAFE_API_KEY;
        delete process.env.TYPESAFE_API_KEY;
        process.exitCode = 0;
        try {
            await writeFile(path, SAMPLE, "utf8");
            await runCli(["analyze", path]);
            expect(process.exitCode).toBe(1);
            expect(errs.join("")).toContain("TYPESAFE_API_KEY");
        } finally {
            if (prev !== undefined) process.env.TYPESAFE_API_KEY = prev;
            errSpy.mockRestore();
            await rm(dir, { recursive: true, force: true });
        }
    });
});
