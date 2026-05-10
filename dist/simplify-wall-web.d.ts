import type { ParsedFrame, ParsedStick, WebAction } from "./synthesize-plans.js";
/** True iff the plan is a wall plan whose vertical wall studs participate
 *  in the dynamic Web rule. Matches `-LBW-` and `-NLBW-` plan suffixes
 *  case-insensitively. */
export declare function isWallWebPlanName(planName: string): boolean;
/** For one VERTICAL wall stud, project applicable horizontal Web tool_action
 *  segments into local positions along the stud (Z-axis). Returns deduped
 *  sorted array.
 *
 *  Selection rule (verified 2026-05-09 against HG260044 GF-LBW corpus —
 *  208/208 missing Web ops on S studs explained):
 *   1. Web action must be HORIZONTAL: `|w.start.z - w.end.z| < 0.5mm`.
 *      Vertical-drop Web actions are plate-only — already handled.
 *   2. Action's elevation Z (z_h) must lie within stud's vertical extent ±5mm.
 *   3. Stud's X must lie within the action's X-range ±5mm.
 *   4. Stud's Y must lie within the action's Y-range ±5mm (same wall plane).
 *   5. Position formula:
 *         local_pos = (sStart.z <= sEnd.z) ? (z_h - sStart.z)
 *                                          : (sStart.z - z_h)
 *   6. Bounds: `5 ≤ local_pos ≤ length - 5`.
 *
 *  Bounds note: wall-service uses 30mm clearance, but Web bolt-holes
 *  regularly land 78mm from the end (king-stud + trim-stud bolt pair at
 *  the head plate), and a few land 38mm from the end (cross-batten
 *  panel-point crossings). 5mm is the minimum tool-clearance; Detailer's
 *  output is the source of truth for what's drillable. */
export declare function applicableWebPositionsForStud(stick: ParsedStick, webActions: ReadonlyArray<WebAction>, length: number): number[];
/** Per-frame entry: for every vertical wall stud in the frame, add Web ops
 *  projected from horizontal tool_action segments. Mutates
 *  `frame.sticks[].tooling` in place. No-op when frame has no webActions
 *  or the frame contains no vertical wall studs. */
export declare function simplifyWallWebFrame(frame: ParsedFrame): void;
/** Public entry point. Walks every plan and frame; for each plan whose name
 *  matches the wall predicate, runs `simplifyWallWebFrame` on every frame.
 *  Mutates `project.plans[].frames[].sticks[]` in place. */
export declare function simplifyWallWebInProject(plans: ReadonlyArray<{
    name: string;
    frames: ParsedFrame[];
}>): void;
