// Linear-truss RFY simplifier — replaces FrameCAD's BOLT HOLES on -LIN- truss
// web members with a centreline-intersection rule (3 holes per stick at every
// pairwise crossing). See spec at docs/superpowers/specs/2026-05-02-...
import { decryptRfy, encryptRfy } from "./crypto.js";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
/** Intersect two segments projected to the XZ plane. Returns parametric `t`/`u`
 *  along each segment and the intersection point. `null` if the lines are
 *  parallel (denom < 1e-9) or the intersection falls outside both segments
 *  beyond the slack tolerance (in mm). */
export function lineIntersectionXZ(a, b, slackMm) {
    const x1 = a.start[0], z1 = a.start[2];
    const x2 = a.end[0], z2 = a.end[2];
    const x3 = b.start[0], z3 = b.start[2];
    const x4 = b.end[0], z4 = b.end[2];
    const denom = (x1 - x2) * (z3 - z4) - (z1 - z2) * (x3 - x4);
    if (Math.abs(denom) < 1e-9)
        return null;
    const t = ((x1 - x3) * (z3 - z4) - (z1 - z3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (z1 - z3) - (z1 - z2) * (x1 - x3)) / denom;
    const L1 = Math.hypot(x2 - x1, z2 - z1);
    const L2 = Math.hypot(x4 - x3, z4 - z3);
    const stA = L1 > 0 ? slackMm / L1 : 0;
    const stB = L2 > 0 ? slackMm / L2 : 0;
    if (t < -stA || t > 1 + stA)
        return null;
    if (u < -stB || u > 1 + stB)
        return null;
    return { pt: [x1 + t * (x2 - x1), z1 + t * (z2 - z1)], t, u };
}
/** Euclidean length in the XZ plane. Y is ignored — Linear trusses are
 *  fabricated flat in the XZ wall plane and the truss-frame Y is constant. */
export function stickLength3D(s) {
    return Math.hypot(s.end[0] - s.start[0], s.end[2] - s.start[2]);
}
/** HYTEK Linear-truss default profile: 89×41 asymmetric C ("LC"), 0.75mm BMT.
 *  lFlange=38, rFlange=41 is intentional asymmetry; both lips are 11mm.
 *  These values gate every Linear-truss frame submitted to the simplifier. */
export const DEFAULT_PROFILE_GATE = {
    web: 89, rFlange: 41, lFlange: 38, lLip: 11, rLip: 11, shape: "C", gauge: "0.75",
};
// ---------- Profile gate (4-layer detection) ----------
export function isLinearTruss(frame, planName, gate = DEFAULT_PROFILE_GATE) {
    if (frame.type === undefined)
        return { ok: false, reason: "frame type missing (parser did not populate frame.type)" };
    if (frame.type !== "Truss")
        return { ok: false, reason: `frame type "${frame.type}" not Truss` };
    if (!/-LIN-/i.test(planName))
        return { ok: false, reason: `plan "${planName}" not Linear` };
    for (const s of frame.sticks) {
        const p = s.profile;
        const wrongProfile = p.web !== gate.web || p.rFlange !== gate.rFlange || p.lFlange !== gate.lFlange ||
            p.lLip !== gate.lLip || p.rLip !== gate.rLip || p.shape !== gate.shape;
        if (wrongProfile) {
            return { ok: false, reason: `${s.name} wrong profile (${p.web}x${p.rFlange} ${p.shape})` };
        }
        if ((s.gauge ?? "").trim() !== gate.gauge.trim()) {
            return { ok: false, reason: `${s.name} wrong gauge (${s.gauge ?? "missing"})` };
        }
    }
    const hasChord = frame.sticks.some(s => /chord/i.test(s.usage));
    const hasWeb = frame.sticks.some(s => /web/i.test(s.usage));
    if (!hasChord)
        return { ok: false, reason: "no chord members" };
    if (!hasWeb)
        return { ok: false, reason: "no web members" };
    return { ok: true };
}
// ---------- Validator: zero-length stick ----------
const ZERO_LENGTH_TOL_MM = 1e-3;
export function guardZeroLength(sticks) {
    for (const s of sticks) {
        const seg = {
            start: [s.start.x, s.start.y, s.start.z],
            end: [s.end.x, s.end.y, s.end.z],
        };
        if (stickLength3D(seg) < ZERO_LENGTH_TOL_MM) {
            return { ok: false, reason: `zero-length stick ${s.name}` };
        }
    }
    return { ok: true };
}
// ---------- Validator: end-zone exclusion (INV-4) ----------
export function assertEndZone(positions, stickLength, endZoneMm) {
    const safe = [];
    const violations = [];
    // Float-tolerance: pairwise centreline intersections in real Linear-truss
    // geometry land at the 30mm end-zone boundary (HYTEK's standard chord
    // stand-off equals endZoneMm). After IEEE-754 arithmetic, individual
    // positions drift by up to a few hundred micrometres either side of the
    // intended boundary, and FrameCAD's geometric stand-offs themselves vary by
    // a few tenths of a millimetre per joint. Treat anything within EPS_MM of
    // the boundary as safe — 0.5mm is well below the rollformer's positional
    // tolerance (~0.5mm at-best, typically ±1mm) and well above accumulated
    // float drift in the pairwise-intersection chain.
    // Verified against the 2603191 ROCKVILLE corpus: 158 positions land in
    // [29.5, 30) due to float / geometric drift, 29 positions are TRUE INV-4
    // violations at < 29mm from end. EPS=0.5 absorbs the former, flags the
    // latter.
    const EPS_MM = 0.5;
    const minPos = endZoneMm - EPS_MM;
    const maxPos = stickLength - endZoneMm + EPS_MM;
    for (const p of positions) {
        if (p < minPos || p > maxPos)
            violations.push(p);
        else
            safe.push(p);
    }
    return { safe, violations };
}
// ---------- Validator: apex-collision dedup ----------
/** Sort positions ascending and drop any that fall within `apexCollisionMm`
 *  of the previously-kept position. Caller provides the keep-priority by
 *  the array's natural ascending order — first-seen wins. */
export function dedupApex(positions, apexCollisionMm) {
    const sorted = [...positions].sort((a, b) => a - b);
    const kept = [];
    const merged = [];
    for (const p of sorted) {
        const last = kept[kept.length - 1];
        if (last === undefined || p - last >= apexCollisionMm)
            kept.push(p);
        else
            merged.push(p);
    }
    return { kept, merged };
}
// ---------- Validator: parallel-pair handler (back-to-back chords) ----------
/** When `lineIntersectionXZ` returns null because the centrelines are parallel,
 *  check whether they're actually co-linear-within-tolerance (= a back-to-back
 *  paired box member). If yes, emit a synthetic intersection at the midpoint
 *  of the overlap. If no overlap or truly distinct parallel sticks, returns null. */
export function handleParallelPair(a, b, coincidenceMm) {
    // Direction vectors in XZ
    const ax = a.end[0] - a.start[0], az = a.end[2] - a.start[2];
    const bx = b.end[0] - b.start[0], bz = b.end[2] - b.start[2];
    const lenA = Math.hypot(ax, az);
    const lenB = Math.hypot(bx, bz);
    if (lenA === 0 || lenB === 0)
        return null;
    // Cross-product magnitude / lenA = perpendicular distance from B's start to A's line.
    const cross = ax * bz - az * bx;
    if (Math.abs(cross) > 1e-6 * lenA * lenB)
        return null; // not parallel
    // Project B's endpoints onto A's centreline and measure perpendicular distance
    const ux = ax / lenA, uz = az / lenA; // A unit
    const dStartX = b.start[0] - a.start[0], dStartZ = b.start[2] - a.start[2];
    // Perpendicular distance = |dStart × u| in 2D
    const perpDist = Math.abs(dStartX * uz - dStartZ * ux);
    if (perpDist > coincidenceMm)
        return null;
    // Project B's endpoints onto A's axis (parametric tA along A in mm)
    const tA_bStart = dStartX * ux + dStartZ * uz;
    const tA_bEnd = (b.end[0] - a.start[0]) * ux + (b.end[2] - a.start[2]) * uz;
    const overlapMin = Math.max(0, Math.min(tA_bStart, tA_bEnd));
    const overlapMax = Math.min(lenA, Math.max(tA_bStart, tA_bEnd));
    if (overlapMax <= overlapMin)
        return null; // no overlap
    const posOnA = (overlapMin + overlapMax) / 2;
    // Convert posOnA back to a point in world XZ, then project onto B's axis to get posOnB
    const ptX = a.start[0] + posOnA * ux;
    const ptZ = a.start[2] + posOnA * uz;
    const vbx = bx / lenB, vbz = bz / lenB;
    const posOnB = (ptX - b.start[0]) * vbx + (ptZ - b.start[2]) * vbz;
    return { posOnA, posOnB };
}
// ---------- Validator: RFY format version ----------
export class RfyVersionMismatch extends Error {
    found;
    constructor(found) {
        super(`RFY version "${found ?? "MISSING"}" not supported (need ≥ 2.12.0)`);
        this.found = found;
        this.name = "RfyVersionMismatch";
    }
}
const MIN_RFY_VERSION = { major: 2, minor: 12, patch: 0 };
export function assertRfyVersion(rfyXml) {
    // Real Detailer-emitted RFYs use `<schedule version="2">` as the root, not
    // `<rfy version="X.Y.Z">`. The semver gate only applies when an `<rfy>` tag
    // is explicitly present (e.g. synthetic test inputs or future RFY-versioned
    // bundles). When no `<rfy>` element exists, accept the file as-is.
    const rfyTag = rfyXml.match(/<rfy\b[^>]*>/);
    if (!rfyTag)
        return;
    const m = rfyTag[0].match(/\bversion="([^"]+)"/);
    if (!m)
        throw new RfyVersionMismatch(null);
    const parts = m[1].split(".").map(n => parseInt(n, 10));
    const [maj, min, pat] = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
    const ok = maj > MIN_RFY_VERSION.major ||
        (maj === MIN_RFY_VERSION.major && min > MIN_RFY_VERSION.minor) ||
        (maj === MIN_RFY_VERSION.major && min === MIN_RFY_VERSION.minor && pat >= MIN_RFY_VERSION.patch);
    if (!ok)
        throw new RfyVersionMismatch(m[1]);
}
// =============================================================================
// Core walker — simplifyLinearTrussRfy()
// =============================================================================
const DEFAULTS = {
    rewrite: true,
    intersectionSlackMm: 20,
    endZoneMm: 30,
    apexCollisionMm: 17,
    parallelCoincidenceMm: 5,
};
export function simplifyLinearTrussRfy(rfyBytes, frames, planNameByFrame, opts = {}) {
    const cfg = { ...DEFAULTS, ...opts };
    const gate = opts.profileGate ?? DEFAULT_PROFILE_GATE;
    const exclude = opts.excludeFrames ?? new Set();
    // Decrypt + assert RFY version up front — refuse incompatible files.
    const rfyXml = decryptRfy(rfyBytes);
    assertRfyVersion(rfyXml);
    const parser = new XMLParser({
        ignoreAttributes: false, attributeNamePrefix: "@_",
        preserveOrder: true, allowBooleanAttributes: true, parseAttributeValue: false,
    });
    const builder = new XMLBuilder({
        ignoreAttributes: false, attributeNamePrefix: "@_",
        preserveOrder: true, format: true, indentBy: "  ",
        suppressBooleanAttributes: false,
    });
    const tree = parser.parse(rfyXml);
    const decisions = [];
    const appliedFrames = [];
    const frameByName = new Map();
    for (const f of frames)
        frameByName.set(f.name, f);
    // Recursive walker — find every <frame name="..."> and process its <stick>s.
    const walk = (node) => {
        if (!Array.isArray(node)) {
            if (node && typeof node === "object") {
                for (const k of Object.keys(node)) {
                    const v = node[k];
                    if (Array.isArray(v))
                        walk(v);
                }
            }
            return;
        }
        for (const item of node) {
            if (item.frame && Array.isArray(item.frame)) {
                processFrame(item, frameByName, planNameByFrame, gate, cfg, exclude, decisions, appliedFrames);
            }
            else if (typeof item === "object" && item !== null) {
                for (const k of Object.keys(item)) {
                    const v = item[k];
                    if (Array.isArray(v))
                        walk(v);
                }
            }
        }
    };
    walk(tree);
    // If audit-only or no frames applied, return original bytes verbatim.
    if (!cfg.rewrite || appliedFrames.length === 0) {
        return { rfy: rfyBytes, decisions, appliedFrames };
    }
    const newXml = builder.build(tree);
    const newRfy = encryptRfy(newXml);
    return { rfy: newRfy, decisions, appliedFrames };
}
function processFrame(frameWrap, frameByName, planNameByFrame, gate, cfg, exclude, decisions, appliedFrames) {
    const frameName = frameWrap[":@"]?.["@_name"];
    if (!frameName)
        return;
    if (exclude.has(frameName)) {
        decisions.push({ frame: frameName, decision: "SKIP", reason: "in exclude list" });
        return;
    }
    const planName = planNameByFrame.get(frameName);
    if (!planName) {
        decisions.push({ frame: frameName, decision: "SKIP", reason: `frame ${frameName} not in input ParsedFrame[] / plan map` });
        return;
    }
    const parsed = frameByName.get(frameName);
    if (!parsed) {
        decisions.push({ frame: frameName, decision: "SKIP", reason: `frame ${frameName} not in input ParsedFrame[]` });
        return;
    }
    const lin = isLinearTruss(parsed, planName, gate);
    if (!lin.ok) {
        decisions.push({ frame: frameName, decision: "SKIP", reason: lin.reason });
        return;
    }
    const zero = guardZeroLength(parsed.sticks);
    if (!zero.ok) {
        decisions.push({ frame: frameName, decision: "SKIP", reason: zero.reason });
        return;
    }
    // Compute new bolt positions per stick using all pairwise intersections,
    // dropping end-zone violators (FALLBACK), deduping apex collisions.
    const segOf = (s) => ({
        start: [s.start.x, s.start.y, s.start.z],
        end: [s.end.x, s.end.y, s.end.z],
    });
    const newPositionsPerStick = new Map();
    const fallbackSticks = new Set();
    for (let i = 0; i < parsed.sticks.length; i++) {
        for (let j = i + 1; j < parsed.sticks.length; j++) {
            const sA = parsed.sticks[i], sB = parsed.sticks[j];
            const segA = segOf(sA), segB = segOf(sB);
            const lenA = stickLength3D(segA), lenB = stickLength3D(segB);
            const inter = lineIntersectionXZ(segA, segB, cfg.intersectionSlackMm);
            let posA, posB;
            if (inter !== null) {
                posA = Math.max(0, Math.min(lenA, inter.t * lenA));
                posB = Math.max(0, Math.min(lenB, inter.u * lenB));
            }
            else {
                const par = handleParallelPair(segA, segB, cfg.parallelCoincidenceMm);
                if (par === null)
                    continue;
                posA = par.posOnA;
                posB = par.posOnB;
            }
            pushPosition(newPositionsPerStick, sA.name, posA);
            pushPosition(newPositionsPerStick, sB.name, posB);
        }
    }
    // Apply end-zone + dedupApex per stick.
    const finalPerStick = new Map();
    for (const [stickName, raw] of newPositionsPerStick) {
        const stick = parsed.sticks.find(s => s.name === stickName);
        if (!stick)
            continue;
        const len = stickLength3D(segOf(stick));
        const dedup = dedupApex(raw, cfg.apexCollisionMm);
        const ez = assertEndZone(dedup.kept, len, cfg.endZoneMm);
        if (ez.violations.length > 0) {
            fallbackSticks.add(stickName);
            continue; // FALLBACK: keep source RFY's Web ops for this stick (skip rewrite below)
        }
        finalPerStick.set(stickName, ez.safe);
    }
    // Mutate the RFY XML — replace Web point-tools per stick, preserve all
    // physical-fit ops byte-identical. FALLBACK sticks: don't touch their tooling.
    let modifiedSticks = 0;
    let totalNewBolts = 0;
    for (const child of frameWrap.frame) {
        const stickArr = child.stick;
        if (!Array.isArray(stickArr))
            continue;
        const stickName = child[":@"]?.["@_name"];
        if (!stickName)
            continue;
        if (fallbackSticks.has(stickName))
            continue;
        const positions = finalPerStick.get(stickName);
        if (!positions)
            continue;
        // Find the <tooling> child inside this stick.
        const toolingNode = stickArr.find((c) => c.tooling !== undefined);
        if (!toolingNode || !Array.isArray(toolingNode.tooling))
            continue;
        // Filter out existing point-tool Web ops; keep everything else byte-identical.
        const filtered = toolingNode.tooling.filter(op => {
            if ("point-tool" in op) {
                const t = op[":@"]?.["@_type"];
                return t !== "Web";
            }
            return true;
        });
        // Append new Web ops at simplified positions.
        for (const pos of positions) {
            filtered.push({
                "point-tool": [],
                ":@": { "@_type": "Web", "@_pos": pos.toFixed(2) },
            });
        }
        toolingNode.tooling = filtered;
        modifiedSticks++;
        totalNewBolts += positions.length;
    }
    // Frame-level decision per spec §6 (table): APPLY when at least one stick
    // was modified. Stick-level fallbacks are surfaced via `fallbackSticks` but
    // do not demote the frame's decision. FALLBACK at the frame level is
    // reserved for the (currently unused) case where every stick fell back —
    // i.e. the frame matched the gate but produced zero usable rewrites.
    if (modifiedSticks > 0) {
        decisions.push({
            frame: frameName,
            decision: "APPLY",
            reason: fallbackSticks.size > 0
                ? `${modifiedSticks} sticks updated, ${fallbackSticks.size} fell back (end-zone violation)`
                : `${modifiedSticks} sticks updated`,
            modifiedSticks, newBoltCount: totalNewBolts,
            ...(fallbackSticks.size > 0 ? { fallbackSticks: [...fallbackSticks] } : {}),
        });
        appliedFrames.push(frameName);
    }
    else {
        decisions.push({
            frame: frameName,
            decision: "FALLBACK",
            reason: `all ${fallbackSticks.size} sticks fell back (end-zone violation) — keeping source RFY's Web ops`,
            modifiedSticks: 0, newBoltCount: 0,
            fallbackSticks: [...fallbackSticks],
        });
    }
}
function pushPosition(map, key, value) {
    const arr = map.get(key);
    if (arr)
        arr.push(value);
    else
        map.set(key, [value]);
}
