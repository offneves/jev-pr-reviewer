import { z } from "zod";

export const YesNoSchema = z.enum(["yes", "no"]);
export type YesNo = z.infer<typeof YesNoSchema>;

export const RiskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const DecisionSchema = <T extends z.ZodType>(valueSchema: T) =>
    z.object({
        value: valueSchema,
        confidence: z.number().min(0).max(1),
    });

export const PrStateSchema = z.object({
    files: z.array(z.string()),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
    diffText: z.string(),
    truncated: z.boolean(),
});

export type PrState = z.infer<typeof PrStateSchema>;

export const JevDecisionsSchema = z.object({
    breakingChange: DecisionSchema(YesNoSchema),
    securityImpact: DecisionSchema(YesNoSchema),
    databaseChange: DecisionSchema(YesNoSchema),
    apiImpact: DecisionSchema(YesNoSchema),
    authenticationImpact: DecisionSchema(YesNoSchema),
    needsHumanReview: DecisionSchema(YesNoSchema),
    riskLevel: DecisionSchema(RiskLevelSchema),
});

export type JevDecisions = z.infer<typeof JevDecisionsSchema>;

export const ScoreContributionSchema = z.object({
    signal: z.string(),
    points: z.number().int(),
    detail: z.string(),
});

export type ScoreContribution = z.infer<typeof ScoreContributionSchema>;

export const AnalysisResultSchema = z.object({
    state: PrStateSchema,
    decisions: JevDecisionsSchema,
    score: z.number().int().min(0).max(100),
    riskLevel: RiskLevelSchema,
    confidence: z.number().min(0).max(1),
    action: z.enum(["APPROVE", "REVIEW", "BLOCK"]),
    recommendation: z.string(),
    contributions: z.array(ScoreContributionSchema),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
