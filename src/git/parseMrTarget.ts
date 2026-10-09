import { MrDiffError } from "./errors.js";

export interface MrTarget {
    number: number;
    ref: string;
}

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
