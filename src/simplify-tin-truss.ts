// TIN-style linear-truss simplifier — runs in `synthesizeRfyFromPlans` as a
// post-pass on each frame's parsed sticks BEFORE the per-stick rules-engine
// output is serialised to XML. Targets the HG260001 GF-TIN-70.075 corpus
// where the codec's default rules emit the wrong vocabulary (or wrong
// dimensions) on six frames: HN3-1, TN8-1, TN18-1, TS1-1, HN12-1, TI2-1.
//
// Detection is plan-name-based (`/-TIN-/i`) plus frame-name (`/^(HN|TN|TS|TI)\d/i`).
// PC-prefix frames in TIN plans (PC2-1, PC3-1) are NOT touched — they reach
// 95%+ parity with the existing codec rules.
//
// Scope (v1, conservative):
//   1. Vertical Ws (XML horiz-delta < 0.5mm): trim the stick endpoint by
//      6.5mm so net length-extension is +4.5mm (matches ref) instead of
//      the +11mm the codec applies via the wall-rule. Rebuild the end-Swage
//      span to 44.4mm — the dominant ref width across all TIN vertical Ws.
//   2. Diagonal Ws: leave coords untouched. Strip any extra Chamfer@start
//      that the codec emitted but the ref doesn't have. Reference shows
//      chamfers vary stick-by-stick by geometry; the conservative cut is
//      the start-side because the codec consistently over-emits there.
//
// Anything more ambitious (chord panel-point clusters with ScrewHoles +
// paired InnerDimples + LipNotch, diagonal-W length recompute, end-Chamfer
// rewriter, etc.) is deferred to a v2 in a separate session — those changes
// require modelling truss topology (apex / panel points) which is tangled
// with the same frame-context machinery that another agent is editing.
import type { ParsedFrame, ParsedStick } from "./synthesize-plans.js";
import type { RfyToolingOp } from "./format.js";

/** True iff the plan name marks this as a TIN linear-truss plan. */
export function isTinPlanName(planName: string): boolean {
  return /-TIN-/i.test(planName);
}

/** True iff the frame name belongs to the truss-style sub-set within a TIN
 *  plan (HN / TN / TS / TI prefixes). PC-prefix frames in TIN plans are
 *  handled by the codec's default rules and should NOT be rewritten here. */
export function isTinTrussFrameName(frameName: string): boolean {
  return /^(HN|TN|TS|TI)\d/i.test(frameName);
}

const VERTICAL_HORIZ_TOL_MM = 0.5;
/** TIN vertical-W length net-extension relative to raw XML length:
 *  ref applies +4.5mm; the diff harness's wall-rule extends by +11mm
 *  (lipDepth). We need to undo 6.5mm of that. */
const TIN_VERTICAL_TRIM_MM = 6.5;
/** Dominant ref end-Swage span on TIN vertical Ws.  Verified across
 *  HN3-1, HN12-1, TS1-1, TN8-1, TN18-1: 44.39mm appears on the majority of
 *  vertical Ws longer than ~100mm.  A handful (e.g. TN8-1 W5/W9, TS1-1 W3)
 *  use a 25.27mm short-Swage; we accept the small mismatch on those rather
 *  than over-fit the rule with unverified topology assumptions. */
const TIN_VERTICAL_END_SWAGE_SPAN_MM = 44.39;

/** Stick is a vertical truss web iff its name matches W\d and its
 *  XML-frame horizontal delta (sqrt(dx²+dy²)) is below `VERTICAL_HORIZ_TOL_MM`. */
function isVerticalWeb(stick: ParsedStick): boolean {
  if (!/^W\d/.test(stick.name)) return false;
  if ((stick.usage ?? "").toLowerCase() !== "web") return false;
  const dx = stick.end.x - stick.start.x;
  const dy = stick.end.y - stick.start.y;
  const horiz = Math.sqrt(dx * dx + dy * dy);
  return horiz < VERTICAL_HORIZ_TOL_MM;
}

/** Stick is a diagonal truss web iff name matches W\d and horiz-delta
 *  exceeds the vertical tolerance. */
function isDiagonalWeb(stick: ParsedStick): boolean {
  if (!/^W\d/.test(stick.name)) return false;
  if ((stick.usage ?? "").toLowerCase() !== "web") return false;
  const dx = stick.end.x - stick.start.x;
  const dy = stick.end.y - stick.start.y;
  const horiz = Math.sqrt(dx * dx + dy * dy);
  return horiz >= VERTICAL_HORIZ_TOL_MM;
}

/** Compute the stick's 3D length (Euclidean). */
function stickLen(stick: ParsedStick): number {
  const dx = stick.end.x - stick.start.x;
  const dy = stick.end.y - stick.start.y;
  const dz = stick.end.z - stick.start.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Trim `mmFromEnd` off the stick's end point along its centerline.  Mutates
 *  `stick.end` in place.  No-op if the stick is shorter than 2*mmFromEnd. */
function trimStickEnd(stick: ParsedStick, mmFromEnd: number): boolean {
  const dx = stick.end.x - stick.start.x;
  const dy = stick.end.y - stick.start.y;
  const dz = stick.end.z - stick.start.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < mmFromEnd * 2 + 1) return false;
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  stick.end = {
    x: stick.end.x - ux * mmFromEnd,
    y: stick.end.y - uy * mmFromEnd,
    z: stick.end.z - uz * mmFromEnd,
  };
  return true;
}

/** Mutate `tooling` in place: shift any tooling op whose position is at or
 *  beyond `oldLen - 1` by `-mmFromEnd`, preserving span widths.  Spans whose
 *  endPos was at L now end at L_new; their startPos shifts by the same amount.
 *  After shift, replace the end-Swage span (the spanned op of type "Swage"
 *  with endPos within 1mm of L_new) with one of width `endSwageSpan`. */
function shiftEndAnchoredOps(
  tooling: RfyToolingOp[],
  oldLen: number,
  newLen: number,
  endSwageSpan: number,
): void {
  const delta = newLen - oldLen; // negative when shortening
  // Identify ops anchored at or past oldLen - 1 (the codec's "end-cap"
  // ops).  Mid-stick ops (InnerDimple at L/2 etc.) untouched.
  const END_ANCHOR_TOL = 1.0;
  for (const op of tooling) {
    if (op.kind === "spanned") {
      if (op.endPos >= oldLen - END_ANCHOR_TOL) {
        op.endPos += delta;
        // Keep the start anchored too — span width preserved.  The end-Swage
        // re-spanning happens in the dedicated pass below.
        op.startPos += delta;
      }
    } else if (op.kind === "point") {
      if (op.pos >= oldLen - END_ANCHOR_TOL) {
        op.pos += delta;
      }
    }
  }

  // Re-span the END Swage to `endSwageSpan` mm wide.  Only mutate ops whose
  // post-shift endPos is at L_new.
  for (const op of tooling) {
    if (op.kind !== "spanned") continue;
    if (op.type !== "Swage") continue;
    if (Math.abs(op.endPos - newLen) > END_ANCHOR_TOL) continue;
    op.startPos = op.endPos - endSwageSpan;
  }
}

/** Strip Chamfer@start from a stick's tooling.  Used to delete extras the
 *  codec emits on diagonal Ws of TIN frames where the reference RFY shows
 *  the start side has no apex chamfer. Returns the number of ops removed. */
function stripStartChamfer(tooling: RfyToolingOp[]): number {
  let removed = 0;
  for (let i = tooling.length - 1; i >= 0; i--) {
    const op = tooling[i]!;
    if (op.kind === "start" && op.type === "Chamfer") {
      tooling.splice(i, 1);
      removed++;
    }
  }
  return removed;
}

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
export function simplifyTinTrussFrame(frame: ParsedFrame): SimplifyTinDecision {
  const verticalWsTrimmed: string[] = [];
  const diagonalsChamferStripped: string[] = [];

  for (const stick of frame.sticks) {
    if (isVerticalWeb(stick)) {
      const oldLen = stickLen(stick);
      // Skip very short sticks where the trim would over-shorten the end-Swage
      // span.  TS1-1 W3 / HN3-1 W4 are length ~70mm; their end-Swage in ref
      // spans the whole stick, so the simple "44.4mm wide span at end" rule
      // doesn't apply.  Threshold = endSwageSpan * 2 + a small buffer.
      if (oldLen < TIN_VERTICAL_END_SWAGE_SPAN_MM * 2 + 5) continue;
      const ok = trimStickEnd(stick, TIN_VERTICAL_TRIM_MM);
      if (!ok) continue;
      const newLen = oldLen - TIN_VERTICAL_TRIM_MM;
      shiftEndAnchoredOps(
        stick.tooling,
        oldLen,
        newLen,
        TIN_VERTICAL_END_SWAGE_SPAN_MM,
      );
      verticalWsTrimmed.push(stick.name);
      continue;
    }
    // Diagonal Ws: Chamfer rule is geometry-dependent (apex-end vs mid-chord
    // attach). The conservative strip-start rule over-removed real chamfers
    // (e.g. TS1-1 W5 has Chamfer@start in ref). Defer diagonal-W rewrites to
    // a v2 where topology can be modelled. Retained as no-op for now.
    void stripStartChamfer;
    void diagonalsChamferStripped;
    if (isDiagonalWeb(stick)) {
      continue;
    }
  }

  if (verticalWsTrimmed.length === 0 && diagonalsChamferStripped.length === 0) {
    return { frame: frame.name, decision: "SKIP", reason: "no rewriteable sticks found" };
  }
  return {
    frame: frame.name,
    decision: "APPLY",
    reason:
      `${verticalWsTrimmed.length} vertical Ws trimmed, ` +
      `${diagonalsChamferStripped.length} diagonal Ws had start-Chamfer stripped`,
    ...(verticalWsTrimmed.length > 0 ? { verticalWsTrimmed } : {}),
    ...(diagonalsChamferStripped.length > 0 ? { diagonalsChamferStripped } : {}),
  };
}

/** Public entry point for the TIN simplifier post-pass.  Walks every plan
 *  and frame in the project; for each TIN-truss frame matching the gate
 *  (plan `/-TIN-/i` AND frame `/^(HN|TN|TS|TI)\d/i`), runs `simplifyTinTrussFrame`.
 *  Mutates `project.plans[].frames[].sticks[]` in place. */
export function simplifyTinTrussFramesInProject(
  plans: ReadonlyArray<{ name: string; frames: ParsedFrame[] }>,
): SimplifyTinDecision[] {
  const decisions: SimplifyTinDecision[] = [];
  for (const plan of plans) {
    if (!isTinPlanName(plan.name)) continue;
    for (const frame of plan.frames) {
      if (!isTinTrussFrameName(frame.name)) continue;
      decisions.push(simplifyTinTrussFrame(frame));
    }
  }
  return decisions;
}
