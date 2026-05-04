import type { ParsedFrame } from "./synthesize-plans.js";
/** True iff the plan name marks this as a TIN linear-truss plan. */
export declare function isTinPlanName(planName: string): boolean;
/** True iff the frame name belongs to the truss-style sub-set within a TIN
 *  plan (HN / TN / TS / TI prefixes). PC-prefix frames in TIN plans are
 *  handled by the codec's default rules and should NOT be rewritten here. */
export declare function isTinTrussFrameName(frameName: string): boolean;
export interface SimplifyTinDecision {
    frame: string;
    decision: "APPLY" | "SKIP";
    reason: string;
    /** Vertical Ws whose endpoint was trimmed and end-Swage was rewritten. */
    verticalWsTrimmed?: string[];
    /** Diagonal Ws whose start-Chamfer was stripped. */
    diagonalsChamferStripped?: string[];
}
/** Run the TIN-truss simplifier on a single frame.  Mutates `frame.sticks[].end`
 *  and `frame.sticks[].tooling[]` in place.  Returns a decision describing
 *  what was applied (or why the frame was skipped).  Caller is responsible
 *  for the plan-name + frame-name gate; this function blindly applies the
 *  rewrite when called. */
export declare function simplifyTinTrussFrame(frame: ParsedFrame): SimplifyTinDecision;
/** Public entry point for the TIN simplifier post-pass.  Walks every plan
 *  and frame in the project; for each TIN-truss frame matching the gate
 *  (plan `/-TIN-/i` AND frame `/^(HN|TN|TS|TI)\d/i`), runs `simplifyTinTrussFrame`.
 *  Mutates `project.plans[].frames[].sticks[]` in place. */
export declare function simplifyTinTrussFramesInProject(plans: ReadonlyArray<{
    name: string;
    frames: ParsedFrame[];
}>): SimplifyTinDecision[];
