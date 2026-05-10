import type { ParsedFrame } from "./synthesize-plans.js";
/** True iff the plan name marks this as a TIN linear-truss plan. */
export declare function isTinPlanName(planName: string): boolean;
/** True iff the frame name belongs to the truss-style sub-set within a TIN
 *  plan (HN / TN / TS / TI prefixes). PC-prefix frames in TIN plans are
 *  handled by the codec's default rules and should NOT be rewritten here. */
export declare function isTinTrussFrameName(frameName: string): boolean;
/** True iff the frame name belongs to the panel-chord / TGI sub-set within
 *  a TIN plan (PC / TGI prefixes). These frames get a separate rule set
 *  focused on diagonal-W end-Swage span correction (the harness's default
 *  `45/cos(angle)` formula systematically misses ref's `39/cos + ~4·tan²`
 *  formula by 4-6mm at medium angles, causing every diagonal-W end-Swage to
 *  count as a missing/extra pair). 2026-05-09 (Agent TIN). */
export declare function isTinPcFrameName(frameName: string): boolean;
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
/** Marker key on a `ParsedStick`: when set, downstream `mergeStickTooling`
 *  skips the frame-context ops merge for that stick. Used by the HN
 *  panel-point rule to prevent the codec's per-web-crossing context ops
 *  from re-polluting top chords after this rule's strip+emit pass.
 *  Exported so `synthesize-plans.ts` can read the marker. */
export declare const HN_PANELPOINT_APPLIED_KEY = "_tinHnPanelPatternApplied";
/** Public entry point for the TIN simplifier post-pass.  Walks every plan
 *  and frame in the project.
 *
 *  Sub-rules (run order matters):
 *   (0) HN-frame top-chord panel-point pattern (Agent TIN3 2026-05-11).
 *       MUST run BEFORE `simplifyTinTrussFrame` mutates web coordinates,
 *       because the simplifier's vertical-W trim (6.5mm on long verticals)
 *       creates a length-dependent ~2mm chord-projection drift that
 *       degrades panel-point match.
 *   (a) The original truss simplifier (`simplifyTinTrussFrame`) gated to
 *       frame names matching `/^(HN|TN|TS|TI)\d/i`. Handles vertical-W trim,
 *       diagonal-W chamfer-strip, bottom-chord ScrewHoles cleanup.
 *   (b) The H-stick LipNotch→Swage substitution. Gated by plan `/-TIN-/i`
 *       only — fires on H-named sticks across ALL TIN frame types
 *       (PC / TTI / TGI / HB / HA / HN / TN / etc.). Per-stick predicate
 *       (`substituteHeaderEndSwages`) handles safety: skips when an
 *       InnerNotch already shares the anchor.
 *   (c) HN-frame heel-zone ScrewHoles emission (Agent SH 2026-05-10). Adds
 *       missing ScrewHoles on heel-zone Ws + B1 of large HN-frame trusses.
 *       See `emitTinHnScrewHoles` for the gate set + position formulas.
 *
 *  Mutates `project.plans[].frames[].sticks[]` in place. */
export declare function simplifyTinTrussFramesInProject(plans: ReadonlyArray<{
    name: string;
    frames: ParsedFrame[];
}>): SimplifyTinDecision[];
