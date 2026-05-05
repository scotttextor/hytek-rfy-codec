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
/** Run the RP Reversed-Tooling simplifier on a single frame.  Mutates
 *  `frame.sticks[].tooling[]` in place.  Caller is responsible for the
 *  plan-name gate; this function blindly applies the rewrite when called. */
export function simplifyRpFrame(frame) {
    // v1 stub — detection layer only. Rule rewriting lives in commits 2-4.
    // Walk every stick to populate the decision (so the apply-pass log is useful)
    // but emit no tooling changes yet.
    const horizontalsRewritten = [];
    const studStartsRewritten = [];
    const studEndsChamfered = [];
    for (const stick of frame.sticks) {
        if (isHorizontalContinuous(stick)) {
            // commit 2 will rewrite end-caps here
            void stick;
        }
        else if (isVerticalNotched(stick)) {
            // commit 3 will rewrite start cap here
            void stick;
        }
    }
    if (horizontalsRewritten.length === 0
        && studStartsRewritten.length === 0
        && studEndsChamfered.length === 0) {
        return { frame: frame.name, decision: "SKIP", reason: "v1 stub — no rules wired yet" };
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
