import { TypeSafeClient } from "@typesafe-ai/sdk";
import {
    JevDecisionsSchema,
    RiskLevelSchema,
    YesNoSchema,
    type JevDecisions,
    type PrState,
    type RiskLevel,
    type YesNo,
} from "../schema.js";
import { buildJevQuestions } from "./questions.js";
import type { JevClient } from "./types.js";

function redactSecrets(message: string): string {
    return message.replace(
        /(TYPESAFE_API_KEY\s*[=:]\s*)\S+/gi,
        "$1[REDACTED]",
    ).replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[REDACTED]");
}

function asYesNo(value: string): YesNo {
    const parsed = YesNoSchema.safeParse(value);
    if (!parsed.success) {
        return "no";
    }
    return parsed.data;
}

function asRiskLevel(value: string): RiskLevel {
    return RiskLevelSchema.parse(value);
}

export function createTypeSafeJevClient(
    env: NodeJS.ProcessEnv = process.env,
): JevClient {
    const apiKey = env.TYPESAFE_API_KEY?.trim();
    if (!apiKey) {
        throw new Error(
            "Missing TYPESAFE_API_KEY. Set the environment variable before using the real JEV client.",
        );
    }

    const sdk = new TypeSafeClient({ apiKey });

    return {
        async evaluate(state: PrState): Promise<JevDecisions> {
            try {
                const questions = buildJevQuestions();
                const response = await sdk.systemOne({
                    state: {
                        files: state.files,
                        additions: state.additions,
                        deletions: state.deletions,
                        truncated: state.truncated,
                        diffText: state.diffText,
                    },
                    questions,
                });

                const a = response.answers;
                const decisions: JevDecisions = {
                    breakingChange: {
                        value: asYesNo(a.breakingChange.choice),
                        confidence: a.breakingChange.confidence,
                    },
                    securityImpact: {
                        value: asYesNo(a.securityImpact.choice),
                        confidence: a.securityImpact.confidence,
                    },
                    databaseChange: {
                        value: asYesNo(a.databaseChange.choice),
                        confidence: a.databaseChange.confidence,
                    },
                    apiImpact: {
                        value: asYesNo(a.apiImpact.choice),
                        confidence: a.apiImpact.confidence,
                    },
                    authenticationImpact: {
                        value: asYesNo(a.authenticationImpact.choice),
                        confidence: a.authenticationImpact.confidence,
                    },
                    needsHumanReview: {
                        value: asYesNo(a.needsHumanReview.choice),
                        confidence: a.needsHumanReview.confidence,
                    },
                    riskLevel: {
                        value: asRiskLevel(a.riskLevel.choice),
                        confidence: a.riskLevel.confidence,
                    },
                };

                return JevDecisionsSchema.parse(decisions);
            } catch (err) {
                const raw =
                    err instanceof Error ? err.message : "TypeSafe JEV request failed";
                throw new Error(redactSecrets(raw), { cause: err });
            }
        },
    };
}
