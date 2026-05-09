import type { ParsedFrame } from "./synthesize-plans.js";
/** True iff the plan name marks this as a Roof-Panel (Reversed-Tooling) plan.
 *  Matches `-RP-` anywhere in the plan name (e.g. PK1-GF-RP-89.075).
 *  Cross-checked against TIN/TB2B detection in src/csv.ts:332 — RP plans are
 *  disjoint from those. */
export declare function isRpPlanName(planName: string): boolean;
export interface SimplifyRpDecision {
    frame: string;
    decision: "APPLY" | "SKIP";
    reason: string;
    /** Sticks (S) whose start cap was rewritten. */
    studStartsRewritten?: string[];
    /** Sticks (S) whose end side received a Chamfer @end. */
    studEndsChamfered?: string[];
    /** Frame's rake mode classification. */
    rakeMode?: string;
}
/** Apply the RP stud-only rewrite to a single frame. */
export declare function simplifyRpFrame(frame: ParsedFrame): SimplifyRpDecision;
/** Public entry point for the RP simplifier post-pass. Walks every plan and
 *  frame in the project; for each frame inside an RP plan, runs `simplifyRpFrame`.
 *  Mutates `project.plans[].frames[].sticks[]` in place. */
export declare function simplifyRpFramesInProject(plans: ReadonlyArray<{
    name: string;
    frames: ParsedFrame[];
}>): SimplifyRpDecision[];
