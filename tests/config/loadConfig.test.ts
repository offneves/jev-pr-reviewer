import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config/defaults.js";
import {
    ConfigError,
    DEFAULT_CONFIG_FILENAME,
    loadConfig,
} from "../../src/config/loadConfig.js";

describe("loadConfig", () => {
    it("returns built-in defaults when no config file exists", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-cfg-"));
        try {
            const cfg = await loadConfig({ cwd: dir });
            expect(cfg.weights.security).toBe(5);
            expect(cfg.weights.database).toBe(3);
            expect(cfg.weights.api).toBe(2);
            expect(cfg.weights.authentication).toBe(1);
            expect(cfg.confidence.threshold).toBe(0.7);
            expect(cfg.diff.maxChars).toBe(80_000);
            expect(cfg).toEqual(DEFAULT_CONFIG);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it("deep-merges a partial cwd config over defaults", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-cfg-"));
        try {
            await writeFile(
                join(dir, DEFAULT_CONFIG_FILENAME),
                JSON.stringify({
                    weights: { security: 50 },
                    confidence: { threshold: 0.5 },
                }),
                "utf8",
            );
            const cfg = await loadConfig({ cwd: dir });
            expect(cfg.weights.security).toBe(50);
            expect(cfg.weights.database).toBe(3);
            expect(cfg.confidence.threshold).toBe(0.5);
            expect(cfg.diff.maxChars).toBe(80_000);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it("loads --config path instead of cwd default", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-cfg-"));
        const custom = join(dir, "custom.json");
        try {
            await writeFile(
                custom,
                JSON.stringify({
                    cli: { defaultBaseBranch: "develop" },
                }),
                "utf8",
            );
            const cfg = await loadConfig({ configPath: custom, cwd: dir });
            expect(cfg.cli.defaultBaseBranch).toBe("develop");
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it("throws ConfigError with field path when schema is invalid", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-cfg-"));
        const path = join(dir, "bad.json");
        try {
            await writeFile(
                path,
                JSON.stringify({ confidence: { threshold: 2 } }),
                "utf8",
            );
            await expect(loadConfig({ configPath: path })).rejects.toSatisfy(
                (err: unknown) => {
                    expect(err).toBeInstanceOf(ConfigError);
                    expect((err as Error).message).toContain("threshold");
                    return true;
                },
            );
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it("throws ConfigError including path when --config file is missing", async () => {
        const path = "/no/such/jev-config.json";
        await expect(loadConfig({ configPath: path })).rejects.toSatisfy(
            (err: unknown) => {
                expect(err).toBeInstanceOf(ConfigError);
                expect((err as Error).message).toContain(path);
                return true;
            },
        );
    });

    it("throws ConfigError on malformed JSON", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-cfg-"));
        const path = join(dir, "bad.json");
        try {
            await writeFile(path, "{not-json", "utf8");
            await expect(loadConfig({ configPath: path })).rejects.toSatisfy(
                (err: unknown) => {
                    expect(err).toBeInstanceOf(ConfigError);
                    expect((err as Error).message).toMatch(/Invalid JSON/i);
                    return true;
                },
            );
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it("ignores _docs and description for scoring fields", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-cfg-"));
        try {
            await writeFile(
                join(dir, DEFAULT_CONFIG_FILENAME),
                JSON.stringify({
                    _docs: "ignore me",
                    weights: {
                        description: "also ignore",
                        security: 40,
                    },
                }),
                "utf8",
            );
            const cfg = await loadConfig({ cwd: dir });
            expect(cfg.weights.security).toBe(40);
            expect(cfg).not.toHaveProperty("_docs");
            expect(cfg.weights).not.toHaveProperty("description");
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it("does not read policy weights from environment variables", async () => {
        const prev = process.env.JEV_WEIGHT_SECURITY;
        process.env.JEV_WEIGHT_SECURITY = "99";
        const dir = await mkdtemp(join(tmpdir(), "jev-cfg-"));
        try {
            const cfg = await loadConfig({ cwd: dir });
            expect(cfg.weights.security).toBe(5);
        } finally {
            if (prev === undefined) delete process.env.JEV_WEIGHT_SECURITY;
            else process.env.JEV_WEIGHT_SECURITY = prev;
            await rm(dir, { recursive: true, force: true });
        }
    });

    it("rejects config when every weight is 0", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-cfg-"));
        const path = join(dir, "zero.json");
        try {
            await writeFile(
                path,
                JSON.stringify({
                    weights: {
                        security: 0,
                        database: 0,
                        api: 0,
                        authentication: 0,
                    },
                }),
                "utf8",
            );
            await expect(loadConfig({ configPath: path })).rejects.toSatisfy(
                (err: unknown) => {
                    expect(err).toBeInstanceOf(ConfigError);
                    expect((err as Error).message).toMatch(/weight/i);
                    return true;
                },
            );
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});

describe("loadConfig gates.rules (GATE-07/08)", () => {
    it("defaults to the embedded gate rules", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-cfg-"));
        try {
            const cfg = await loadConfig({ cwd: dir });
            expect(cfg.gates.rules.map((r) => r.id)).toContain("migration-path");
            expect(cfg.gates.rules).toEqual(DEFAULT_CONFIG.gates.rules);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it("replaces default rules with configured rules and keeps other defaults", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-cfg-"));
        try {
            await writeFile(
                join(dir, DEFAULT_CONFIG_FILENAME),
                JSON.stringify({
                    gates: {
                        description: "docs",
                        rules: [
                            {
                                id: "ui-only",
                                severity: "warn",
                                match: "pathRegex:^src/ui/",
                                description: "ignored",
                            },
                        ],
                    },
                }),
                "utf8",
            );
            const cfg = await loadConfig({ cwd: dir });
            expect(cfg.gates.rules).toEqual([
                { id: "ui-only", severity: "warn", match: "pathRegex:^src/ui/" },
            ]);
            expect(cfg.weights.security).toBe(5);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    it.each([
        [{ severity: "warn", match: "secretLine" }, "gates.rules.0.id"],
        [{ id: "x", match: "secretLine" }, "gates.rules.0.severity"],
        [{ id: "x", severity: "fatal", match: "secretLine" }, "gates.rules.0.severity"],
        [{ id: "x", severity: "warn", match: "sensitiveCategory:nope" }, "gates.rules.0.match"],
    ])("rejects invalid rule %j with path %s", async (rule, path) => {
        const dir = await mkdtemp(join(tmpdir(), "jev-cfg-"));
        try {
            await writeFile(
                join(dir, DEFAULT_CONFIG_FILENAME),
                JSON.stringify({ gates: { rules: [rule] } }),
                "utf8",
            );
            await expect(loadConfig({ cwd: dir })).rejects.toSatisfy((err: unknown) => {
                expect(err).toBeInstanceOf(ConfigError);
                expect((err as Error).message).toContain(path);
                return true;
            });
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});

describe("loadConfig evidence (EVID-07)", () => {
    it("defaults minImpactForRequiredEvidence to 40 and accepts overrides", async () => {
        const dir = await mkdtemp(join(tmpdir(), "jev-cfg-"));
        try {
            expect((await loadConfig({ cwd: dir })).evidence.minImpactForRequiredEvidence).toBe(40);
            await writeFile(
                join(dir, DEFAULT_CONFIG_FILENAME),
                JSON.stringify({ evidence: { minImpactForRequiredEvidence: 60 } }),
                "utf8",
            );
            expect((await loadConfig({ cwd: dir })).evidence.minImpactForRequiredEvidence).toBe(60);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
