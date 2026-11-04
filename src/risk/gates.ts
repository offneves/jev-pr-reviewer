import type { ChangeInventory, SensitiveCategory } from "../schema.js";
import { SensitiveCategorySchema } from "../schema.js";
import { isTestOrDoc, splitFiles, type FileChunk } from "../state/inventory.js";

export type GateSeverity = "info" | "warn" | "block";

/**
 * Matcher forms:
 * - `sensitiveCategory:<category>` inventory sensitive paths of that category
 * - `secretLine`                   added lines that look like credentials
 * - `testRemoval`                  deleted test files or test files losing most lines
 * - `pathRegex:<regex>`            any changed path matching the regex
 */
export interface GateRule {
    id: string;
    severity: GateSeverity;
    match: string;
}

export interface GateResult {
    id: string;
    severity: GateSeverity;
    matchedPaths: string[];
}

export const DEFAULT_GATE_RULES: GateRule[] = [
    { id: "secret-inline", severity: "block", match: "secretLine" },
    { id: "migration-path", severity: "block", match: "sensitiveCategory:migration" },
    { id: "secrets-path", severity: "warn", match: "sensitiveCategory:secrets" },
    { id: "auth-path", severity: "warn", match: "sensitiveCategory:auth" },
    { id: "test-removal", severity: "warn", match: "testRemoval" },
    { id: "ci-config-path", severity: "warn", match: "sensitiveCategory:ci-config" },
    { id: "docker-file-path", severity: "warn", match: "sensitiveCategory:docker-file" },
    { id: "lockfile-change", severity: "info", match: "sensitiveCategory:lockfile" },
];

const SECRET_PATTERNS: RegExp[] = [
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
    /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
    /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
    /\b(?:api[_-]?key|secret(?:[_-]?key)?|password|passwd|pwd|token|access[_-]?key|client[_-]?secret|private[_-]?key)\b["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i,
];

/** Minimum removed lines for a test file to count as test removal. */
export const TEST_REMOVAL_MIN_LINES = 10;

function changedLines(chunk: FileChunk, marker: "+" | "-"): string[] {
    const header = marker === "+" ? "+++" : "---";
    let inHunk = false;
    const out: string[] = [];
    for (const line of chunk.lines) {
        if (line.startsWith("@@")) inHunk = true;
        else if (inHunk && line.startsWith(marker) && !line.startsWith(header)) {
            out.push(line.slice(1));
        }
    }
    return out;
}

export function isSecretLike(line: string): boolean {
    return SECRET_PATTERNS.some((re) => re.test(line));
}

function isTestPath(path: string): boolean {
    // Docs also count for isTestOrDoc; exclude them here.
    return isTestOrDoc(path) && !/\.(?:md|mdx|rst|adoc|txt)$/i.test(path) && !/(?:^|\/)docs?\//i.test(path);
}

function matchPaths(
    match: string,
    inventory: ChangeInventory,
    chunks: FileChunk[],
): string[] {
    if (match.startsWith("sensitiveCategory:")) {
        const category = match.slice("sensitiveCategory:".length) as SensitiveCategory;
        return inventory.sensitive.filter((s) => s.category === category).map((s) => s.path);
    }
    if (match.startsWith("pathRegex:")) {
        const re = new RegExp(match.slice("pathRegex:".length));
        return inventory.files.filter((f) => re.test(f.path)).map((f) => f.path);
    }
    if (match === "secretLine") {
        return chunks
            .filter((c) => changedLines(c, "+").some(isSecretLike))
            .map((c) => c.path);
    }
    if (match === "testRemoval") {
        return chunks
            .filter((c) => isTestPath(c.path))
            .filter((c) => {
                if (c.status === "deleted") return true;
                const removed = changedLines(c, "-").length;
                const added = changedLines(c, "+").length;
                return removed >= TEST_REMOVAL_MIN_LINES && removed > added * 2;
            })
            .map((c) => c.path);
    }
    throw new Error(`Unknown gate matcher: ${match}`);
}

/** Matcher validation shared with config parsing. */
export function isValidMatcher(match: string): boolean {
    if (match === "secretLine" || match === "testRemoval") return true;
    if (match.startsWith("sensitiveCategory:")) {
        return SensitiveCategorySchema.safeParse(match.slice("sensitiveCategory:".length)).success;
    }
    if (match.startsWith("pathRegex:")) {
        const source = match.slice("pathRegex:".length);
        if (!source) return false;
        try {
            new RegExp(source);
            return true;
        } catch {
            return false;
        }
    }
    return false;
}

/** Evaluates rules in order over the full diff; returns only matched gates. */
export function evaluateGates(
    inventory: ChangeInventory,
    diffText: string,
    rules: GateRule[] = DEFAULT_GATE_RULES,
): GateResult[] {
    const chunks = splitFiles(diffText);
    const results: GateResult[] = [];
    for (const rule of rules) {
        const matchedPaths = [...new Set(matchPaths(rule.match, inventory, chunks))];
        if (matchedPaths.length > 0) {
            results.push({ id: rule.id, severity: rule.severity, matchedPaths });
        }
    }
    return results;
}
