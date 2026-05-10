import type { ParsedFrame } from "./synthesize-plans.js";
import { type MachineSetup } from "./machine-setups.js";
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
/** Optional per-call config for `computeTb2bWebPositions` covering edge-case
 *  rules that depend on cross-stick state determined outside the function.
 *  Currently used by Agent T4 (2026-05-09) for the sloped peer-pair B-chord
 *  PERP-web chord-side correction override. */
export interface Tb2bWebPositionsOptions {
    /** Per-chord-instance arc-correction (in chord-arc space) to use for
     *  chord-Web crossings when the web is perpendicular-ish (|dot| <
     *  PERP_GATE = 0.5). Keyed by `name#occurrence` matching the function's
     *  internal `stickKeys`.
     *
     *  Detailer's chord-Web bolt position on sloped 15° peer-pair B-chords
     *  doesn't follow the codec's standard `-CHORD_HALF_DEPTH × dot / 2` rule.
     *  Empirically (verified vs HG260001 PK10/PK11 ref):
     *    longer-of-pair  (with cap-stack):  correction = -(WEB_VS_RAIL_OFFSET + lLip + rLip) × tan(slope)
     *    shorter-of-pair (no cap-stack):    correction = -(WEB_VS_RAIL_OFFSET) × tan(slope)
     *  At 15°/70S41 these are -9.91mm and -4.02mm respectively, vs the old
     *  ±4.53mm. The caller (`simplifyTb2bTrussFrame`) computes the right scalar
     *  per chord and passes it in here.
     *
     *  When this Map is supplied and a chord-Web PERP crossing is on a chord
     *  in the Map, the override replaces the standard correction. The implied
     *  @22.8/@120.8 fixed end-pair at the centerline-meeting end emerges
     *  naturally from the W17-W18-style PERP+PAR pair-bolt with the shifted
     *  PERP position. */
    perpWebChordCorrectionOverride?: ReadonlyMap<string, number>;
    /** Per-stick-instance arc-direction override (Agent T7, 2026-05-11). Keys
     *  in this set are stick instance keys (`name#occurrence`) whose final
     *  arc-positions should be reversed (L - p) IN ADDITION to whatever
     *  `needsArcReversal` returns for the stick.
     *
     *  Used by `simplifyTb2bTrussFrame` to handle the HG260001 PK6/PK12 TT-truss
     *  flat-horizontal B-chord case: when XML emits B1 with `flipped=false`,
     *  `start.y < end.y`, and `zSpan ≈ 0`, the codec's natural arc direction is
     *  opposite to what Detailer measures. The existing rule in `needsArcReversal`
     *  only catches the symmetric case (`start.y > end.y`); this override fills
     *  the gap WITHOUT changing the rule's defaults (avoids regressing other
     *  bottomchord shapes). Verified on PK6 TT7-1/TT8-1/TT9-1 B1 sticks. */
    forceReverseStickKeys?: ReadonlySet<string>;
}
export declare function computeTb2bWebPositions(sticks: ReadonlyArray<MetaStick>, options?: Tb2bWebPositionsOptions): Map<string, number[]>;
export interface SimplifyTb2bDecision {
    frame: string;
    decision: "APPLY" | "SKIP";
    reason: string;
    rewritten?: string[];
}
/** Rewrite tooling on a single TB2B truss frame in place. Caller must have
 *  already verified the plan/frame gate (`isTb2bPlanName` AND
 *  `frame.type === "Truss"`). */
export declare function simplifyTb2bTrussFrame(frame: ParsedFrame, setup?: MachineSetup): SimplifyTb2bDecision;
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
