import type { SensitiveCategory } from "../schema.js";

// Default sensitive-path table. deterministic-gates (F3) will move it into config.

const AUTH_KEYWORDS = [
    "auth",
    "authn",
    "authz",
    "authentication",
    "authorization",
    "oauth",
    "login",
    "logout",
    "session",
    "sessions",
    "token",
    "tokens",
    "jwt",
    "password",
    "passwords",
    "credential",
    "credentials",
    "security",
    "permission",
    "permissions",
    "acl",
];

const SECRET_KEYWORDS = ["secret", "secrets", "crypto"];

const word = (keywords: string[]) =>
    new RegExp(`(?:^|[/_.-])(?:${keywords.join("|")})(?:$|[/_.-])`);

// First match wins.
const CATEGORY_PATTERNS: [SensitiveCategory, RegExp][] = [
    ["lockfile", /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|pipfile\.lock|gradle\.lockfile)$/],
    ["ci-config", /(?:^|\/)\.github\/workflows\//],
    ["ci-config", /\.gitlab-ci\.ya?ml$/],
    ["ci-config", /(?:^|\/)jenkinsfile$/],
    ["docker-file", /(?:^|\/)dockerfile/],
    ["docker-file", /(?:^|\/)docker-compose[^/]*\.ya?ml$/],
    ["migration", /(?:^|\/)migrations?(?:\/|$)/],
    ["migration", /\.sql$/],
    ["secrets", /(?:^|\/)\.env(?:\.|$)/],
    ["secrets", word(SECRET_KEYWORDS)],
    ["auth", word(AUTH_KEYWORDS)],
];

/** Splits camelCase/PascalCase into dash-separated lowercase (AuthService → auth-service). */
function normalize(path: string): string {
    return path
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
        .toLowerCase();
}

export function sensitiveCategory(path: string): SensitiveCategory | null {
    if (!path) return null;
    const normalized = normalize(path);
    for (const [category, re] of CATEGORY_PATTERNS) {
        if (re.test(normalized)) return category;
    }
    return null;
}

/**
 * True when hunks of this path should be prioritized under truncation.
 * Lockfiles are sensitive for inventory but excluded here: they are huge
 * and would eat the budget.
 */
export function isSensitivePath(path: string): boolean {
    const category = sensitiveCategory(path);
    return category !== null && category !== "lockfile";
}
