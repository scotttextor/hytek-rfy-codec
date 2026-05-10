// Wall InnerService z-line simplifier — runs in `synthesizeRfyFromPlans` as
// a post-pass on every wall plan (`-(N?LBW)-`) BEFORE the per-stick rules-
// engine output is serialised.
//
// Replaces the static `InnerService @296/@446` rule (`src/rules/table.ts`)
// with per-stud projections of the frame's `<tool_action name="Service">`
// horizontal z-lines. The static rule over-emits on studs outside a
// z-line's wall-axis span (e.g. HG260001 L23/S8 at x=72537, OUTSIDE
// span 70537..72496 — Detailer ref has zero InnerService) and under-
// emits on frames with a non-standard z-schedule (e.g. L38/S11 with 8
// distinct horizontal Services that produce 8 InnerService positions).
//
// HISTORY: Logic was originally implemented as post-decode patches in
// `scripts/diff-vs-detailer.mjs` (Agent S, 2026-05-05) and migrated here
// by Agent V on 2026-05-05 for production parity. Rule semantics were
// preserved verbatim during the move; cross-corpus parity targets
// HG260001 ≥ 84.38%, HG260044 ≥ 83.12%, HG260023 ≥ 79.98% must hold.
//
// See `docs/simplify-wall-service-design.md` (this dispatch) and
// `docs/service-z-line-design.md` (Agent S's predecessor doc) for the
// selection rule, position formula, and corpus evidence.

import type { ParsedFrame, ParsedStick, ServiceAction } from "./synthesize-plans.js";
import type { RfyToolingOp } from "./format.js";
import type { ProjectConfig } from "./rules/types.js";

/** True iff the plan is a wall plan whose vertical wall studs participate in
 *  the dynamic InnerService rule. Matches `-LBW-` and `-NLBW-` plan suffixes
 *  case-insensitively. Other plan types (TIN/RP/TB2B/FJ/etc.) are no-ops. */
export function isWallServicePlanName(planName: string): boolean {
  return /-(N?LBW)-/i.test(planName);
}

/** Wall-stud usage roles that participate in the dynamic rule. The static
 *  rule fires on the same set (see `STUD_ROLES` in `src/rules/table.ts`). */
function isWallStudUsage(usage: string | undefined): boolean {
  const u = (usage ?? "").toLowerCase();
  return u === "stud" || u === "trimstud" || u === "endstud" || u === "jackstud";
}

/** Vertical-stud test mirrors the harness's `|dz|/length > 0.99` gate. */
function isVerticalStud(stick: ParsedStick): boolean {
  const dx = stick.end.x - stick.start.x;
  const dy = stick.end.y - stick.start.y;
  const dz = stick.end.z - stick.start.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return len > 0 && Math.abs(dz) / len > 0.99;
}

/** 3D distance — used for the stud's `length` (matches the harness's
 *  `distance3D(stick.start, stick.end)` rounded to 1 decimal at the call
 *  site). The harness rounds; we round here too so the `30 ≤ pos ≤
 *  length-30` bound matches byte-for-byte. */
function distance3D(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

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
export function applicableZLinePositions(
  stick: ParsedStick,
  serviceActions: ReadonlyArray<ServiceAction>,
  length: number,
): number[] {
  const sStart = stick.start, sEnd = stick.end;
  const studStartZ = Math.min(sStart.z, sEnd.z);
  const studEndZ = Math.max(sStart.z, sEnd.z);
  const studX = (sStart.x + sEnd.x) / 2;
  const studY = (sStart.y + sEnd.y) / 2;
  const positions: number[] = [];
  for (const svc of serviceActions) {
    const svcDz = Math.abs(svc.start.z - svc.end.z);
    if (svcDz > 0.01) continue;
    const z_h = svc.start.z;
    if (z_h < studStartZ - 0.5 || z_h > studEndZ + 0.5) continue;
    const svcDx = Math.abs(svc.end.x - svc.start.x);
    const svcDy = Math.abs(svc.end.y - svc.start.y);
    const runAxis: "x" | "y" = svcDx >= svcDy ? "x" : "y";
    if (runAxis === "x") {
      if (Math.abs(studY - svc.start.y) > 5) continue;
      const sxLo = Math.min(svc.start.x, svc.end.x);
      const sxHi = Math.max(svc.start.x, svc.end.x);
      if (studX < sxLo - 5 || studX > sxHi + 5) continue;
    } else {
      if (Math.abs(studX - svc.start.x) > 5) continue;
      const syLo = Math.min(svc.start.y, svc.end.y);
      const syHi = Math.max(svc.start.y, svc.end.y);
      if (studY < syLo - 5 || studY > syHi + 5) continue;
    }
    const localPos = sStart.z <= sEnd.z ? z_h - sStart.z : sStart.z - z_h;
    if (localPos < 30 || localPos > length - 30) continue;
    positions.push(Math.round(localPos * 10) / 10);
  }
  return positions;
}

/** Strip every point-InnerService op from a tooling list (in-place).
 *  Used unconditionally: even when no z-lines apply, the static rule's
 *  @296/@446 ops must be removed (matches the harness's "drop the static
 *  ones unconditionally" comment at diff-vs-detailer.mjs:783). */
function stripInnerServicePointOps(tooling: RfyToolingOp[]): void {
  for (let i = tooling.length - 1; i >= 0; i--) {
    const op = tooling[i]!;
    if (op.kind === "point" && op.type === "InnerService") {
      tooling.splice(i, 1);
    }
  }
}

/** Re-sort tooling array by position so InnerService ops slot into the
 *  correct slice of the rollformer's pass-order schedule. Mirrors the
 *  harness's sort comparator. */
function sortToolingByPosition(tooling: RfyToolingOp[], length: number): void {
  tooling.sort((a, b) => {
    const pa =
      a.kind === "spanned" ? a.startPos :
      a.kind === "point"   ? a.pos :
      a.kind === "start"   ? 0 : length;
    const pb =
      b.kind === "spanned" ? b.startPos :
      b.kind === "point"   ? b.pos :
      b.kind === "start"   ? 0 : length;
    return pa - pb;
  });
}

/** Per-frame entry: for every wall stud in the frame, replace static
 *  InnerService ops with per-stud z-line projections. Mutates
 *  `frame.sticks[].tooling` in place. No-op for frames without
 *  serviceActions populated AND without any wall stud — but stripping
 *  proceeds whether `serviceActions` is empty or not (no z-lines covering
 *  this stud is itself the correct answer). */
export function simplifyWallServiceFrame(frame: ParsedFrame): void {
  const services = frame.serviceActions ?? [];
  for (const stick of frame.sticks) {
    if (!isWallStudUsage(stick.usage)) continue;
    if (!isVerticalStud(stick)) continue;
    const length = Math.round(distance3D(stick.start, stick.end) * 10) / 10;
    const dynamic = applicableZLinePositions(stick, services, length);
    // Strip ALL existing point InnerService ops (the static rule's @296/@446
    // emit, plus any earlier dynamic emit if this gets called twice). Then
    // re-emit the dynamic set, deduped.
    stripInnerServicePointOps(stick.tooling);
    const seen = new Set<number>();
    for (const p of dynamic) {
      if (seen.has(p)) continue;
      seen.add(p);
      stick.tooling.push({ kind: "point", type: "InnerService", pos: p });
    }
    sortToolingByPosition(stick.tooling, length);
  }
}

/** Public entry point for the wall-service simplifier post-pass. Walks every
 *  plan and frame in the project; for each plan whose name matches the wall
 *  predicate, runs `simplifyWallServiceFrame` on every frame. Mutates
 *  `project.plans[].frames[].sticks[]` in place. */
export function simplifyWallServiceInProject(
  plans: ReadonlyArray<{ name: string; frames: ParsedFrame[] }>,
): void {
  for (const plan of plans) {
    if (!isWallServicePlanName(plan.name)) continue;
    for (const frame of plan.frames) {