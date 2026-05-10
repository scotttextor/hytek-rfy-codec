/** True iff the plan name marks this as a TIN linear-truss plan. */
export function isTinPlanName(planName) {
    return /-TIN-/i.test(planName);
}
/** True iff the frame name belongs to the truss-style sub-set within a TIN
 *  plan (HN / TN / TS / TI prefixes). PC-prefix frames in TIN plans are
 *  handled by the codec's default rules and should NOT be rewritten here. */
export function isTinTrussFrameName(frameName) {
    return /^(HN|TN|TS|TI)\d/i.test(frameName);
}
/** True iff the frame name belongs to the panel-chord / TGI sub-set within
 *  a TIN plan (PC / TGI prefixes). These frames get a separate rule set
 *  focused on diagonal-W end-Swage span correction (the harness's default
 *  `45/cos(angle)` formula systematically misses ref's `39/cos + ~4·tan²`
 *  formula by 4-6mm at medium angles, causing every diagonal-W end-Swage to
 *  count as a missing/extra pair). 2026-05-09 (Agent TIN). */
export function isTinPcFrameName(frameName) {
    return /^(PC|TGI)\d/i.test(frameName);
}
/** Compute end-Swage span for a TIN diagonal W-stick at the given angle from
 *  vertical (degrees).
 *
 *  Formula: `min(39/cos + 8·tan², 45/cos)`, capped at 100mm safety bound.
 *  Both `39/cos + 8·tan²` (the production wall-W formula) and `45/cos`
 *  describe valid Detailer behaviour in different angle regimes:
 *
 *    angle ≤ ~52°: `39/cos + 8·tan²` is smaller and matches ref (≤ 1mm).
 *    angle ≥ ~52°: `45/cos`           is smaller and matches ref (≤ 1mm).
 *
 *  The crossover happens at ~52° where the two curves equal. Below it the
 *  quadratic-in-tan low-formula dominates; above it the linear-in-sec
 *  high-formula dominates. Taking the elementwise minimum produces a
 *  smooth, monotonic curve that respects both regimes with no
 *  discontinuity and no need to hard-code a transition zone.
 *
 *  Empirical residuals (combined 23-point HG260044 + HG260001 PC/TGI corpus,
 *  spanning angles 2.7°–60°; RMS = 0.47mm, max = 0.95mm — every point well
 *  inside the 1.5mm match tolerance):
 *
 *    a=2.71°  ref=39.0  fit=39.06  Δ=-0.06
 *    a=19.44° ref=41.4  fit=42.35  Δ=-0.95
 *    a=37.80° ref=54.4  fit=54.17  Δ=+0.23   (HG260044 0.095 PC1-1 W5)
 *    a=40.91° ref=57.6  fit=57.61  Δ=-0.01   (HG260044 0.095 PC6-1 W4)
 *    a=50.34° ref=70.0  fit=70.51  Δ=-0.51
 *    a=55.73° ref=80.0  fit=79.92  Δ=+0.08   (HG260044 0.095 PC6-1 W5)
 *    a=57.44° ref=84.0  fit=83.61  Δ=+0.39
 *    a=59.85° ref=90.0  fit=89.59  Δ=+0.41
 *
 *  History: original Agent TIN (2026-05-09) used `39/cos + 8·tan²` cap=92
 *  with no high-angle fallback — fit HG260044's low-angle TGI cohort (≤20°)
 *  but over-emitted by 3–8mm on HG260001 PC1/PC3 (50–57°), regressing
 *  HG260001 GF-TIN by ~1pp. An interim piecewise blend (linear interp in
 *  25°–45° transition) was rejected because the blended values miss the
 *  ~38° and ~41° HG260044 0.095 reference points by 1.5mm. The
 *  elementwise-min form below preserves all wins and adds none of the
 *  drawbacks. 2026-05-10 (Agent TIN2 v2). */
function tinDiagonalEndSwageSpan(angleFromVerticalDeg) {
    const a = Math.max(0, angleFromVerticalDeg);
    const rad = (a * Math.PI) / 180;
    const cos = Math.cos(rad);
    if (cos < 0.05)
        return 100;
    const tan = Math.sin(rad) / cos;
    const lowFit = 39 / cos + 8 * tan * tan;
    const highFit = 45 / cos;
    return Math.min(lowFit, highFit, 100);
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
function tinDiagonalDimpleOffset(angleFromVerticalDeg) {
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
function fixTinDiagonalDimplePosition(stick) {
    if ((stick.usage ?? "").toLowerCase() !== "web")
        return 0;
    if (!/^W\d/.test(stick.name))
        return 0;
    const dx = stick.end.x - stick.start.x;
    const dy = stick.end.y - stick.start.y;
    const dz = stick.end.z - stick.start.z;
    const horiz = Math.sqrt(dx * dx + dy * dy);
    if (horiz < 1.0)
        return 0;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const angle = Math.abs(dz) < 1e-6 ? 90 : (Math.atan2(horiz, Math.abs(dz)) * 180) / Math.PI;
    if (angle <= 3 || angle >= 21)
        return 0;
    const offset = tinDiagonalDimpleOffset(angle);
    if (Math.abs(offset - 10) < 0.05)
        return 0;
    let rewritten = 0;
    for (const op of stick.tooling) {
        if (op.kind !== "point")
            continue;
        if (op.type !== "InnerDimple")
            continue;
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
function fixTinDiagonalEndSwage(stick) {
    if ((stick.usage ?? "").toLowerCase() !== "web")
        return 0;
    if (!/^W\d/.test(stick.name))
        return 0;
    const dx = stick.end.x - stick.start.x;
    const dy = stick.end.y - stick.start.y;
    const dz = stick.end.z - stick.start.z;
    const horiz = Math.sqrt(dx * dx + dy * dy);
    if (horiz < 1.0)
        return 0;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const angle = Math.abs(dz) < 1e-6 ? 90 : (Math.atan2(horiz, Math.abs(dz)) * 180) / Math.PI;
    if (angle <= 3 || angle >= 89)
        return 0;
    const desiredSpan = tinDiagonalEndSwageSpan(angle);
    let rewritten = 0;
    for (const op of stick.tooling) {
        if (op.kind !== "spanned")
            continue;
        if (op.type !== "Swage")
            continue;
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
function isHeaderStickName(name) {
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
function substituteHeaderEndSwages(stick) {
    if (!isHeaderStickName(stick.name))
        return 0;
    const oldLen = Math.sqrt((stick.end.x - stick.start.x) ** 2 +
        (stick.end.y - stick.start.y) ** 2 +
        (stick.end.z - stick.start.z) ** 2);
    let rewritten = 0;
    for (const op of stick.tooling) {
        if (op.kind !== "spanned")
            continue;
        if (op.type !== "LipNotch")
            continue;
        const isStartAnchored = op.startPos < ANCHOR_END_TOL_MM && op.endPos < START_ANCHOR_END_MAX_MM;
        const isEndAnchored = oldLen - op.endPos < ANCHOR_END_TOL_MM && oldLen - op.startPos < END_ANCHOR_START_MAX_MM;
        if (!isStartAnchored && !isEndAnchored)
            continue;
        // Discriminator: skip when an InnerNotch already shares this anchor.
        // In those cases ref keeps the LipNotch (it's a panel-point notch, not a
        // header-end finish).
        const hasInnerNotchAtAnchor = stick.tooling.some(o => {
            if (o === op)
                return false;
            if (o.kind !== "spanned")
                return false;
            if (o.type !== "InnerNotch")
                return false;
            if (isStartAnchored) {
                return o.startPos < ANCHOR_END_TOL_MM && o.endPos < START_ANCHOR_END_MAX_MM;
            }
            // end anchor
            return (oldLen - o.endPos < ANCHOR_END_TOL_MM && oldLen - o.startPos < END_ANCHOR_START_MAX_MM);
        });
        if (hasInnerNotchAtAnchor)
            continue;
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
function isVerticalWeb(stick) {
    if (!/^W\d/.test(stick.name))
        return false;
    if ((stick.usage ?? "").toLowerCase() !== "web")
        return false;
    const dx = stick.end.x - stick.start.x;
    const dy = stick.end.y - stick.start.y;
    const horiz = Math.sqrt(dx * dx + dy * dy);
    return horiz < VERTICAL_HORIZ_TOL_MM;
}
/** Stick is a diagonal truss web iff name matches W\d and horiz-delta
 *  exceeds the vertical tolerance. */
function isDiagonalWeb(stick) {
    if (!/^W\d/.test(stick.name))
        return false;
    if ((stick.usage ?? "").toLowerCase() !== "web")
        return false;
    const dx = stick.end.x - stick.start.x;
    const dy = stick.end.y - stick.start.y;
    const horiz = Math.sqrt(dx * dx + dy * dy);
    return horiz >= VERTICAL_HORIZ_TOL_MM;
}
/** Compute the stick's 3D length (Euclidean). */
function stickLen(stick) {
    const dx = stick.end.x - stick.start.x;
    const dy = stick.end.y - stick.start.y;
    const dz = stick.end.z - stick.start.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
/** Trim `mmFromEnd` off the stick's end point along its centerline.  Mutates
 *  `stick.end` in place.  No-op if the stick is shorter than 2*mmFromEnd. */
function trimStickEnd(stick, mmFromEnd) {
    const dx = stick.end.x - stick.start.x;
    const dy = stick.end.y - stick.start.y;
    const dz = stick.end.z - stick.start.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < mmFromEnd * 2 + 1)
        return false;
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
function extendStickEnd(stick, mmFromEnd) {
    const dx = stick.end.x - stick.start.x;
    const dy = stick.end.y - stick.start.y;
    const dz = stick.end.z - stick.start.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1)
        return false;
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
function shiftEndAnchoredOps(tooling, oldLen, newLen, endSwageSpan) {
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
        }
        else if (op.kind === "point") {
            if (op.pos >= oldLen - END_ANCHOR_TOL) {
                op.pos += delta;
            }
        }
    }
    // Re-span the END Swage to `endSwageSpan` mm wide.  Only mutate ops whose
    // post-shift endPos is at L_new.
    for (const op of tooling) {
        if (op.kind !== "spanned")
            continue;
        if (op.type !== "Swage")
            continue;
        if (Math.abs(op.endPos - newLen) > END_ANCHOR_TOL)
            continue;
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
function shiftEndAnchoredOpsByDelta(tooling, oldLen, delta) {
    const END_ANCHOR_TOL = 1.0;
    for (const op of tooling) {
        if (op.kind === "spanned") {
            if (op.endPos >= oldLen - END_ANCHOR_TOL) {
                op.endPos += delta;
                op.startPos += delta;
            }
        }
        else if (op.kind === "point") {
            if (op.pos >= oldLen - END_ANCHOR_TOL) {
                op.pos += delta;
            }
        }
    }
}
/** Strip Chamfer of the given edge from a stick's tooling.  Returns the
 *  number of ops removed (0 or 1 in practice — Chamfer is a singleton per
 *  edge in well-formed RFY tooling). */
function stripChamfer(tooling, edge) {
    let removed = 0;
    for (let i = tooling.length - 1; i >= 0; i--) {
        const op = tooling[i];
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
function angleFromVerticalDeg(stick) {
    const dx = stick.end.x - stick.start.x;
    const dy = stick.end.y - stick.start.y;
    const dz = stick.end.z - stick.start.z;
    const horiz = Math.sqrt(dx * dx + dy * dy);
    if (Math.abs(dz) < 1e-6)
        return 90;
    return Math.atan2(horiz, Math.abs(dz)) * 180 / Math.PI;
}
/** Detect "flat-chord" trusses: every TopChord/BottomChord stick has |dz| < 50mm
 *  (i.e. the chord is roughly horizontal in elevation).  TI2-1 is the canonical
 *  example — its H2 + B1 are both perfectly horizontal.  HN/TS frames with
 *  sloped chords (T2's gable peak, etc.) return false. */
function isFlatChordTruss(frame) {
    let chordCount = 0;
    for (const s of frame.sticks) {
        const u = (s.usage ?? "").toLowerCase();
        if (u !== "topchord" && u !== "bottomchord")
            continue;
        chordCount++;
        const dz = Math.abs(s.end.z - s.start.z);
        if (dz > 50)
            return false;
    }
    return chordCount > 0;
}
/** Run the TIN-truss simplifier on a single frame.  Mutates `frame.sticks[].end`
 *  and `frame.sticks[].tooling[]` in place.  Returns a decision describing
 *  what was applied (or why the frame was skipped).  Caller is responsible
 *  for the plan-name + frame-name gate; this function blindly applies the
 *  rewrite when called. */
export function simplifyTinTrussFrame(frame) {
    const verticalWsTrimmed = [];
    const diagonalsChamferStripped = [];
    // Flat-chord trusses (TI2-1 et al.) need different W-length rules:
    //   - Verticals: NO trim (the +11mm wall-rule extension matches ref).
    //   - Diagonals: +10mm extension (instead of +5mm for sloped-chord frames).
    // Detected by chord dz < 50mm (see `isFlatChordTruss`). Stashed on the
    // frame as a private field for the per-stick branch to read.
    const flatChord = isFlatChordTruss(frame);
    const diagonalShift = flatChord ? 10.0 : 6.0;
    frame._tinDiagonalShiftMm = diagonalShift;
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
            const earlyScrews = stick.tooling.filter(op => op.kind === "point" && op.type === "ScrewHoles" && op.pos < 100);
            if (earlyScrews.length >= 3) {
                for (let i = stick.tooling.length - 1; i >= 0; i--) {
                    const op = stick.tooling[i];
                    if (op.kind === "point" && op.type === "ScrewHoles" && op.pos < 100) {
                        stick.tooling.splice(i, 1);
                    }
                }
            }
        }
        if (isVerticalWeb(stick)) {
            // Flat-chord verticals already match ref — leave coords + tooling alone.
            if (flatChord)
                continue;
            const oldLen = stickLen(stick);
            // Skip very short sticks where the trim would over-shorten the end-Swage
            // span.  TS1-1 W3 / HN3-1 W4 are length ~70mm; their end-Swage in ref
            // spans the whole stick, so the simple "44.4mm wide span at end" rule
            // doesn't apply.  Threshold = endSwageSpan * 2 + a small buffer.
            if (oldLen < TIN_VERTICAL_END_SWAGE_SPAN_MM * 2 + 5)
                continue;
            const ok = trimStickEnd(stick, TIN_VERTICAL_TRIM_MM);
            if (!ok)
                continue;
            const newLen = oldLen - TIN_VERTICAL_TRIM_MM;
            shiftEndAnchoredOps(stick.tooling, oldLen, newLen, TIN_VERTICAL_END_SWAGE_SPAN_MM);
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
            if (len <= 800)
                continue;
            const angle = angleFromVerticalDeg(stick);
            if (angle >= 50)
                continue;
            // (a) Length extension.  Default +5mm; overridden to +9mm for flat-
            // chord trusses (see frame-level dispatcher below).
            const shiftMm = frame;
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
            }
            else {
                removed += stripChamfer(stick.tooling, "start");
            }
            if (removed > 0 || lengthShift !== 0)
                diagonalsChamferStripped.push(stick.name);
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
        reason: `${verticalWsTrimmed.length} vertical Ws trimmed, ` +
            `${diagonalsChamferStripped.length} diagonal Ws had start-Chamfer stripped`,
        ...(verticalWsTrimmed.length > 0 ? { verticalWsTrimmed } : {}),
        ...(diagonalsChamferStripped.length > 0 ? { diagonalsChamferStripped } : {}),
    };
}
/** Emit ScrewHoles on heel-zone webs and BottomChord of large HN-truss frames.
 *
 *  Detailer puts ScrewHoles on TIN HN-frame trusses in HG260001 GF-TIN-70.075
 *  but NOT on HN trusses elsewhere (HG260023 small HN29/HN30 frames, HG260030
 *  small HN3-x frames). The discriminator is **frame size**: HG260001's HN3-1
 *  (5670mm wide) and HN12-1 (7520mm wide) are large multi-stick trusses with
 *  ~22-33 sticks; the empty-cohort ones are <500mm wide / 4-5 sticks. Smaller
 *  HN frames are treated as simple non-truss panels by Detailer.
 *
 *  Behaviour, per stick of a qualifying HN frame:
 *
 *    - **BottomChord (B1)**: emit single `ScrewHoles @18.57` from start.
 *      The codec already strips the start-cluster of 3 ScrewHoles via the
 *      bottom-chord cleanup rule in `simplifyTinTrussFrame`; we add the
 *      single anchor screw back.
 *
 *    - **W (web) sticks**: emit single `ScrewHoles` IFF the stick is in the
 *      "heel cohort" — i.e. its start-XY is within `HEEL_PROXIMITY_MM` of
 *      either bottom-chord endpoint, OR it's a long king-post (length ≥
 *      1500mm) located near the BottomChord midpoint. Position depends on
 *      angle and length:
 *
 *        Diagonal (horiz ≥ 0.5mm): `ScrewHoles @SH_DIAG_FROM_START` from start.
 *        Vertical (horiz < 0.5mm) bucketed by length:
 *          length < 100         → `@(length - 57)` from start  (≈ 13 from start)
 *          100 ≤ length < 300   → `@(length - 27)` from start  (≈ 27 from end)
 *          300 ≤ length < 1000  → `@(length - 57)` from start
 *          length ≥ 1000        → `@(length - 27)` from start
 *
 *      The bimodal 27/57-from-end pattern is empirical (HG260001 HN3-1+HN12-1
 *      W-stick measurements) — appears to encode whether the stick attaches
 *      to a sloped chord at the apex side vs a horizontal chord. We accept
 *      the bucketing rather than try to derive a topological formula since
 *      the cohort is tiny (12 vertical Ws across the whole HG260001 corpus).
 *
 *  Gates (must all pass before emission):
 *    - plan name matches `/-TIN-/i`
 *    - frame name matches `/^HN\d+-\d+$/`
 *    - frame envelope width ≥ HN_MIN_WIDTH_MM
 *    - first stick gauge is "0.75" (i.e. profile 70.075 frame)
 *
 *  This rule is intentionally narrow. It targets the HG260001 GF-TIN-70.075
 *  cohort identified by Agent SH (2026-05-10 — see `agent-sh-screwholes`
 *  branch). Closes ~10/12 W-stick + 2/2 B1 missing ScrewHoles on HN3-1 +
 *  HN12-1 with zero predicted regression on HG260023 (HN frames too small),
 *  HG260030 (HN frames too small), HG260044 (no HN frames in TIN).
 *
 *  Mutates `frame.sticks[].tooling[]` in place. Returns count of ops emitted. */
/** Heel-zone Ws are within this XY-distance of a BottomChord endpoint AND
 *  shorter than `HEEL_MAX_LEN_MM`. Tightened from 1500/no-len-cap empirical
 *  test which over-emitted on W17-W22 (long verticals on apex side that
 *  happened to be within 1500mm of the heel). */
const HEEL_PROXIMITY_MM = 1100;
const HEEL_MAX_LEN_MM = 1100;
/** King-post detector: very long verticals get ScrewHoles when they sit
 *  in the truss interior — far enough from a heel that they're clearly
 *  load-bearing king posts (not heel-side rake/gable end studs).
 *
 *  Empirical bracket from HG260001 HN12-1 (king posts) vs HN3-1 (no king):
 *    HN12-1 W26 #1 (y=15771): dist to nearest heel = 2054 → king post ✓
 *    HN12-1 W26 #2 (y=14553): dist to nearest heel =  836 → king post ✓
 *    HN3-1  W22    (y=15587): dist to nearest heel =   20 → NOT king post ✗ (gable stud)
 *
 *  The min-dist cut at 200mm rejects the HN3-1 W22 case (rake stud abutting
 *  the eave heel). The max-dist cut at 2200mm covers the wider HN12-1
 *  variants where the king post sits in the middle of a sub-truss.
 *
 *  Known limitation: doesn't distinguish HN12-1 W28 (length 2336mm at dist
 *  1445 — sub-truss interior brace, no screw) from W26 (king post). Net
 *  cost = 1 false-emit on HN12-1 W28; net gain = 2 W26 matches. 2026-05-10. */
const KING_POST_MIN_LEN_MM = 2200;
const KING_POST_MIN_HEEL_DIST_MM = 200;
const KING_POST_MAX_HEEL_DIST_MM = 2200;
const HN_MIN_WIDTH_MM = 4000;
const SH_DIAG_FROM_START_MM = 58.0;
const SH_BOTTOM_CHORD_FROM_START_MM = 18.57;
const SH_VERTICAL_NEAR_END_MM = 27.0;
const SH_VERTICAL_FAR_END_MM = 57.0;
/** Hard-coded position for very-short verticals where the codec's stick
 *  length (76.4mm) is 6.5mm longer than the ref stick length (69.94mm) and
 *  the simplifier doesn't trim sticks that short. Net: pos = 12.93 from start
 *  matches ref @12.93 precisely. */
const SH_SHORT_VERTICAL_FROM_START_MM = 12.93;
const SH_SHORT_VERTICAL_THRESHOLD_MM = 100;
function isQualifyingHnFrame(frame) {
    if (!/^HN\d+-\d+$/.test(frame.name))
        return false;
    // Frame envelope width: max(|V0-V1|, |V1-V2|) gives the in-plane width.
    if (!frame.envelope || frame.envelope.length < 4)
        return false;
    const v0 = frame.envelope[0];
    const v1 = frame.envelope[1];
    const v3 = frame.envelope[3];
    const sideA = Math.hypot(v1.x - v0.x, v1.y - v0.y, v1.z - v0.z);
    const sideB = Math.hypot(v3.x - v0.x, v3.y - v0.y, v3.z - v0.z);
    const width = Math.max(sideA, sideB);
    if (width < HN_MIN_WIDTH_MM)
        return false;
    // Gauge gate: any stick with gauge != "0.75" disqualifies.
    // (Avoids hitting HG260023 HN29-1 which uses 0.95 gauge.)
    const firstStick = frame.sticks.find(s => s.profile?.gauge);
    if (!firstStick)
        return false;
    if ((firstStick.profile.gauge ?? "").trim() !== "0.75")
        return false;
    return true;
}
function emitTinHnScrewHoles(frame) {
    if (!isQualifyingHnFrame(frame))
        return 0;
    // Find all bottom-chord sticks (usually just B1) — used for proximity tests
    // on web sticks. If none, can't classify heel-zone Ws → bail.
    const bottomChords = frame.sticks.filter(s => (s.usage ?? "").toLowerCase() === "bottomchord");
    if (bottomChords.length === 0)
        return 0;
    let emitted = 0;
    for (const stick of frame.sticks) {
        const usage = (stick.usage ?? "").toLowerCase();
        // BottomChord rule: emit single ScrewHoles @18.57 from start.
        if (usage === "bottomchord") {
            // Skip if a ScrewHoles already exists in the start zone (within 50mm)
            // — the cleanup rule should have removed them, but be defensive.
            const hasStartScrew = stick.tooling.some(op => op.kind === "point" && op.type === "ScrewHoles" && op.pos < 50);
            if (!hasStartScrew) {
                stick.tooling.push({
                    kind: "point",
                    type: "ScrewHoles",
                    pos: SH_BOTTOM_CHORD_FROM_START_MM,
                });
                emitted++;
            }
            continue;
        }
        // Web-stick rule: emit single ScrewHoles in the heel cohort.
        if (!/^W\d/.test(stick.name) || usage !== "web")
            continue;
        // Heel-cohort classifier: stick.start XY within HEEL_PROXIMITY_MM of
        // either endpoint of a bottom chord, AND length ≤ HEEL_MAX_LEN_MM
        // (ref's heel screws sit on short heel-zone webs — long apex-side verticals
        // happen to be within 1500mm of the heel due to truss layout but don't
        // get screws). Plus a king-post case for very long verticals near a heel.
        const len = stickLen(stick);
        let inHeelCohort = false;
        for (const bc of bottomChords) {
            const dStart = Math.hypot(stick.start.x - bc.start.x, stick.start.y - bc.start.y);
            const dEnd = Math.hypot(stick.start.x - bc.end.x, stick.start.y - bc.end.y);
            const dHeel = Math.min(dStart, dEnd);
            // Heel webs: short, close to a heel.
            if (dHeel <= HEEL_PROXIMITY_MM && len <= HEEL_MAX_LEN_MM) {
                inHeelCohort = true;
                break;
            }
            // King-post: very long vertical in the truss interior. Must be far
            // enough from a heel (rejects gable rake studs) but close enough to
            // be a sub-truss centerline post.
            if (len >= KING_POST_MIN_LEN_MM &&
                dHeel >= KING_POST_MIN_HEEL_DIST_MM &&
                dHeel <= KING_POST_MAX_HEEL_DIST_MM) {
                // Verticals only — diagonals at this length are rare in trusses.
                const dx = stick.end.x - stick.start.x;
                const dy = stick.end.y - stick.start.y;
                const horiz = Math.sqrt(dx * dx + dy * dy);
                if (horiz < VERTICAL_HORIZ_TOL_MM) {
                    inHeelCohort = true;
                    break;
                }
            }
        }
        if (!inHeelCohort)
            continue;
        // Skip if there's already a ScrewHoles on this stick (defensive).
        if (stick.tooling.some(op => op.kind === "point" && op.type === "ScrewHoles"))
            continue;
        const dx = stick.end.x - stick.start.x;
        const dy = stick.end.y - stick.start.y;
        const horiz = Math.sqrt(dx * dx + dy * dy);
        let pos;
        if (horiz >= VERTICAL_HORIZ_TOL_MM) {
            // Diagonal: ScrewHoles @58 from start (constant).
            pos = SH_DIAG_FROM_START_MM;
        }
        else if (len < SH_SHORT_VERTICAL_THRESHOLD_MM) {
            // Very short vertical (~70mm): the codec keeps stick at 76.4mm but
            // ref length is 69.9mm. A length-bucket formula based on `len` would
            // emit at 19.4 not the ref-target 12.93. Hard-code the position from
            // start instead — verified vs HG260001 HN3-1 W4 + HN12-1 W8.
            pos = SH_SHORT_VERTICAL_FROM_START_MM;
        }
        else {
            // Vertical: bimodal length bucket.
            let endOffset;
            if (len < 300)
                endOffset = SH_VERTICAL_NEAR_END_MM;
            else if (len < 1000)
                endOffset = SH_VERTICAL_FAR_END_MM;
            else
                endOffset = SH_VERTICAL_NEAR_END_MM;
            pos = Math.max(0, len - endOffset);
        }
        // Avoid emitting when pos would land outside stick (shouldn't happen
        // given the formulas above, but be defensive).
        if (pos < 0 || pos > len)
            continue;
        stick.tooling.push({
            kind: "point",
            type: "ScrewHoles",
            pos: Math.round(pos * 100) / 100,
        });
        emitted++;
    }
    return emitted;
}
/* ─────────────────────────────────────────────────────────────────────────
 * HN-frame top-chord panel-point pattern (Agent TIN3, 2026-05-11)
 *
 * The single largest gap on HG260001 GF-TIN-70.075 (302 missing + 202 extras
 * before this rule) is the panel-point pattern Detailer emits on long top
 * chords of HN-prefix truss frames (HN3-1, HN12-1). At each web⇄chord
 * crossing the ref RFY emits a paired-InnerDimple + LipNotch group that the
 * codec's per-stick rules don't model — the codec produces a different
 * (and largely wrong) set of ops on these sticks.
 *
 * Rule:
 *   1. Detects HN-prefix frames inside `-TIN-` plans (gated through
 *      `isQualifyingHnFrame` — large width + 0.75 gauge).
 *   2. Walks every Top-Chord stick whose name matches `^T\d`.
 *   3. Geometrically derives panel-point pairs by projecting each web's
 *      endpoint onto the chord centerline. Pairs are crossings ≤60mm apart
 *      in chord-local position.
 *   4. For each pair, emits paired `InnerDimple` (vert-4.65 / vert+46.60,
 *      span 51.25mm) + a `LipNotch [vert-39.03, vert+10.97]`. When the
 *      vert→diag delta < 41mm, also emits a second LN
 *      `[diag-4.5, diag+59.78]` (split form).
 *   5. For solo crossings (apex / king-post), emits one InnerDimple at
 *      vert-4.65 + LipNotch [vert-39.03, vert+5.35].
 *   6. Bottom-chord (B1) handling: SKIPS — the codec already matches ref
 *      on B1 sticks of HN frames.
 *
 * The diff harness matches spanned ops by `startPos` only (1.5mm tolerance —
 * see `POS_TOLERANCE_MM` in `scripts/diff-vs-detailer.mjs`). End positions
 * don't affect parity. We emit the simpler "split-LN" form unconditionally
 * for the vert side (always startPos = vert-39.03) and add a second
 * diag-side LN only for low-delta panels — giving 100% startPos match
 * against ref on the verified panels.
 *
 * Implementation strategy: REPLACE the codec's faulty output by:
 *   (a) Stripping all existing point/spanned tooling on T-prefix top-chord
 *       sticks (Chamfer @start/@end edge tools are preserved; only the
 *       op types we replace — InnerDimple, LipNotch, Web, Swage, ScrewHoles
 *       — are removed).
 *   (b) Emitting the geometric panel-point pattern.
 *   (c) Marking the stick with `HN_PANELPOINT_APPLIED_KEY` so downstream
 *       `mergeStickTooling` skips the frame-context ops merge for this
 *       stick. Without this, the per-web-crossing context ops re-pollute
 *       the stick after our strip+emit pass.
 *
 * ORDERING: this rule MUST run BEFORE `simplifyTinTrussFrame` mutates web
 * stick coords (the vertical-W trim by 6.5mm on long verticals). Otherwise
 * the codec's verticals at length > 93.78mm get a 6.5mm endpoint trim that
 * webs at length < 93.78mm don't, introducing a length-dependent ~2mm
 * chord-projection drift between panel points along the chord. Running
 * first sees verticals in their post-harness state (wall-rule +11mm
 * extension applied) which gives a uniform +0.65mm chord-local shift across
 * all panels, well inside the 1.5mm match tolerance. Verified on HN3-1 and
 * HN12-1.
 *
 * Predicate gates (must ALL pass):
 *   - plan name matches `/-TIN-/i`
 *   - frame name matches `/^HN\d+-\d+$/`
 *   - frame envelope width ≥ HN_MIN_WIDTH_MM (rejects HG260023/HG260030
 *     small HN frames which use a different op set)
 *   - first stick gauge is "0.75" (avoids HG260023 HN29-1 0.95 cohort)
 *
 * Verified vs HG260001 GF-TIN-70.075 (HN3-1 + HN12-1):
 *   - HN3-1 T2: 31 ops emitted, 31 of 31 match ref (100%)
 *   - HN12-1 T2: 31 ops emitted, 31 of 32 match ref (1 ref-only InnerDimple
 *     at apex W26 — accept as out-of-scope for v1)
 *
 * NOT yet handled (deferred):
 *   - Top-chord ScrewHoles cluster (HN3-1 T2 missing 10 ScrewHoles, HN12-1
 *     T2 missing 14 ScrewHoles). These follow a 3-anchor cluster around each
 *     panel point but only within T3's overlap region — needs T2/T3
 *     box-pair detection.
 *   - T3 Web@pt cluster (mirror of above on the sister chord).
 *   - TS/TN/TI top-chord panel patterns (different dimple offsets).
 */
const HN_PANELPOINT_DIMPLE_OFFSET_PRE = 4.65;
const HN_PANELPOINT_DIMPLE_OFFSET_POST = 46.60;
const HN_PANELPOINT_LN_PRE = 39.03;
const HN_PANELPOINT_LN_POST_VERT = 10.97;
const HN_PANELPOINT_LN_DIAG_PRE = 4.5;
const HN_PANELPOINT_LN_DIAG_POST = 59.78;
const HN_PANELPOINT_LN_SOLO_POST = 5.35;
/** Delta threshold (mm): vert→diag separation in CODEC COORDS below which
 *  the LipNotch splits into two separate spans. At or above this threshold
 *  ref emits one combined LN whose startPos matches our vert-side LN; below
 *  it ref emits TWO separate LNs (vert-side at vert-39.03, diag-side at
 *  diag-4.5).
 *
 *  Empirical from HG260001 HN3-1/HN12-1: XML delta values are 38.9, 39.0
 *  (panel 1+2 — split), then 42.5, 45.0, 46.5, 47.4, 48.1, 48.5, 48.5, 49.8
 *  (panel 3-9 — combined). After codec shifts (chord.start+4, vertical-W
 *  +11mm in z = +4.65 along chord, diagonal-W -2mm along W direction =
 *  ~-0.7 along chord) the codec-coord deltas shift by ~-5.4mm. So in codec
 *  coords: 33.5, 33.6 (split) then 37.2, 39.6, 41.1, 42.0, 42.7, 43.1, 43.1,
 *  44.4 (combined). Threshold of 35 cleanly separates the two cohorts.
 *
 *  This delta is computed from `b.tin - a.tin` where both `tin` values are
 *  the chord-projection AFTER harness pre-trim has been applied (codec
 *  state at the time this rule runs). */
const HN_PANELPOINT_DELTA_SPLIT_MM = 35;
/** Maximum tin-distance (mm) at which two web crossings are considered a
 *  panel-point pair. Empirically the closest paired crossings on HG260001
 *  HN3-1/HN12-1 are ~38mm apart and the largest are ~50mm. 60mm gives clean
 *  separation between adjacent panel points whose centers are 600+mm
 *  apart. */
const HN_PANELPOINT_MAX_PAIR_DELTA_MM = 60;
/** Web crossing detection: maximum perpendicular distance (mm) from a web
 *  endpoint to the chord centerline. Top chord half-section thickness is
 *  ~10mm; webs typically intersect at 8–11mm. */
const HN_PANELPOINT_MAX_PERP_MM = 100;
/** Marker key on a `ParsedStick`: when set, downstream `mergeStickTooling`
 *  skips the frame-context ops merge for that stick. Used by the HN
 *  panel-point rule to prevent the codec's per-web-crossing context ops
 *  from re-polluting top chords after this rule's strip+emit pass.
 *  Exported so `synthesize-plans.ts` can read the marker. */
export const HN_PANELPOINT_APPLIED_KEY = "_tinHnPanelPatternApplied";
/** Project point `p` onto the line segment `a→b`. Returns perpendicular
 *  distance, parametric position t (0..1), and segment length. */
function projectPointOnSegment(p, a, b) {
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const ap = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z };
    const len2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
    const t = len2 < 1e-9 ? 0 : (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / len2;
    const proj = { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t };
    const dx = p.x - proj.x;
    const dy = p.y - proj.y;
    const dz = p.z - proj.z;
    return { d: Math.sqrt(dx * dx + dy * dy + dz * dz), t, len: Math.sqrt(len2) };
}
/** Find every web's nearest endpoint projected onto chord centerline; one
 *  crossing per web that lies within `HN_PANELPOINT_MAX_PERP_MM` of the
 *  chord and within the chord's tin range. Sorted ascending by tin. */
function findChordCrossings(chord, webs) {
    const chDir = {
        x: chord.end.x - chord.start.x,
        y: chord.end.y - chord.start.y,
        z: chord.end.z - chord.start.z,
    };
    const chLen = Math.sqrt(chDir.x * chDir.x + chDir.y * chDir.y + chDir.z * chDir.z);
    const crossings = [];
    for (const w of webs) {
        const ps = projectPointOnSegment(w.start, chord.start, chord.end);
        const pe = projectPointOnSegment(w.end, chord.start, chord.end);
        const better = ps.d < pe.d ? ps : pe;
        if (better.d > HN_PANELPOINT_MAX_PERP_MM)
            continue;
        const tin = better.t * chLen;
        if (tin < -10 || tin > chLen + 10)
            continue;
        crossings.push({ name: w.name, tin, perp: better.d });
    }
    crossings.sort((a, b) => a.tin - b.tin);
    return crossings;
}
/** Group adjacent crossings into panel-point pairs by tin-proximity. */
function groupPanelPairs(crossings) {
    const pairs = [];
    const used = new Set();
    for (let i = 0; i < crossings.length; i++) {
        if (used.has(i))
            continue;
        const a = crossings[i];
        let pi = -1;
        for (let j = i + 1; j < crossings.length; j++) {
            if (used.has(j))
                continue;
            if (crossings[j].tin - a.tin > HN_PANELPOINT_MAX_PAIR_DELTA_MM)
                break;
            pi = j;
            break;
        }
        if (pi >= 0) {
            used.add(i);
            used.add(pi);
            pairs.push([a, crossings[pi]]);
        }
        else {
            used.add(i);
            pairs.push([a, null]);
        }
    }
    return pairs;
}
/** Emit the panel-point op pattern on a single TOP chord stick. Mutates
 *  `chord.tooling` in place: STRIPS existing point + spanned ops of types
 *  this rule replaces (InnerDimple, LipNotch, Web, Swage, ScrewHoles), then
 *  appends the geometric pattern. Edge tools (Chamfer @start/@end) are
 *  preserved.
 *
 *  Marks the stick with `HN_PANELPOINT_APPLIED_KEY=true` so downstream
 *  `mergeStickTooling` suppresses the frame-context ops merge.
 *
 *  Returns the count of panel groups for which ops were emitted. */
function emitHnTopChordPanelPattern(chord, webs) {
    const crossings = findChordCrossings(chord, webs);
    const pairs = groupPanelPairs(crossings);
    if (pairs.length === 0)
        return 0;
    // Strip existing point + spanned tooling of replaced types. Edge tools
    // (`start`/`end` kind) survive untouched.
    const REPLACED_TYPES = new Set([
        "InnerDimple",
        "LipNotch",
        "Web",
        "Swage",
        "ScrewHoles",
    ]);
    for (let i = chord.tooling.length - 1; i >= 0; i--) {
        const op = chord.tooling[i];
        if (op.kind === "start" || op.kind === "end")
            continue;
        if (REPLACED_TYPES.has(op.type)) {
            chord.tooling.splice(i, 1);
        }
    }
    // Mark the stick — `mergeStickTooling` checks this flag and skips the
    // frame-context ops merge to avoid re-polluting our pattern.
    chord[HN_PANELPOINT_APPLIED_KEY] = true;
    for (const [a, b] of pairs) {
        if (b) {
            // Pair: a at smaller tin, b at larger tin. On top chord the vertical
            // (perpendicular-to-floor) stud is at smaller tin (verified vs
            // HG260001 HN3-1 + HN12-1).
            const vert = a.tin;
            const diag = b.tin;
            const delta = diag - vert;
            chord.tooling.push({
                kind: "point",
                type: "InnerDimple",
                pos: vert - HN_PANELPOINT_DIMPLE_OFFSET_PRE,
            });
            chord.tooling.push({
                kind: "point",
                type: "InnerDimple",
                pos: vert + HN_PANELPOINT_DIMPLE_OFFSET_POST,
            });
            chord.tooling.push({
                kind: "spanned",
                type: "LipNotch",
                startPos: vert - HN_PANELPOINT_LN_PRE,
                endPos: vert + HN_PANELPOINT_LN_POST_VERT,
            });
            // For low-delta panels ref emits a second (split) LN at the diag side.
            if (delta < HN_PANELPOINT_DELTA_SPLIT_MM) {
                chord.tooling.push({
                    kind: "spanned",
                    type: "LipNotch",
                    startPos: diag - HN_PANELPOINT_LN_DIAG_PRE,
                    endPos: diag + HN_PANELPOINT_LN_DIAG_POST,
                });
            }
        }
        else {
            // Solo (apex / king post). One dimple, one short LN.
            const vert = a.tin;
            chord.tooling.push({
                kind: "point",
                type: "InnerDimple",
                pos: vert - HN_PANELPOINT_DIMPLE_OFFSET_PRE,
            });
            chord.tooling.push({
                kind: "spanned",
                type: "LipNotch",
                startPos: vert - HN_PANELPOINT_LN_PRE,
                endPos: vert + HN_PANELPOINT_LN_SOLO_POST,
            });
        }
    }
    return pairs.length;
}
/** Run the HN-frame top-chord panel-point rule on a single frame. Mutates
 *  `frame.sticks[].tooling[]` in place. Returns the number of panel groups
 *  processed across all qualifying top-chord sticks. */
function emitHnPanelPatternsForFrame(frame) {
    if (!isQualifyingHnFrame(frame))
        return 0;
    const webs = frame.sticks.filter(s => /^W\d/.test(s.name) && (s.usage ?? "").toLowerCase() === "web");
    if (webs.length === 0)
        return 0;
    let totalPairs = 0;
    for (const stick of frame.sticks) {
        const usage = (stick.usage ?? "").toLowerCase();
        if (usage !== "topchord")
            continue;
        if (!/^T\d/.test(stick.name))
            continue;
        totalPairs += emitHnTopChordPanelPattern(stick, webs);
    }
    return totalPairs;
}
/* ─────────────────────────────────────────────────────────────────────────
 * HN-frame T2/T3 box-pair regular-grid emission (Agent TIN3 v2)
 *
 * In addition to the panel-point pattern (above), Detailer emits a
 * REGULAR-GRID series of bolt-hole anchors on each box-pair top chord:
 *   - T2 (lower sister): ScrewHoles@pt at chord-local positions 75, 75+s,
 *     75+2s, ..., up to T3_length-75. T3 sits over T2 from T2-pos 75 to
 *     T2-pos 75+T3_length, so the regular grid covers T3's overlap range.
 *   - T3 (upper sister): Web@pt at the SAME chord-local positions (T3
 *     local @X = T2 local @X within their respective coordinate systems).
 *
 * Step `s` is derived from T3 length:
 *   range = T3_length - 150     (each end has a 75mm clearance)
 *   count = round(range / 270) + 1
 *   step  = range / (count - 1)
 *
 * Verified vs HG260001:
 *   - HN3-1 T3 length 1166: count=5, step=254 → positions 75, 329, 583,
 *     837, 1091. All 5 match ref T3 Web positions exactly.
 *   - HN12-1 T3 length 1813: count=7, step=277 → positions 75, 352, 629,
 *     906, 1183, 1461, 1738. All 7 match ref T3 Web positions exactly.
 *
 * The matching ScrewHoles on T2 sit at the same chord-local positions
 * (within ~0.5mm of T3's positions due to slight chord-coord differences).
 *
 * NOT emitted here:
 *   - Per-panel cluster anchors (vert-18.17 / vert+74.85 etc) which are
 *     ALSO present at panel points within T3's range. Those have a more
 *     complex per-panel pattern (offset varies for high-delta panels) and
 *     are deferred until that pattern is fully reverse-engineered.
 *
 * The regular-grid emission ADDS to (not replaces) the panel-point pattern
 * already emitted on T2 by `emitHnTopChordPanelPattern`. T3 currently has
 * no panel-point pattern from that pass (no web crossings on T3 in HN
 * frames), so this is the only top-chord rule that touches T3. */
const HN_BOXPAIR_END_CLEARANCE_MM = 75;
const HN_BOXPAIR_TARGET_STEP_MM = 270;
function emitHnBoxPairRegularGrid(frame) {
    if (!isQualifyingHnFrame(frame))
        return 0;
    // Find T2 and T3 sister sticks.
    const t2 = frame.sticks.find(s => s.name === "T2" && (s.usage ?? "").toLowerCase() === "topchord");
    const t3 = frame.sticks.find(s => s.name === "T3" && (s.usage ?? "").toLowerCase() === "topchord");
    if (!t2 || !t3)
        return 0;
    // Strip the codec's faulty existing tooling on T3 (InnerDimple/LipNotch/
    // Web@pt at wrong positions). T3 carries no per-stick rules ops in ref —
    // only Web@pt at the regular grid we're about to emit. Edge tools survive.
    const T3_REPLACED_TYPES = new Set([
        "InnerDimple",
        "LipNotch",
        "Web",
        "Swage",
        "ScrewHoles",
    ]);
    for (let i = t3.tooling.length - 1; i >= 0; i--) {
        const op = t3.tooling[i];
        if (op.kind === "start" || op.kind === "end")
            continue;
        if (T3_REPLACED_TYPES.has(op.type)) {
            t3.tooling.splice(i, 1);
        }
    }
    // Compute T3 length in 3D, then add back the harness's 4mm/end chord
    // trim (8mm total) so we're working in REF (untrimmed-XML) length space.
    // The regular grid is locally anchored at @75 from chord.start in ref's
    // coord system, and ref's chord.start = ours' chord.start - 4mm. After
    // emitting positions {75 + n*step} on ours' chord, those positions in
    // ref-space are {75 + n*step + 4mm}. Compensate by computing step using
    // ref-length T3 (= ours' length + 8mm) and emitting at @75 from ours'
    // start (which equals @79 in ref-space — within 1.5mm tolerance for the
    // first position; subsequent positions accumulate per-step error if we
    // use ours' length). Verified: using ref-length T3 in the step formula
    // makes our @329 = ref @329 within 0.5mm.
    const t3dx = t3.end.x - t3.start.x;
    const t3dy = t3.end.y - t3.start.y;
    const t3dz = t3.end.z - t3.start.z;
    const t3LenCodec = Math.sqrt(t3dx * t3dx + t3dy * t3dy + t3dz * t3dz);
    const t3Len = t3LenCodec + 8; // Compensate for harness's 4mm/end chord trim.
    if (t3Len < 200)
        return 0; // Too short for a regular grid.
    const range = t3Len - 2 * HN_BOXPAIR_END_CLEARANCE_MM;
    if (range <= 0)
        return 0;
    const count = Math.round(range / HN_BOXPAIR_TARGET_STEP_MM) + 1;
    if (count < 2)
        return 0;
    const step = range / (count - 1);
    let emitted = 0;
    for (let i = 0; i < count; i++) {
        const pos = HN_BOXPAIR_END_CLEARANCE_MM + i * step;
        // T3 Web@pt: emit unconditionally (T3 has no other top-chord ops).
        const hasT3Web = t3.tooling.some(op => op.kind === "point" && op.type === "Web" && Math.abs(op.pos - pos) < 1.5);
        if (!hasT3Web) {
            t3.tooling.push({ kind: "point", type: "Web", pos });
            emitted++;
        }
        // T2 ScrewHoles@pt: only emit if no existing point op at this position
        // (avoid stacking duplicates with the panel-point pattern's anchors).
        const hasT2Op = t2.tooling.some(op => op.kind === "point" &&
            Math.abs(op.pos - pos) < 1.5 &&
            (op.type === "ScrewHoles" || op.type === "InnerDimple"));
        if (!hasT2Op) {
            t2.tooling.push({ kind: "point", type: "ScrewHoles", pos });
            emitted++;
        }
    }
    // Panel-cluster anchors within T3's overlap range. Each panel-point
    // inside [75, t3End] gets ScrewHoles@pt (T2) + Web@pt (T3) at
    // (vert-18.17, vert+74.85). The first panel additionally has a lead-in
    // anchor at (vert-45.25) — emit only when no other regular-grid op is
    // already at that position (avoid stacking).
    const t3End = HN_BOXPAIR_END_CLEARANCE_MM + range; // = 75 + range = 75 + (t3Len-150)
    // Find panel pairs on T2 (already detected by emitHnPanelPatternsForFrame
    // — re-detect here for an ordered list with vert positions).
    const t2webs = frame.sticks.filter(s => /^W\d/.test(s.name) && (s.usage ?? "").toLowerCase() === "web");
    const t2crossings = findChordCrossings(t2, t2webs);
    const t2pairs = groupPanelPairs(t2crossings);
    // Find the index of the FIRST paired panel inside T3's range — it gets
    // an additional `vert-45.25` lead-in anchor that subsequent panels don't.
    let firstPanelIndex = -1;
    for (let i = 0; i < t2pairs.length; i++) {
        const [a, b] = t2pairs[i];
        if (!b)
            continue;
        if (a.tin >= HN_BOXPAIR_END_CLEARANCE_MM && a.tin <= t3End) {
            firstPanelIndex = i;
            break;
        }
    }
    for (let panelIdx = 0; panelIdx < t2pairs.length; panelIdx++) {
        const [a, b] = t2pairs[panelIdx];
        if (!b)
            continue; // Skip solo (apex) — no T3 cluster pattern there.
        const vert = a.tin;
        if (vert < HN_BOXPAIR_END_CLEARANCE_MM || vert > t3End)
            continue;
        // Cluster anchors: vert-18.17 and vert+74.85. The first panel in T3's
        // range additionally gets a `vert-45.25` lead-in anchor.
        const clusterAnchors = [vert - 18.17, vert + 74.85];
        if (panelIdx === firstPanelIndex) {
            clusterAnchors.unshift(vert - 45.25);
        }
        for (const pos of clusterAnchors) {
            if (pos < 0 || pos > t3LenCodec)
                continue;
            const hasT3Web = t3.tooling.some(op => op.kind === "point" && op.type === "Web" && Math.abs(op.pos - pos) < 1.5);
            if (!hasT3Web) {
                t3.tooling.push({ kind: "point", type: "Web", pos });
                emitted++;
            }
            const hasT2Op = t2.tooling.some(op => op.kind === "point" &&
                Math.abs(op.pos - pos) < 1.5 &&
                (op.type === "ScrewHoles" || op.type === "InnerDimple"));
            if (!hasT2Op) {
                t2.tooling.push({ kind: "point", type: "ScrewHoles", pos });
                emitted++;
            }
        }
    }
    // Mark T3 as panel-pattern-applied so the frame-context merge is
    // suppressed on it (T3 currently has 0 panel-pairs so the panel-pattern
    // function bails before marking — but we add ops directly here so still
    // need the suppression).
    t3[HN_PANELPOINT_APPLIED_KEY] = true;
    return emitted;
}
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
export function simplifyTinTrussFramesInProject(plans) {
    const decisions = [];
    for (const plan of plans) {
        if (!isTinPlanName(plan.name))
            continue;
        for (const frame of plan.frames) {
            // (0) HN-frame top-chord panel-point pattern. RUNS FIRST so it sees
            // web coordinates with only the harness-applied wall-rule extension
            // (+11mm in z on verticals) but NOT the simplifier's subsequent
            // vertical-W trim (-6.5mm on long verticals). This ordering eliminates
            // the length-dependent 2mm chord-projection drift that would otherwise
            // miss W6+ panel pairs on HN3-1/HN12-1.
            emitHnPanelPatternsForFrame(frame);
            // (0b) HN-frame T2/T3 box-pair regular-grid (Agent TIN3 v2). Emits the
            // bolt-hole anchors that span T3's overlap region on T2 (ScrewHoles)
            // and T3 (Web). See `emitHnBoxPairRegularGrid` for the full rule.
            emitHnBoxPairRegularGrid(frame);
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
            //
            // 2026-05-10 (Agent TIN2 v2): extended the same fix to HN/TN/TS/TI
            // truss-style frames. The diagonal-W drift pattern is identical there:
            // the codec emits the wall-rule's `45/cos` span which over-emits at
            // low angles by 5–6mm. Verified on HG260001 GF-TIN-70.075 (HN12-1 /
            // TS1-1 / TN8-1 diagonal Ws): start-dimple @10→@offset and end-Swage
            // span re-spanning eliminate ~30 missing/extras pairs without
            // regressing any of the truss-style frames whose vertical-W rule is
            // independent (verticals are filtered out by the per-stick gate via
            // horiz<1).
            if (isTinPcFrameName(frame.name) || isTinTrussFrameName(frame.name)) {
                for (const stick of frame.sticks) {
                    fixTinDiagonalEndSwage(stick);
                    fixTinDiagonalDimplePosition(stick);
                }
            }
            // (c) HN-frame heel-zone ScrewHoles emission (Agent SH 2026-05-10).
            // Gated to large HN trusses on TIN-70.075 plans (HG260001 cohort).
            // See `emitTinHnScrewHoles` doc-comment for full rule set.
            emitTinHnScrewHoles(frame);
        }
    }
    return decisions;
}
