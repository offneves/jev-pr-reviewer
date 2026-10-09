import { choice, score } from "@typesafe-ai/sdk";

const yesNo = {
    yes: "Yes",
    no: "No",
} as const;

const IMPACT_RUBRIC = [
    "No impact",
    null,
    null,
    null,
    null,
    "Moderate impact",
    null,
    null,
    null,
    null,
    "Critical impact",
] as const;

export function scoreToImpact(rawScore: number): number {
    const clamped = Math.min(10, Math.max(0, rawScore));
    return Math.round(clamped * 10);
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
            "How severe is the security impact of this PR (0=none … 10=critical)?",
        ),
        databaseChange: impactScore(
            "How severe is the database/schema impact of this PR (0=none … 10=critical)?",
        ),
        apiImpact: impactScore(
            "How severe is the public API contract impact of this PR (0=none … 10=critical)?",
        ),
        authenticationImpact: impactScore(
            "How severe is the authentication/authorization impact of this PR (0=none … 10=critical)?",
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
