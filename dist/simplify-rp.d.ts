import type { ParsedFrame } from "./synthesize-plans.js";
import type { RfyToolingOp } from "./format.js";
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
/**
 * Scale body-crossing op positions on diagonal RP T-plate sticks.
 *
 * Operates on a single (RP T-plate) stick's already-merged tooling list.
 * Returns scale stats or null if not applicable.
 *
 * Algorithm:
 *   1. Compute outline bbox (xMin/xMax/yMin/yMax) and centerline endpoints
 *      (cls = midpoint of c[0]/c[3], cle = midpoint of c[1]/c[2]) from the
 *      4-corner outline rectangle.
 *   2. Skip if x-extent < 50mm (bbox-degenerate) or y-extent < 50mm
 *      (axis-aligned plate — already correct).
 *   3. Compute scale = stick.length / (cle.x - cls.x). If |scale| < 1.02,
 *      skip (axis-aligned).
 *   4. For each body-zone op (position in [50, L-50]), apply transform
 *      `correctedPos = (pos - (cls.x - xMin) + 4) × scale`.
 *   5. Drop ops whose corrected position falls outside [5, L-5].
 */
export declare function scaleRpDiagonalTplateBodyOps(stick: {
    name: string;
    length: number;
    outlineCorners?: ReadonlyArray<{
        x: number;
        y: number;
    }>;
    tooling: RfyToolingOp[];
}, planName: string): {
    scaled: number;
    dropped: number;
    scaleFactor: number;
    offsetMm: number;
} | null;
