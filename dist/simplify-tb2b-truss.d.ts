import type { ParsedFrame } from "./synthesize-plans.js";
/** True iff the plan name marks this as a TB2B (Back-to-Back) truss plan. */
export declare function isTb2bPlanName(planName: string): boolean;
/** Stick metadata used by the centerline-intersection rule. Mirrors the
 *  shape used in the legacy diff-harness `computeTB2BWebPositions` helper. */
interface MetaStick {
    name: string;
    start3D: {
        x: number;
        y: number;
        z: number;
    };
    end3D: {
        x: number;
        y: number;
        z: number;
    };
    usage: string;
    flipped: boolean;
}
/** Pairwise centerline-intersection rule for TB2B (back-to-back) trusses.
 *  Mirrors `simplify-linear-truss.ts` but works in whichever 2D plane the
 *  truss lies in (TB2B is typically YZ — sticks share a constant X — while
 *  LIN trusses are XZ). For each pair of sticks, project to 2D and find
 *  the intersection's local arc-length on each stick.
 *
 *  TB2B distinguishes W (web) members from chord/rail (T/B/R/H) members:
 *  - W members: emit Web@END_ANCHOR + Web@(len-END_ANCHOR) (fixed 35mm
 *    end-cap offsets where the web butts into the chord), plus mid-stick
 *    Web@pt at every chord/rail crossing more than END_ANCHOR+5mm from
 *    each end. Verified vs HG260001 PK10/TN6-1 ref: W10/W11/W12/W13 have
 *    only the two end-caps; W14 (which crosses R9 mid-stick) has 3 Webs.
 *  - Chord/rail members (T/B/R/H): emit Web@pt at every web/rail
 *    centerline crossing, end-zone filtered.
 *  Returns Map<stickName, sortedPositions[]>. */
export declare function computeTb2bWebPositions(sticks: ReadonlyArray<MetaStick>): Map<string, number[]>;
export interface SimplifyTb2bDecision {
    frame: string;
    decision: "APPLY" | "SKIP";
    reason: string;
    rewritten?: string[];
}
/** Rewrite tooling on a single TB2B truss frame in place. Caller must have
 *  already verified the plan/frame gate (`isTb2bPlanName` AND
 *  `frame.type === "Truss"`). */
export declare function simplifyTb2bTrussFrame(frame: ParsedFrame): SimplifyTb2bDecision;
/** Public entry point for the TB2B simplifier post-pass. Walks every plan
 *  and frame in the project; for each TB2B truss frame matching the gate
 *  (plan `/-TB2B-/i` AND `frame.type === "Truss"`), runs
 *  `simplifyTb2bTrussFrame`. Mutates `project.plans[].frames[].sticks[]`
 *  in place. */
export declare function simplifyTb2bTrussFramesInProject(plans: ReadonlyArray<{
    name: string;
    frames: ParsedFrame[];
}>): SimplifyTb2bDecision[];
export {};
