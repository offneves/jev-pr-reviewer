import { describe, expect, it } from "vitest";
import { globToRegExp, matchesAnyGlob } from "../../src/risk/glob.js";

describe("globToRegExp", () => {
    it.each([
        ["**/security/**", "src/security/tokens.ts", true],
        ["**/security/**", "security/tokens.ts", true],
        ["**/security/**", "src/securityx/a.ts", false],
        ["src/*.ts", "src/a.ts", true],
        ["src/*.ts", "src/deep/a.ts", false],
        ["src/**/*.sql", "src/db/m/1.sql", true],
        ["src/**/*.sql", "src/1.sql", true],
        ["infra/**", "infra/a/b.tf", true],
        ["file?.md", "file1.md", true],
        ["file?.md", "file10.md", false],
        ["a.b", "axb", false],
    ])("%s vs %s → %s", (glob, path, expected) => {
        expect(globToRegExp(glob).test(path)).toBe(expected);
    });

    it("matchesAnyGlob returns true when any glob matches", () => {
        expect(matchesAnyGlob("src/a.ts", ["docs/**", "src/*.ts"])).toBe(true);
        expect(matchesAnyGlob("src/a.ts", [])).toBe(false);
    });
});
