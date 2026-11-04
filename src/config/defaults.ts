import { DEFAULT_GATE_RULES } from "../risk/gates.js";
import type { AppConfig } from "./schema.js";

export const DEFAULT_CONFIG: AppConfig = {
    diff: {
        maxChars: 80_000,
    },
    weights: {
        security: 5,
        database: 3,
        api: 2,
        authentication: 1,
    },
    files: {
        tiers: [
            { max: 3, points: 0 },
            { max: 10, points: 5 },
            { above: 10, points: 10 },
        ],
    },
    lines: {
        tiers: [
            { max: 50, points: 0 },
            { max: 200, points: 3 },
            { above: 200, points: 5 },
        ],
    },
    levels: {
        lowMax: 30,
        mediumMax: 60,
        highMax: 80,
    },
    confidence: {
        threshold: 0.7,
        scoredOnly: true,
    },
    recommendations: {
        approve: "Automatic approval possible",
        review: "Human review recommended",
        blockOrSecurity: "Security review required",
    },
    cli: {
        defaultBaseBranch: "main",
    },
    gates: {
        rules: DEFAULT_GATE_RULES.map((rule) => ({ ...rule })),
    },
    evidence: {
        minImpactForRequiredEvidence: 40,
    },
};
