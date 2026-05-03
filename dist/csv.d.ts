import type { RfyDocument, RfyPlan } from "./format.js";
/** Emit one plan's CSV text. Format mirrors Detailer's Rollforming CSV.
 *
 * Detailer emits a `DETAILS,<job>#1-1,<plan>` header BEFORE EACH FRAME,
 * not just once per file. Verified 2026-05-03 vs HG260044#1-1_GF-LBW-70.075.csv
 * which has 39 DETAILS rows for 39 frames.
 */
export declare function planToCsv(project: {
    name: string;
    jobNum: string;
}, plan: RfyPlan): string;
/** Emit every plan as separate CSVs, keyed by plan name. */
export declare function documentToCsvs(doc: RfyDocument): Record<string, string>;
