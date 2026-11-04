import type { Truncation } from "../schema.js";
import { isSensitivePath } from "./sensitivePaths.js";

interface FileSection {
    path: string;
    sensitive: boolean;
    header: string;
    hunks: string[];
}

export interface TruncateResult {
    diffText: string;
    truncation: Truncation;
}

function pathFromSection(lines: string[]): string {
    let minus = "";
    let gitHeader = "";
    for (const line of lines) {
        if (line.startsWith("+++ ")) {
            const p = line.slice(4).trim();
            if (p !== "/dev/null") return p.startsWith("b/") ? p.slice(2) : p;
        } else if (line.startsWith("--- ")) {
            const p = line.slice(4).trim();
            if (p !== "/dev/null") minus = p.startsWith("a/") ? p.slice(2) : p;
        } else if (line.startsWith("diff --git ")) {
            const m = /\sb\/(\S+)\s*$/.exec(line);
            if (m) gitHeader = m[1];
        }
    }
    return minus || gitHeader;
}

/** Splits a unified diff into per-file sections; null when there are no `diff --git` headers. */
function splitSections(text: string): FileSection[] | null {
    const lines = text.split(/(?<=\n)/);
    if (!lines.some((l) => l.startsWith("diff --git "))) return null;

    const groups: string[][] = [];
    let current: string[] = [];
    for (const line of lines) {
        if (line.startsWith("diff --git ") && current.length > 0) {
            groups.push(current);
            current = [];
        }
        current.push(line);
    }
    if (current.length > 0) groups.push(current);

    return groups.map((group) => {
        const isFile = group[0].startsWith("diff --git ");
        const path = isFile ? pathFromSection(group) : "";
        let header = "";
        const hunks: string[] = [];
        for (const line of group) {
            if (isFile && line.startsWith("@@")) {
                hunks.push(line);
            } else if (hunks.length > 0) {
                hunks[hunks.length - 1] += line;
            } else {
                header += line;
            }
        }
        return { path, sensitive: isSensitivePath(path), header, hunks };
    });
}

function prefixResult(text: string, maxChars: number): TruncateResult {
    const diffText = text.slice(0, maxChars);
    return {
        diffText,
        truncation: {
            truncated: true,
            originalChars: text.length,
            keptChars: diffText.length,
            prioritizedPaths: [],
        },
    };
}

/**
 * Fits `text` into `maxChars`. When the diff contains sensitive paths, their hunks are
 * packed first (whole hunks, greedy), then the leftover budget is filled with a cut of
 * the first hunk that did not fit; otherwise the diff is cut as a prefix.
 */
export function truncateDiff(text: string, maxChars: number): TruncateResult {
    if (text.length <= maxChars) {
        return {
            diffText: text,
            truncation: {
                truncated: false,
                originalChars: text.length,
                keptChars: text.length,
                prioritizedPaths: [],
            },
        };
    }

    const sections = splitSections(text);
    if (!sections || !sections.some((s) => s.sensitive)) {
        return prefixResult(text, maxChars);
    }

    const ordered = [
        ...sections.filter((s) => s.sensitive),
        ...sections.filter((s) => !s.sensitive),
    ];

    let out = "";
    const prioritized: string[] = [];
    // First piece that did not fit whole; used to fill the leftover budget.
    let skipped: { text: string; section: FileSection } | null = null;
    const markKept = (section: FileSection) => {
        if (section.sensitive && !prioritized.includes(section.path)) {
            prioritized.push(section.path);
        }
    };

    for (const section of ordered) {
        let kept = "";
        const pieces = section.hunks.length > 0 ? section.hunks : [""];
        for (const hunk of pieces) {
            const piece = (kept ? "" : section.header) + hunk;
            if (out.length + kept.length + piece.length <= maxChars) {
                kept += piece;
            } else if (!skipped) {
                skipped = { text: piece, section };
            }
        }
        if (kept) {
            out += kept;
            markKept(section);
        }
    }

    const room = maxChars - out.length;
    if (skipped && room > 0) {
        const cut = skipped.text.slice(0, room);
        out += cut;
        // Only a cut that reaches hunk content counts as a contributed hunk.
        if (cut.includes("\n@@")  || cut.startsWith("@@")) {
            markKept(skipped.section);
        }
    }

    return {
        diffText: out,
        truncation: {
            truncated: true,
            originalChars: text.length,
            keptChars: out.length,
            prioritizedPaths: prioritized,
        },
    };
}
