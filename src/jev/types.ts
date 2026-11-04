import type { JevDecisions, PrState } from "../schema.js";
import type { InventorySummary } from "../state/inventory.js";

export interface JevClient {
    /** `inventory` is the app-built change summary sent next to diffText. */
    evaluate(state: PrState, inventory?: InventorySummary): Promise<JevDecisions>;
}
