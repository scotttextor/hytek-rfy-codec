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
 *  Tooling. Role is one of the wall horizontals (T/B/N) AND its world-space
 *  centerline is more horizontal than vertical. RP frames sometimes contain
 *  sloped rake-plates whose horizontal extent still dominates — those are
 *  still horizontal continuous. */
function isHorizontalContinuous(stick) {
    const role = rolePrefix(stick.name);
    if (!/^(T|Tp|B|Bp|Bh|N|Nog)$/i.test(role))
        return false;
    const dx = stick.end.x - stick.start.x;
    const dy = stick.end.y - stick.start.y;
    const dz = stick.end.z - stick.start.z;
    const horiz = Math.sqrt(dx * dx + dy * dy);
    const vert = Math.abs(dz);
    return horiz >= vert;
}
/** Decide if this stick is a VERTICAL NOTCHED member under Reversed Tooling.
 *  Role is wall-stud-like (S/J) AND z-extent dominates xy-extent. */
function isVerticalNotched(stick) {
    const role = rolePrefix(stick.name);
    if (!/^(S|J)$/i.test(role))
        return false;
    const dx = stick.end.x - stick.start.x;
    const dy = stick.end.y - stick.start.y;
    const dz = stick.end.z - stick.start.z;
    const horiz = Math.sqrt(dx * dx + dy * dy);
    const vert = Math.abs(dz);
    return vert > horiz;
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
/** Compute stick centerline length from world coords. The codec's per-stick
 *  rule emits ops anchored to this length (e.g. end-Swage at L-39). */
function computeStickLength(stick) {
    const dx = stick.end.x - stick.start.x;
    const dy = stick.end.y - stick.start.y;
    const dz = stick.end.z - stick.start.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
/** Strip start-anchored ops the standard wall rule emits on every stud:
 *    Swage 0..39  +  InnerDimple @16.5
 *  Returns the number of ops removed (mostly used for diagnostics). */
function stripStandardStartCap(tooling) {
    let removed = 0;
    for (let i = tooling.length - 1; i >= 0; i--) {
        const op = tooling[i];
        if (op.kind === "spanned"
            && op.type === "Swage"
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
/** Strip end-anchored ops the standard wall rule emits on every stud:
 *    Swage (L-39)..L  +  InnerDimple @(L-16.5)
 *  Returns the number of ops removed. */
function stripStandardEndCap(tooling, stickLen) {
    let removed = 0;
    for (let i = tooling.length - 1; i >= 0; i--) {
        const op = tooling[i];
        if (op.kind === "spanned"
            && op.type === "Swage"
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
/** Run the RP Reversed-Tooling simplifier on a single frame.  Mutates
 *  `frame.sticks[].tooling[]` in place.  Caller is responsible for the
 *  plan-name gate; this function blindly applies the rewrite when called. */
export function simplifyRpFrame(frame) {
    const horizontalsRewritten = [];
    const studStartsRewritten = [];
    const studEndsChamfered = [];
    for (const stick of frame.sticks) {
        if (isHorizontalContinuous(stick)) {
            if (applyHorizontalCaps(stick)) {
                horizontalsRewritten.push(stick.name);
            }
        }
        else if (isVerticalNotched(stick)) {
            // commit 3 will rewrite start cap here
            void stick;
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
