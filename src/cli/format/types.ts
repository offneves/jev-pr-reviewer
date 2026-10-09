import { z } from "zod";

const LabelsSchema = z.record(z.string(), z.string());

const OrderedLabelSchema = z.object({
    order: z.array(z.string()).min(1),
    labels: LabelsSchema,
});

export const DisplayConfigSchema = z.object({
    _docs: z.string().optional(),
    analyze: z.object({
        title: z.string().min(1),
        sections: z.object({
            risk: z.string().min(1),
            confidence: z.string().min(1),
            action: z.string().min(1),
            scored: z.string().min(1),
            advisory: z.string().min(1),
            state: z.string().min(1),
        }),
        scored: OrderedLabelSchema,
        advisory: OrderedLabelSchema,
    }),
    explain: z.object({
        title: z.string().min(1),
        sections: z.object({
            contributions: z.string().min(1),
            totalScore: z.string().min(1),
            riskLevel: z.string().min(1),
        }),
        signals: OrderedLabelSchema,
    }),
});

export type DisplayConfig = z.infer<typeof DisplayConfigSchema>;

export function labelOf(
    labels: Record<string, string>,
    key: string,
): string {
    return labels[key] ?? key;
}

export function labelForDecision(key: string, config: DisplayConfig): string {
    if (key in config.analyze.scored.labels) {
        return labelOf(config.analyze.scored.labels, key);
    }
    return labelOf(config.analyze.advisory.labels, key);
}

export function labelForSignal(signal: string, config: DisplayConfig): string {
    return labelOf(config.explain.signals.labels, signal);
}
