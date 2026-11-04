import { z } from "zod";

export const YesNoSchema = z.enum(["yes", "no"]);
export type YesNo = z.infer<typeof YesNoSchema>;

export const ImpactSchema = z.number().int().min(0).max(100);
export type Impact = z.infer<typeof ImpactSchema>;

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

export const TruncationSchema = z.object({
    truncated: z.boolean(),
    originalChars: z.number().int().nonnegative(),
    keptChars: z.number().int().nonnegative(),
    prioritizedPaths: z.array(z.string()),
});

export type Truncation = z.infer<typeof TruncationSchema>;

export const FileStatusSchema = z.enum(["added", "modified", "deleted", "renamed"]);
export type FileStatus = z.infer<typeof FileStatusSchema>;

export const LanguageSchema = z.enum([
    "java",
    "javascript",
    "typescript",
    "python",
    "other",
]);
export type Language = z.infer<typeof LanguageSchema>;

export const SymbolKindSchema = z.enum(["function", "method", "class", "other"]);
export type SymbolKind = z.infer<typeof SymbolKindSchema>;

export const SensitiveCategorySchema = z.enum([
    "auth",
    "secrets",
    "migration",
    "ci-config",
    "docker-file",
    "lockfile",
]);
export type SensitiveCategory = z.infer<typeof SensitiveCategorySchema>;

export const InventoryFileSchema = z.object({
    path: z.string(),
    status: FileStatusSchema,
    language: LanguageSchema,
});

export const ChangedSymbolSchema = z.object({
    name: z.string().min(1),
    kind: SymbolKindSchema,
    path: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbolSchema>;

export const ChangeInventorySchema = z.object({
    files: z.array(InventoryFileSchema),
    symbols: z.object({
        added: z.array(ChangedSymbolSchema),
        modified: z.array(ChangedSymbolSchema),
        removed: z.array(ChangedSymbolSchema),
    }),
    sensitive: z.array(
        z.object({ path: z.string(), category: SensitiveCategorySchema }),
    ),
    blastRadius: z.object({ directories: z.array(z.string()) }),
    testsOrDocsOnly: z.boolean(),
});
export type ChangeInventory = z.infer<typeof ChangeInventorySchema>;

export const JevDecisionsSchema = z.object({
    breakingChange: DecisionSchema(YesNoSchema),
    securityImpact: DecisionSchema(ImpactSchema),
    databaseChange: DecisionSchema(ImpactSchema),
    apiImpact: DecisionSchema(ImpactSchema),
    authenticationImpact: DecisionSchema(ImpactSchema),
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
    truncation: TruncationSchema,
    decisions: JevDecisionsSchema,
    score: z.number().int().min(0).max(100),
    riskLevel: RiskLevelSchema,
    confidence: z.number().min(0).max(1),
    action: z.enum(["APPROVE", "REVIEW", "BLOCK"]),
    recommendation: z.string(),
    contributions: z.array(ScoreContributionSchema),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
