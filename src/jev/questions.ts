import { choice, score } from "@typesafe-ai/sdk";
import type { EvidenceItem } from "../schema.js";

const yesNo = {
    yes: "Yes",
    no: "No",
} as const;

const IMPACT_RUBRIC_MAX = 9;

const IMPACT_RUBRIC = [
    "0 — No impact",
    "1 — Minimal / negligible impact",
    "2 — Very low impact",
    "3 — Low impact",
    "4 — Low-to-moderate impact",
    "5 — Moderate impact",
    "6 — Moderate-to-high impact",
    "7 — High impact",
    "8 — Very high impact",
    "9 — Critical impact",
] as const;

export function scoreToImpact(rawScore: number): number {
    const clamped = Math.min(IMPACT_RUBRIC_MAX, Math.max(0, rawScore));
    return Math.round((clamped / IMPACT_RUBRIC_MAX) * 100);
}

function impactScore(instructions: string) {
    return score(instructions, IMPACT_RUBRIC);
}

export function buildJevQuestions() {
    return {
        breakingChange: choice(
            "Does this PR introduce a breaking change for consumers?",
            yesNo,
        ),
        securityImpact: impactScore(
            "How severe is the security impact of this PR (0=none … 9=critical)?",
        ),
        databaseChange: impactScore(
            "How severe is the database/schema impact of this PR (0=none … 9=critical)?",
        ),
        apiImpact: impactScore(
            "How severe is the public API contract impact of this PR (0=none … 9=critical)?",
        ),
        authenticationImpact: impactScore(
            "How severe is the authentication/authorization impact of this PR (0=none … 9=critical)?",
        ),
        needsHumanReview: choice(
            "Should a human review this PR before merge?",
            yesNo,
        ),
        riskLevel: choice("What is the overall risk level of this PR?", {
            LOW: "Low risk",
            MEDIUM: "Medium risk",
            HIGH: "High risk",
            CRITICAL: "Critical risk",
        }),
    };
}

export const JEV_DECISION_KEYS = [
    "breakingChange",
    "securityImpact",
    "databaseChange",
    "apiImpact",
    "authenticationImpact",
    "needsHumanReview",
    "riskLevel",
] as const;

/** Scored axis → evidence question key asked in the same System One call. */
export const EVIDENCE_QUESTION_KEYS = {
    securityImpact: "securityEvidence",
    databaseChange: "databaseEvidence",
    apiImpact: "apiEvidence",
    authenticationImpact: "authenticationEvidence",
} as const;

export type ScoredAxis = keyof typeof EVIDENCE_QUESTION_KEYS;

export const NO_EVIDENCE_LABEL = "NONE";
/** Minimum choice probability for a catalog id to count as cited. */
export const EVIDENCE_MIN_PROBABILITY = 0.15;
/** Maximum cited ids per axis. */
export const EVIDENCE_MAX_IDS = 3;

const AXIS_TOPIC: Record<ScoredAxis, string> = {
    securityImpact: "security",
    databaseChange: "database/schema",
    apiImpact: "public API contract",
    authenticationImpact: "authentication/authorization",
};

/** One choice question per scored axis over the app-built catalog; none when it is empty. */
export function buildEvidenceQuestions(evidence: EvidenceItem[]) {
    if (evidence.length === 0) return {};
    const criteria: Record<string, string | { path: string; snippet: string }> = {
        [NO_EVIDENCE_LABEL]: "None of the listed changes supports this impact",
    };
    for (const item of evidence) {
        criteria[item.id] = { path: item.path, snippet: item.snippet };
    }
    const questions: Record<string, ReturnType<typeof choice>> = {};
    for (const [axis, key] of Object.entries(EVIDENCE_QUESTION_KEYS)) {
        questions[key] = choice(
            `Which listed change is the strongest evidence for the ${AXIS_TOPIC[axis as ScoredAxis]} impact of this PR? Answer ${NO_EVIDENCE_LABEL} if none.`,
            criteria,
        );
    }
    return questions;
}

/** Catalog ids with probability >= threshold (NONE and unknown ids excluded), highest first. */
export function evidenceIdsFromProbabilities(
    probabilities: Record<string, number> | undefined,
    knownIds: ReadonlySet<string>,
): string[] {
    if (!probabilities) return [];
    return Object.entries(probabilities)
        .filter(
            ([label, p]) =>
                label !== NO_EVIDENCE_LABEL &&
                knownIds.has(label) &&
                p >= EVIDENCE_MIN_PROBABILITY,
        )
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en", { numeric: true }))
        .slice(0, EVIDENCE_MAX_IDS)
        .map(([label]) => label);
}
