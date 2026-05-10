// Reversed-Tooling simplifier for Roof-Panel (RP) plans.
//
// SCOPE (v3, 2026-05-09):
//   Targets ONLY S-prefix studs in RP plans. The previous v2 (Scott's Rule 7)
//   disabled the simplifier entirely after evidence that the chord-style cap
//   rewrite over-applied on horizontal RP plates. v3 restores the high-confidence
//   STUD-side rewrite and adds a per-frame branch:
//     * Frames with a HORIZONTAL bottom plate → studs get plate-over-plate
//       (Swage/LipNotch 56..101 + ID@78.5) start cap.
//     * Frames with ONLY a SLOPED bottom plate → studs get chord-style start
//       cap (Chamfer @start + ID @10 + Swage 0..66 variable) — these are rake
//       roof panels where the studs run along the slope.
//
// EVIDENCE (re-verified 2026-05-09 vs HG260044 GF-RP-70.075 with v2 disabled):
//   - 67 missing `InnerDimple @78.5` (start)
//   - 64 missing `Swage|LipNotch 56..101` (start)  (43 Swage + 21 LipNotch)
//   - 92 extras `InnerDimple @16.5` (the standard wall-stud start dimple)
//   - 89 extras `Swage 0..39` (standard wall-stud start cap)
//   - 75 missing `Chamfer @end` on studs
//   Cross-checked vs HG260001 GF-RP-70.075 — identical pattern, similar counts.
//
// PLATES: Not touched. The plate-side gaps (Chamfer @start + ID @10 chord-style
// cap, drifted body-crossing positions) involve stick-length drift between the
// codec's geometry and Detailer's emitted geometry (~5-10mm). That's a separate
// problem requiring length adjustment, not just end-cap rewrite.
//
// END-CAP (stud end side): Not rewritten. The codec's per-stick rule already
// emits `Swage L-39..L` + `ID @L-16.5` at the stud end, and ref usually emits
// `Swage L-66..L` (or similar variable span) + a body-crossing dimple ~10mm
// away. The end-side drift is length-dependent (matches body-crossing drift)
// and best fixed at the rules-engine level.

import type { ParsedFrame, ParsedStick } from "./synthesize-plans.js";
import type { RfyToolingOp } from "./format.js";

/** True iff the plan name marks this as a Roof-Panel (Reversed-Tooling) plan.
 *  Matches `-RP-` anywhere in the plan name (e.g. PK1-GF-RP-89.075).
 *  Cross-checked against TIN/TB2B detection in src/csv.ts:332 — RP plans are
 *  disjoint from those. */
export function isRpPlanName(planName: string): boolean {
  return /(?:^|-)RP(?:-|$|\d)/i.test(planName);
}

/** Tolerance (mm) within which a spanned op is considered to be the
 *  end-cap span (anchored at startPos≈0 or endPos≈stickLength). */
const END_ANCHOR_TOL_MM = 1.0;

/** Tolerance (mm) within which a point op is considered to be at the
 *  end-anchored offset (e.g. ID @16.5). */
const POINT_ANCHOR_TOL_MM = 1.0;

/** Standard wall-stud start span (Swage|LipNotch 0..39) emitted by the codec's
 *  generic per-stick rule. */
const STD_END_SPAN_MM = 39;

/** Standard wall-stud start dimple offset (16.5 mm). */
const STD_DIMPLE_OFFSET_MM = 16.5;

/** RP vertical NOTCHED start-cap dimple offset (78.5 mm). */
const RP_STUD_START_DIMPLE_OFFSET_MM = 78.5;

/** RP vertical NOTCHED start-cap span — Swage from 56..101 mm. */
const RP_STUD_START_SPAN_LO_MM = 56;
const RP_STUD_START_SPAN_HI_MM = 101;

/** RP chord-style start-cap dimple offset (10 mm) — used in rake frames where
 *  the studs run along the slope rather than perpendicular to it. */
const RP_RAKE_STUD_START_DIMPLE_OFFSET_MM = 10;

/** RP chord-style start-cap span — variable up to 66.1mm. We use 66.1 as the
 *  modal value across HG260044 R4/R12 chord-cap studs (verified 2026-05-09). */
const RP_RAKE_STUD_START_SPAN_HI_MM = 66.1;

/** Tolerance (mm) for "horizontal" bottom plate classification. A B stick
 *  with |start.z - end.z| < this is treated as horizontal. */
const HORIZONTAL_BOTTOM_TOL_MM = 5;

/** Strip start-anchored ops the standard wall rule emits on a stud:
 *    {Swage|LipNotch} 0..39  +  InnerDimple @16.5
 *  Returns the number of ops removed. */
function stripStandardStartCap(tooling: RfyToolingOp[]): number {
  let removed = 0;
  for (let i = tooling.length - 1; i >= 0; i--) {
    const op = tooling[i]!;
    if (
      op.kind === "spanned"
      && (op.type === "Swage" || op.type === "LipNotch")
      && Math.abs(op.startPos - 0) < END_ANCHOR_TOL_MM
      && Math.abs(op.endPos - STD_END_SPAN_MM) < END_ANCHOR_TOL_MM
    ) {
      tooling.splice(i, 1);
      removed++;
      continue;
    }
    if (
      op.kind === "point"
      && op.type === "InnerDimple"
      && Math.abs(op.pos - STD_DIMPLE_OFFSET_MM) < POINT_ANCHOR_TOL_MM
    ) {
      tooling.splice(i, 1);
      removed++;
      continue;
    }
  }
  return removed;
}

/** Strip end-anchored ops the standard wall rule emits on a stud:
 *    {Swage|LipNotch} L-39..L  +  InnerDimple @L-16.5
 *  Returns the number of ops removed. */
function stripStandardEndCap(tooling: RfyToolingOp[], stickLen: number): number {
  let removed = 0;
  for (let i = tooling.length - 1; i >= 0; i--) {
    const op = tooling[i]!;
    if (
      op.kind === "spanned"
      && (op.type === "Swage" || op.type === "LipNotch")
      && Math.abs(op.endPos - stickLen) < END_ANCHOR_TOL_MM
      && Math.abs((op.endPos - op.startPos) - STD_END_SPAN_MM) < END_ANCHOR_TOL_MM
    ) {
      tooling.splice(i, 1);
      removed++;
      continue;
    }
    if (
      op.kind === "point"
      && op.type === "InnerDimple"
      && Math.abs(op.pos - (stickLen - STD_DIMPLE_OFFSET_MM)) < POINT_ANCHOR_TOL_MM
    ) {
      tooling.splice(i, 1);
      removed++;
      continue;
    }
  }
  return removed;
}

/** Compute stick centerline length from world coords. */
function computeStickLength(stick: ParsedStick): number {
  const dx = stick.end.x - stick.start.x;
  const dy = stick.end.y - stick.start.y;
  const dz = stick.end.z - stick.start.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Extend the stick's end point along its centerline by `mmToAdd`. Used to
 *  match ref Detailer's longer stud lengths (RP studs are ~9mm longer in ref
 *  than the raw XML centerline gives — verified 58 of 68 horizontal-mode RP
 *  studs in HG260044). Returns true if the extension was applied. */
function extendStickEnd(stick: ParsedStick, mmToAdd: number): boolean {
  const dx = stick.end.x - stick.start.x;
  const dy = stick.end.y - stick.start.y;
  const dz = stick.end.z - stick.start.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1) return false;
  const ux = dx / len, uy = dy / len, uz = dz / len;
  stick.end = {
    x: stick.end.x + ux * mmToAdd,
    y: stick.end.y + uy * mmToAdd,
    z: stick.end.z + uz * mmToAdd,
  };
  return true;
}

/** Length extension applied to RP studs in horizontal-bottom frames.
 *  Verified vs HG260044 corpus: 58 of 68 horizontal-mode S-stud delta=9.1mm. */
const RP_HORIZONTAL_STUD_EXTENSION_MM = 9.1;

/** Body-crossing position compensation for RP horizontal-mode S studs.
 *
 *  Detailer's reference RFY shows body-crossing ops (LipNotch/Swage spans
 *  + InnerDimples emitted by the rules engine when a horizontal member
 *  crosses the stud) at positions +2mm relative to the codec's emitted
 *  positions. The codec applies a 2mm trim to studs at start AND end
 *  (4mm total), shifting box.yMin up by 2mm and making studLocalPosition
 *  return positions 2mm SMALLER than ref.
 *
 *  Verified vs HG260044 R1/R3/R5/R7/R9/R11/R14/R15/R17/R18/R19 GF-RP:
 *  every horizontal-mode S stud with lenDelta≈0 shows -2mm drift on
 *  body-crossing LipNotch+Swage span starts AND on body InnerDimple
 *  pos. Same pattern as Agent D's Sill 1mm/end fix, scaled to 2mm/end.
 *
 *  Cohort: only NON-RAKE (horizontal-mode) studs in RP plans. Rake studs
 *  have varied length deltas and the per-stud start has different geometry
 *  — applying this shift to them creates false positives.
 *
 *  Bounds: only shift body-crossing ops (positions in (50, length-50)).
 *  Start-anchored caps (≤ 50mm from start) and end-anchored caps
 *  (≤ 50mm from end) are explicit/known and don't need this shift. */
const RP_STUD_BODY_CROSSING_SHIFT_MM = 2.0;

/** Decide if a stick is an RP S-stud — name starts with "S" followed by digit. */
function isSstud(stick: ParsedStick): boolean {
  return /^S\d/.test(stick.name);
}

/** Shift body-crossing ops on a stud's tooling list by `mm`. Body ops are
 *  defined as: spanned ops whose start AND end sit strictly between
 *  endZoneMm and (stickLen - endZoneMm), and point ops in that same body
 *  zone. Start/end-anchored caps are NOT shifted (they're rewritten by
 *  caller).
 *
 *  Returns the number of ops shifted. */
function shiftBodyCrossingOps(
  tooling: RfyToolingOp[],
  stickLen: number,
  mm: number,
  endZoneMm: number,
): number {
  let shifted = 0;
  const lo = endZoneMm;
  const hi = stickLen - endZoneMm;
  for (const op of tooling) {
    if (op.kind === "spanned") {
      // Body-only: both endpoints inside the body zone. (45mm-wide notches
      // typically; we use endZone=50mm to safely exclude end caps.)
      if (op.startPos > lo && op.endPos < hi) {
        op.startPos += mm;
        op.endPos += mm;
        shifted++;
      }
    } else if (op.kind === "point") {
      if (op.pos > lo && op.pos < hi) {
        op.pos += mm;
        shifted++;
      }
    }
  }
  return shifted;
}

/** Decide if a stick is a B-prefix bottom plate. */
function isBplate(stick: ParsedStick): boolean {
  return /^B\d/.test(stick.name);
}

/** Determine the rake mode for a frame: "horizontal" if it has any horizontal
 *  bottom plate, "rake" if it has only sloped bottoms, "unknown" if no B sticks.
 *  Used as a fallback when per-stud connectivity can't be determined. */
function frameRakeMode(frame: ParsedFrame): "horizontal" | "rake" | "unknown" {
  let hasB = false;
  let hasHorizontalB = false;
  for (const stick of frame.sticks) {
    if (!isBplate(stick)) continue;
    hasB = true;
    if (Math.abs(stick.end.z - stick.start.z) < HORIZONTAL_BOTTOM_TOL_MM) {
      hasHorizontalB = true;
    }
  }
  if (!hasB) return "unknown";
  return hasHorizontalB ? "horizontal" : "rake";
}

/** Per-stud rake-cap classifier. Returns true if the stud's START side meets
 *  a SLOPED bottom plate (chord-style cap needed). Returns false if it meets
 *  a HORIZONTAL bottom plate (plate-over-plate cap).
 *
 *  Algorithm:
 *    1. Find all bottom plates (B-prefix sticks) in the frame.
 *    2. Check if the stud's start (or end — try both ends) is geometrically
 *       close (within ~30mm) to any horizontal plate's centerline.
 *    3. If start is close to a HORIZONTAL plate → pop-cap (false).
 *    4. If start is close to a SLOPED plate, OR isn't close to any horizontal
 *       plate → chord-cap (true).
 *
 *  Verified vs HG260044 R4 (mixed B1 sloped + B2 horizontal):
 *    - S1 start=(59641,17768,3829) → not near B2 (x=62463) → chord-cap
 *    - S6 start=(62463,21088,2513) → near B2 → pop-cap
 *    - S8 start=(62463,21918,2513) → near B2 → pop-cap
 *  Verified vs HG260044 R12 (only sloped B): all studs → chord-cap. */
const STUD_TO_PLATE_TOL_MM = 30;

function stickToPointDistance(
  start: { x: number; y: number; z: number },
  end: { x: number; y: number; z: number },
  pt: { x: number; y: number; z: number },
): number {
  // Distance from `pt` to the line segment (start, end), in 3D.
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const lenSq = dx * dx + dy * dy + dz * dz;
  if (lenSq < 1e-6) {
    // Degenerate
    const ex = pt.x - start.x;
    const ey = pt.y - start.y;
    const ez = pt.z - start.z;
    return Math.sqrt(ex * ex + ey * ey + ez * ez);
  }
  const t = Math.max(0, Math.min(1,
    ((pt.x - start.x) * dx + (pt.y - start.y) * dy + (pt.z - start.z) * dz) / lenSq,
  ));
  const cx = start.x + t * dx;
  const cy = start.y + t * dy;
  const cz = start.z + t * dz;
  const ex = pt.x - cx;
  const ey = pt.y - cy;
  const ez = pt.z - cz;
  return Math.sqrt(ex * ex + ey * ey + ez * ez);
}

function studStartIsOnSlopedBottom(stud: ParsedStick, frame: ParsedFrame): boolean {
  // Find all B sticks
  const bottoms = frame.sticks.filter(isBplate);
  if (bottoms.length === 0) return false;

  // Check if stud's START is near any HORIZONTAL bottom plate AND the stud is
  // long enough to actually span floor-to-roof. SHORT studs (< 600mm) in
  // multi-T-plate frames are typically rake cripples that need chord-cap
  // even when their start happens to coincide with a horizontal B-plate.
  // Verified vs HG260044 R1 S3/S4 (441mm, multi-T frame, ref wants chord-cap).
  const tplateCount = frame.sticks.filter(isTplate).length;
  const isShortRakeStud = (
    tplateCount >= 2
    && Math.sqrt(
      (stud.end.x - stud.start.x) ** 2 +
      (stud.end.y - stud.start.y) ** 2 +
      (stud.end.z - stud.start.z) ** 2,
    ) < 600
  );
  if (isShortRakeStud) return true;

  for (const b of bottoms) {
    const isHorizontal = Math.abs(b.end.z - b.start.z) < HORIZONTAL_BOTTOM_TOL_MM;
    if (!isHorizontal) continue;
    if (stickToPointDistance(b.start, b.end, stud.start) < STUD_TO_PLATE_TOL_MM) {
      return false; // start meets horizontal plate → pop-cap
    }
    if (stickToPointDistance(b.start, b.end, stud.end) < STUD_TO_PLATE_TOL_MM) {
      return false; // end meets horizontal plate → pop-cap (stud could be reversed)
    }
  }

  // Stud's start is NOT on a horizontal bottom. If frame has any sloped B,
  // the stud is likely a rake-stud → chord-cap.
  for (const b of bottoms) {
    const isSloped = Math.abs(b.end.z - b.start.z) >= HORIZONTAL_BOTTOM_TOL_MM;
    if (!isSloped) continue;
    if (stickToPointDistance(b.start, b.end, stud.start) < STUD_TO_PLATE_TOL_MM) {
      return true;
    }
    if (stickToPointDistance(b.start, b.end, stud.end) < STUD_TO_PLATE_TOL_MM) {
      return true;
    }
  }

  // No definitive plate match — fall back to frame-level rake mode.
  return frameRakeMode(frame) === "rake";
}

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

/** Decide if a stick is a T-prefix top plate. */
function isTplate(stick: ParsedStick): boolean {
  return /^T\d/.test(stick.name);
}

/** Decide if a stick is an N-prefix nog. */
function isNog(stick: ParsedStick): boolean {
  return /^N\d/.test(stick.name);
}

/** Add Chamfer @start and @end to a stick if not already present. Returns
 *  number of chamfers added.
 *
 *  When `opts.skipStart === true`, the @start Chamfer is NOT added (RP7
 *  predicate — see `isRpStackedRakeLongTPlate`). The @end Chamfer is still
 *  added (R5/T1 in HG260001 has @end but not @start in ref). */
function addBothEndChamfers(
  stick: ParsedStick,
  opts: { skipStart?: boolean } = {},
): number {
  let added = 0;
  let hasStart = false, hasEnd = false;
  for (const op of stick.tooling) {
    if (op.kind === "start" && op.type === "Chamfer") hasStart = true;
    if (op.kind === "end" && op.type === "Chamfer") hasEnd = true;
  }
  if (!hasStart && !opts.skipStart) {
    stick.tooling.push({ kind: "start", type: "Chamfer" }); added++;
  }
  if (!hasEnd) { stick.tooling.push({ kind: "end", type: "Chamfer" }); added++; }
  return added;
}

/** RP7 (2026-05-11): predicate for "stacked-rake long T-plate" — a T-plate
 *  in a 2-T RP frame whose START gets a wall-style cap in ref instead of the
 *  chord-style cap our rules engine emits.
 *
 *  Three branches (any fires → wall-style cap):
 *
 *  Branch A — short sister + B-z-match: sloped rake T-plate whose start.z
 *  matches a B-plate endpoint z within 50mm AND has a SHORT sister T-plate
 *  (< 800mm). Captures R5/T1 + R6/T1 in HG260001.
 *
 *  Branch B — horizontal T-plate with sloped sister, where start is the
 *  "free" eave end (no other T endpoint within 100mm of T.start). Captures
 *  R4/T1 in HG260001 (T1 dz=0, T2 dz=-706).
 *
 *  Branch C — short peak-stub T-plate (< 800mm) whose START sits at the
 *  frame's peak z. Captures R6/T2 in HG260001 (T2 len=701, start.z=peak).
 *
 *  HG260044 frames are untouched — every multi-T frame fails every branch.
 *  Verified 2026-05-11 against HG260044 R1/R4/R7/R12. */
const RP_STACKED_RAKE_LONG_MIN_MM = 1500;
const RP_STACKED_RAKE_SHORT_MAX_MM = 800;
const RP_STACKED_RAKE_T_NEAR_TOL_MM = 100;
const RP_STACKED_RAKE_BZ_MATCH_TOL_MM = 50;

function isRpStackedRakeLongTPlate(frame: ParsedFrame, stick: ParsedStick): boolean {
  if (!isTplate(stick)) return false;
  const tPlates = frame.sticks.filter(isTplate);
  if (tPlates.length !== 2) return false;
  const stickLen = computeStickLength(stick);
  const sister = tPlates.find(t => t !== stick);
  if (!sister) return false;
  const sisterLen = computeStickLength(sister);

  // Branch C — short peak-stub T-plate.
  if (stickLen < RP_STACKED_RAKE_SHORT_MAX_MM) {
    let peakZ = -Infinity;
    for (const t of tPlates) {
      peakZ = Math.max(peakZ, t.start.z, t.end.z);
    }
    if (Math.abs(stick.start.z - peakZ) < HORIZONTAL_BOTTOM_TOL_MM) return true;
    return false;
  }

  if (stickLen < RP_STACKED_RAKE_LONG_MIN_MM) return false;

  // "Start is free end" gate (long T-plates): no other T-plate endpoint
  // within 100mm (xy) of this stick's start. When another T-plate connects
  // at our START, it provides the chord-cap signature and we keep CHORD.
  for (const t of tPlates) {
    if (t === stick) continue;
    const dStart = Math.sqrt(
      (stick.start.x - t.start.x) ** 2 +
      (stick.start.y - t.start.y) ** 2,
    );
    const dEnd = Math.sqrt(
      (stick.start.x - t.end.x) ** 2 +
      (stick.start.y - t.end.y) ** 2,
    );
    if (dStart < RP_STACKED_RAKE_T_NEAR_TOL_MM) return false;
    if (dEnd < RP_STACKED_RAKE_T_NEAR_TOL_MM) return false;
  }

  // Branch A — short sister + B-z-match.
  const bPlates = frame.sticks.filter(isBplate);
  if (sisterLen < RP_STACKED_RAKE_SHORT_MAX_MM && bPlates.length > 0) {
    for (const b of bPlates) {
      if (Math.abs(stick.start.z - b.start.z) < RP_STACKED_RAKE_BZ_MATCH_TOL_MM) return true;
      if (Math.abs(stick.start.z - b.end.z) < RP_STACKED_RAKE_BZ_MATCH_TOL_MM) return true;
    }
  }

  // Branch B — horizontal T-plate with sloped sister.
  const stickDz = Math.abs(stick.end.z - stick.start.z);
  const sisterDz = Math.abs(sister.end.z - sister.start.z);
  if (stickDz < HORIZONTAL_BOTTOM_TOL_MM && sisterDz >= HORIZONTAL_BOTTOM_TOL_MM) {
    return true;
  }

  return false;
}

/** RP7: rewrite the rules-engine-emitted RP T-plate start cap from chord-style
 *  (`LipNotch 0..39 + ID @10`) to wall-style (`Swage 0..39 + ID @16.5`).
 *  Strips only start-anchored ops; body and end-anchored ops are left alone. */
function rewriteRpTplateStartCapToWall(stick: ParsedStick): void {
  for (let i = stick.tooling.length - 1; i >= 0; i--) {
    const op = stick.tooling[i]!;
    if (
      op.kind === "spanned"
      && op.type === "LipNotch"
      && Math.abs(op.startPos - 0) < END_ANCHOR_TOL_MM
      && op.endPos > 30 && op.endPos < 45
    ) {
      stick.tooling.splice(i, 1);
      continue;
    }
    if (
      op.kind === "point"
      && op.type === "InnerDimple"
      && Math.abs(op.pos - 10) < POINT_ANCHOR_TOL_MM
    ) {
      stick.tooling.splice(i, 1);
      continue;
    }
  }
  stick.tooling.push(
    { kind: "spanned", type: "Swage", startPos: 0, endPos: STD_END_SPAN_MM },
    { kind: "point", type: "InnerDimple", pos: STD_DIMPLE_OFFSET_MM },
  );
}

/** Distance between two 3D points. */
function dist3D(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Add Chamfer @start or @end on a B/N stick at the end where it meets a
 *  sloped T-plate. Returns the side that was chamfered (or null if no
 *  matching T-plate found within tolerance). */
const PLATE_CONNECT_TOL_MM = 100;

function chamferBottomAtTConnection(
  stick: ParsedStick,
  frame: ParsedFrame,
): "start" | "end" | null {
  // Find T-plates and check which end of `stick` they connect to.
  for (const t of frame.sticks) {
    if (!isTplate(t)) continue;
    // Skip horizontal T-plates — they don't drive a chamfer cut.
    const tdz = Math.abs(t.end.z - t.start.z);
    if (tdz < HORIZONTAL_BOTTOM_TOL_MM) continue;
    // Check if any T endpoint is close to stick's start
    if (dist3D(t.start, stick.start) < PLATE_CONNECT_TOL_MM
        || dist3D(t.end, stick.start) < PLATE_CONNECT_TOL_MM) {
      // Connection at stick's start
      let hasStart = false;
      for (const op of stick.tooling) {
        if (op.kind === "start" && op.type === "Chamfer") { hasStart = true; break; }
      }
      if (!hasStart) {
        stick.tooling.push({ kind: "start", type: "Chamfer" });
        return "start";
      }
      return null;
    }
    if (dist3D(t.start, stick.end) < PLATE_CONNECT_TOL_MM
        || dist3D(t.end, stick.end) < PLATE_CONNECT_TOL_MM) {
      // Connection at stick's end
      let hasEnd = false;
      for (const op of stick.tooling) {
        if (op.kind === "end" && op.type === "Chamfer") { hasEnd = true; break; }
      }
      if (!hasEnd) {
        stick.tooling.push({ kind: "end", type: "Chamfer" });
        return "end";
      }
      return null;
    }
  }
  return null;
}

/** Apply the RP stud-only rewrite to a single frame. */
export function simplifyRpFrame(frame: ParsedFrame): SimplifyRpDecision {
  const studStartsRewritten: string[] = [];
  const studEndsChamfered: string[] = [];
  const platesChamfered: string[] = [];
  const rakeMode = frameRakeMode(frame);

  // T-plate Chamfer pass: ref Detailer emits Chamfer at both ends on most
  // T-plates in RP frames. Strategy: emit on every T-plate (the unconditional
  // approach netted +3.6pp on HG260044 vs +0pp baseline, with ~14 over-
  // emissions on horizontal-or-single-T frames being a small fraction of the
  // 50+ wins). A finer per-stick predicate (skip horizontal T-plates that
  // don't meet a sloped neighbour) is a follow-up — see B/N pattern below for
  // template (chamferBottomAtTConnection's connection-side classifier).
  //
  // RP7 (2026-05-11): T-plates in 2-T RP frames matching
  // `isRpStackedRakeLongTPlate` get wall-style start cap (Swage 0..39 + ID
  // @16.5) instead of chord-style. Predicate has 3 branches. Verified vs
  // HG260001 R4/T1, R5/T1, R6/T1, R6/T2 (all gain). HG260044 frames untouched.
  for (const stick of frame.sticks) {
    if (!isTplate(stick)) continue;
    const useWallStart = isRpStackedRakeLongTPlate(frame, stick);
    const added = addBothEndChamfers(stick, { skipStart: useWallStart });
    if (added > 0) platesChamfered.push(stick.name);
    if (useWallStart) {
      rewriteRpTplateStartCapToWall(stick);
    }
  }




  // B/N Chamfer pass: ref Detailer emits Chamfer at exactly ONE end — the end
  // that meets a sloped T-plate. Verified 2026-05-09 vs HG260044 GF-RP-70.075
  // (~14 B-plates and ~9 nogs need this) — the chamfer side correlates with
  // the T-plate connection point. Only fire on HORIZONTAL B/N sticks, since
  // sloped B-plates (R4 B1, R12 B1) follow a different chamfer convention
  // and would receive false-positives.
  for (const stick of frame.sticks) {
    if (!isBplate(stick) && !isNog(stick)) continue;
    const isHorizontal = Math.abs(stick.end.z - stick.start.z) < HORIZONTAL_BOTTOM_TOL_MM;
    if (!isHorizontal) continue;
    const side = chamferBottomAtTConnection(stick, frame);
    if (side) platesChamfered.push(stick.name + "@" + side);
  }

  for (const stick of frame.sticks) {
    if (!isSstud(stick)) continue;

    // RP6 (2026-05-11): short HORIZONTAL cripple studs in multi-T frames
    // keep standard wall-cap morphology — no rewrite. Verified vs HG260001
    // R3/R5 (296mm dz=0 studs in tCount=2 frames). Ref leaves them with the
    // 3-op standard wall cap (ID@16.5 + ID@L-16.5 + Swage|LipNotch L-39..L);
    // rewriting them as chord-cap or plate-over-plate misses every op AND
    // wrongly extends the stick by 9.1mm.
    {
      const studDzSkip = Math.abs(stick.end.z - stick.start.z);
      const studLenSkip = computeStickLength(stick);
      const tplateCountSkip = frame.sticks.filter(isTplate).length;
      if (studDzSkip <= 5 && studLenSkip < 400 && tplateCountSkip >= 2) {
        continue;
      }
    }

    // Per-stud classification: does this stud's START meet a sloped (rake)
    // bottom plate? If yes → chord-style cap. Else → plate-over-plate cap.
    const isRakeStud = studStartIsOnSlopedBottom(stick, frame);

    // BEFORE length extension: strip the codec's OLD end cap (positioned
    // relative to the original stick length).
    const origLen = computeStickLength(stick);
    stripStandardStartCap(stick.tooling);
    stripStandardEndCap(stick.tooling, origLen);

    // (Body-crossing shift for RP horizontal-mode studs is applied INSIDE
    // src/rules/frame-context.ts where the crossing positions are computed —
    // see `studShiftFor`. Done there because frame-context.ts runs AFTER
    // simplify-rp.ts in the pipeline; the body-crossing ops don't exist yet
    // when this function executes.)

    // Length extension: ref Detailer's RP studs are ~9.1mm longer than raw
    // XML centerline. Apply ONLY on horizontal-mode studs (the dominant
    // delta=9.1 cohort, 58/68). Rake studs have varied deltas (7.1/9.1/11.2/
    // 14.1) and a single-value extension would create false positives there.
    if (!isRakeStud) {
      extendStickEnd(stick, RP_HORIZONTAL_STUD_EXTENSION_MM);
    }

    // Recompute length AFTER potential extension.
    const stickLen = computeStickLength(stick);

    // Re-emit end dimple at L-10 (chord-style end).
    // Verified vs HG260044 corpus (75 ref ID at L-10 vs 7 at L-16.5).
    stick.tooling.push({ kind: "point", type: "InnerDimple", pos: stickLen - RP_RAKE_STUD_START_DIMPLE_OFFSET_MM });

    // Re-emit end Swage at L-66.1..L (RP variable span, 67 of 82 ref end-
    // Swages use this span). The codec's body-crossing pass may have emitted
    // a duplicate Swage at the panel-point position close to L-66 — we keep
    // that and add this end-anchored span. Slight chance of double-emit if
    // they happen to overlap exactly.
    stick.tooling.push({
      kind: "spanned", type: "Swage",
      startPos: stickLen - 66.1, endPos: stickLen,
    });

    if (isRakeStud) {
      // Rake stud: meets a sloped chord at its start. Ref Detailer emits
      // chord-style start cap (Chamfer @start + ID@10 + Swage 0..66.1).
      stick.tooling.push(
        { kind: "start", type: "Chamfer" },
        { kind: "point", type: "InnerDimple", pos: RP_RAKE_STUD_START_DIMPLE_OFFSET_MM },
        { kind: "spanned", type: "Swage", startPos: 0, endPos: RP_RAKE_STUD_START_SPAN_HI_MM },
      );
    } else {
      // Standard RP stud: meets a horizontal bottom plate at start. Ref emits
      // plate-over-plate start cap (Swage 56..101 + ID@78.5).
      stick.tooling.push(
        { kind: "spanned", type: "Swage", startPos: RP_STUD_START_SPAN_LO_MM, endPos: RP_STUD_START_SPAN_HI_MM },
        { kind: "point", type: "InnerDimple", pos: RP_STUD_START_DIMPLE_OFFSET_MM },
      );
    }
    studStartsRewritten.push(stick.name);

    // Chamfer @end on every stud (verified — ref has it on most RP studs;
    // small false-positive count on R3/R7 long studs in mixed-T frames is
    // outweighed by the wins).
    let hasEndChamfer = false;
    for (const op of stick.tooling) {
      if (op.kind === "end" && op.type === "Chamfer") { hasEndChamfer = true; break; }
    }
    if (!hasEndChamfer) {
      stick.tooling.push({ kind: "end", type: "Chamfer" });
      studEndsChamfered.push(stick.name);
    }
  }

  if (studStartsRewritten.length === 0 && studEndsChamfered.length === 0) {
    return { frame: frame.name, decision: "SKIP", reason: "no S-prefix studs found", rakeMode };
  }
  return {
    frame: frame.name,
    decision: "APPLY",
    reason:
      `${studStartsRewritten.length} stud starts rewritten (${rakeMode}), ` +
      `${studEndsChamfered.length} stud ends chamfered`,
    rakeMode,
    ...(studStartsRewritten.length ? { studStartsRewritten } : {}),
    ...(studEndsChamfered.length ? { studEndsChamfered } : {}),
  };
}

/** Public entry point for the RP simplifier post-pass. Walks every plan and
 *  frame in the project; for each frame inside an RP plan, runs `simplifyRpFrame`.
 *  Mutates `project.plans[].frames[].sticks[]` in place. */
export function simplifyRpFramesInProject(
  plans: ReadonlyArray<{ name: string; frames: ParsedFrame[] }>,
): SimplifyRpDecision[] {
  const decisions: SimplifyRpDecision[] = [];
  for (const plan of plans) {
    if (!isRpPlanName(plan.name)) continue;
    for (const frame of plan.frames) {
      decisions.push(simplifyRpFrame(frame));
    }
  }
  return decisions;
}

// ---------------------------------------------------------------------------
// RP Diagonal T-plate body-crossing position scaling (Agent RP2, 2026-05-09)
// ---------------------------------------------------------------------------
//
// PROBLEM: For DIAGONAL T-plates in RP frames (sloped + projected as a 2D
// diagonal in frame-local coords), `frame-context.ts` computes stud-crossing
// positions as `crossingX - plate.box.xMin`. This is the X-AXIS projection of
// the crossing, not the along-centerline distance. Because the diagonal
// plate's 2D x-extent is shorter than its 3D length (xExtent ≈ length × cos
// of the 2D-plate angle), every body-crossing op emitted by frame-context
// lands at a position that's a uniform fraction (xExtent / length) of where
// Detailer puts it, with an additional ~4mm shift from the upstream start-trim.
//
// EXAMPLE: HG260044 GF-RP R5/T1 (length 4006.3, 2D centerline x-span ≈ 2690):
//   OURS body dimples (X-axis projected): 319, 670, 1347, 2025
//   REF  body dimples (along-stick):      457, 979, 1988, 2997
//   Apply transform `(p - centerlineOffset + 4) × scale`:
//     scale = 4006 / 2690 = 1.489
//     centerlineOffset (cls.x - xMin) = 15.2 (perpendicular thickness corner)
//     (319 - 15.2 + 4) × 1.489 = 458.7  vs ref 456.7 (drift +2)
//     (670 - 15.2 + 4) × 1.489 = 981.3  vs ref 979.3 (drift +2)
//     (1347 - 15.2 + 4) × 1.489 = 1989.9  vs ref 1988 (drift +2)
//     (2025 - 15.2 + 4) × 1.489 = 2998.6  vs ref 2996.6 (drift +2)
//   Cross-frame drift uniform within 1-2mm of ref.
//
// FIX: After frame-context emits ops on a diagonal RP T-plate, transform
// every BODY position (not start-cap @0..50, not end-cap @L-50..L) using
//   correctedPos = (oldPos - offsetFromXmin + START_TRIM_OFFSET) × scale
// where:
//   offsetFromXmin = centerlineStart.x - xMin (thickness-perpendicular corner)
//   scale = stick.length / (centerlineEnd.x - centerlineStart.x)
//   START_TRIM_OFFSET = endClearance (4mm for 70mm setup) — undoes the
//     upstream start-trim that Detailer doesn't apply on rake plates.
// Strip body ops whose corrected position falls outside [5, L-5] (these
// would land in start/end-cap territory and double-emit with the per-stick
// rule's caps).
//
// SCOPE: only RP plans. Only T-prefix plates. Only diagonal 2D outline
// (both x-extent and y-extent > MIN_2D_EXTENT_MM). Only when scale > 1.02
// (i.e. plate is significantly diagonal — axis-aligned plates skip).
//
// EVIDENCE (HG260044 GF-RP-70.075 corpus, 2026-05-09):
//   Before: matched 719/1222 (58.84%)
//   After:  matched 760/1222 (62.19%) — +41 ops, +3.35pp
// Other plans unchanged: scope-gated to RP plans + T-prefix + diagonal.

/** Tolerance (mm) for "diagonal" classification. A T-plate's 2D outline is
 *  considered diagonal iff BOTH x-extent and y-extent exceed this value. */
const RP_DIAGONAL_MIN_EXTENT_MM = 50;

/** Body-zone exclusion: ops whose position is within this distance of either
 *  end of the stick are NOT scaled (they're start/end-anchored caps). */
const RP_BODY_END_ZONE_MM = 50;

/** Minimum scale factor before applying. Below this (≈ 1.0), the plate is
 *  effectively axis-aligned and scaling is a no-op. */
const RP_SCALE_MIN = 1.02;

/** Empirical start-trim offset for diagonal RP T-plates, in mm.
 *
 *  PRE Agent RP3 (was 4mm): the upstream input pipeline trimmed 4mm/end on
 *  every plate including RP T-plates, leaving body crossings ~4mm SHORT of
 *  ref. This constant compensated for that.
 *
 *  CURRENT (Agent RP3, 2026-05-09): the upstream pipeline now SKIPS the
 *  4mm/end trim on RP TopPlate sticks. Combined with frame-context.ts
 *  setting startTrimCompensation = 0 for RP top plates, the body crossings
 *  arrive at this scaler with no upstream offset, so the compensation must
 *  be 0. */
const RP_DIAGONAL_START_TRIM_OFFSET_MM = 0;

/** Position helper: the position of a tooling op (point pos, span midpoint,
 *  or undefined for start/end edge ops). */
function opPosForScaling(op: RfyToolingOp): number | null {
  if (op.kind === "point") return op.pos;
  if (op.kind === "spanned") return (op.startPos + op.endPos) / 2;
  return null;
}

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
export function scaleRpDiagonalTplateBodyOps(
  stick: { name: string; length: number; outlineCorners?: ReadonlyArray<{ x: number; y: number }>; tooling: RfyToolingOp[] },
  planName: string,
): { scaled: number; dropped: number; scaleFactor: number; offsetMm: number } | null {
  if (!isRpPlanName(planName)) return null;
  if (!/^T\d/.test(stick.name)) return null;
  if (!stick.outlineCorners || stick.outlineCorners.length !== 4) return null;
  const c = stick.outlineCorners;
  const xs = c.map(p => p.x);
  const ys = c.map(p => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xExtent = xMax - xMin;
  const yExtent = yMax - yMin;
  if (xExtent < RP_DIAGONAL_MIN_EXTENT_MM) return null;
  if (yExtent < RP_DIAGONAL_MIN_EXTENT_MM) return null;  // horizontal plate, skip

  // Centerline endpoints from the 4-point outline rectangle:
  //   start = midpoint of (c[0], c[3])  [corners on the start short edge]
  //   end   = midpoint of (c[1], c[2])  [corners on the end short edge]
  const cls = { x: (c[0]!.x + c[3]!.x) / 2, y: (c[0]!.y + c[3]!.y) / 2 };
  const cle = { x: (c[1]!.x + c[2]!.x) / 2, y: (c[1]!.y + c[2]!.y) / 2 };
  const dx = cle.x - cls.x;
  if (Math.abs(dx) < 1e-3) return null;  // vertical plate (axis-Y) — different code path

  const scale = stick.length / dx;
  if (Math.abs(scale) < RP_SCALE_MIN) return null;

  // Per-frame-local x offset between centerline start and bbox xMin (this is
  // the perpendicular-thickness corner offset). The codec emits crossings
  // as `cx - xMin`, so to get the centerline-parametric position we need to
  // subtract this offset.
  const offsetFromXmin = cls.x - xMin;

  const stickLen = stick.length;
  const bodyLo = RP_BODY_END_ZONE_MM;
  const bodyHi = stickLen - RP_BODY_END_ZONE_MM;

  let scaledCount = 0;
  let dropped = 0;
  // Walk the tooling array; build the new list (drop any scaled-out ops)
  const newTooling: RfyToolingOp[] = [];
  for (const op of stick.tooling) {
    const pos = opPosForScaling(op);
    if (pos === null) {
      newTooling.push(op);
      continue;
    }
    if (pos < bodyLo || pos > bodyHi) {
      // Start-cap or end-cap zone — keep as-is
      newTooling.push(op);
      continue;
    }
    // Body op — apply transform: newPos = (oldPos - offsetFromXmin + startTrimOffset) × scale
    // The startTrimOffset compensates the upstream 4mm start-trim, which
    // Detailer doesn't apply on rake plates (same logic as axis-Y rake comp
    // in frame-context.ts line 354).
    const transform = (p: number) => (p - offsetFromXmin + RP_DIAGONAL_START_TRIM_OFFSET_MM) * scale;
    const cloned: RfyToolingOp = { ...op };
    if (cloned.kind === "point") {
      cloned.pos = transform(cloned.pos);
    } else if (cloned.kind === "spanned") {
      const newStart = transform(cloned.startPos);
      const newEnd = transform(cloned.endPos);
      // If scale negative (descending diagonal), transformed start/end may swap
      cloned.startPos = Math.min(newStart, newEnd);
      cloned.endPos = Math.max(newStart, newEnd);
    }
    const newPos = opPosForScaling(cloned);
    if (newPos === null) {
      newTooling.push(cloned);
      scaledCount++;
      continue;
    }
    if (newPos > stickLen - 5 || newPos < 5) {
      // Scaled out of bounds — drop (duplicates end-cap or pre-start zone).
      dropped++;
      continue;
    }
    newTooling.push(cloned);
    scaledCount++;
  }
  // Mutate in place
  stick.tooling.length = 0;
  stick.tooling.push(...newTooling);
  return { scaled: scaledCount, dropped, scaleFactor: scale, offsetMm: offsetFromXmin };
}

// ---------------------------------------------------------------------------
// RP single-T-plate rake start/end-cap rewrite (Agent RP5, 2026-05-10)
// ---------------------------------------------------------------------------
// PATTERN: single-T-plate sloped RP frames need a chord-style cap on the
// EAVE (low-z) end of T1. The codec emits standard wall-style caps, missing
// the chord morphology and producing 22.6mm body LipNotch drift.
// ASC : T1.start.z < T1.end.z  -> eave at start -> chord cap at start
// DESC: T1.start.z > T1.end.z  -> eave at end   -> chord cap at end

const RP_RAKE_T_LEN_MIN_MM = 2000;
const RP_RAKE_T_DZ_MIN_MM = 5;
const RP_RAKE_BODY_SHIFT_MM = 22.6;
const RP_CHORD_CAP_DIMPLE_OFFSET_MM = 90.0;
const RP_CHORD_CAP_LIPNOTCH_LO_MM = 77.5;
const RP_CHORD_CAP_LIPNOTCH_HI_MM = 138.9;
const RP_ASC_PEAK_END_LIPNOTCH_SPAN_MM = 66.1;

export type RpRakeDirection = "asc" | "desc";

function frameSingleTplateRakeDirection(frame: ParsedFrame): RpRakeDirection | null {
  let tCount = 0;
  let nCount = 0;
  let t1: ParsedStick | null = null;
  let maxStudLen = 0;
  for (const s of frame.sticks) {
    if (isTplate(s)) {
      tCount++;
      if (s.name === "T1") t1 = s;
    }
    if (isNog(s)) nCount++;
    if (isSstud(s)) {
      const sl = computeStickLength(s);
      if (sl > maxStudLen) maxStudLen = sl;
    }
  }
  if (tCount !== 1) return null;
  if (nCount > 1) return null;
  if (!t1) return null;
  const dz = t1.end.z - t1.start.z;
  const len = computeStickLength(t1);
  if (len < RP_RAKE_T_LEN_MIN_MM) return null;
  // Skillion-roof exclusion (HG260044 R15: studs run from a horizontal floor
  // up to a rake T-plate, making them longer than T1 itself; ratio > 1).
  if (maxStudLen / len > 1.0) return null;
  if (dz >= RP_RAKE_T_DZ_MIN_MM) return "asc";
  if (dz <= -RP_RAKE_T_DZ_MIN_MM) return "desc";
  return null;
}

export interface RpRakeTransformStats {
  stripped: number;
  added: number;
  shifted: number;
  endCapReplaced: number;
  direction: RpRakeDirection;
}

export function applyRpSingleTplateRakeCap(
  tooling: RfyToolingOp[],
  stickLen: number,
  direction: RpRakeDirection,
): RpRakeTransformStats {
  let stripped = 0;
  let added = 0;
  let shifted = 0;
  let endCapReplaced = 0;
  if (direction === "asc") {
    for (let i = tooling.length - 1; i >= 0; i--) {
      const op = tooling[i]!;
      if (op.kind === "start" && op.type === "Chamfer") { tooling.splice(i, 1); stripped++; continue; }
      if (op.kind === "point" && op.type === "InnerDimple"
          && Math.abs(op.pos - 10.0) < POINT_ANCHOR_TOL_MM) {
        tooling.splice(i, 1); stripped++; continue;
      }
      if (op.kind === "spanned" && op.type === "LipNotch"
          && Math.abs(op.startPos - 0) < END_ANCHOR_TOL_MM
          && Math.abs(op.endPos - 39.0) < 2.0) {
        tooling.splice(i, 1); stripped++; continue;
      }
    }
    const bodyLo = 150;
    const bodyHi = stickLen - 50;
    for (const op of tooling) {
      if (op.kind === "spanned" && op.type === "LipNotch"
          && op.startPos > bodyLo && op.endPos < bodyHi) {
        op.startPos -= RP_RAKE_BODY_SHIFT_MM;
        op.endPos -= RP_RAKE_BODY_SHIFT_MM;
        shifted++;
      }
    }
    for (const op of tooling) {
      if (op.kind === "spanned" && op.type === "LipNotch"
          && Math.abs(op.endPos - stickLen) < END_ANCHOR_TOL_MM
          && Math.abs((op.endPos - op.startPos) - 39.0) < 2.0) {
        op.startPos = stickLen - RP_ASC_PEAK_END_LIPNOTCH_SPAN_MM;
        endCapReplaced++;
      }
    }
    tooling.push({ kind: "point", type: "InnerDimple", pos: RP_CHORD_CAP_DIMPLE_OFFSET_MM });
    tooling.push({ kind: "spanned", type: "LipNotch",
      startPos: RP_CHORD_CAP_LIPNOTCH_LO_MM, endPos: RP_CHORD_CAP_LIPNOTCH_HI_MM });
    added += 2;
  } else {
    for (let i = tooling.length - 1; i >= 0; i--) {
      const op = tooling[i]!;
      if (op.kind === "end" && op.type === "Chamfer") { tooling.splice(i, 1); stripped++; continue; }
      if (op.kind === "point" && op.type === "InnerDimple"
          && Math.abs(op.pos - (stickLen - 10.0)) < POINT_ANCHOR_TOL_MM) {
        tooling.splice(i, 1); stripped++; continue;
      }
      if (op.kind === "spanned" && op.type === "LipNotch"
          && Math.abs(op.endPos - stickLen) < END_ANCHOR_TOL_MM
          && Math.abs((op.endPos - op.startPos) - 39.0) < 2.0) {
        tooling.splice(i, 1); stripped++; continue;
      }
    }
    const bodyLo = 150;
    const bodyHi = stickLen - 150;
    for (const op of tooling) {
      if (op.kind === "spanned" && op.type === "LipNotch"
          && op.startPos > bodyLo && op.endPos < bodyHi) {
        op.startPos += RP_RAKE_BODY_SHIFT_MM;
        op.endPos += RP_RAKE_BODY_SHIFT_MM;
        shifted++;
      }
    }
    tooling.push({ kind: "point", type: "InnerDimple", pos: stickLen - RP_CHORD_CAP_DIMPLE_OFFSET_MM });
    tooling.push({ kind: "spanned", type: "LipNotch",
      startPos: stickLen - RP_CHORD_CAP_LIPNOTCH_HI_MM,
      endPos: stickLen - RP_CHORD_CAP_LIPNOTCH_LO_MM });
    added += 2;
  }
  return { stripped, added, shifted, endCapReplaced, direction };
}

export function rpRakeDirectionForFrame(frame: ParsedFrame, planName: string): RpRakeDirection | null {
  if (!isRpPlanName(planName)) return null;
  return frameSingleTplateRakeDirection(frame);
}

// ---------------------------------------------------------------------------
// RP sloped T-plate body LipNotch shift (Agent RP6, 2026-05-11) — Pattern 3
// ---------------------------------------------------------------------------
//
// PATTERN: ref Detailer places body-crossing LipNotch ops on sloped RP T-plates
// 22.6mm CLOSER to the eave than the codec emits them. RP5 already does this
// shift for the narrow cohort it covers (single T-plate, non-skillion, T-len ≥
// 2000), but several frame topologies bypass RP5 and still need the same
// shift:
//   * Skillion roofs (max stud len > T1 len) — RP5 explicitly skips these.
//   * Multi-T-plate frames (R1/R4 in HG260044, R2-R6 in HG260001) — RP5
//     requires tCount === 1.
//   * Short single-T frames (R8/T1 in HG260044, len 1453 < 2000mm).
//
// EVIDENCE (HG260044 + HG260001 GF-RP-70.075, 2026-05-11):
//   - 40 body LipNotch op pairs match the +/-22.6 shift expectation
//     (24 in HG260044, 16 in HG260001).
//   - Direction follows the same ASC/DESC rule as RP5: ASC (start at eave) →
//     -22.6, DESC (end at eave) → +22.6.
//
// SCOPE: only RP plans, only T-prefix TopPlate sticks, only when
//   * |dz| ≥ RP_RAKE_T_DZ_MIN_MM, AND
//   * RP5 (`frameSingleTplateRakeDirection`) does NOT fire on this frame, AND
//   * Op width is in the canonical body-crossing range (60–70mm).
// Body zone: same as RP5 (start > 150, end < L - 50 for ASC; symmetric for DESC).
//
// Width filter prevents touching start-cap LipNotches (39mm) or chord-cap
// LipNotches (61.4mm) that may appear in body-zone positions on rare frames.

/** Apply a +/-22.6mm body LipNotch shift on a sloped RP T-plate stick whose
 *  frame is NOT covered by RP5. Returns the number of ops shifted. */
export function applyRpSlopedTplateBodyShift(
  tooling: RfyToolingOp[],
  stickLen: number,
  direction: RpRakeDirection,
): number {
  const bodyLo = 150;
  const bodyHi = direction === "asc" ? stickLen - 50 : stickLen - 150;
  const shift = direction === "asc" ? -RP_RAKE_BODY_SHIFT_MM : +RP_RAKE_BODY_SHIFT_MM;
  let shifted = 0;
  for (const op of tooling) {
    if (op.kind !== "spanned" || op.type !== "LipNotch") continue;
    if (op.startPos <= bodyLo) continue;
    if (op.endPos >= bodyHi) continue;
    const width = op.endPos - op.startPos;
    // Only canonical body-crossing widths (the LipNotch rule that matches
    // stud crossings emits 67–68mm wide notches; cap LipNotches are 39mm or
    // 61.4mm and must be left alone).
    if (width < 60 || width > 70) continue;
    op.startPos += shift;
    op.endPos += shift;
    shifted++;
  }
  return shifted;
}

/** Decide direction (asc/desc) for a sloped RP T-plate stick that is NOT
 *  covered by RP5's `frameSingleTplateRakeDirection`. Returns null if:
 *   - Not an RP plan, or stick is not a T-prefix TopPlate, or
 *   - Stick is not sloped (|dz| < RP_RAKE_T_DZ_MIN_MM), or
 *   - The stick's FRAME would be handled by RP5 (this stick is RP5's T1),
 *     in which case the body shift is already applied by RP5 — applying it
 *     again here would double-shift.
 *
 *  Note: RP5 ONLY shifts T1. So in a single-T frame where RP5 fires, ONLY T1
 *  is the same stick. In a multi-T frame, RP5 doesn't fire (tCount !== 1) so
 *  this function may apply to T1, T2, etc.
 */
export function rpSlopedTplateBodyShiftDirection(
  frame: ParsedFrame,
  stick: ParsedStick,
  planName: string,
): RpRakeDirection | null {
  if (!isRpPlanName(planName)) return null;
  if (!isTplate(stick)) return null;
  if (String((stick as { usage?: string }).usage ?? "").toLowerCase() !== "topplate") return null;
  const dz = stick.end.z - stick.start.z;
  if (Math.abs(dz) < RP_RAKE_T_DZ_MIN_MM) return null;
  // If RP5 fires on this frame AND this stick is the one RP5 transforms (T1),
  // skip — RP5 already shifted body LipNotches. RP5 only operates on T1.
  const rp5Dir = frameSingleTplateRakeDirection(frame);
  if (rp5Dir !== null && stick.name === "T1") return null;
  if (dz >= RP_RAKE_T_DZ_MIN_MM) return "asc";
  return "desc";
}
