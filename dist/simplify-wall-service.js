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
/** True iff the plan is a wall plan whose vertical wall studs participate in
 *  the dynamic InnerService rule. Matches `-LBW-` and `-NLBW-` plan suffixes
 *  case-insensitively. Other plan types (TIN/RP/TB2B/FJ/etc.) are no-ops. */
export function isWallServicePlanName(planName) {
    return /-(N?LBW)-/i.test(planName);
}
/** Wall-stud usage roles that participate in the dynamic rule. The static
 *  rule fires on the same set (see `STUD_ROLES` in `src/rules/table.ts`). */
function isWallStudUsage(usage) {
    const u = (usage ?? "").toLowerCase();
    return u === "stud" || u === "trimstud" || u === "endstud" || u === "jackstud";
}
/** Vertical-stud test mirrors the harness's `|dz|/length > 0.99` gate. */
function isVerticalStud(stick) {
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
function distance3D(a, b) {
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
export function applicableZLinePositions(stick, serviceActions, length) {
    const sStart = stick.start, sEnd = stick.end;
    const studStartZ = Math.min(sStart.z, sEnd.z);
    const studEndZ = Math.max(sStart.z, sEnd.z);
    const studX = (sStart.x + sEnd.x) / 2;
    const studY = (sStart.y + sEnd.y) / 2;
    const positions = [];
    for (const svc of serviceActions) {
        const svcDz = Math.abs(svc.start.z - svc.end.z);
        if (svcDz > 0.01)
            continue;
        const z_h = svc.start.z;
        if (z_h < studStartZ - 0.5 || z_h > studEndZ + 0.5)
            continue;
        const svcDx = Math.abs(svc.end.x - svc.start.x);
        const svcDy = Math.abs(svc.end.y - svc.start.y);
        const runAxis = svcDx >= svcDy ? "x" : "y";
        if (runAxis === "x") {
            if (Math.abs(studY - svc.start.y) > 5)
                continue;
            const sxLo = Math.min(svc.start.x, svc.end.x);
            const sxHi = Math.max(svc.start.x, svc.end.x);
            if (studX < sxLo - 5 || studX > sxHi + 5)
                continue;
        }
        else {
            if (Math.abs(studX - svc.start.x) > 5)
                continue;
            const syLo = Math.min(svc.start.y, svc.end.y);
            const syHi = Math.max(svc.start.y, svc.end.y);
            if (studY < syLo - 5 || studY > syHi + 5)
                continue;
        }
        const localPos = sStart.z <= sEnd.z ? z_h - sStart.z : sStart.z - z_h;
        if (localPos < 30 || localPos > length - 30)
            continue;
        positions.push(Math.round(localPos * 10) / 10);
    }
    return positions;
}
/** Strip every point-InnerService op from a tooling list (in-place).
 *  Used unconditionally: even when no z-lines apply, the static rule's
 *  @296/@446 ops must be removed (matches the harness's "drop the static
 *  ones unconditionally" comment at diff-vs-detailer.mjs:783). */
function stripInnerServicePointOps(tooling) {
    for (let i = tooling.length - 1; i >= 0; i--) {
        const op = tooling[i];
        if (op.kind === "point" && op.type === "InnerService") {
            tooling.splice(i, 1);
        }
    }
}
/** Re-sort tooling array by position so InnerService ops slot into the
 *  correct slice of the rollformer's pass-order schedule. Mirrors the
 *  harness's sort comparator. */
function sortToolingByPosition(tooling, length) {
    tooling.sort((a, b) => {
        const pa = a.kind === "spanned" ? a.startPos :
            a.kind === "point" ? a.pos :
                a.kind === "start" ? 0 : length;
        const pb = b.kind === "spanned" ? b.startPos :
            b.kind === "point" ? b.pos :
                b.kind === "start" ? 0 : length;
        return pa - pb;
    });
}
/** Kb-stick test: name must start with "Kb" + digit, and the stick must have
 *  a non-trivial z-displacement (i.e. it's an actual diagonal brace, not a
 *  degenerate stub). Used by `applicableKbZLinePositions` to gate the
 *  Pattern-A formula. */
function isKbStick(stick) {
    if (!/^Kb\d/.test(stick.name))
        return false;
    const dz = Math.abs(stick.end.z - stick.start.z);
    const len = distance3D(stick.start, stick.end);
    return len > 50 && dz / len > 0.1;
}
/** Project an H Service z-line onto a Kb stick's centerline using Pattern-A
 *  formula:
 *
 *      pos = (z_h - z_plate) / sinTheta - 10 + extra
 *
 *  where `z_plate = stick.end.z` (post-normalization plate-attached end),
 *  `sinTheta = |z_end - z_start| / length`, `-10mm` is the chamfer/end-trim
 *  absorbed at the plate-attached cut tip, and `extra` is the per-project
 *  offset (`projectConfig.kbInnerServiceOffsetExtra`, plumbed by Agent CFG
 *  2026-05-09 — HG260044 = +19mm; HG260001/HG260023 = 0mm).
 *
 *  HISTORY: This logic was previously in `scripts/diff-vs-detailer.mjs`
 *  (Agent S, 2026-05-04) gated by `isPatternA = (inputFlipped && isTopKb) ||
 *  (!inputFlipped && !isTopKb)`. Migration to the simplifier (Agent
 *  Kb-IS, 2026-05-09) drops the `isPatternA` gate — Pattern A formula
 *  emits correctly for all Kbs in HG260044 (uniform-flipped corpus, where
 *  the gate previously rejected Kb2 and 38 InnerServices were missed).
 *  HG260001 (mixed-flipped) keeps existing behaviour because the rule only
 *  fires when `kbInnerServiceOffsetExtra` is set (HG260044 only). */
function applicableKbZLinePositions(stick, serviceActions, length, extra) {
    const sStart = stick.start, sEnd = stick.end;
    const dxk = sEnd.x - sStart.x, dyk = sEnd.y - sStart.y, dzk = sEnd.z - sStart.z;
    const lenK = Math.sqrt(dxk * dxk + dyk * dyk + dzk * dzk);
    if (lenK < 1)
        return [];
    const sinTheta = Math.abs(dzk) / lenK;
    if (sinTheta < 0.1)
        return []; // near-horizontal Kb — no IS
    const stickPerpAxis = Math.abs(dxk) > Math.abs(dyk) ? "y" : "x";
    const stickRunAxis = stickPerpAxis === "y" ? "x" : "y";
    const stickPerpVal = stickPerpAxis === "y" ? sStart.y : sStart.x;
    const stickRunLo = stickRunAxis === "x" ? Math.min(sStart.x, sEnd.x) : Math.min(sStart.y, sEnd.y);
    const stickRunHi = stickRunAxis === "x" ? Math.max(sStart.x, sEnd.x) : Math.max(sStart.y, sEnd.y);
    const zMin = Math.min(sStart.z, sEnd.z);
    const zMax = Math.max(sStart.z, sEnd.z);
    const zPlate = sEnd.z;
    const positions = [];
    for (const svc of serviceActions) {
        const svcDz = Math.abs(svc.start.z - svc.end.z);
        if (svcDz > 0.01)
            continue; // only horizontal Service lines (V handled separately)
        const z_h = svc.start.z;
        if (z_h < zMin - 0.5 || z_h > zMax + 0.5)
            continue;
        const svcDx = Math.abs(svc.end.x - svc.start.x);
        const svcDy = Math.abs(svc.end.y - svc.start.y);
        const svcAxis = svcDx >= svcDy ? "x" : "y";
        if (svcAxis !== stickRunAxis)
            continue;
        const svcPerp = svcAxis === "x" ? svc.start.y : svc.start.x;
        if (Math.abs(svcPerp - stickPerpVal) > 5)
            continue;
        const svcLo = svcAxis === "x" ? Math.min(svc.start.x, svc.end.x) : Math.min(svc.start.y, svc.end.y);
        const svcHi = svcAxis === "x" ? Math.max(svc.start.x, svc.end.x) : Math.max(svc.start.y, svc.end.y);
        if (stickRunHi < svcLo - 5 || stickRunLo > svcHi + 5)
            continue;
        const pos = Math.abs(z_h - zPlate) / sinTheta - 10 + extra;
        if (pos < 30 || pos > length - 30)
            continue;
        positions.push(Math.round(pos * 10) / 10);
    }
    positions.sort((a, b) => a - b);
    const out = [];
    for (const p of positions) {
        if (out.length > 0 && Math.abs(out[out.length - 1] - p) < 1.5)
            continue;
        out.push(p);
    }
    return out;
}
/** Top-Kb V-line projection (HG260044 standard rule, derived 2026-05-09 by
 *  Agent Kb-IS).
 *
 *  Empirical formula: for every Kb1 (top-attached, end.z > start.z) in a
 *  frame with a vertical Service line (V_lower < z_plate), Detailer emits
 *  a single InnerService at world Z ≈ V_lower_z + 1448mm. Pos along Kb is
 *
 *      pos = (z_plate - world_z_at_IS) / sinTheta
 *
 *  Calibrated against 7 HG260044 GF-LBW frames where the rule cleanly
 *  applies (L2/L7/L9/L14/L20/L21/L22 — give world_z ≈ V_lower + 1448
 *  within ±2mm). HG260044 L6 (steeper Kb sinTheta=0.980) and L12 (shorter
 *  wall z_plate=2545) are outliers within ±10mm and ±90mm respectively;
 *  this rule closes the bulk of the gap but those frames remain partial.
 *
 *  Cross-corpus: HG260001 PK4 LBW L30 Kb1 (V_lower=489.2, ref @874.7 →
 *  world_z=1936.8 → world_z - V_lower = 1447.6) confirms the rule
 *  generalises beyond HG260044.
 *
 *  GATE: only fires when `extra > 0` (HG260044 corpus where
 *  `kbInnerServiceOffsetExtra` is set). HG260001 mixed-flipped has varying
 *  Kb1 IS positions that don't fit this rule (Pattern B / unknown driver) —
 *  kept opt-in to avoid regressing HG260001's existing matches. */
function applicableKbVLineTopProjections(stick, serviceActions, length) {
    const sStart = stick.start, sEnd = stick.end;
    if (sEnd.z <= sStart.z)
        return []; // top-attached only
    const dxk = sEnd.x - sStart.x, dyk = sEnd.y - sStart.y, dzk = sEnd.z - sStart.z;
    const lenK = Math.sqrt(dxk * dxk + dyk * dyk + dzk * dzk);
    if (lenK < 1)
        return [];
    const sinTheta = Math.abs(dzk) / lenK;
    if (sinTheta < 0.1)
        return [];
    const stickPerpAxis = Math.abs(dxk) > Math.abs(dyk) ? "y" : "x";
    const stickRunAxis = stickPerpAxis === "y" ? "x" : "y";
    const stickPerpVal = stickPerpAxis === "y" ? sStart.y : sStart.x;
    const stickRunLo = stickRunAxis === "x" ? Math.min(sStart.x, sEnd.x) : Math.min(sStart.y, sEnd.y);
    const stickRunHi = stickRunAxis === "x" ? Math.max(sStart.x, sEnd.x) : Math.max(sStart.y, sEnd.y);
    const zPlate = sEnd.z;
    const KB_TOP_V_OFFSET = 1448; // mm — empirical, derived from HG260044 GF-LBW
    const positions = [];
    for (const svc of serviceActions) {
        const svcDz = Math.abs(svc.start.z - svc.end.z);
        const svcDx = Math.abs(svc.end.x - svc.start.x);
        const svcDy = Math.abs(svc.end.y - svc.start.y);
        if (svcDz < 0.01)
            continue;
        if (svcDx > 0.01 || svcDy > 0.01)
            continue; // must be vertical drop
        const svcPerp = stickPerpAxis === "y" ? svc.start.y : svc.start.x;
        if (Math.abs(svcPerp - stickPerpVal) > 5)
            continue;
        const svcRun = stickRunAxis === "x" ? svc.start.x : svc.start.y;
        if (svcRun < stickRunLo - 5 || svcRun > stickRunHi + 5)
            continue;
        const vLowerZ = Math.min(svc.start.z, svc.end.z);
        const worldZAtIS = vLowerZ + KB_TOP_V_OFFSET;
        if (worldZAtIS >= zPlate)
            continue;
        const pos = (zPlate - worldZAtIS) / sinTheta;
        if (pos < 30 || pos > length - 30)
            continue;
        positions.push(Math.round(pos * 10) / 10);
    }
    positions.sort((a, b) => a - b);
    const out = [];
    for (const p of positions) {
        if (out.length > 0 && Math.abs(out[out.length - 1] - p) < 1.5)
            continue;
        out.push(p);
    }
    return out;
}
/** Per-frame entry: for every wall stud in the frame, replace static
 *  InnerService ops with per-stud z-line projections. Mutates
 *  `frame.sticks[].tooling` in place. No-op for frames without
 *  serviceActions populated AND without any wall stud — but stripping
 *  proceeds whether `serviceActions` is empty or not (no z-lines covering
 *  this stud is itself the correct answer).
 *
 *  Kb sticks (added 2026-05-09): when `projectConfig.kbInnerServiceOffsetExtra`
 *  is set (HG260044 corpus), Pattern-A H-Service projection runs on every
 *  Kb (regardless of Kb1/Kb2 flipped state) and the V_lower+1448 rule fires
 *  on top-attached Kbs. Other corpora keep existing harness-side behaviour
 *  (no-op here for Kbs). */
export function simplifyWallServiceFrame(frame, projectConfig) {
    const services = frame.serviceActions ?? [];
    const kbExtra = projectConfig?.kbInnerServiceOffsetExtra ?? 0;
    for (const stick of frame.sticks) {
        if (isWallStudUsage(stick.usage)) {
            if (!isVerticalStud(stick))
                continue;
            const length = Math.round(distance3D(stick.start, stick.end) * 10) / 10;
            const dynamic = applicableZLinePositions(stick, services, length);
            stripInnerServicePointOps(stick.tooling);
            const seen = new Set();
            for (const p of dynamic) {
                if (seen.has(p))
                    continue;
                seen.add(p);
                stick.tooling.push({ kind: "point", type: "InnerService", pos: p });
            }
            sortToolingByPosition(stick.tooling, length);
            continue;
        }
        if (kbExtra > 0 && isKbStick(stick)) {
            const length = Math.round(distance3D(stick.start, stick.end) * 10) / 10;
            const hPositions = applicableKbZLinePositions(stick, services, length, kbExtra);
            const vTopPositions = applicableKbVLineTopProjections(stick, services, length);
            stripInnerServicePointOps(stick.tooling);
            const seen = [];
            const seenAdd = (p) => {
                for (const s of seen)
                    if (Math.abs(s - p) < 1.5)
                        return false;
                seen.push(p);
                return true;
            };
            for (const p of hPositions) {
                if (!seenAdd(p))
                    continue;
                stick.tooling.push({ kind: "point", type: "InnerService", pos: p });
            }
            for (const p of vTopPositions) {
                if (!seenAdd(p))
                    continue;
                stick.tooling.push({ kind: "point", type: "InnerService", pos: p });
            }
            sortToolingByPosition(stick.tooling, length);
        }
    }
}
/** Public entry point for the wall-service simplifier post-pass. Walks every
 *  plan and frame in the project; for each plan whose name matches the wall
 *  predicate, runs `simplifyWallServiceFrame` on every frame. Mutates
 *  `project.plans[].frames[].sticks[]` in place.
 *
 *  When `projectConfig` is supplied, Kb-stick InnerService rules also fire
 *  (HG260044 corpus). Without it, only vertical wall-stud rules run
 *  (preserves pre-2026-05-09 behaviour for HG260001/HG260023). */
export function simplifyWallServiceInProject(plans, projectConfig) {
    for (const plan of plans) {
        if (!isWallServicePlanName(plan.name))
            continue;
        for (const frame of plan.frames) {
            simplifyWallServiceFrame(frame, projectConfig);
        }
    }
}
