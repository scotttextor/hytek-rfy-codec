/**
 * Detailer-replacement rules table — derived from corpus analysis of real
 * Detailer outputs (see research/output/rules-fixture.txt and sample-sticks-*.txt).
 *
 * The table covers UNIVERSAL per-stick patterns: end-anchored ops on every
 * stud/plate/nog/brace/etc. Frame-context-dependent ops (LIP notches at stud
 * crossings on top/bottom plates, WEB+LIP notches at stud crossings on nogs)
 * are computed separately by src/rules/frame-context.ts.
 *
 * The patterns observed are remarkably consistent:
 *
 *   STUDS (S):
 *     start: SWAGE [0..39] + INNER DIMPLE @16.5
 *     end:   SWAGE [length-39..length] + INNER DIMPLE @length-16.5
 *
 *   TOP PLATES (T) and BOTTOM PLATES (B) (asymmetric ends — same TYPE):
 *     start: LIP NOTCH [0..39] + INNER DIMPLE @16.5
 *     end:   LIP NOTCH [length-39..length] + INNER DIMPLE @length-16.5
 *
 *   NOGS (N):
 *     start: SWAGE [0..39] + INNER DIMPLE @16.5
 *     end:   SWAGE [length-39..length] + INNER DIMPLE @length-16.5
 *
 *   BOTTOM PLATES additionally have BOLT HOLES at start+62 and end-62 for
 *   anchoring to the slab.
 *
 *   HEAD plates (H), KING-/J(amb)-studs (Kb), and similar variant studs
 *   share the same structure with different terminal ops; pending more data.
 *
 * The 39mm span and 16.5mm dimple offset are tied to the 70S41 profile
 * (web=70mm, flange=41mm). For other profiles (89S41, 150S41, etc.) the
 * offsets scale with profile width (≈ flange/2 + small fixed offset).
 */
import type { RuleGroup } from "./types.js";
export declare const RULE_TABLE: RuleGroup[];
/** Wall plans contain studs that need electrical service holes. */
export declare function isWallPlan(ctx: {
    planName?: string;
}): boolean;
/** Ground-floor wall plan (slab-bearing) — gets Web@8 + slab anchor bolts.
 *  Upper-floor walls (1F, 2F, etc.) sit on the floor structure and don't get
 *  these slab-attachment ops. Plan name pattern: "...GF-LBW-..." or
 *  "GF-LBW", "G-F-LBW", "GROUND-LBW". Verified vs HG260012 TH01-1F-LBW
 *  reference (no bolts on B1) vs TH01-GF-LBW (bolts present).
 */
export declare function isGroundFloor(ctx: {
    planName?: string;
}): boolean;
/**
 * Primary B plate detection: B1 OR any other B plate >= 1500mm long.
 * Detailer emits anchor bolts (slab attachment) only on the slab-resting
 * plate. Short B2/B3 plates above doors/windows don't get anchor bolts.
 */
export declare function isPrimaryBPlate(ctx: {
    stickName?: string;
    length: number;
}): boolean;
/** Look up profile-specific span/dimple offsets.
 *
 * TODO(rules-coverage): when the rules engine has access to a MachineSetup
 * instance (e.g. via `getMachineSetupForProfile(profileWeb)`), prefer the
 * derived values from `endClearanceSpan(setup)` and `dimpleEndOffset(setup)`
 * — they correctly handle 104mm setup (which uses span=40, offset=17.5
 * instead of 39/16.5) and Demo Setup (37mm span). Hardcoded 50/25 for 150mm
 * is a guess — when a 150mm setup is added to .sups, its values will flow
 * through automatically.
 */
export declare function profileOffsets(profileFamily: string): {
    span: number;
    dimpleOffset: number;
    boltOffset: number;
};
