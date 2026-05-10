// Wall stud Web-bolthole simplifier — runs in `synthesizeRfyFromPlans` as a
// post-pass on every wall plan (`-(N?LBW)-`) BEFORE the per-stick rules-
// engine output is serialised.
//
// Adds per-stud Web ops on vertical wall studs from the frame's
// `<tool_action name="Web">` horizontal segments. These segments are
// authored by Detailer (or upstream design tools) at every transverse
// bolt-hole row through stud webs — typically:
//
//   • Pairs at king/jack-stud + trim-stud connections under a head plate
//     (e.g. {L-258, L-78} from each end on a long king stud, mirrored as
//     {78, 258} on the short trim stud above).
//   • Pairs at sill connections (~ same offsets at the bottom).
//   • 7-hole evenly spaced columns at door-frame edge studs (panel-point
//     crossings of an internal cross-batten layout).
//
// All these patterns reduce to ONE rule: emit a Web op at every horizontal
// `<tool_action name="Web">` segment whose elevation-plane coordinates
// cover the stud's column.
//
// Scope: VERTICAL WALL STUDS ONLY. Plate-like sticks (HeadPlate, Sill,
// BottomPlate, Nog) already have their Web ops emitted by the per-stick
// rule engine + the diff harness's pre-codec plate-Web pass. Adding a
// duplicate emit here would cause regressions on H1/H4/L1 sticks where
// Detailer's reference RFY uses the existing per-stick rule's output.
//
// Empirical: 208/260 (80%) of LBW S-stud Web missing-ops in HG260044 are
// explained on the first try by this rule, with only 13 → 13 extras
// (no new false positives on studs).

import type { ParsedFrame, ParsedStick, WebAction } from "./synthesize-plans.js";
import type { RfyToolingOp } from "./format.js";

/** True iff the plan is a wall plan whose vertical wall studs participate
 *  in the dynamic Web rule. Matches `-LBW-` and `-NLBW-` plan suffixes
 *  case-insensitively. */
export function isWallWebPlanName(planName: string): boolean {
  return /-(N?LBW)-/i.test(planName);
}

/** Wall-stud usage roles that participate in the dynamic Web rule. */
function isWallStudUsage(usage: string | undefined): boolean {
  const u = (usage ?? "").toLowerCase();
  return u === "stud" || u === "trimstud" || u === "endstud" || u === "jackstud";
}

/** Vertical-stud test mirrors the wall-service simplifier. */
function isVerticalStud(stick: ParsedStick): boolean {
  const dx = stick.end.x - stick.start.x;
  const dy = stick.end.y - stick.start.y;
  const dz = stick.end.z - stick.start.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return len > 0 && Math.abs(dz) / len > 0.99;
}

function distance3D(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

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
export function applicableWebPositionsForStud(
  stick: ParsedStick,
  webActions: ReadonlyArray<WebAction>,
  length: number,
): number[] {
  const sStart = stick.start, sEnd = stick.end;
  const studStartZ = Math.min(sStart.z, sEnd.z);
  const studEndZ = Math.max(sStart.z, sEnd.z);
  const studX = (sStart.x + sEnd.x) / 2;
  const studY = (sStart.y + sEnd.y) / 2;
  const positions: number[] = [];
  for (const w of webActions) {
    const wDz = Math.abs(w.start.z - w.end.z);
    if (wDz > 0.5) continue; // skip vertical drops — plate-only
    const z_h = (w.start.z + w.end.z) / 2;
    if (z_h < studStartZ - 5 || z_h > studEndZ + 5) continue;
    const wxLo = Math.min(w.start.x, w.end.x);
    const wxHi = Math.max(w.start.x, w.end.x);
    if (studX < wxLo - 5 || studX > wxHi + 5) continue;
    const wyLo = Math.min(w.start.y, w.end.y);
    const wyHi = Math.max(w.start.y, w.end.y);
    if (studY < wyLo - 5 || studY > wyHi + 5) continue;
    const localPos = sStart.z <= sEnd.z ? z_h - sStart.z : sStart.z - z_h;
    if (localPos < 5 || localPos > length - 5) continue;
    positions.push(Math.round(localPos * 10) / 10);
  }
  return positions;
}

/** Add Web ops to a tooling list at the supplied positions, deduplicating
 *  against any Web ops already present (±1mm). Mutates `tooling` in place
 *  and re-sorts by position. */
function appendDedupedWebOps(
  tooling: RfyToolingOp[],
  positions: number[],
  length: number,
): void {
  const existingWebPositions: number[] = [];
  for (const op of tooling) {
    if (op.kind === "point" && op.type === "Web") existingWebPositions.push(op.pos);
  }
  for (const p of positions) {
    if (existingWebPositions.some(ep => Math.abs(ep - p) < 1)) continue;
    tooling.push({ kind: "point", type: "Web", pos: p });
    existingWebPositions.push(p);
  }
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

/** Per-frame entry: for every vertical wall stud in the frame, add Web ops
 *  projected from horizontal tool_action segments. Mutates
 *  `frame.sticks[].tooling` in place. No-op when frame has no webActions
 *  or the frame contains no vertical wall studs. */
export function simplifyWallWebFrame(frame: ParsedFrame): void {
  const webs = frame.webActions ?? [];
  if (webs.length === 0) return;
  for (const stick of frame.sticks) {
    if (!isWallStudUsage(stick.usage)) continue;
    if (!isVerticalStud(stick)) continue;
    const length = Math.round(distance3D(stick.start, stick.end) * 10) / 10;
    const positions = applicableWebPositionsForStud(stick, webs, length);
    if (positions.length > 0) appendDedupedWebOps(stick.tooling, positions, length);
  }
}

/** Public entry point. Walks every plan and frame; for each plan whose name
 *  matches the wall predicate, runs `simplifyWallWebFrame` on every frame.
 *  Mutates `project.plans[].frames[].sticks[]` in place. */
export function simplifyWallWebInProject(
  plans: ReadonlyArray<{ name: string; frames: ParsedFrame[] }>,
): void {
  for (const plan of plans) {
    if (!isWallWebPlanName(plan.name)) continue;
    for (const frame of plan.frames) {
      simplifyWallWebFrame(frame);
    }
  }
}
