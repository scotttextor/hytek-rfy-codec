import type { RfyDocument, RfyPlan } from "./format.js";
/** Emit one plan's CSV text. Format mirrors Detailer's Rollforming CSV. */
export declare function planToCsv(project: {
    name: string;
    jobNum: string;
}, plan: RfyPlan): string;
/** Emit every plan as separate CSVs, keyed by plan name. */
export declare function documentToCsvs(doc: RfyDocument): Record<string, string>;
