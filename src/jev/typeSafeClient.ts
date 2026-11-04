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
import {
    EVIDENCE_QUESTION_KEYS,
    buildEvidenceQuestions,
    buildJevQuestions,
    evidenceIdsFromProbabilities,
    scoreToImpact,
    type ScoredAxis,
} from "./questions.js";
import type { EvaluateContext, JevClient } from "./types.js";

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

function asImpact(rawScore: number, confidence: number, evidenceIds: string[]) {
    return {
        value: scoreToImpact(rawScore),
        confidence,
        evidenceIds,
    };
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
        async evaluate(
            state: PrState,
            context: EvaluateContext = {},
        ): Promise<JevDecisions> {
            const { inventory, evidence = [] } = context;
            try {
                const questions = {
                    ...buildJevQuestions(),
                    ...buildEvidenceQuestions(evidence),
                };
                const response = await sdk.systemOne({
                    state: {
                        files: state.files,
                        additions: state.additions,
                        deletions: state.deletions,
                        truncated: state.truncated,
                        diffText: state.diffText,
                        ...(inventory ? { inventory: { ...inventory } } : {}),
                    },
                    questions,
                });

                const a = response.answers;
                const knownIds = new Set(evidence.map((e) => e.id));
                const loose = response.answers as unknown as Record<
                    string,
                    { probabilities?: Record<string, number> } | undefined
                >;
                const cited = (axis: ScoredAxis) =>
                    evidenceIdsFromProbabilities(
                        loose[EVIDENCE_QUESTION_KEYS[axis]]?.probabilities,
                        knownIds,
                    );
                const decisions: JevDecisions = {
                    breakingChange: {
                        value: asYesNo(a.breakingChange.choice),
                        confidence: a.breakingChange.confidence,
                    },
                    securityImpact: asImpact(
                        a.securityImpact.score,
                        a.securityImpact.confidence,
                        cited("securityImpact"),
                    ),
                    databaseChange: asImpact(
                        a.databaseChange.score,
                        a.databaseChange.confidence,
                        cited("databaseChange"),
                    ),
                    apiImpact: asImpact(
                        a.apiImpact.score,
                        a.apiImpact.confidence,
                        cited("apiImpact"),
                    ),
                    authenticationImpact: asImpact(
                        a.authenticationImpact.score,
                        a.authenticationImpact.confidence,
                        cited("authenticationImpact"),
                    ),
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
