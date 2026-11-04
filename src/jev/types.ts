import type { EvidenceItem, JevDecisions, PrState } from "../schema.js";
import type { InventorySummary } from "../state/inventory.js";

export interface EvaluateContext {
    /** App-built change summary sent next to diffText. */
    inventory?: InventorySummary;
    /** App-owned evidence catalog JEV may cite by id. */
    evidence?: EvidenceItem[];
}

export interface JevClient {
    evaluate(state: PrState, context?: EvaluateContext): Promise<JevDecisions>;
}
