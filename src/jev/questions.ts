import { choice, score } from "@typesafe-ai/sdk";

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
