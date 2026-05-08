import { classifyJoint, } from "./classify-joint.js";
import { emptyFrameFlags, deriveFrameFlags, } from "./frame-flags.js";
import { getActionSection } from "./action-defs.js";
import { evalConditions, packEdgeMask, } from "./condition-eval.js";
import { emitActions } from "./action-emit.js";
import { lipNotchToolLength, findSectionSetup } from "../machine-setups.js";
/** Whether the action-defs pass is enabled for the current run. Reads
 *  CODEC_USE_ACTION_DEFS env var. */
export function isActionDefsPassEnabled() {
    return process.env.CODEC_USE_ACTION_DEFS === "1" ||
        process.env.CODEC_USE_ACTION_DEFS === "true";
}
// ---------------------------------------------------------------------------
// Stick → StickProps derivation
// ---------------------------------------------------------------------------
/**
 * Build the per-stick `StickProps` record that the classifier consumes.
 *
 * This is the stage Detailer's `FUN_005456bc` performs in the original.
 * We approximate from the visible RfyStick + StickWithBox fields plus the
 * resolved MachineSetup's per-profile SectionSetup.
 *
 * Per-field provenance:
 *   - isCSection: derived from role (plates are non-C in Detailer terms).
 *   - isTrussChord: stick.usage === topchord/bottomchord.
 *   - isBoxing: 1 when stick.usage indicates boxing (Boxing/BoxedStud) OR
 *     role is Bp/Tp boxing-plate. 2 reserved for Omega sentinel.
 *   - swageClearance: profile has fastener2 != -1 (dual-fastener / swage
 *     clearance enabled). Per the .sups, dualFasteners=true OR fastener2>=0
 *     marks the profile as "has swage clearance". Empirically this gates
 *     OnFlat - Swaged emit on the per-stick branch.
 *   - hasOuterFlange: plate sections (track shapes) have outer flange;
 *     stud sections (C-shape) don't. The shapeClassification "T" indicates
 *     track / plate.
 *   - secondaryFlag: opaque match flag from byte 0x01 of the record. We
 *     derive it from `usage` — webs/diagonals get flag=1, primary studs
 *     get flag=0. Used only in OnEdge LipNotchedStandard 2/3 selection.
 *   - isHybridFlange: profile has "hybrid" flange shape. Approximated by
 *     unequal leftFlange/rightFlange (HYTEK 89mm has 38/41 = hybrid).
 */
function deriveStickProps(sb, setup) {
    const stick = sb.stick;
    const usage = String(stick.usage ?? "").toLowerCase();
    const isTrussChord = usage === "topchord" || usage === "bottomchord";
    // C-section vs non-C: HYTEK profiles are predominantly S (stud-section,
    // C-shape) plus track/plate variants. Role + usage gives strongest signal.
    // Plates (T/B/Tp/Bp) are non-C in Detailer's terminology.
    const role = sb.role;
    const isPlate = ["T", "B", "Tp", "Bp", "Bh", "L"].includes(role) ||
        usage === "topplate" || usage === "bottomplate" ||
        usage === "raisedbottomplate" || usage === "lintel";
    const isCSection = !isPlate;
    // hasOuterFlange: heuristically true for non-C plates (the outer flange is
    // the lip on track sections). Studs have no outer flange.
    const hasOuterFlange = isPlate;
    // Look up per-profile SectionSetup if a MachineSetup is supplied.
    // This gives us authoritative swage / dual-fastener data per profile.
    let sectionSetup;
    if (setup && stick.profile?.metricLabel) {
        // Section names look like "70S41_0.75". Build it from profile.
        const w = stick.profile.web;
        const lf = stick.profile.lFlange;
        const g = stick.profile.gauge;
        const sectionName = `${w}S${lf}_${g}`;
        sectionSetup = findSectionSetup(setup, sectionName);
    }
    const opts = sectionSetup?.sectionOptions;
    // swageClearance: the section has a secondary fastener (fastener2 >= 0)
    // OR dualFasteners is true. This gates Detailer's OnFlat - Swaged emit
    // on the per-stick "has swage" branch (FUN_00538b00 line 98578-98584).
    const swageClearance = opts
        ? Boolean(opts.dualFasteners) || (opts.fastener2 ?? -1) >= 0
        : false;
    // isHybridFlange: HYTEK 89mm profiles have asymmetric flange (38mm vs
    // 41mm). Detailer's FlangeType=onEdge = hybrid. For HYTEK only the
    // 89-series profile sets this.
    const isHybridFlange = sectionSetup?.profile
        ? Math.abs(sectionSetup.profile.leftFlange - sectionSetup.profile.rightFlange) > 0.5
        : (stick.profile && Math.abs(stick.profile.lFlange - stick.profile.rFlange) > 0.5);
    // isBoxing: boxed sticks are paired back-to-back. HYTEK conventions:
    //   - usage = "boxing", "boxedstud", or contains "boxed" → isBoxing=1
    //   - role = "Bp" / "Tp" (boxing plates) → isBoxing=1
    // value 2 is the OnEdge subgroup sentinel (Omega) — we don't detect it.
    const isBoxedUsage = usage.includes("box") || usage === "boxedstud" || usage === "boxing";
    const isBoxedRole = role === "Bp" || role === "Tp";
    const isBoxing = (isBoxedUsage || isBoxedRole) ? 1 : 0;
    // secondaryFlag: opaque "secondary fastener" flag at byte 0x01 of
    // Detailer's record. Approximated: webs/diagonals/braces get flag=1,
    // primary structural members get flag=0. Only used in OnEdge sub-variant
    // selection (LipNotchedStandard2 vs 3).
    const isSecondary = role === "W" || role === "V" ||
        usage === "web" || usage === "brace";
    const secondaryFlag = isSecondary ? 1 : 0;
    return {
        isCSection,
        secondaryFlag,
        swageClearance,
        isHybridFlange: Boolean(isHybridFlange),
        isTrussChord,
        isBoxing,
        hasOuterFlange,
        length: stick.length,
    };
}
/** Roles that participate in crossings as the "connector" side (the stick
 *  we emit ops onto). Includes truss chords (top/bottom plate, top/bottom
 *  chord), nogs, and lintels. */
const CONNECTOR_ROLES = new Set(["T", "B", "Tp", "Bp", "Bh", "N", "Nog", "H", "L"]);
/** Roles that participate as the "partner" side (the stick that crosses
 *  into the connector). Includes studs, jacks, cripples, truss webs/posts,
 *  and headers. */
const PARTNER_ROLES = new Set(["S", "J", "Kb", "W", "V", "H"]);
/** Recognise truss chord usage strings — used for chord-flag derivation. */
function isTrussChordUsage(u) {
    const x = u.toLowerCase();
    return x === "topchord" || x === "bottomchord";
}
/** Recognise truss web usage strings. */
function isTrussWebUsage(u) {
    return String(u ?? "").toLowerCase() === "web";
}
/** Centerline endpoints from outlineCorners (CCW rectangle around stick axis):
 *   start_centerline = midpoint of corners[0] + corners[3]
 *   end_centerline   = midpoint of corners[1] + corners[2]
 */
function getCenterlineEndpoints(sb) {
    const c = sb.stick.outlineCorners;
    if (!c || c.length < 4)
        return null;
    return {
        sx: (c[0].x + c[3].x) / 2,
        sy: (c[0].y + c[3].y) / 2,
        ex: (c[1].x + c[2].x) / 2,
        ey: (c[1].y + c[2].y) / 2,
    };
}
/** Compute the 2D intersection of two centerlines (each a parametric segment).
 *  Returns the intersection point + (tA, tB) parameters along each segment.
 *  null if parallel or out of range (with epsilon slack). */
function intersectSegments(a, b) {
    const ax = a.ex - a.sx, ay = a.ey - a.sy;
    const bx = b.ex - b.sx, by = b.ey - b.sy;
    const det = ax * by - ay * bx;
    if (Math.abs(det) < 1e-6)
        return null;
    const dx = b.sx - a.sx, dy = b.sy - a.sy;
    const tA = (dx * by - dy * bx) / det;
    const tB = (dx * ay - dy * ax) / det;
    // Allow small slack: end-touching joints have tA/tB at 0 or 1 ± noise.
    const SLACK = 0.05;
    if (tA < -SLACK || tA > 1 + SLACK)
        return null;
    if (tB < -SLACK || tB > 1 + SLACK)
        return null;
    return {
        x: a.sx + tA * ax,
        y: a.sy + tA * ay,
        tA, tB,
    };
}
/** Compute the angle in degrees between two directed vectors. */
function angleBetween(a, b) {
    const ax = a.ex - a.sx, ay = a.ey - a.sy;
    const bx = b.ex - b.sx, by = b.ey - b.sy;
    const aLen = Math.sqrt(ax * ax + ay * ay);
    const bLen = Math.sqrt(bx * bx + by * by);
    if (aLen < 1 || bLen < 1)
        return 90;
    const cosAng = (ax * bx + ay * by) / (aLen * bLen);
    const c = Math.max(-1, Math.min(1, cosAng));
    return (Math.acos(Math.abs(c)) * 180) / Math.PI; // 0..90 (acute) — not orientation
}
/** Project the intersection point onto stick A's centerline to get a
 *  position along its length (mm from start). */
function projectToStickLocal(cl, px, py) {
    const dx = cl.ex - cl.sx, dy = cl.ey - cl.sy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1)
        return 0;
    const t = ((px - cl.sx) * dx + (py - cl.sy) * dy) / (len * len);
    return Math.max(0, Math.min(len, t * len));
}
/**
 * Compute edge-touch booleans for an intersection. Each of the 4 edges (LL/LW/
 * WL/WW) corresponds to "which feature of which stick's section the
 * intersection falls on":
 *   - LL: both sticks intersect via their lip (rare — only at corner-of-corner).
 *   - LW: connector lip × connectee web.
 *   - WL: connector web × connectee lip.
 *   - WW: both webs cross (the dominant case for any non-edge crossing).
 *
 * Heuristic for now: for an interior crossing both webs cross (WW=true). For
 * an end-touching crossing (one stick's tA/tB at ~0 or ~1) we additionally
 * set edge flags for the touching side. The 4-bit mask packs into the slot
 * index FToolActions[0..15].
 */
function computeEdgeMask(tA, tB, intersectionType) {
    // Default: all 4 webs touch (mask = 0xF for symmetric panel-point joints).
    // Per the brief: "If unsure, set TODO and emit for mask=0xF (all corners)
    // by default — better to over-emit than under-emit". But for end-to-web
    // joints, only 2 corners touch.
    const isEndConnector = tA < 0.05 || tA > 0.95;
    const isEndPartner = tB < 0.05 || tB > 0.95;
    // ww_inner_edge / panel-point: ALL 4 corners present (mask=0xF).
    if (intersectionType === "ww_inner_edge") {
        return { ll: true, lw: true, wl: true, ww: true };
    }
    // ew_inner_edge: end-to-web — only 2 of the 4 corners present (mask=0x3).
    if (intersectionType === "ew_inner_edge") {
        return { ll: false, lw: true, wl: false, ww: true, ew: true };
    }
    // Chord-to-chord intersections: WW only (mask=0x8).
    if (intersectionType === "t_bchord" || intersectionType === "b_tchord" ||
        intersectionType === "t_tchord") {
        return { ll: false, lw: false, wl: false, ww: true };
    }
    // ll/lw/wl_inner_edge: explicit lip variants — only that one bit set.
    if (intersectionType === "ll_inner_edge") {
        return { ll: true, lw: false, wl: false, ww: false };
    }
    if (intersectionType === "lw_inner_edge") {
        return { ll: false, lw: true, wl: false, ww: false };
    }
    if (intersectionType === "wl_inner_edge") {
        return { ll: false, lw: false, wl: true, ww: false };
    }
    // Fallback: just WW. End-touch refines the mask.
    const edges = { ll: false, lw: false, wl: false, ww: true };
    if (isEndPartner && !isEndConnector)
        edges.ew = true;
    if (isEndConnector && !isEndPartner)
        edges.el = true;
    return edges;
}
/** Classify an intersection by which edges of each stick it touches.
 *  This drives both the slot index (4-bit mask) AND the chord-flag context. */
function classifyIntersectionType(connector, connectee, tA, tB) {
    const cnUsage = String(connector.stick.usage ?? "").toLowerCase();
    const ceUsage = String(connectee.stick.usage ?? "").toLowerCase();
    const cnIsChord = isTrussChordUsage(cnUsage);
    const ceIsChord = isTrussChordUsage(ceUsage);
    // Both sides are truss chords → chord-to-chord intersection. The naming
    // captures "top connector × bottom partner" or vice versa.
    if (cnIsChord && ceIsChord) {
        if (cnUsage === "topchord" && ceUsage === "bottomchord")
            return "t_bchord";
        if (cnUsage === "bottomchord" && ceUsage === "topchord")
            return "b_tchord";
        if (cnUsage === "topchord" && ceUsage === "topchord")
            return "t_tchord";
        return "ww_inner_edge"; // bottom-to-bottom rare, fall through
    }
    // End-to-web: partner's end-tB indicates a stick whose endpoint lies on
    // the connector's centerline (truss brace ending at chord web).
    const isEndPartner = tB < 0.05 || tB > 0.95;
    if (isEndPartner)
        return "ew_inner_edge";
    // Default: ww_inner_edge (panel-point through both sticks' webs).
    return "ww_inner_edge";
}
/**
 * Find every (connector, connectee) crossing in the frame. Extended in
 * 2026-05-08 to cover truss panel-points.
 *
 * Coverage by frame type:
 *   - Walls (LBW/NLBW): top/bottom plates × studs (orthogonal) — covered by
 *     the bbox-overlap branch (legacy behaviour).
 *   - Trusses (TIN/TB2B/RP/CP/MH/FJ): chord × web/post panel-points + heel
 *     crossings — covered by the centerline-intersection branch.
 *
 * The legacy path (`frame-context.ts`) still fires for non-action-defs
 * cases; this scan is allowed to be aggressive — false-positives that
 * don't classify well are filtered later by classifyJoint returning "None"
 * or by the SUPPRESSED_CLASSIFICATIONS list.
 */
function findCrossings(layout) {
    const out = [];
    const seen = new Set(); // dedupe (connector, connectee) pairs
    // -------------------------------------------------------------------
    // BRANCH 1 — wall plate × stud (orthogonal bbox-overlap, legacy)
    // -------------------------------------------------------------------
    const connectorsHorizontal = layout.filter((sb) => CONNECTOR_ROLES.has(sb.role) && sb.horizontal);
    const partnersVertical = layout.filter((sb) => PARTNER_ROLES.has(sb.role) && !sb.horizontal);
    for (const connector of connectorsHorizontal) {
        for (const partner of partnersVertical) {
            if (partner.box.cx < connector.box.xMin)
                continue;
            if (partner.box.cx > connector.box.xMax)
                continue;
            if (partner.box.yMax < connector.box.yMin)
                continue;
            if (partner.box.yMin > connector.box.yMax)
                continue;
            const intersectionPos = partner.box.cx - connector.box.xMin;
            if (intersectionPos < 50)
                continue;
            if (intersectionPos > connector.stick.length - 50)
                continue;
            const intersectionType = classifyIntersectionType(connector, partner, 0.5, 0.5);
            const edges = computeEdgeMask(0.5, 0.5, intersectionType);
            let webAngleDeg = 90;
            const c = partner.stick.outlineCorners;
            if (c && c.length >= 2) {
                const dy = (c[1]?.y ?? 0) - (c[0]?.y ?? 0);
                const dx = (c[1]?.x ?? 0) - (c[0]?.x ?? 0);
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len > 1) {
                    webAngleDeg = (Math.acos(Math.abs(dx) / len) * 180) / Math.PI;
                }
            }
            const key = `wall|${connector.stick.name}|${partner.stick.name}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            out.push({
                connector,
                connectee: partner,
                intersectionPos,
                edges,
                webAngleDeg,
                intersectionType,
            });
        }
    }
    // -------------------------------------------------------------------
    // BRANCH 2 — truss panel-points (centerline × centerline)
    //
    // For trusses (TIN/TB2B/RP/CP/MH/FJ), webs aren't necessarily vertical.
    // Iterate every (chord-or-web, web-or-chord) PAIR where at least one
    // side is usage="topchord"/"bottomchord"/"web" and compute the
    // centerline intersection. This catches:
    //   - ww_inner_edge: web × chord at panel points
    //   - ew_inner_edge: brace end touching chord web
    //   - t_bchord / b_tchord / t_tchord: chord × chord at heel/apex
    // -------------------------------------------------------------------
    const trussSticks = layout.filter((sb) => {
        const u = String(sb.stick.usage ?? "").toLowerCase();
        return isTrussChordUsage(u) || isTrussWebUsage(u) ||
            sb.role === "T" || sb.role === "B" ||
            sb.role === "W" || sb.role === "V";
    });
    for (const connector of trussSticks) {
        if (!CONNECTOR_ROLES.has(connector.role))
            continue;
        const cnCl = getCenterlineEndpoints(connector);
        if (!cnCl)
            continue;
        for (const partner of trussSticks) {
            if (partner === connector)
                continue;
            // Connector × partner pair. We always emit ops onto the connector;
            // the partner is what crosses it.
            if (connector.stick.name === partner.stick.name)
                continue;
            const partnerUsage = String(partner.stick.usage ?? "").toLowerCase();
            const partnerIsParticipant = isTrussWebUsage(partnerUsage) ||
                isTrussChordUsage(partnerUsage) ||
                PARTNER_ROLES.has(partner.role);
            if (!partnerIsParticipant)
                continue;
            const ceCl = getCenterlineEndpoints(partner);
            if (!ceCl)
                continue;
            const hit = intersectSegments(cnCl, ceCl);
            if (!hit)
                continue;
            const intersectionPos = projectToStickLocal(cnCl, hit.x, hit.y);
            // Inside the connector body (not at an end)?
            if (intersectionPos < 50)
                continue;
            if (intersectionPos > connector.stick.length - 50)
                continue;
            const itype = classifyIntersectionType(connector, partner, hit.tA, hit.tB);
            const edges = computeEdgeMask(hit.tA, hit.tB, itype);
            const webAngleDeg = angleBetween(cnCl, ceCl);
            const key = `truss|${connector.stick.name}|${partner.stick.name}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            out.push({
                connector,
                connectee: partner,
                intersectionPos,
                edges,
                webAngleDeg,
                intersectionType: itype,
            });
        }
    }
    return out;
}
// ---------------------------------------------------------------------------
// Slot walker
// ---------------------------------------------------------------------------
/** Walk a section's slot, evaluating each alternative until one matches. */
function pickAlternative(slot, condCtx) {
    for (const alt of slot.alternatives) {
        if (evalConditions(alt.conditions, condCtx))
            return alt;
    }
    return undefined;
}
/**
 * The set of joint classifications the action-defs pass deliberately
 * suppresses (lets legacy frame-context.ts handle instead). Tuned via the
 * 9-pair A/B sweep — only suppress where legacy is at 85+% parity AND the
 * action-defs path regresses.
 *
 * Default posture:
 *   - WALL OnFlat (Standard / DualTrack / LipNotchedCorners) — legacy
 *     handles these well; action-defs over-emits without the full lip-edge
 *     plumbing yet.
 *   - TRUSS OnEdge / OnFlat-Over / Swaged variants — NOT suppressed.
 *     These are the cohorts where action-defs is expected to gain parity.
 *
 * Override per-cohort via env: `CODEC_SUPPRESS_ONFLAT=0` un-suppresses the
 * wall path (useful for debugging).
 */
function getSuppressedSet() {
    const out = new Set();
    // Wall OnFlat path — legacy is at 85-95% parity, action-defs would
    // double-emit without proper edge-mask resolution. Keep suppressed by
    // default. Set CODEC_SUPPRESS_ONFLAT=0 to disable.
    if (process.env.CODEC_SUPPRESS_ONFLAT !== "0") {
        out.add("OnFlat - Standard");
        out.add("OnFlat - Reversed");
        out.add("OnFlat - LipNotchedCorners");
        out.add("OnFlat - LipNotchedCorners Reversed");
        out.add("OnFlat - DualTrack Standard");
        out.add("OnFlat - DualTrack PlateToStud");
        out.add("OnFlat - DualTrack StudToPlate");
    }
    // OnFlat - Over / Swaged: only emit on truss heel/apex, not walls.
    // legacy path handles wall over/swaged via the W-brace branch already.
    // Set CODEC_SUPPRESS_OVER_SWAGED=0 to enable.
    if (process.env.CODEC_SUPPRESS_OVER_SWAGED !== "0") {
        out.add("OnFlat - Over");
        out.add("OnFlat - Swaged");
    }
    return out;
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Run the action-defs pass over a frame's crossings. Returns a per-stick
 * map: name → handled+ops+trace.
 *
 * The legacy `frame-context.ts` engine should consult this map BEFORE its
 * crossings loop and skip any stick where `handled === true`.
 */
export function runActionDefsPass(layout, config) {
    const out = new Map();
    for (const sb of layout) {
        out.set(sb.stick.name, { handled: false, ops: [] });
    }
    if (!config.enabled)
        return out;
    const flags = config.frameFlags ?? (config.planName
        ? deriveFrameFlags("", "", config.planName)
        : emptyFrameFlags());
    const lipNotchSpan = lipNotchToolLength(config.setup) - 3;
    const swageClearance = config.setup.toolClearance;
    const crossings = findCrossings(layout);
    // Pre-compute multi-hit info: for each connector stick, count how many
    // distinct partner sticks intersect it.
    const partnerCountByConnector = new Map();
    for (const cr of crossings) {
        const k = cr.connector.stick.name;
        partnerCountByConnector.set(k, (partnerCountByConnector.get(k) ?? 0) + 1);
    }
    // Group crossings by connector stick, accumulate ops.
    const opsByStick = new Map();
    const tracesByStick = new Map();
    const classByStick = new Map();
    // Cohorts where the LEGACY frame-context.ts pipeline is already mature.
    // Tunable via narrowing per-cohort A/B testing — see `getSuppressedSet()`.
    // Default conservative posture: suppress the wall OnFlat path because the
    // legacy crossings logic in frame-context.ts is at 85-95% parity already.
    // Truss OnEdge / mixed paths are NOT suppressed — that's where the gain is.
    const SUPPRESSED_CLASSIFICATIONS = getSuppressedSet();
    for (const cr of crossings) {
        const connectorProps = deriveStickProps(cr.connector, config.setup);
        const connecteeProps = deriveStickProps(cr.connectee, config.setup);
        const className = classifyJoint(connectorProps, connecteeProps, flags);
        if (className === "None")
            continue;
        if (SUPPRESSED_CLASSIFICATIONS.has(className))
            continue;
        const section = getActionSection(className);
        if (!section)
            continue;
        const mask = packEdgeMask(cr.edges);
        const slot = section.slots[mask];
        if (!slot)
            continue;
        // Build condition context — chord flags drawn from intersection-type tag.
        const chord = {
            t_tchord: cr.intersectionType === "t_tchord",
            b_tchord: cr.intersectionType === "b_tchord",
            t_bchord: cr.intersectionType === "t_bchord",
        };
        const multiHit = (partnerCountByConnector.get(cr.connector.stick.name) ?? 0) > 1;
        const condCtx = {
            edges: cr.edges,
            multiHit,
            chord,
            ...(cr.webAngleDeg !== undefined && { webAngleDeg: cr.webAngleDeg }),
        };
        const alt = pickAlternative(slot, condCtx);
        if (!alt)
            continue;
        const ec = {
            length: cr.connector.stick.length,
            intersectionPos: cr.intersectionPos,
            lipNotchSpan,
            webNotchSpan: lipNotchSpan,
            swageClearance,
        };
        const emit = emitActions(alt.ops, ec);
        if (emit.ops.length === 0)
            continue;
        const name = cr.connector.stick.name;
        if (!opsByStick.has(name))
            opsByStick.set(name, []);
        opsByStick.get(name).push(...emit.ops);
        if (!tracesByStick.has(name))
            tracesByStick.set(name, []);
        if (emit.trace)
            tracesByStick.get(name).push(emit.trace);
        classByStick.set(name, className);
    }
    for (const [stickName, ops] of opsByStick.entries()) {
        out.set(stickName, {
            handled: true,
            ops,
            ...(classByStick.has(stickName) && { classification: classByStick.get(stickName) }),
            ...(tracesByStick.has(stickName) && { trace: tracesByStick.get(stickName).join("\n") }),
        });
    }
    // Debug — set CODEC_ACTION_DEFS_DEBUG=1 to print per-frame stats.
    if (process.env.CODEC_ACTION_DEFS_DEBUG === "1") {
        const classCounts = new Map();
        let totalOps = 0;
        let handledSticks = 0;
        for (const info of out.values()) {
            if (info.handled) {
                handledSticks++;
                totalOps += info.ops.length;
                if (info.classification) {
                    classCounts.set(info.classification, (classCounts.get(info.classification) ?? 0) + info.ops.length);
                }
            }
        }
        if (handledSticks > 0) {
            const planLabel = config.planName ?? "?";
            console.error(`[action-defs] plan=${planLabel} crossings=${crossings.length} handled=${handledSticks} ops=${totalOps} ` +
                [...classCounts.entries()].map(([k, v]) => `${k}=${v}`).join(" "));
        }
    }
    return out;
}
/** Empty pass result — used when the env flag is off (legacy path runs alone). */
export function emptyActionDefsPass(layout) {
    const out = new Map();
    for (const sb of layout) {
        out.set(sb.stick.name, { handled: false, ops: [] });
    }
    return out;
}
