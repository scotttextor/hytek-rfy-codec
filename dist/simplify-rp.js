/** True iff the plan name marks this as a Roof-Panel (Reversed-Tooling) plan.
 *  Matches `-RP-` anywhere in the plan name (e.g. PK1-GF-RP-89.075).
 *  Cross-checked against TIN/TB2B detection in src/csv.ts:332 — RP plans are
 *  disjoint from those. */
export function isRpPlanName(planName) {
    return /(?:^|-)RP(?:-|$|\d)/i.test(planName);
}
/** Extract the alpha prefix from a stick name (e.g. "S1" → "S", "Kb1" → "Kb"). */
function rolePrefix(stickName) {
    return stickName.replace(/[0-9_].*$/, "");
}
/** Decide if this stick is a HORIZONTAL CONTINUOUS member under Reversed
 *  Tooling. Detection is by role prefix only — RP plans use the same role
 *  conventions as walls (T=top plate, B=bottom plate, N=nog) and the role
 *  prefix carries the IN-FRAME orientation correctly even when the frame
 *  itself is a sloped panel-roof rake (where world-space orientation is
 *  meaningless because the frame plane is tilted). Verified empirically:
 *  in HG260001 GF-RP R1, S1 has world-space horizontal extent 1494mm
 *  vs vertical 697mm because the rake plane is sloped — but in the frame's
 *  own elevation S1 is a vertical stud. */
function isHorizontalContinuous(stick) {
    const role = rolePrefix(stick.name);
    return /^(T|Tp|B|Bp|Bh|N|Nog)$/i.test(role);
}
/** Test whether a plate is actually SLOPED (rake plate / roof-pitch member).
 *  Per Scott's Rule 7 (2026-05-07): in RP plans, only the top-of-slope and
 *  bottom-of-slope plates are special. Most "RP" frames are actually horizontal
 *  panel-roof walls where T1 + B1 + N1 are simple horizontal members and
 *  should keep STANDARD wall-stud caps (Swage/LipNotch 0..39 + ID@16.5).
 *
 *  A plate is sloped when its end-z differs from start-z by > 50mm. Verified
 *  vs HG260012 GF-RP test corpus: most RP frames have horizontal plates
 *  (z-extent < 5mm) where Detailer ref emits STANDARD wall caps, NOT chord-style.
 *  The previous unconditional rewrite was over-applying chord-style and causing
 *  ~67% of RP ops to mismatch.
 */
function isSlopedPlate(stick) {
    const dz = Math.abs(stick.end.z - stick.start.z);
    return dz > 50;
}
/** Decide if this stick is a VERTICAL NOTCHED member under Reversed Tooling.
 *  Same role-only detection rationale as `isHorizontalContinuous`. */
function isVerticalNotched(stick) {
    const role = rolePrefix(stick.name);
    return /^(S|J)$/i.test(role);
}
/** Tolerance (mm) within which a spanned op is considered to be the
 *  end-cap span (anchored at startPos≈0 or endPos≈stickLength). */
const END_ANCHOR_TOL_MM = 1.0;
/** Tolerance (mm) within which a point op is considered to be at the
 *  end-anchored offset (e.g. ID @16.5, or ID @(L-16.5)). */
const POINT_ANCHOR_TOL_MM = 1.0;
/** Standard wall-stud start span (Swage 0..39) emitted by the codec's
 *  generic per-stick rule. We strip this on RP horizontals to avoid
 *  double-emitting at the start. */
const STD_END_SPAN_MM = 39;
/** Standard wall-stud start dimple offset (16.5 mm). The Reversed-Tooling
 *  end-cap pattern uses 10mm instead. */
const STD_DIMPLE_OFFSET_MM = 16.5;
/** RP horizontal end-cap dimple offset (10 mm — chord-style cap). */
const RP_HORIZONTAL_DIMPLE_OFFSET_MM = 10;
/** RP vertical NOTCHED start-cap dimple offset (78.5 mm) — InnerDimple
 *  centred at 78.5mm = 16.5mm wall offset + 62mm horizontal-plate clearance.
 *  62mm = 70mm web - 8mm tab clearance. */
const RP_STUD_START_DIMPLE_OFFSET_MM = 78.5;
/** RP vertical NOTCHED start-cap span — Swage|LipNotch from 56..101 mm
 *  (45mm-wide tool, centred on the 78.5mm dimple). */
const RP_STUD_START_SPAN_LO_MM = 56;
const RP_STUD_START_SPAN_HI_MM = 101;
/** Compute stick centerline length from world coords. The codec's per-stick
 *  rule emits ops anchored to this length (e.g. end-Swage at L-39). */
function computeStickLength(stick) {
    const dx = stick.end.x - stick.start.x;
    const dy = stick.end.y - stick.start.y;
    const dz = stick.end.z - stick.start.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
/** Strip start-anchored ops the standard wall rule emits on every stud / plate:
 *    {Swage|LipNotch} 0..39  +  InnerDimple @16.5
 *  Returns the number of ops removed (mostly used for diagnostics).
 *  We accept BOTH Swage and LipNotch since `table.ts` emits Swage on stud
 *  roles (S/J) and LipNotch on plate roles (T/Tp/B/Bp/Bh/N). */
function stripStandardStartCap(tooling) {
    let removed = 0;
    for (let i = tooling.length - 1; i >= 0; i--) {
        const op = tooling[i];
        if (op.kind === "spanned"
            && (op.type === "Swage" || op.type === "LipNotch")
            && Math.abs(op.startPos - 0) < END_ANCHOR_TOL_MM
            && Math.abs(op.endPos - STD_END_SPAN_MM) < END_ANCHOR_TOL_MM) {
            tooling.splice(i, 1);
            removed++;
            continue;
        }
        if (op.kind === "point"
            && op.type === "InnerDimple"
            && Math.abs(op.pos - STD_DIMPLE_OFFSET_MM) < POINT_ANCHOR_TOL_MM) {
            tooling.splice(i, 1);
            removed++;
            continue;
        }
    }
    return removed;
}
/** Strip end-anchored ops the standard wall rule emits on every stud / plate:
 *    {Swage|LipNotch} (L-39)..L  +  InnerDimple @(L-16.5)
 *  Returns the number of ops removed. */
function stripStandardEndCap(tooling, stickLen) {
    let removed = 0;
    for (let i = tooling.length - 1; i >= 0; i--) {
        const op = tooling[i];
        if (op.kind === "spanned"
            && (op.type === "Swage" || op.type === "LipNotch")
            && Math.abs(op.endPos - stickLen) < END_ANCHOR_TOL_MM
            && Math.abs((op.endPos - op.startPos) - STD_END_SPAN_MM) < END_ANCHOR_TOL_MM) {
            tooling.splice(i, 1);
            removed++;
            continue;
        }
        if (op.kind === "point"
            && op.type === "InnerDimple"
            && Math.abs(op.pos - (stickLen - STD_DIMPLE_OFFSET_MM)) < POINT_ANCHOR_TOL_MM) {
            tooling.splice(i, 1);
            removed++;
            continue;
        }
    }
    return removed;
}
/** Replace the codec's standard wall-stud end-caps on a horizontal-continuous
 *  RP stick with chord-style caps:
 *
 *    OUT:  Swage 0..39       (start)              IN:  Chamfer @start
 *          InnerDimple @16.5 (start)                   InnerDimple @10
 *          Swage (L-39)..L   (end)                     Chamfer @end
 *          InnerDimple @(L-16.5) (end)                 InnerDimple @(L-10)
 *
 *  The body-side ops (LipNotch + InnerDimple at stud crossings) are emitted
 *  by frame-context.ts and we leave them alone — the corpus shows those
 *  positions are usually correct; only the *very ends* are wrong. */
function applyHorizontalCaps(stick) {
    const stickLen = computeStickLength(stick);
    let modified = false;
    const removedStart = stripStandardStartCap(stick.tooling);
    const removedEnd = stripStandardEndCap(stick.tooling, stickLen);
    if (removedStart > 0 || removedEnd > 0)
        modified = true;
    // Insert chord-style end-caps. Always emit both ends — the codec's standard
    // rule did the same (symmetric cap). We use the actual stick length from
    // the codec's geometry, not a corpus-derived L_ref, because the codec's
    // length is what the downstream RFY encoder will write to disk.
    stick.tooling.push({ kind: "start", type: "Chamfer" }, { kind: "point", type: "InnerDimple", pos: RP_HORIZONTAL_DIMPLE_OFFSET_MM }, { kind: "point", type: "InnerDimple", pos: stickLen - RP_HORIZONTAL_DIMPLE_OFFSET_MM }, { kind: "end", type: "Chamfer" });
    modified = true;
    return modified;
}
/** Replace the codec's standard wall-stud start-cap on a vertical-notched
 *  RP stick with the plate-over-plate notch pattern:
 *
 *    OUT:  Swage 0..39      (start)        IN:  Swage 56..101     (start)
 *          InnerDimple @16.5 (start)            InnerDimple @78.5 (start)
 *
 *  End-side ops are NOT touched here (handled by the chamfer pass in the
 *  next stage).
 *
 *  Tool choice — Swage vs LipNotch — depends on which of the two C-section
 *  lip orientations the stud has. We don't have access to per-stud lip
 *  orientation here, so we pick the cross-corpus majority (Swage 78 vs
 *  LipNotch 38 across HG260001+HG260044) by default. The minority cases
 *  produce a "Swage 56..101 vs LipNotch 56..101" mismatch — same span, same
 *  position, different tool. That's still a 1-op miss (vs the previous
 *  ~3-op miss for the standard wall caps), so net positive. */
function applyStudStartCap(stick) {
    const removed = stripStandardStartCap(stick.tooling);
    // Insert RP plate-over-plate notch at start.
    stick.tooling.push({ kind: "spanned", type: "Swage", startPos: RP_STUD_START_SPAN_LO_MM, endPos: RP_STUD_START_SPAN_HI_MM }, { kind: "point", type: "InnerDimple", pos: RP_STUD_START_DIMPLE_OFFSET_MM });
    return removed > 0;
}
/** Add Chamfer @end on a vertical-notched RP stud (the rake-end cut where
 *  the stud meets the sloped chord). Cross-corpus evidence: 51 missing
 *  Chamfer @end on HG260001 RP studs + 75 on HG260044 RP studs (126 total)
 *  vs only 26+0 emitted as extras. The previous diff harness post-decode
 *  patch (`scripts/diff-vs-detailer.mjs:2161`) stripped Chamfer from every
 *  S stud unconditionally — that patch was based on HG260012 alone and is
 *  now overzealous. We emit Chamfer @end here and the harness patch is
 *  loosened in the same commit so emissions survive the round-trip. */
function applyStudEndChamfer(stick) {
    // Don't double-emit if the codec or another simplifier already added it.
    for (const op of stick.tooling) {
        if (op.kind === "end" && op.type === "Chamfer")
            return false;
    }
    stick.tooling.push({ kind: "end", type: "Chamfer" });
    return true;
}
/** Run the RP Reversed-Tooling simplifier on a single frame.  Mutates
 *  `frame.sticks[].tooling[]` in place.  Caller is responsible for the
 *  plan-name gate; this function blindly applies the rewrite when called.
 *
 *  Per Scott's Rule 7 (2026-05-07): only SLOPED plates (top-of-slope or
 *  bottom-of-slope rake plates) get the chord-style cap rewrite. Horizontal
 *  RP plates (the dominant case in the HG260001/HG260012 corpora) keep the
 *  standard wall-stud caps from `table.ts`. Likewise, only VERTICAL studs
 *  that meet a sloped plate at one end get the plate-over-plate notch start
 *  cap; horizontal-RP studs that meet two horizontal plates on a normal
 *  wall structure keep their standard wall caps.
 */
export function simplifyRpFrame(frame) {
    const horizontalsRewritten = [];
    const studStartsRewritten = [];
    const studEndsChamfered = [];
    // Scott Rule 7: detect whether THIS frame contains any sloped plates.
    // If no plate in the frame is sloped, the frame is a horizontal panel-roof
    // wall and the chord-style/plate-over-plate cap rewrites should NOT apply.
    // Verified vs HG260012 GF-RP frames: the bulk are horizontal panel-roof
    // walls where standard wall caps match Detailer ref exactly.
    const frameHasSlopedPlate = frame.sticks.some((s) => isHorizontalContinuous(s) && isSlopedPlate(s));
    if (!frameHasSlopedPlate) {
        return {
            frame: frame.name,
            decision: "SKIP",
            reason: "no sloped plates — frame is horizontal panel-roof wall, keep standard caps",
        };
    }
    for (const stick of frame.sticks) {
        if (isHorizontalContinuous(stick)) {
            // Per-plate gate: only sloped plates get chord-style caps.
            if (!isSlopedPlate(stick))
                continue;
            if (applyHorizontalCaps(stick)) {
                horizontalsRewritten.push(stick.name);
            }
        }
        else if (isVerticalNotched(stick)) {
            applyStudStartCap(stick);
            studStartsRewritten.push(stick.name);
            if (applyStudEndChamfer(stick)) {
                studEndsChamfered.push(stick.name);
            }
        }
    }
    if (horizontalsRewritten.length === 0
        && studStartsRewritten.length === 0
        && studEndsChamfered.length === 0) {
        return { frame: frame.name, decision: "SKIP", reason: "no rewriteable sticks found" };
    }
    return {
        frame: frame.name,
        decision: "APPLY",
        reason: `${horizontalsRewritten.length} horizontals rewritten, ` +
            `${studStartsRewritten.length} stud starts rewritten, ` +
            `${studEndsChamfered.length} stud ends chamfered`,
        ...(horizontalsRewritten.length ? { horizontalsRewritten } : {}),
        ...(studStartsRewritten.length ? { studStartsRewritten } : {}),
        ...(studEndsChamfered.length ? { studEndsChamfered } : {}),
    };
}
/** Public entry point for the RP simplifier post-pass.  Walks every plan
 *  and frame in the project; for each frame inside an RP plan, runs
 *  `simplifyRpFrame`. Mutates `project.plans[].frames[].sticks[]` in place. */
export function simplifyRpFramesInProject(plans) {
    const decisions = [];
    for (const plan of plans) {
        if (!isRpPlanName(plan.name))
            continue;
        for (const frame of plan.frames) {
            decisions.push(simplifyRpFrame(frame));
        }
    }
    return decisions;
}
// Used by future commits — keep imported so the file always type-checks.
void null;
