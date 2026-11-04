// Default sensitive-path patterns used to prioritize hunks when truncating.
// deterministic-gates (F3) will move these into config with categories.
// Lockfiles are intentionally excluded: they are huge and would eat the budget.

const KEYWORDS = [
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
    "secret",
    "secrets",
    "crypto",
    "security",
    "permission",
    "permissions",
    "acl",
];

const SENSITIVE_PATTERNS: RegExp[] = [
    new RegExp(`(?:^|[/_.-])(?:${KEYWORDS.join("|")})(?:$|[/_.-])`),
    /(?:^|\/)migrations?(?:\/|$)/,
    /\.sql$/,
    /(?:^|\/)\.env(?:\.|$)/,
    /(?:^|\/)dockerfile/,
    /(?:^|\/)\.github\/workflows\//,
    /\.gitlab-ci\.ya?ml$/,
    /(?:^|\/)jenkinsfile$/,
];

/** Splits camelCase/PascalCase into dash-separated lowercase (AuthService → auth-service). */
function normalize(path: string): string {
    return path
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
        .toLowerCase();
}

export function isSensitivePath(path: string): boolean {
    if (!path) return false;
    const normalized = normalize(path);
    return SENSITIVE_PATTERNS.some((re) => re.test(normalized));
}
