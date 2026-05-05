import type { ParsedFrame, ParsedStick, ServiceAction } from "./synthesize-plans.js";
/** True iff the plan is a wall plan whose vertical wall studs participate in
 *  the dynamic InnerService rule. Matches `-LBW-` and `-NLBW-` plan suffixes
 *  case-insensitively. Other plan types (TIN/RP/TB2B/FJ/etc.) are no-ops. */
export declare function isWallServicePlanName(planName: string): boolean;
/** For one wall stud, project the applicable horizontal Service z-lines into
 *  local positions along the stud. Returns a deduped, sorted array.
 *
 *  Selection rule (verbatim from the harness, see design doc §4):
 *   1. Service must be horizontal: `|svc.dz| < 0.01`.
 *   2. z-line height must lie within stud's vertical extent (±0.5mm).
 *   3. Run-axis = whichever of (x, y) the z-line varies in (≥ 0.5mm range).
 *   4. Wall plane: stud's perpendicular coord matches z-line's perp coord
 *      within ±5mm.
 *   5. Wall-axis: stud's wall-axis coord lies within z-line's span ±5mm.
 *   6. Position formula (z_h is z-line height; sStart/sEnd are stud
 *      start/end in world coords):
 *         local_pos = (sStart.z <= sEnd.z) ? (z_h - sStart.z)
 *                                          : (sStart.z - z_h)
 *   7. Bounds: `30 ≤ local_pos ≤ length - 30`.
 *
 *  The 2mm trim absorbed by `local_pos` matches the upstream stud-end trim
 *  (verified vs L23/S9: z_start_trimmed = −41, 300 − (−41) = 341 = ref @341).
 */
export declare function applicableZLinePositions(stick: ParsedStick, serviceActions: ReadonlyArray<ServiceAction>, length: number): number[];
/** Per-frame entry: for every wall stud in the frame, replace static
 *  InnerService ops with per-stud z-line projections. Mutates
 *  `frame.sticks[].tooling` in place. No-op for frames without
 *  serviceActions populated AND without any wall stud — but stripping
 *  proceeds whether `serviceActions` is empty or not (no z-lines covering
 *  this stud is itself the correct answer). */
export declare function simplifyWallServiceFrame(frame: ParsedFrame): void;
/** Public entry point for the wall-service simplifier post-pass. Walks every
 *  plan and frame in the project; for each plan whose name matches the wall
 *  predicate, runs `simplifyWallServiceFrame` on every frame. Mutates
 *  `project.plans[].frames[].sticks[]` in place. */
export declare function simplifyWallServiceInProject(plans: ReadonlyArray<{
    name: string;
    frames: ParsedFrame[];
}>): void;
