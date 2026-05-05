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
    /** Sticks (T/B/N) whose end-caps were rewritten to chord-style (Chamfer + ID@10). */
    horizontalsRewritten?: string[];
    /** Sticks (S/J) whose start cap was rewritten to plate-over-plate notch (Swage 56..101 + ID@78.5). */
    studStartsRewritten?: string[];
    /** Sticks (S/J) whose end side received a Chamfer @end. */
    studEndsChamfered?: string[];
}
/** Run the RP Reversed-Tooling simplifier on a single frame.  Mutates
 *  `frame.sticks[].tooling[]` in place.  Caller is responsible for the
 *  plan-name gate; this function blindly applies the rewrite when called. */
export declare function simplifyRpFrame(frame: ParsedFrame): SimplifyRpDecision;
/** Public entry point for the RP simplifier post-pass.  Walks every plan
 *  and frame in the project; for each frame inside an RP plan, runs
 *  `simplifyRpFrame`. Mutates `project.plans[].frames[].sticks[]` in place. */
export declare function simplifyRpFramesInProject(plans: ReadonlyArray<{
    name: string;
    frames: ParsedFrame[];
}>): SimplifyRpDecision[];
