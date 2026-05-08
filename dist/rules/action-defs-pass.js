import { classifyJoint, } from "./classify-joint.js";
import { emptyFrameFlags, deriveFrameFlags, } from "./frame-flags.js";
import { getActionSection } from "./action-defs.js";
import { evalConditions, packEdgeMask, } from "./condition-eval.js";
import { emitActions } from "./action-emit.js";
import { lipNotchToolLength } from "../machine-setups.js";
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
 * We approximate from the visible RfyStick + StickWithBox fields. Some
 * fields are best-effort — see TODOs.
 */
function deriveStickProps(sb) {
    const stick = sb.stick;
    const usage = String(stick.usage ?? "").toLowerCase();
    const isTrussChord = usage === "topchord" || usage === "bottomchord";
    // C-section vs non-C: HYTEK profiles are predominantly S (stud-section,
    // C-shape) plus track/plate variants. The role naming is the strongest
    // signal we have without parsing the full section descriptor.
    // Plates (T/B/Tp/Bp) are non-C in Detailer's terminology.
    const role = sb.role;
    const isPlate = ["T", "B", "Tp", "Bp", "Bh"].includes(role) ||
        usage === "topplate" || usage === "bottomplate" ||
        usage === "raisedbottomplate";
    const isCSection = !isPlate;
    // hasOuterFlange: heuristically true for non-C plates (the outer flange is
    // the lip on track sections). Studs have no outer flange.
    const hasOuterFlange = isPlate;
    return {
        isCSection,
        secondaryFlag: 0,
        swageClearance: false,
        isHybridFlange: false,
        isTrussChord,
        isBoxing: 0,
        hasOuterFlange,
        length: stick.length,
    };
}
/** Roles that participate in crossings. */
const CONNECTOR_ROLES = new Set(["T", "B", "Tp", "Bp", "Bh", "N", "Nog", "H", "L"]);
const PARTNER_ROLES = new Set(["S", "J", "Kb", "W", "V", "H"]);
/**
 * Find every (connector, connectee) crossing in the frame. This is a
 * deliberately simple geometric scan — it doesn't replicate every nuance
 * of `frame-context.ts` (Kb-edge virtual studs, B2B detection, etc.).
 *
 * The legacy path will still fire for cases this scan misses, so it's safe
 * to keep this minimal — every false-negative just falls through to legacy.
 */
function findCrossings(layout) {
    const out = [];
    const connectors = layout.filter((sb) => CONNECTOR_ROLES.has(sb.role) && sb.horizontal);
    const partners = layout.filter((sb) => PARTNER_ROLES.has(sb.role) && !sb.horizontal);
    for (const connector of connectors) {
        for (const partner of partners) {
            // Bbox overlap?
            if (partner.box.cx < connector.box.xMin)
                continue;
            if (partner.box.cx > connector.box.xMax)
                continue;
            if (partner.box.yMax < connector.box.yMin)
                continue;
            if (partner.box.yMin > connector.box.yMax)
                continue;
            // Position on connector = partner.cx - connector.xMin (assuming connector
            // axis is X — most common case).
            const intersectionPos = partner.box.cx - connector.box.xMin;
            if (intersectionPos < 50)
                continue;
            if (intersectionPos > connector.stick.length - 50)
                continue;
            // Edge-mask: simplest case — partner crosses the connector's web (WW)
            // and may also touch a flange depending on relative widths. We default
            // to WW=true for stud-on-plate crossings.
            const edges = { ll: false, lw: false, wl: false, ww: true };
            // Web angle: 90° for orthogonal crossings; for diagonal members
            // (W braces) compute from the partner's outline.
            let webAngleDeg = 90;
            const c = partner.stick.outlineCorners;
            if (c && c.length >= 2) {
                const dy = (c[1]?.y ?? 0) - (c[0]?.y ?? 0);
                const dx = (c[1]?.x ?? 0) - (c[0]?.x ?? 0);
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len > 1) {
                    // Angle from the connector axis (x-axis).
                    webAngleDeg = (Math.acos(Math.abs(dx) / len) * 180) / Math.PI;
                }
            }
            out.push({
                connector,
                connectee: partner,
                intersectionPos,
                edges,
                webAngleDeg,
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
    // Group crossings by connector stick, accumulate ops.
    const opsByStick = new Map();
    const tracesByStick = new Map();
    const classByStick = new Map();
    // Cohorts where the LEGACY frame-context.ts pipeline is already mature
    // (>80% parity). For these we suppress the action-defs supplement to avoid
    // double-emit. Re-enabled once the geometry resolver in this file matches
    // Detailer's per-corner OperationType metadata.
    // TODO-AMBIGUOUS: derive this list from per-cohort baselines instead of
    // hardcoding. For now: skip the dominant non-truss OnFlat path.
    const SUPPRESSED_CLASSIFICATIONS = new Set([
        "OnFlat - Standard",
        "OnFlat - Over",
        "OnFlat - Swaged",
        "OnFlat - Reversed",
        "OnFlat - LipNotchedCorners",
        "OnFlat - LipNotchedCorners Reversed",
        "OnFlat - DualTrack Standard",
        "OnFlat - DualTrack PlateToStud",
        "OnFlat - DualTrack StudToPlate",
    ]);
    for (const cr of crossings) {
        const connectorProps = deriveStickProps(cr.connector);
        const connecteeProps = deriveStickProps(cr.connectee);
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
        const condCtx = {
            edges: cr.edges,
            multiHit: false, // TODO: detect multi-hit (multiple intersections of same pair)
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
