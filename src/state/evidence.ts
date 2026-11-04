import type { EvidenceItem } from "../schema.js";
import { splitFiles } from "./inventory.js";
import { isSensitivePath } from "./sensitivePaths.js";

export const EVIDENCE_LIMIT = 40;
export const SNIPPET_MAX_CHARS = 240;

interface Hunk {
    path: string;
    changed: string[];
}

function hunksOf(diffText: string): Hunk[] {
    const hunks: Hunk[] = [];
    for (const chunk of splitFiles(diffText)) {
        let current: Hunk | null = null;
        for (const line of chunk.lines) {
            if (line.startsWith("@@")) {
                current = { path: chunk.path, changed: [] };
                hunks.push(current);
            } else if (
                current &&
                (line.startsWith("+") || line.startsWith("-")) &&
                !line.startsWith("+++") &&
                !line.startsWith("---")
            ) {
                current.changed.push(line);
            }
        }
    }
    return hunks.filter((h) => h.changed.length > 0);
}

function snippetOf(changed: string[]): string {
    const text = changed.join("\n");
    return text.length > SNIPPET_MAX_CHARS
        ? `${text.slice(0, SNIPPET_MAX_CHARS - 1)}…`
        : text;
}

/**
 * App-owned evidence catalog: one item per changed hunk of the full diff,
 * sensitive paths first, ids E1..En in catalog order, capped at EVIDENCE_LIMIT.
 */
export function buildEvidenceCatalog(diffText: string): EvidenceItem[] {
    const hunks = hunksOf(diffText);
    const ordered = [
        ...hunks.filter((h) => isSensitivePath(h.path)),
        ...hunks.filter((h) => !isSensitivePath(h.path)),
    ].slice(0, EVIDENCE_LIMIT);
    return ordered.map((h, i) => ({
        id: `E${i + 1}`,
        path: h.path,
        snippet: snippetOf(h.changed),
    }));
}
