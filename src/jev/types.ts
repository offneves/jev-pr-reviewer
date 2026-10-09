import type { JevDecisions, PrState } from "../schema.js";

export interface JevClient {
    evaluate(state: PrState): Promise<JevDecisions>;
}
