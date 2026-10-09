import { MrDiffError } from "./errors.js";

export interface MrTarget {
    /** Numeric MR iid */
    number: number;
    /** Original input when it was a URL (passed to glab when possible) */
    ref: string;
}

/**
 * Accept a bare MR number or a GitLab merge request URL.
 *
 * Examples:
 * - 123
 * - https://gitlab.com/group/project/-/merge_requests/123
 * - https://gitlab.example.com/g/p/-/merge_requests/123/diffs
 */
export function parseMrTarget(input: string): MrTarget {
    const trimmed = input.trim();
    if (!trimmed) {
        throw new MrDiffError("MR target is empty. Pass a number or GitLab MR URL.");
    }

    if (/^\d+$/.test(trimmed)) {
        const number = Number(trimmed);
        if (number <= 0) {
            throw new MrDiffError(`Invalid MR number: ${trimmed}`);
        }
        return { number, ref: trimmed };
    }

    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        throw new MrDiffError(
            `Invalid MR target: ${trimmed}. Use a number (123) or a GitLab MR URL.`,
        );
    }

    const match = url.pathname.match(/\/merge_requests\/(\d+)(?:\/|$)/);
    if (!match) {
        throw new MrDiffError(
            `Could not find /merge_requests/<id> in URL: ${trimmed}`,
        );
    }

    const number = Number(match[1]);
    if (!Number.isInteger(number) || number <= 0) {
        throw new MrDiffError(`Invalid MR number in URL: ${trimmed}`);
    }

    const pathMatch = url.pathname.match(/^(.*?\/merge_requests\/\d+)/);
    const canonical = `${url.origin}${pathMatch?.[1] ?? url.pathname}`;
    return { number, ref: canonical };
}
