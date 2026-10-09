import { describe, expect, it } from "vitest";
import { MrDiffError } from "./errors.js";
import { parseMrTarget } from "./parseMrTarget.js";

describe("parseMrTarget", () => {
    it("parses a bare MR number", () => {
        expect(parseMrTarget("123")).toEqual({ number: 123, ref: "123" });
    });

    it("parses a GitLab merge request URL", () => {
        const url =
            "https://gitlab.com/acme/app/-/merge_requests/42";
        expect(parseMrTarget(url)).toEqual({
            number: 42,
            ref: "https://gitlab.com/acme/app/-/merge_requests/42",
        });
    });

    it("strips trailing /diffs from the URL ref", () => {
        const url =
            "https://gitlab.example.com/g/p/-/merge_requests/9/diffs";
        const parsed = parseMrTarget(url);
        expect(parsed.number).toBe(9);
        expect(parsed.ref).toBe(
            "https://gitlab.example.com/g/p/-/merge_requests/9",
        );
    });

    it("rejects invalid input", () => {
        expect(() => parseMrTarget("not-a-url")).toThrow(MrDiffError);
        expect(() => parseMrTarget("https://example.com/foo")).toThrow(MrDiffError);
        expect(() => parseMrTarget("0")).toThrow(MrDiffError);
    });
});
