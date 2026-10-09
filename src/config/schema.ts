import { z } from "zod";

const TierSchema = z
    .object({
        max: z.number().int().nonnegative().optional(),
        above: z.number().int().nonnegative().optional(),
        points: z.number().int().nonnegative(),
        description: z.string().optional(),
    })
    .refine((t) => t.max !== undefined || t.above !== undefined, {
        message: "tier must have max or above",
    });

export const AppConfigSchema = z
    .object({
        _docs: z.string().optional(),
        diff: z
            .object({
                description: z.string().optional(),
                maxChars: z.number().int().positive().optional(),
            })
            .partial()
            .optional(),
        weights: z
            .object({
                description: z.string().optional(),
                security: z.number().int().nonnegative().optional(),
                database: z.number().int().nonnegative().optional(),
                api: z.number().int().nonnegative().optional(),
                authentication: z.number().int().nonnegative().optional(),
            })
            .partial()
            .optional(),
        files: z
            .object({
                description: z.string().optional(),
                tiers: z.array(TierSchema).min(1).optional(),
            })
            .partial()
            .optional(),
        lines: z
            .object({
                description: z.string().optional(),
                tiers: z.array(TierSchema).min(1).optional(),
            })
            .partial()
            .optional(),
        levels: z
            .object({
                description: z.string().optional(),
                lowMax: z.number().int().nonnegative().optional(),
                mediumMax: z.number().int().nonnegative().optional(),
                highMax: z.number().int().nonnegative().optional(),
            })
            .partial()
            .optional(),
        confidence: z
            .object({
                description: z.string().optional(),
                threshold: z.number().min(0).max(1).optional(),
            })
            .partial()
            .optional(),
        recommendations: z
            .object({
                description: z.string().optional(),
                approve: z.string().min(1).optional(),
                review: z.string().min(1).optional(),
                blockOrSecurity: z.string().min(1).optional(),
            })
            .partial()
            .optional(),
        cli: z
            .object({
                description: z.string().optional(),
                defaultBaseBranch: z.string().min(1).optional(),
            })
            .partial()
            .optional(),
    })
    .passthrough();

export const ResolvedAppConfigSchema = z.object({
    diff: z.object({
        maxChars: z.number().int().positive(),
    }),
    weights: z.object({
        security: z.number().int().nonnegative(),
        database: z.number().int().nonnegative(),
        api: z.number().int().nonnegative(),
        authentication: z.number().int().nonnegative(),
    }),
    files: z.object({
        tiers: z.array(TierSchema).min(1),
    }),
    lines: z.object({
        tiers: z.array(TierSchema).min(1),
    }),
    levels: z
        .object({
            lowMax: z.number().int().nonnegative(),
            mediumMax: z.number().int().nonnegative(),
            highMax: z.number().int().nonnegative(),
        })
        .refine((l) => l.lowMax < l.mediumMax && l.mediumMax < l.highMax, {
            message: "levels must satisfy lowMax < mediumMax < highMax",
        }),
    confidence: z.object({
        threshold: z.number().min(0).max(1),
    }),
    recommendations: z.object({
        approve: z.string().min(1),
        review: z.string().min(1),
        blockOrSecurity: z.string().min(1),
    }),
    cli: z.object({
        defaultBaseBranch: z.string().min(1),
    }),
});

export type AppConfig = z.infer<typeof ResolvedAppConfigSchema>;
export type AppConfigFile = z.infer<typeof AppConfigSchema>;
