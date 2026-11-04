import type {
    ChangeInventory,
    ChangedSymbol,
    FileStatus,
    Language,
    SymbolKind,
} from "../schema.js";
import { sensitiveCategory } from "./sensitivePaths.js";

interface Declaration {
    name: string;
    kind: SymbolKind;
}

interface FileChunk {
    path: string;
    status: FileStatus;
    lines: string[];
}

const EXTENSIONS: [RegExp, Language][] = [
    [/\.java$/i, "java"],
    [/\.(?:ts|tsx|mts|cts)$/i, "typescript"],
    [/\.(?:js|jsx|mjs|cjs)$/i, "javascript"],
    [/\.(?:py|pyi)$/i, "python"],
];

export function languageOf(path: string): Language {
    for (const [re, language] of EXTENSIONS) {
        if (re.test(path)) return language;
    }
    return "other";
}

const CONTROL_WORDS = new Set([
    "if",
    "for",
    "while",
    "switch",
    "catch",
    "return",
    "new",
    "else",
    "do",
    "try",
    "throw",
    "function",
    "super",
    "this",
    "typeof",
    "await",
    "yield",
    "constructor",
]);

const JAVA_CLASS =
    /^\s*(?:(?:public|protected|private|abstract|final|static|sealed|non-sealed|strictfp)\s+)*(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/;
const JAVA_METHOD =
    /^\s*(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|protected|private|static|final|abstract|synchronized|native|default|strictfp)\s+)*(?:<[^>]+>\s+)?([\w$][\w$.<>[\],?\s]*?)\s+([A-Za-z_$][\w$]*)\s*\(/;

const JS_CLASS = /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/;
const JS_INTERFACE = /^\s*(?:export\s+)?(?:declare\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/;
const JS_FUNCTION = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/;
const JS_ARROW =
    /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>)/;
const JS_METHOD =
    /^\s+(?:(?:public|private|protected|static|readonly|async|override|abstract|get|set)\s+)*\*?([A-Za-z_$#][\w$]*)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?::\s*[^{=;]+)?\{\s*$/;

const PY_CLASS = /^\s*class\s+([A-Za-z_]\w*)/;
const PY_DEF = /^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)/;

function javaDeclaration(line: string): Declaration | null {
    const cls = JAVA_CLASS.exec(line);
    if (cls) return { name: cls[1], kind: "class" };
    const m = JAVA_METHOD.exec(line);
    if (!m) return null;
    const [, type, name] = m;
    const before = line.slice(0, m.index + m[0].length);
    if (before.includes("=") || before.includes("return ")) return null;
    const typeWords = type.trim().split(/\s+/);
    if (typeWords.some((w) => CONTROL_WORDS.has(w)) || CONTROL_WORDS.has(name)) {
        return null;
    }
    return { name, kind: "method" };
}

function jsDeclaration(line: string, language: Language): Declaration | null {
    const cls = JS_CLASS.exec(line);
    if (cls) return { name: cls[1], kind: "class" };
    if (language === "typescript") {
        const iface = JS_INTERFACE.exec(line);
        if (iface) return { name: iface[1], kind: "other" };
    }
    const fn = JS_FUNCTION.exec(line) ?? JS_ARROW.exec(line);
    if (fn) return { name: fn[1], kind: "function" };
    const method = JS_METHOD.exec(line);
    if (method && !CONTROL_WORDS.has(method[1])) {
        return { name: method[1], kind: "method" };
    }
    if (method && method[1] === "constructor") {
        return { name: "constructor", kind: "method" };
    }
    return null;
}

function pythonDeclaration(line: string): Declaration | null {
    const cls = PY_CLASS.exec(line);
    if (cls) return { name: cls[1], kind: "class" };
    const def = PY_DEF.exec(line);
    if (def) return { name: def[2], kind: def[1].length > 0 ? "method" : "function" };
    return null;
}

export function declarationOf(line: string, language: Language): Declaration | null {
    switch (language) {
        case "java":
            return javaDeclaration(line);
        case "javascript":
        case "typescript":
            return jsDeclaration(line, language);
        case "python":
            return pythonDeclaration(line);
        default:
            return null;
    }
}

function stripPrefix(p: string, prefix: string): string {
    return p.startsWith(prefix) ? p.slice(prefix.length) : p;
}

function splitFiles(text: string): FileChunk[] {
    const chunks: FileChunk[] = [];
    let current: string[] | null = null;
    const flush = () => {
        if (current) chunks.push(chunkFrom(current));
    };
    for (const line of text.split(/\r?\n/)) {
        if (line.startsWith("diff --git ")) {
            flush();
            current = [line];
        } else if (current) {
            current.push(line);
        } else if (line.startsWith("--- ")) {
            // Plain unified diff without git headers.
            current = [line];
        }
    }
    flush();
    return chunks.filter((c) => c.path !== "");
}

function chunkFrom(lines: string[]): FileChunk {
    let oldPath = "";
    let newPath = "";
    let renameTo = "";
    let added = false;
    let deleted = false;
    for (const line of lines) {
        if (line.startsWith("@@")) break;
        if (line.startsWith("diff --git ")) {
            const m = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
            if (m) {
                oldPath = m[1];
                newPath = m[2];
            }
        } else if (line.startsWith("new file mode")) {
            added = true;
        } else if (line.startsWith("deleted file mode")) {
            deleted = true;
        } else if (line.startsWith("rename to ")) {
            renameTo = line.slice("rename to ".length);
        } else if (line.startsWith("--- ")) {
            const p = line.slice(4).trim();
            if (p === "/dev/null") added = true;
            else oldPath = stripPrefix(p, "a/");
        } else if (line.startsWith("+++ ")) {
            const p = line.slice(4).trim();
            if (p === "/dev/null") deleted = true;
            else newPath = stripPrefix(p, "b/");
        }
    }
    let status: FileStatus = "modified";
    if (renameTo) status = "renamed";
    else if (added) status = "added";
    else if (deleted) status = "deleted";
    const path = renameTo || (status === "deleted" ? oldPath : newPath) || oldPath;
    return { path, status, lines };
}

const symbolKey = (path: string, d: Declaration) => `${path}\u0000${d.kind}\u0000${d.name}`;

function collectSymbols(chunk: FileChunk, language: Language) {
    const added = new Map<string, ChangedSymbol>();
    const removed = new Map<string, ChangedSymbol>();
    const touched = new Map<string, ChangedSymbol>();
    const toSymbol = (d: Declaration): ChangedSymbol => ({ ...d, path: chunk.path });

    let inHunk = false;
    let enclosing: Declaration | null = null;
    for (const line of chunk.lines) {
        if (line.startsWith("@@")) {
            inHunk = true;
            // git puts the enclosing declaration after the second @@.
            const context = /^@@[^@]*@@\s?(.*)$/.exec(line)?.[1] ?? "";
            enclosing = context ? declarationOf(context, language) : null;
            continue;
        }
        if (!inHunk || line.startsWith("\\")) continue;
        const marker = line[0];
        const body = line.slice(1);
        const decl = declarationOf(body, language);
        if (marker === "+" || marker === "-") {
            if (decl) {
                (marker === "+" ? added : removed).set(symbolKey(chunk.path, decl), toSymbol(decl));
            } else if (enclosing) {
                touched.set(symbolKey(chunk.path, enclosing), toSymbol(enclosing));
            }
        } else if (marker === " " && decl) {
            enclosing = decl;
        }
    }

    const modified = new Map<string, ChangedSymbol>();
    for (const [key, sym] of added) {
        if (removed.has(key)) modified.set(key, sym);
    }
    for (const key of modified.keys()) {
        added.delete(key);
        removed.delete(key);
    }
    for (const [key, sym] of touched) {
        if (!added.has(key) && !removed.has(key)) modified.set(key, sym);
    }
    return {
        added: [...added.values()],
        modified: [...modified.values()],
        removed: [...removed.values()],
    };
}

const TEST_OR_DOC = [
    /(?:^|\/)(?:tests?|__tests__|spec|specs|docs?)\//i,
    /\.(?:test|spec)\.[^/]+$/i,
    /(?:^|\/)test_[^/]*\.py$/i,
    /_test\.(?:py|go)$/i,
    /Tests?\.java$/,
    /\.(?:md|mdx|rst|adoc|txt)$/i,
    /(?:^|\/)(?:README|CHANGELOG|LICENSE)[^/]*$/i,
];

function isTestOrDoc(path: string): boolean {
    return TEST_OR_DOC.some((re) => re.test(path));
}

function parentDirectory(path: string): string {
    const i = path.lastIndexOf("/");
    return i === -1 ? "." : path.slice(0, i);
}

/** Deterministic change inventory derived only from unified diff text. */
export function buildInventory(diffText: string): ChangeInventory {
    const chunks = splitFiles(diffText);
    const symbols = { added: [] as ChangedSymbol[], modified: [] as ChangedSymbol[], removed: [] as ChangedSymbol[] };
    const sensitive: ChangeInventory["sensitive"] = [];

    const files = chunks.map((chunk) => {
        const language = languageOf(chunk.path);
        const found = collectSymbols(chunk, language);
        symbols.added.push(...found.added);
        symbols.modified.push(...found.modified);
        symbols.removed.push(...found.removed);
        const category = sensitiveCategory(chunk.path);
        if (category) sensitive.push({ path: chunk.path, category });
        return { path: chunk.path, status: chunk.status, language };
    });

    const directories = [...new Set(files.map((f) => parentDirectory(f.path)))].sort();

    return {
        files,
        symbols,
        sensitive,
        blastRadius: { directories },
        testsOrDocsOnly: files.length > 0 && files.every((f) => isTestOrDoc(f.path)),
    };
}
