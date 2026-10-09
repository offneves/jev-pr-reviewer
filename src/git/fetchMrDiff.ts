import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MrDiffError } from "./errors.js";
import { runCommand, type RunCommand } from "./runCommand.js";

export { MrDiffError } from "./errors.js";

export interface FetchMrDiffOptions {
    mrNumber: number;
    mrRef?: string;
    base?: string;
    cwd?: string;
    run?: RunCommand;
}

export interface FetchedMrDiff {
    path: string;
    cleanup: () => Promise<void>;
    source: "glab" | "git";
}

async function commandExists(
    command: string,
    run: RunCommand,
    cwd?: string,
): Promise<boolean> {
    try {
        const result = await run(command, ["--version"], { cwd });
        return result.code === 0;
    } catch {
        return false;
    }
}

async function resolveBase(
    preferred: string | undefined,
    run: RunCommand,
    cwd?: string,
): Promise<string> {
    const candidates = preferred
        ? [preferred, "main", "master"].filter(
            (name, index, all) => all.indexOf(name) === index,
        )
        : ["main", "master"];
    for (const candidate of candidates) {
        const result = await run("git", ["rev-parse", "--verify", candidate], {
            cwd,
        });
        if (result.code === 0) {
            return candidate;
        }
    }
    throw new MrDiffError(
        "Could not detect base branch. Pass --base (e.g. --base main).",
    );
}

async function fetchViaGlab(
    mrRef: string,
    run: RunCommand,
    cwd?: string,
): Promise<string> {
    const result = await run("glab", ["mr", "diff", mrRef], { cwd });
    if (result.code !== 0) {
        throw new MrDiffError(
            `glab mr diff ${mrRef} failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`}`,
        );
    }
    if (!result.stdout.trim()) {
        throw new MrDiffError(`glab mr diff ${mrRef} returned an empty diff`);
    }
    return result.stdout;
}

async function fetchViaGit(
    mrNumber: number,
    base: string,
    run: RunCommand,
    cwd?: string,
): Promise<string> {
    const localBranch = `mr-${mrNumber}`;
    const fetch = await run(
        "git",
        ["fetch", "origin", `merge-requests/${mrNumber}/head:${localBranch}`],
        { cwd },
    );
    if (fetch.code !== 0) {
        throw new MrDiffError(
            `git fetch for merge-requests/${mrNumber} failed: ${fetch.stderr.trim() || fetch.stdout.trim() || `exit ${fetch.code}`}`,
        );
    }

    const diff = await run("git", ["diff", `${base}...${localBranch}`], { cwd });
    if (diff.code !== 0) {
        throw new MrDiffError(
            `git diff ${base}...${localBranch} failed: ${diff.stderr.trim() || diff.stdout.trim() || `exit ${diff.code}`}`,
        );
    }
    if (!diff.stdout.trim()) {
        throw new MrDiffError(
            `git diff ${base}...${localBranch} returned an empty diff`,
        );
    }
    return diff.stdout;
}

export async function fetchMrDiff(
    options: FetchMrDiffOptions,
): Promise<FetchedMrDiff> {
    const { mrNumber, cwd } = options;
    if (!Number.isInteger(mrNumber) || mrNumber <= 0) {
        throw new MrDiffError(`Invalid MR number: ${options.mrNumber}`);
    }

    const mrRef = options.mrRef?.trim() || String(mrNumber);
    const run = options.run ?? runCommand;
    const dir = await mkdtemp(join(tmpdir(), "jev-mr-"));
    const path = join(dir, `mr-${mrNumber}.diff`);
    const cleanup = async () => {
        await rm(dir, { recursive: true, force: true });
    };

    try {
        let diffText: string;
        let source: "glab" | "git";

        if (await commandExists("glab", run, cwd)) {
            diffText = await fetchViaGlab(mrRef, run, cwd);
            source = "glab";
        } else {
            if (!(await commandExists("git", run, cwd))) {
                throw new MrDiffError(
                    "Neither glab nor git is available. Install git (and optionally glab) to use `mr`.",
                );
            }
            const base = await resolveBase(options.base, run, cwd);
            diffText = await fetchViaGit(mrNumber, base, run, cwd);
            source = "git";
        }

        await writeFile(path, diffText, "utf8");
        return { path, cleanup, source };
    } catch (err) {
        await cleanup();
        throw err;
    }
}
