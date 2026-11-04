/**
 * Minimal glob → RegExp for repo-relative paths (Node 20 has no path.matchesGlob).
 * Supports `**` (any depth, including zero dirs), `*` (within a segment) and `?`.
 */
export function globToRegExp(glob: string): RegExp {
    let out = "";
    let i = 0;
    while (i < glob.length) {
        const rest = glob.slice(i);
        if (rest.startsWith("**/")) {
            out += "(?:.*/)?";
            i += 3;
        } else if (rest === "/**") {
            out += "(?:/.*)?";
            i += 3;
        } else if (rest.startsWith("**")) {
            out += ".*";
            i += 2;
        } else if (glob[i] === "*") {
            out += "[^/]*";
            i += 1;
        } else if (glob[i] === "?") {
            out += "[^/]";
            i += 1;
        } else {
            out += glob[i].replace(/[.+^${}()|[\]\\]/g, "\\$&");
            i += 1;
        }
    }
    return new RegExp(`^${out}$`);
}

export function matchesAnyGlob(path: string, globs: string[]): boolean {
    return globs.some((g) => globToRegExp(g).test(path));
}
