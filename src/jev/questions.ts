import { choice } from "@typesafe-ai/sdk";

const yesNo = {
    yes: "Yes",
    no: "No",
} as const;

export function buildJevQuestions() {
    return {
        breakingChange: choice(
            "Does this PR introduce a breaking change for consumers?",
            yesNo,
        ),
        securityImpact: choice(
            "Does this PR have a security impact that needs attention?",
            yesNo,
        ),
        databaseChange: choice(
            "Does this PR change database schema or migrations?",
            yesNo,
        ),
        apiImpact: choice(
            "Does this PR change public API contracts?", 
            yesNo
        ),
        authenticationImpact: choice(
            "Does this PR affect authentication or authorization?",
            yesNo,
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
