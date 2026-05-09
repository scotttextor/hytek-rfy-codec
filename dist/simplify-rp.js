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
/** True iff the plan name marks this as a Roof-Panel (Reversed-Tooling) plan.
 *  Matches `-RP-` anywhere in the plan name (e.g. PK1-GF-RP-89.075).
 *  Cross-checked against TIN/TB2B detection in src/csv.ts:332 — RP plans are
 *  disjoint from those. */
export function isRpPlanName(planName) {
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
/** Strip end-anchored ops the standard wall rule emits on a stud:
 *    {Swage|LipNotch} L-39..L  +  InnerDimple @L-16.5
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
/** Compute stick centerline length from world coords. */
function computeStickLength(stick) {
    const dx = stick.end.x - stick.start.x;
    const dy = stick.end.y - stick.start.y;
    const dz = stick.end.z - stick.start.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
/** Extend the stick's end point along its centerline by `mmToAdd`. Used to
 *  match ref Detailer's longer stud lengths (RP studs are ~9mm longer in ref
 *  than the raw XML centerline gives — verified 58 of 68 horizontal-mode RP
 *  studs in HG260044). Returns true if the extension was applied. */
function extendStickEnd(stick, mmToAdd) {
    const dx = stick.end.x - stick.start.x;
    const dy = stick.end.y - stick.start.y;
    const dz = stick.end.z - stick.start.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1)
        return false;
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
/** Decide if a stick is an RP S-stud — name starts with "S" followed by digit. */
function isSstud(stick) {
    return /^S\d/.test(stick.name);
}
/** Decide if a stick is a B-prefix bottom plate. */
function isBplate(stick) {
    return /^B\d/.test(stick.name);
}
/** Determine the rake mode for a frame: "horizontal" if it has any horizontal
 *  bottom plate, "rake" if it has only sloped bottoms, "unknown" if no B sticks.
 *  Used as a fallback when per-stud connectivity can't be determined. */
function frameRakeMode(frame) {
    let hasB = false;
    let hasHorizontalB = false;
    for (const stick of frame.sticks) {
        if (!isBplate(stick))
            continue;
        hasB = true;
        if (Math.abs(stick.end.z - stick.start.z) < HORIZONTAL_BOTTOM_TOL_MM) {
            hasHorizontalB = true;
        }
    }
    if (!hasB)
        return "unknown";
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
function stickToPointDistance(start, end, pt) {
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
    const t = Math.max(0, Math.min(1, ((pt.x - start.x) * dx + (pt.y - start.y) * dy + (pt.z - start.z) * dz) / lenSq));
    const cx = start.x + t * dx;
    const cy = start.y + t * dy;
    const cz = start.z + t * dz;
    const ex = pt.x - cx;
    const ey = pt.y - cy;
    const ez = pt.z - cz;
    return Math.sqrt(ex * ex + ey * ey + ez * ez);
}
function studStartIsOnSlopedBottom(stud, frame) {
    // Find all B sticks
    const bottoms = frame.sticks.filter(isBplate);
    if (bottoms.length === 0)
        return false;
    // Check if stud's START is near any HORIZONTAL bottom plate.
    // If yes → pop-cap. If no → chord-cap (sloped or no plate match).
    for (const b of bottoms) {
        const isHorizontal = Math.abs(b.end.z - b.start.z) < HORIZONTAL_BOTTOM_TOL_MM;
        if (!isHorizontal)
            continue;
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
        if (!isSloped)
            continue;
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
/** Decide if a stick is a T-prefix top plate. */
function isTplate(stick) {
    return /^T\d/.test(stick.name);
}
/** Decide if a stick is an N-prefix nog. */
function isNog(stick) {
    return /^N\d/.test(stick.name);
}
/** Add Chamfer @start and @end to a stick if not already present. Returns
 *  number of chamfers added. */
function addBothEndChamfers(stick) {
    let added = 0;
    let hasStart = false, hasEnd = false;
    for (const op of stick.tooling) {
        if (op.kind === "start" && op.type === "Chamfer")
            hasStart = true;
        if (op.kind === "end" && op.type === "Chamfer")
            hasEnd = true;
    }
    if (!hasStart) {
        stick.tooling.push({ kind: "start", type: "Chamfer" });
        added++;
    }
    if (!hasEnd) {
        stick.tooling.push({ kind: "end", type: "Chamfer" });
        added++;
    }
    return added;
}
/** Distance between two 3D points. */
function dist3D(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
/** Add Chamfer @start or @end on a B/N stick at the end where it meets a
 *  sloped T-plate. Returns the side that was chamfered (or null if no
 *  matching T-plate found within tolerance). */
const PLATE_CONNECT_TOL_MM = 100;
function chamferBottomAtTConnection(stick, frame) {
    // Find T-plates and check which end of `stick` they connect to.
    for (const t of frame.sticks) {
        if (!isTplate(t))
            continue;
        // Skip horizontal T-plates — they don't drive a chamfer cut.
        const tdz = Math.abs(t.end.z - t.start.z);
        if (tdz < HORIZONTAL_BOTTOM_TOL_MM)
            continue;
        // Check if any T endpoint is close to stick's start
        if (dist3D(t.start, stick.start) < PLATE_CONNECT_TOL_MM
            || dist3D(t.end, stick.start) < PLATE_CONNECT_TOL_MM) {
            // Connection at stick's start
            let hasStart = false;
            for (const op of stick.tooling) {
                if (op.kind === "start" && op.type === "Chamfer") {
                    hasStart = true;
                    break;
                }
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
                if (op.kind === "end" && op.type === "Chamfer") {
                    hasEnd = true;
                    break;
                }
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
export function simplifyRpFrame(frame) {
    const studStartsRewritten = [];
    const studEndsChamfered = [];
    const platesChamfered = [];
    const rakeMode = frameRakeMode(frame);
    // T-plate Chamfer pass: ref Detailer emits Chamfer at both ends on most
    // T-plates in RP frames. Strategy: emit on every T-plate (the unconditional
    // approach netted +3.6pp on HG260044 vs +0pp baseline, with ~14 over-
    // emissions on horizontal-or-single-T frames being a small fraction of the
    // 50+ wins). A finer per-stick predicate (skip horizontal T-plates that
    // don't meet a sloped neighbour) is a follow-up — see B/N pattern below for
    // template (chamferBottomAtTConnection's connection-side classifier).
    for (const stick of frame.sticks) {
        if (!isTplate(stick))
            continue;
        const added = addBothEndChamfers(stick);
        if (added > 0)
            platesChamfered.push(stick.name);
    }
    // B/N Chamfer pass: ref Detailer emits Chamfer at exactly ONE end — the end
    // that meets a sloped T-plate. Verified 2026-05-09 vs HG260044 GF-RP-70.075
    // (~14 B-plates and ~9 nogs need this) — the chamfer side correlates with
    // the T-plate connection point. Only fire on HORIZONTAL B/N sticks, since
    // sloped B-plates (R4 B1, R12 B1) follow a different chamfer convention
    // and would receive false-positives.
    for (const stick of frame.sticks) {
        if (!isBplate(stick) && !isNog(stick))
            continue;
        const isHorizontal = Math.abs(stick.end.z - stick.start.z) < HORIZONTAL_BOTTOM_TOL_MM;
        if (!isHorizontal)
            continue;
        const side = chamferBottomAtTConnection(stick, frame);
        if (side)
            platesChamfered.push(stick.name + "@" + side);
    }
    for (const stick of frame.sticks) {
        if (!isSstud(stick))
            continue;
        // Per-stud classification: does this stud's START meet a sloped (rake)
        // bottom plate? If yes → chord-style cap. Else → plate-over-plate cap.
        const isRakeStud = studStartIsOnSlopedBottom(stick, frame);
        // BEFORE length extension: strip the codec's OLD end cap (positioned
        // relative to the original stick length).
        const origLen = computeStickLength(stick);
        stripStandardStartCap(stick.tooling);
        stripStandardEndCap(stick.tooling, origLen);
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
            stick.tooling.push({ kind: "start", type: "Chamfer" }, { kind: "point", type: "InnerDimple", pos: RP_RAKE_STUD_START_DIMPLE_OFFSET_MM }, { kind: "spanned", type: "Swage", startPos: 0, endPos: RP_RAKE_STUD_START_SPAN_HI_MM });
        }
        else {
            // Standard RP stud: meets a horizontal bottom plate at start. Ref emits
            // plate-over-plate start cap (Swage 56..101 + ID@78.5).
            stick.tooling.push({ kind: "spanned", type: "Swage", startPos: RP_STUD_START_SPAN_LO_MM, endPos: RP_STUD_START_SPAN_HI_MM }, { kind: "point", type: "InnerDimple", pos: RP_STUD_START_DIMPLE_OFFSET_MM });
        }
        studStartsRewritten.push(stick.name);
        // Add Chamfer @end if not already present (both modes).
        // Skip Chamfer @end on rake studs that already got Chamfer @start — ref
        // Detailer emits Chamfer at exactly ONE end on rake studs (the meeting
        // end, which we put on @start above).
        if (!isRakeStud) {
            let hasEndChamfer = false;
            for (const op of stick.tooling) {
                if (op.kind === "end" && op.type === "Chamfer") {
                    hasEndChamfer = true;
                    break;
                }
            }
            if (!hasEndChamfer) {
                stick.tooling.push({ kind: "end", type: "Chamfer" });
                studEndsChamfered.push(stick.name);
            }
        }
    }
    if (studStartsRewritten.length === 0 && studEndsChamfered.length === 0) {
        return { frame: frame.name, decision: "SKIP", reason: "no S-prefix studs found", rakeMode };
    }
    return {
        frame: frame.name,
        decision: "APPLY",
        reason: `${studStartsRewritten.length} stud starts rewritten (${rakeMode}), ` +
            `${studEndsChamfered.length} stud ends chamfered`,
        rakeMode,
        ...(studStartsRewritten.length ? { studStartsRewritten } : {}),
        ...(studEndsChamfered.length ? { studEndsChamfered } : {}),
    };
}
/** Public entry point for the RP simplifier post-pass. Walks every plan and
 *  frame in the project; for each frame inside an RP plan, runs `simplifyRpFrame`.
 *  Mutates `project.plans[].frames[].sticks[]` in place. */
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
