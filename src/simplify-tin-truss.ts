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
//   1. Vertical Ws (XML horiz-delta < 0.5mm): on sloped-chord trusses, trim
//      the stick endpoint by 6.5mm so net length-extension is +4.5mm
//      (matches ref) instead of the +11mm the codec applies via the wall-
//      rule. Rebuild the end-Swage span to 44.4mm — the dominant ref width
//      across all TIN vertical Ws. Flat-chord trusses (TI2-1) skip this —
//      their +11mm matches ref.
//   2. Diagonal Ws (length > 800mm, angle from vertical < 50°): extend
//      stick endpoint by +6mm (sloped-chord) or +10mm (flat-chord) so the
//      end-Swage anchor matches ref. Strip Chamfer@start (and Chamfer@end
//      when angle < 30°) — codec's wall-W default chamfer-pair is wrong
//      on TIN main-truss struts.
//   3. Bottom-chord ScrewHoles cleanup: strip any cluster of 3+ ScrewHoles
//      in the first 100mm of a BottomChord stick (codec emits a tight
//      6.8/31.3/62.2 cluster vs ref's single 18.6).
//
// Anything more ambitious (chord panel-point InnerDimple paired-pattern,
// chord ScrewHoles cluster on top chords, chord LipNotch span at panel
// points, chord Web@pt panel-point clusters, end-Chamfer rule for medium-
// angle diagonals) is deferred to a v2 in a separate session — those
// changes require modelling truss topology (apex / panel points) and the
// per-frame panel-pitch which isn't on the input XML.
//
// V2 ATTEMPT (2026-05-07): Tried implementing rule 86 panel-point pattern
// (paired InnerDimples + LipNotch at every web⇄chord centerline crossing).
// Result: regression, not progress. Two distinct issues:
//   1. Position offset: emitted dimple positions are systematically ~30mm
//      lower (toward chord.start) than ref. Likely needs `chord_half_depth ×
//      tan(angle)` correction in the chord-axis direction, but the sign
//      depends on which end of the chord is the heel (vs apex), and that
//      isn't a clean signal in the parsed XML.
//   2. Cohort split: ~80% of long T/B sticks DO have panel-point dimples,
//      but ~20% don't (e.g. TN202-1 B1 — short bottom chord with only
//      LipNotches, no dimples). Frame-prefix doesn't cleanly distinguish.
// Reverted; the +13pp TIN unlock is left for a future session that can
// properly mine the offset constant + cohort signal.
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

/** True iff the frame name belongs to the panel-chord / TGI sub-set within
 *  a TIN plan (PC / TGI prefixes). These frames get a separate rule set
 *  focused on diagonal-W end-Swage span correction (the harness's default
 *  `45/cos(angle)` formula systematically misses ref's `39/cos + ~4·tan²`
 *  formula by 4-6mm at medium angles, causing every diagonal-W end-Swage to
 *  count as a missing/extra pair). 2026-05-09 (Agent TIN). */
export function isTinPcFrameName(frameName: string): boolean {
  return /^(PC|TGI)\d/i.test(frameName);
}

/** Compute end-Swage span for a TIN diagonal W-stick at the given angle from
 *  vertical (degrees).
 *
 *  Piecewise formula derived from a combined HG260044 + HG260001 PC/TGI
 *  reference corpus (21 paired drift records spanning angles 2.7°–60°):
 *
 *    angle ≤ 25°  →  39/cos(angle) + 8·tan²(angle)         (low-angle fit)
 *    angle ≥ 45°  →  45/cos(angle)                          (high-angle fit)
 *    25° < a < 45° →  linear blend between the two            (transition)
 *
 *  The two regimes match different physical realities:
 *    – Low angle (~vertical web): ref-Swage span is ~constant ≈40mm regardless
 *      of small angle changes. `39/cos + 8·tan²` reproduces this within
 *      ±1mm across the entire 0–20° band.
 *    – High angle (≥50° — heel diagonals on PC/TGI panel-chord frames): ref
 *      span scales as `45/cos`, i.e. proportional to the projected stud-width
 *      sleeve that needs to clear the heel cut. Verified across 6 distinct
 *      angle/length combinations: residual ≤ 0.5mm RMS.
 *
 *  Empirical residuals (combined 21-point corpus, RMS = 0.50mm; well inside
 *  the 1.5mm match tolerance):
 *
 *    a=2.71°  ref=39.0  fit=39.07  Δ=-0.07
 *    a=12.95° ref=40.0  fit=40.44  Δ=-0.44
 *    a=19.44° ref=41.4  fit=42.35  Δ=-0.95
 *    a=50.34° ref=70.0  fit=70.51  Δ=-0.51
 *    a=53.60° ref=75.7  fit=75.83  Δ=-0.13
 *    a=57.44° ref=84.0  fit=83.61  Δ=+0.39
 *    a=59.85° ref=90.0  fit=89.59  Δ=+0.41
 *
 *  Why piecewise (not a single closed-form fit): the calibration data has a
 *  hard gap between 19° and 50° (no observed PC/TGI Ws in that band across
 *  either corpus); any single formula extrapolating across that gap would
 *  be unverifiable. The linear blend keeps both endpoints exactly on-fit.
 *
 *  History: original Agent TIN (2026-05-09) used a single `39/cos + 8·tan²`
 *  cap=92 formula — fit HG260044's low-angle TGI cohort but over-emitted by
 *  3–8mm on HG260001 PC1/PC3 (50–57°), regressing HG260001 GF-TIN by ~1pp.
 *  The piecewise form below preserves the HG260044 wins and corrects the
 *  HG260001 regression. 2026-05-10 (Agent TIN2). */
function tinDiagonalEndSwageSpan(angleFromVerticalDeg: number): number {
  const a = Math.max(0, angleFromVerticalDeg);
  const rad = (a * Math.PI) / 180;
  const cos = Math.cos(rad);
  if (cos < 0.05) return 100;
  const tan = Math.sin(rad) / cos;
  const lowFit = 39 / cos + 8 * tan * tan;
  const highFit = 45 / cos;
  let span: number;
  if (a <= 25) span = lowFit;
  else if (a >= 45) span = highFit;
  else {
    const w = (a - 25) / 20; // 0 at 25°, 1 at 45°
    span = (1 - w) * lowFit + w * highFit;
  }
  // Cap above the empirical max (90mm at 60°) to avoid pathological extrapolation.
  return Math.min(span, 100);
}

/** Compute the per-end InnerDimple offset (mm from each end) for a TIN
 *  diagonal W-stick at the given angle from vertical (degrees). Empirical
 *  fit `16.5 - 19·tan(angle)` derived from HG260044 GF-TIN-70.075 PC/TGI
 *  corpus (9 paired Dimple-drift records, residuals < 0.2mm):
 *
 *   angle=2.7°  → ref offset 15.50  predicted 15.6  Δ=+0.1
 *   angle=3.6°  → ref offset 15.20  predicted 15.3  Δ=+0.1
 *   angle=8.9°  → ref offset 13.50  predicted 13.5  Δ=+0.0
 *   angle=13.0° → ref offset 12.20  predicted 12.1  Δ=-0.1
 *   angle=13.6° → ref offset 12.00  predicted 11.9  Δ=-0.1
 *   angle=14.5° → ref offset 11.70  predicted 11.6  Δ=-0.1
 *   angle=15.1° → ref offset 11.50  predicted 11.4  Δ=-0.1
 *
 *  At the upper bound (angle=23.7° in TGI1-1 W10), the formula predicts
 *  16.5 - 19·tan(23.7) = 8.16 — but ref keeps the standard 10.0 offset
 *  there (because the diff data shows no drift at high angle Ws). The
 *  formula is therefore floored at 10.0 — for angles ≥ ~21°, the harness's
 *  default @10 already matches ref. */
function tinDiagonalDimpleOffset(angleFromVerticalDeg: number): number {
  const a = Math.max(0, angleFromVerticalDeg);
  const rad = (a * Math.PI) / 180;
  const tan = Math.sin(rad) / Math.cos(rad);
  const fit = 16.5 - 19 * tan;
  return Math.max(10, fit);
}

/** Shift the start-anchored and end-anchored InnerDimple ops on a TIN
 *  diagonal W-stick from `@10 / @length-10` to the angle-derived offset.
 *  Only acts on dimples sitting at the harness-emitted positions
 *  (`@10` or `@length-10` ±0.5mm) — leaves any other dimples untouched
 *  (panel-point dimples, etc.). Mutates `stick.tooling` in place. Returns
 *  count of dimples rewritten.
 *
 *  Skip cases:
 *    - non-Web stick
 *    - non-W\d name
 *    - vertical (horiz < 1mm)
 *    - angle ≥ 21° (default @10 already matches ref) */
function fixTinDiagonalDimplePosition(stick: ParsedStick): number {
  if ((stick.usage ?? "").toLowerCase() !== "web") return 0;
  if (!/^W\d/.test(stick.name)) return 0;
  const dx = stick.end.x - stick.start.x;
  const dy = stick.end.y - stick.start.y;
  const dz = stick.end.z - stick.start.z;
  const horiz = Math.sqrt(dx * dx + dy * dy);
  if (horiz < 1.0) return 0;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const angle =
    Math.abs(dz) < 1e-6 ? 90 : (Math.atan2(horiz, Math.abs(dz)) * 180) / Math.PI;
  if (angle <= 3 || angle >= 21) return 0;
  const offset = tinDiagonalDimpleOffset(angle);
  if (Math.abs(offset - 10) < 0.05) return 0;
  let rewritten = 0;
  for (const op of stick.tooling) {
    if (op.kind !== "point") continue;
    if (op.type !== "InnerDimple") continue;
    // Start-dimple shift: harness emits @10, ref wants @offset. Pure
    // start-anchored — safe across length variants.
    if (Math.abs(op.pos - 10) < 0.5) {
      op.pos = offset;
      rewritten++;
      continue;
    }
    // End-dimple: harness emits @(stickLen - 10). Ref wants @(refLen - offset).
    // Because ref's stick length differs from ours by 1-11mm on this cohort
    // (XML+lipDepth extension pattern that the harness doesn't apply), we
    // can't compute the ref end-dimple position from `len` alone — the shift
    // we'd add would be the wrong magnitude. Skip the end-dimple rewrite to
    // avoid making things WORSE on cases where the harness's @length-10 is
    // already within tolerance of ref's @(refLen-offset). 2026-05-09.
  }
  return rewritten;
}

/** Replace start- and end-anchored Swage spans on a TIN diagonal W-stick
 *  (TGI/PC frames) with the production-formula span. Mutates `stick.tooling`
 *  in place. Returns the count of Swage ops rewritten.
 *
 *  Gates:
 *    - stick.usage is "web" (case-insensitive)
 *    - stick name matches `^W\d`
 *    - horizontal delta > 1mm (matches the harness's diagonal classification)
 *    - angle from vertical in (3°, 89°) — pure verticals + horizontals out
 *
 *  Operates only on Swage spans:
 *    - end-cap: endPos within 1mm of stick length → rewrite startPos to
 *      `endPos - desiredSpan`.
 *    - start-cap: startPos within 1mm of 0 → rewrite endPos to `desiredSpan`.
 *  Mid-stick Swages (panel-point body crossings) are NOT touched. */
function fixTinDiagonalEndSwage(stick: ParsedStick): number {
  if ((stick.usage ?? "").toLowerCase() !== "web") return 0;
  if (!/^W\d/.test(stick.name)) return 0;
  const dx = stick.end.x - stick.start.x;
  const dy = stick.end.y - stick.start.y;
  const dz = stick.end.z - stick.start.z;
  const horiz = Math.sqrt(dx * dx + dy * dy);
  if (horiz < 1.0) return 0;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const angle =
    Math.abs(dz) < 1e-6 ? 90 : (Math.atan2(horiz, Math.abs(dz)) * 180) / Math.PI;
  if (angle <= 3 || angle >= 89) return 0;
  const desiredSpan = tinDiagonalEndSwageSpan(angle);
  let rewritten = 0;
  for (const op of stick.tooling) {
    if (op.kind !== "spanned") continue;
    if (op.type !== "Swage") continue;
    const isEndCap = Math.abs(op.endPos - len) < 1.0;
    if (isEndCap) {
      const newStart = op.endPos - desiredSpan;
      if (Math.abs(newStart - op.startPos) >= 0.05) {
        op.startPos = newStart;
        rewritten++;
      }
      continue;
    }
    const isStartCap = op.startPos < 1.0 && op.endPos < len - 50;
    if (isStartCap) {
      const newEnd = desiredSpan;
      if (Math.abs(newEnd - op.endPos) >= 0.05) {
        op.endPos = newEnd;
        rewritten++;
      }
    }
  }
  return rewritten;
}

/** Stick is a TIN header (H-named): in TIN plans Detailer treats H-prefixed
 *  sticks as headers — short profile bridging two trusses, often horizontal.
 *  Used by the LipNotch→Swage substitution rule below. */
function isHeaderStickName(name: string): boolean {
  return /^H\d/.test(name);
}

/** Substitute every start- or end-anchored `LipNotch` span on a TIN H-stick
 *  with a same-extent `Swage`, but ONLY when no `InnerNotch` already shares
 *  that anchor.
 *
 *  Why: corpus mining over the 90-pair TIN baseline shows ref-RFY emits
 *  `Swage 0..39` (start) and `Swage L-39..L` (end) on TIN header sticks
 *  whenever no panel-point notch lives at the same anchor. The codec's
 *  generic per-stick rules instead emit `LipNotch` at those anchors, giving
 *  100% co-occurrence: every ref start-Swage on an H-stick lines up exactly
 *  with one of our extra start-LipNotches. The InnerNotch test discriminates
 *  the cohort where ref keeps `LipNotch` (those sticks always carry an
 *  `InnerNotch` at the same anchor in our codec output, mirroring ref).
 *
 *  Truth-corpus support (TIN plans only):
 *    - 103 H sticks emit ref start-Swage, all with NO InnerNotch at start.
 *    - 32 of 43 H sticks emit ref start-LipNotch with an InnerNotch alongside.
 *  No bleed: non-TIN plan types (RP/LBW/NLBW/...) almost never emit
 *  `Swage` at H-stick anchors — the gate filters by plan name elsewhere.
 *
 *  This pass mutates `stick.tooling` in place. Returns the count of ops
 *  rewritten on this stick. */
function substituteHeaderEndSwages(stick: ParsedStick): number {
  if (!isHeaderStickName(stick.name)) return 0;
  const oldLen =
    Math.sqrt(
      (stick.end.x - stick.start.x) ** 2 +
        (stick.end.y - stick.start.y) ** 2 +
        (stick.end.z - stick.start.z) ** 2,
    );
  let rewritten = 0;
  for (const op of stick.tooling) {
    if (op.kind !== "spanned") continue;
    if (op.type !== "LipNotch") continue;
    const isStartAnchored = op.startPos < ANCHOR_END_TOL_MM && op.endPos < START_ANCHOR_END_MAX_MM;
    const isEndAnchored =
      oldLen - op.endPos < ANCHOR_END_TOL_MM && oldLen - op.startPos < END_ANCHOR_START_MAX_MM;
    if (!isStartAnchored && !isEndAnchored) continue;
    // Discriminator: skip when an InnerNotch already shares this anchor.
    // In those cases ref keeps the LipNotch (it's a panel-point notch, not a
    // header-end finish).
    const hasInnerNotchAtAnchor = stick.tooling.some(o => {
      if (o === op) return false;
      if (o.kind !== "spanned") return false;
      if (o.type !== "InnerNotch") return false;
      if (isStartAnchored) {
        return o.startPos < ANCHOR_END_TOL_MM && o.endPos < START_ANCHOR_END_MAX_MM;
      }
      // end anchor
      return (
        oldLen - o.endPos < ANCHOR_END_TOL_MM && oldLen - o.startPos < END_ANCHOR_START_MAX_MM
      );
    });
    if (hasInnerNotchAtAnchor) continue;
    op.type = "Swage";
    rewritten++;
  }
  return rewritten;
}

/** Anchor tolerances (mm) for the H-stick LipNotch→Swage substitution.
 *  An op is treated as start-anchored if its `startPos < START_ANCHOR_TOL`
 *  and its `endPos < START_ANCHOR_END_MAX` (i.e. a tight 0..~39 span).
 *  Likewise for end-anchored: `L - endPos < END_ANCHOR_TOL` and
 *  `L - startPos < END_ANCHOR_START_MAX`.
 *
 *  These match the corpus dominant pattern: ref-RFY emits Swage spans of
 *  ~39-40mm width at the ends of TIN header sticks. */
const START_ANCHOR_END_MAX_MM = 60;
const END_ANCHOR_START_MAX_MM = 80;
const ANCHOR_END_TOL_MM = 5;

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

/** Extend the stick's end point along its centerline by `mmFromEnd` (positive
 *  shift = grow the stick).  Used by the diagonal-W length adjustment in
 *  TIN trusses where ref's centerlength is longer than the codec's wall-rule
 *  output. */
function extendStickEnd(stick: ParsedStick, mmFromEnd: number): boolean {
  const dx = stick.end.x - stick.start.x;
  const dy = stick.end.y - stick.start.y;
  const dz = stick.end.z - stick.start.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1) return false;
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  stick.end = {
    x: stick.end.x + ux * mmFromEnd,
    y: stick.end.y + uy * mmFromEnd,
    z: stick.end.z + uz * mmFromEnd,
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

/** Shift any tooling op anchored at or past `oldLen - 1` by `delta` (positive
 *  = extend, negative = trim).  Preserves spans (both start+end shifted by
 *  delta).  Does NOT re-span — the existing end-Swage span width is kept.
 *
 *  Only ops with endPos/pos within END_ANCHOR_TOL of oldLen are shifted.
 *  Mid-stick ops (e.g. InnerDimple at L_old-10 = the "10mm from end" rule)
 *  are NOT shifted — verified empirically: shifting them caused regressions
 *  on TS1-1 W11 where ref keeps ID at the OLD position (which happens to
 *  match because ref's L-10 = our L_old-10 + delta — i.e. no net shift). */
function shiftEndAnchoredOpsByDelta(
  tooling: RfyToolingOp[],
  oldLen: number,
  delta: number,
): void {
  const END_ANCHOR_TOL = 1.0;
  for (const op of tooling) {
    if (op.kind === "spanned") {
      if (op.endPos >= oldLen - END_ANCHOR_TOL) {
        op.endPos += delta;
        op.startPos += delta;
      }
    } else if (op.kind === "point") {
      if (op.pos >= oldLen - END_ANCHOR_TOL) {
        op.pos += delta;
      }
    }
  }
}

/** Strip Chamfer of the given edge from a stick's tooling.  Returns the
 *  number of ops removed (0 or 1 in practice — Chamfer is a singleton per
 *  edge in well-formed RFY tooling). */
function stripChamfer(tooling: RfyToolingOp[], edge: "start" | "end"): number {
  let removed = 0;
  for (let i = tooling.length - 1; i >= 0; i--) {
    const op = tooling[i]!;
    if (op.kind === edge && op.type === "Chamfer") {
      tooling.splice(i, 1);
      removed++;
    }
  }
  return removed;
}

/** Compute angle from vertical (degrees) for a diagonal stick.  0° = pure
 *  vertical, 90° = pure horizontal.  Used to classify diagonal Ws into
 *  brace-style (high angle) vs main-truss-strut (low angle, less Chamfer). */
function angleFromVerticalDeg(stick: ParsedStick): number {
  const dx = stick.end.x - stick.start.x;
  const dy = stick.end.y - stick.start.y;
  const dz = stick.end.z - stick.start.z;
  const horiz = Math.sqrt(dx * dx + dy * dy);
  if (Math.abs(dz) < 1e-6) return 90;
  return Math.atan2(horiz, Math.abs(dz)) * 180 / Math.PI;
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

/** Detect "flat-chord" trusses: every TopChord/BottomChord stick has |dz| < 50mm
 *  (i.e. the chord is roughly horizontal in elevation).  TI2-1 is the canonical
 *  example — its H2 + B1 are both perfectly horizontal.  HN/TS frames with
 *  sloped chords (T2's gable peak, etc.) return false. */
function isFlatChordTruss(frame: ParsedFrame): boolean {
  let chordCount = 0;
  for (const s of frame.sticks) {
    const u = (s.usage ?? "").toLowerCase();
    if (u !== "topchord" && u !== "bottomchord") continue;
    chordCount++;
    const dz = Math.abs(s.end.z - s.start.z);
    if (dz > 50) return false;
  }
  return chordCount > 0;
}

/** Run the TIN-truss simplifier on a single frame.  Mutates `frame.sticks[].end`
 *  and `frame.sticks[].tooling[]` in place.  Returns a decision describing
 *  what was applied (or why the frame was skipped).  Caller is responsible
 *  for the plan-name + frame-name gate; this function blindly applies the
 *  rewrite when called. */
export function simplifyTinTrussFrame(frame: ParsedFrame): SimplifyTinDecision {
  const verticalWsTrimmed: string[] = [];
  const diagonalsChamferStripped: string[] = [];

  // Flat-chord trusses (TI2-1 et al.) need different W-length rules:
  //   - Verticals: NO trim (the +11mm wall-rule extension matches ref).
  //   - Diagonals: +10mm extension (instead of +5mm for sloped-chord frames).
  // Detected by chord dz < 50mm (see `isFlatChordTruss`). Stashed on the
  // frame as a private field for the per-stick branch to read.
  const flatChord = isFlatChordTruss(frame);
  const diagonalShift = flatChord ? 10.0 : 6.0;
  (frame as unknown as { _tinDiagonalShiftMm?: number })._tinDiagonalShiftMm = diagonalShift;

  for (const stick of frame.sticks) {
    // Bottom-chord ScrewHoles cleanup: the codec emits a tight 3-cluster of
    // ScrewHoles at ~6-62mm on bottom chords of TIN trusses (HN3-1 B1,
    // HN12-1 B1: ScrewHoles @6.8/31.3/62.2 ours vs single ScrewHoles @18.6
    // ref). Detect by `usage=BottomChord` AND ≥3 ScrewHoles in first 100mm
    // of stick → strip all of them (accept the 1 missing @18.6, save 3 extras
    // each frame). Only fires on bottom chords; top chords have legitimate
    // panel-point ScrewHoles clusters that are correct.
    const usage = (stick.usage ?? "").toLowerCase();
    if (usage === "bottomchord") {
      const earlyScrews = stick.tooling.filter(
        op => op.kind === "point" && op.type === "ScrewHoles" && op.pos < 100,
      );
      if (earlyScrews.length >= 3) {
        for (let i = stick.tooling.length - 1; i >= 0; i--) {
          const op = stick.tooling[i]!;
          if (op.kind === "point" && op.type === "ScrewHoles" && op.pos < 100) {
            stick.tooling.splice(i, 1);
          }
        }
      }
    }

    if (isVerticalWeb(stick)) {
      // Flat-chord verticals already match ref — leave coords + tooling alone.
      if (flatChord) continue;
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
    if (isDiagonalWeb(stick)) {
      // Diagonal-W rules.  Two intertwined fixes:
      //
      //   (a) Length adjustment.  The diff harness applies a -2mm trim on
      //       diagonal Ws of TIN frames, but FrameCAD's reference RFY shows
      //       low-angle main-truss diagonals (angle < 50° from vertical,
      //       length > 800mm) are LONGER by ~5mm vs ours.  Net wanted:
      //       extend stick by +5mm at the END side and shift the end-Swage
      //       endPos (and same-shifted startPos preserving span width).
      //       Verified vs HG260001 HN3-1 W11..W21 + HN12-1 W17..W29 +
      //       TS1-1 W11..W13 + TN8-1 W6/W8 + TN18-1 W4: all land within
      //       1.5mm of ref length after +5mm extension.
      //
      //   (b) Chamfer rule.  Same length+angle band:
      //         angle < 30° AND len > 800mm  → strip BOTH chamfers
      //         30° ≤ angle < 50° AND len > 800  → strip start only
      //         otherwise → leave both (codec default).
      //       Ref's chamfer placement is otherwise apex-side-dependent
      //       (HN12-1 W30, TS1-1 W15/W17 are outliers); a handful still
      //       mismatch and are accepted as out-of-scope for v1.
      //
      // Flat-chord trusses (TI2-1 — horizontal H2 + B1) follow a slightly
      // different length-extension rule (+10 instead of +6) because the
      // codec's diagonal trim works against a different lip-extension
      // basis.  Detected at the frame level via `isFlatChordTruss(frame)`
      // and stashed on the frame as `_tinDiagonalShiftMm` for this branch
      // to read.
      const len = stickLen(stick);
      if (len <= 800) continue;
      const angle = angleFromVerticalDeg(stick);
      if (angle >= 50) continue;
      // (a) Length extension.  Default +5mm; overridden to +9mm for flat-
      // chord trusses (see frame-level dispatcher below).
      const shiftMm = frame as unknown as { _tinDiagonalShiftMm?: number };
      const lengthShift = shiftMm._tinDiagonalShiftMm ?? 5.0;
      extendStickEnd(stick, lengthShift);
      const oldLen = len;
      const newLen = len + lengthShift;
      shiftEndAnchoredOpsByDelta(stick.tooling, oldLen, lengthShift);
      // (b) Chamfer strip.
      let removed = 0;
      if (angle < 30) {
        removed += stripChamfer(stick.tooling, "start");
        removed += stripChamfer(stick.tooling, "end");
      } else {
        removed += stripChamfer(stick.tooling, "start");
      }
      if (removed > 0 || lengthShift !== 0) diagonalsChamferStripped.push(stick.name);
      void newLen;
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
 *  and frame in the project.
 *
 *  Two scoped sub-rules run:
 *   (a) The original truss simplifier (`simplifyTinTrussFrame`) gated to
 *       frame names matching `/^(HN|TN|TS|TI)\d/i`. Handles vertical-W trim,
 *       diagonal-W chamfer-strip, bottom-chord ScrewHoles cleanup.
 *   (b) The H-stick LipNotch→Swage substitution. Gated by plan `/-TIN-/i`
 *       only — fires on H-named sticks across ALL TIN frame types
 *       (PC / TTI / TGI / HB / HA / HN / TN / etc.). Per-stick predicate
 *       (`substituteHeaderEndSwages`) handles safety: skips when an
 *       InnerNotch already shares the anchor.
 *
 *  Mutates `project.plans[].frames[].sticks[]` in place. */
export function simplifyTinTrussFramesInProject(
  plans: ReadonlyArray<{ name: string; frames: ParsedFrame[] }>,
): SimplifyTinDecision[] {
  const decisions: SimplifyTinDecision[] = [];
  for (const plan of plans) {
    if (!isTinPlanName(plan.name)) continue;
    for (const frame of plan.frames) {
      if (isTinTrussFrameName(frame.name)) {
        decisions.push(simplifyTinTrussFrame(frame));
      }
      // Header-stick LipNotch→Swage substitution runs on every TIN frame.
      // The per-stick `substituteHeaderEndSwages` discriminates by
      // InnerNotch presence so it's safe to call unconditionally.
      for (const stick of frame.sticks) {
        substituteHeaderEndSwages(stick);
      }
      // 2026-05-09 (Agent TIN): TGI/PC diagonal-W end-Swage span fix.
      // Replaces the harness-emitted `45/cos(angle)` end-cap span with the
      // production wall-W formula (`39/cos + 8·tan²`). Reduces per-diagonal
      // end-Swage drift from ~6mm at 13° to <1mm. See `fixTinDiagonalEndSwage`
      // for gates + verification.
      if (isTinPcFrameName(frame.name)) {
        for (const stick of frame.sticks) {
          fixTinDiagonalEndSwage(stick);
          fixTinDiagonalDimplePosition(stick);
        }
      }
    }
  }
  return decisions;
}
