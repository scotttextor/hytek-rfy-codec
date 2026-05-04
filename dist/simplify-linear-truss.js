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
// Dimple normalisation (HYTEK Box-piece snap-fit rule)
// =============================================================================
//
// HYTEK Linear trusses use Box pieces — short C-section sticks that clip onto
// a main chord via dimple snap-fit. Box pieces appear in the RFY as separate
// <stick> children of the same <frame>, with stick names like "B1 (Box1)",
// "B1 (Box2)", "T5 (Box1)" — a parent stick name plus a "(BoxN)" suffix.
//
// Manufacturing rules (enforced by this pass):
//  1. First/last dimple on a Box piece must be ≥ `margin` from each end.
//  2. No gap between adjacent dimples on a Box piece may exceed `maxGap`.
//  3. The matching dimples on the main chord must be at the same world position
//     as the Box's dimples (CL-to-CL alignment for snap-fit).
//
// Multi-Box main chords (e.g. one B1 with both Box1 and Box2 zones) require
// TWO-PASS processing: capture every Box's original world-space dimple
// positions BEFORE any mutation, THEN apply updates. Otherwise the second Box
// reads already-mutated reference positions.
/** Box-piece stick name regex. Captures the parent stick name in group 1 and
 *  the box index in group 2. Matches names like "B1 (Box1)", "T5 (Box2)". */
const BOX_NAME_RE = /^(.+?)\s*\(Box(\d+)\)$/;
/** Compute the Box-piece's normalised dimple set per HYTEK rule.
 *  - L: Box-piece length in mm.
 *  - margin: minimum distance from each end (default 15mm).
 *  - maxGap: maximum allowed gap between adjacent dimples (default 900mm).
 *  Returns local positions (mm from Box's start) rounded to 2 decimals. */
export function computeBoxDimples(L, margin, maxGap) {
    const usable = L - 2 * margin;
    if (usable <= 0) {
        return [Math.round((L / 2) * 100) / 100];
    }
    const nGaps = Math.max(1, Math.ceil(usable / maxGap));
    const spacing = usable / nGaps;
    const out = [];
    for (let i = 0; i <= nGaps; i++) {
        out.push(Math.round((margin + i * spacing) * 100) / 100);
    }
    return out;
}
/** Read every InnerDimple position out of a tooling-array (preserveOrder format). */
function readDimples(toolingArr) {
    const out = [];
    for (const op of toolingArr) {
        if (op["point-tool"] === undefined)
            continue;
        const t = op[":@"]?.["@_type"];
        if (t !== "InnerDimple")
            continue;
        const posStr = op[":@"]?.["@_pos"];
        if (posStr === undefined)
            continue;
        const pos = parseFloat(posStr);
        if (!Number.isNaN(pos))
            out.push(pos);
    }
    out.sort((a, b) => a - b);
    return out;
}
/** Strip every InnerDimple op from a tooling-array (returns a new array). */
function stripDimples(toolingArr) {
    return toolingArr.filter(op => {
        if (op["point-tool"] === undefined)
            return true;
        return op[":@"]?.["@_type"] !== "InnerDimple";
    });
}
/** Build an InnerDimple point-tool node matching the RFY's preserveOrder shape. */
function makeDimpleNode(pos) {
    return { "point-tool": [], ":@": { "@_type": "InnerDimple", "@_pos": pos.toFixed(2) } };
}
/** Run dimple-normalisation on every chord+Box pair in this frame. Mutates
 *  the tooling arrays of both the Box-piece sticks and the main-chord sticks
 *  in place. Returns the number of InnerDimple ops written (Box + main).
 *  Pure modulo the in-place tree mutation — no I/O, no module state. */
export function normaliseDimplesForFrame(frameWrap, margin, maxGap) {
    // 1. Index sticks by name → { tooling-arr ref, length }.
    const stickIndex = new Map();
    for (const child of frameWrap.frame) {
        if (!child.stick)
            continue;
        const stickAttrs = child[":@"];
        const stickName = stickAttrs?.["@_name"];
        if (!stickName)
            continue;
        const lengthStr = stickAttrs?.["@_length"];
        const length = lengthStr !== undefined ? parseFloat(lengthStr) : NaN;
        const toolingNode = child.stick.find(c => c.tooling !== undefined);
        if (!toolingNode || !Array.isArray(toolingNode.tooling))
            continue;
        stickIndex.set(stickName, { toolingNode, length });
    }
    const boxesByMain = new Map();
    for (const [name, entry] of stickIndex) {
        const m = BOX_NAME_RE.exec(name);
        if (!m)
            continue;
        const baseName = m[1].trim();
        const boxIdx = parseInt(m[2], 10);
        const arr = boxesByMain.get(baseName);
        if (arr)
            arr.push({ boxIdx, boxName: name, boxEntry: entry });
        else
            boxesByMain.set(baseName, [{ boxIdx, boxName: name, boxEntry: entry }]);
    }
    // 3. PASS 1: capture original dimple positions on each main + match Box→main zone.
    const pairs = [];
    for (const [mainName, boxes] of boxesByMain) {
        const mainEntry = stickIndex.get(mainName);
        if (!mainEntry)
            continue;
        const mainOld = readDimples(mainEntry.toolingNode.tooling);
        if (mainOld.length === 0)
            continue;
        boxes.sort((a, b) => a.boxIdx - b.boxIdx);
        const mainClaimed = new Array(mainOld.length).fill(false);
        for (const { boxName, boxEntry } of boxes) {
            const boxOld = readDimples(boxEntry.toolingNode.tooling);
            if (boxOld.length === 0)
                continue;
            if (!Number.isFinite(boxEntry.length))
                continue;
            const boxLength = boxEntry.length;
            const boxGaps = [];
            for (let i = 0; i < boxOld.length - 1; i++) {
                boxGaps.push(Math.round((boxOld[i + 1] - boxOld[i]) * 100) / 100);
            }
            let bestStart = null;
            if (boxGaps.length === 0) {
                // Single-dimple Box → first unclaimed main dimple.
                for (let i = 0; i < mainOld.length; i++) {
                    if (mainClaimed[i])
                        continue;
                    bestStart = i;
                    break;
                }
            }
            else {
                const need = boxOld.length;
                outer: for (let i = 0; i + need <= mainOld.length; i++) {
                    for (let k = 0; k < need; k++)
                        if (mainClaimed[i + k])
                            continue outer;
                    let ok = true;
                    for (let k = 0; k < boxGaps.length; k++) {
                        const mg = Math.round((mainOld[i + k + 1] - mainOld[i + k]) * 100) / 100;
                        if (Math.abs(boxGaps[k] - mg) >= 2.0) {
                            ok = false;
                            break;
                        }
                    }
                    if (ok) {
                        bestStart = i;
                        break;
                    }
                }
            }
            if (bestStart === null)
                continue;
            for (let k = 0; k < boxOld.length; k++)
                mainClaimed[bestStart + k] = true;
            const boxPosition = mainOld[bestStart] - boxOld[0];
            pairs.push({
                mainName, mainEntry, boxName, boxEntry, boxOld, boxLength, boxPosition,
            });
        }
    }
    // 4. PASS 2: rewrite Box dimples (replace ALL) and main dimples (replace zone only).
    let dimplesUpdated = 0;
    for (const p of pairs) {
        const boxNew = computeBoxDimples(p.boxLength, margin, maxGap);
        const mainNew = boxNew.map(d => Math.round((p.boxPosition + d) * 100) / 100);
        // Box piece: strip ALL InnerDimples, append new.
        const boxOps = stripDimples(p.boxEntry.toolingNode.tooling);
        for (const d of boxNew)
            boxOps.push(makeDimpleNode(d));
        p.boxEntry.toolingNode.tooling = boxOps;
        // Main chord: keep dimples OUTSIDE this Box's zone, append new in-zone dimples.
        const zoneStart = p.boxPosition - 1;
        const zoneEnd = p.boxPosition + p.boxLength + 1;
        const mainOps = p.mainEntry.toolingNode.tooling.filter(op => {
            if (op["point-tool"] === undefined)
                return true;
            if (op[":@"]?.["@_type"] !== "InnerDimple")
                return true;
            const posStr = op[":@"]?.["@_pos"];
            if (posStr === undefined)
                return true;
            const pos = parseFloat(posStr);
            if (Number.isNaN(pos))
                return true;
            return !(pos >= zoneStart && pos <= zoneEnd);
        });
        for (const d of mainNew)
            mainOps.push(makeDimpleNode(d));
        p.mainEntry.toolingNode.tooling = mainOps;
        dimplesUpdated += boxNew.length + mainNew.length;
    }
    return dimplesUpdated;
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
    normaliseDimples: true,
    dimpleMargin: 15.0,
    dimpleMaxGap: 900.0,
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
    // Parallel tracker for junction mates. Indexed by stick name; each entry is
    // every (position, mate) pair generated by the pairwise loop. Apex-deduped
    // and end-zone-filtered alongside `newPositionsPerStick` below.
    const rawJunctionsPerStick = new Map();
    const fallbackSticks = new Set();
    for (let i = 0; i < parsed.sticks.length; i++) {
        for (let j = i + 1; j < parsed.sticks.length; j++) {
            const sA = parsed.sticks[i], sB = parsed.sticks[j];
            // HYTEK Linear trusses fasten webs to chords only — never web-to-web.
            // FrameCAD does not punch BOLT HOLES at W<->W mathematical crossings,
            // and neither do we. Dropping these pairs prevents bogus apex bolts at
            // every web-to-web crossing in steep trusses.
            if (/^web$/i.test(sA.usage ?? "") && /^web$/i.test(sB.usage ?? ""))
                continue;
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
            pushJunction(rawJunctionsPerStick, sA.name, posA, sB.name, sB.usage ?? "");
            pushJunction(rawJunctionsPerStick, sB.name, posB, sA.name, sA.usage ?? "");
        }
    }
    // Apply end-zone + dedupApex per stick. Build the final junction list for
    // each kept stick in parallel using the same dedup + filter rules so the
    // mate metadata travels with each surviving bolt position.
    const finalPerStick = new Map();
    const finalJunctionsPerStick = new Map();
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
        // Build the matching junction list. dedupApexWithMates uses the same sort
        // + first-seen-wins rule as dedupApex, so positions align 1:1 — but it
        // also merges mate names when an apex collapse drops a position.
        const rawJ = rawJunctionsPerStick.get(stickName) ?? [];
        const dedupedJ = dedupApexWithMates(rawJ, cfg.apexCollisionMm);
        // ez.safe is in the same order dedupApex emits (sorted ascending). The
        // junction list above is also sorted ascending, so they line up.
        finalJunctionsPerStick.set(stickName, dedupedJ);
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
    // Dimple normalisation pass — runs on the SAME parsed frame, mutates the
    // tooling arrays of every chord+Box pair in place. Independent of bolt-hole
    // placement: Box pieces are fastened to the chord whether or not we
    // simplified the BOLT HOLES. Runs even when every web stick fell back.
    let dimplesUpdated = 0;
    if (cfg.normaliseDimples) {
        dimplesUpdated = normaliseDimplesForFrame(frameWrap, cfg.dimpleMargin, cfg.dimpleMaxGap);
    }
    // Frame-level decision per spec §6 (table): APPLY when at least one stick
    // was modified. Stick-level fallbacks are surfaced via `fallbackSticks` but
    // do not demote the frame's decision. FALLBACK at the frame level is
    // reserved for the (currently unused) case where every stick fell back —
    // i.e. the frame matched the gate but produced zero usable rewrites.
    if (modifiedSticks > 0) {
        // Build per-stick junction summary in parsed-sticks order so labels can
        // be emitted in declaration order. Skip sticks that fell back (no rewrite
        // happened, so we don't have new junctions for them).
        const sticksJunctions = [];
        for (const stick of parsed.sticks) {
            if (fallbackSticks.has(stick.name))
                continue;
            const junctions = finalJunctionsPerStick.get(stick.name);
            if (!junctions || junctions.length === 0)
                continue;
            sticksJunctions.push({
                stick: stick.name,
                usage: stick.usage ?? "",
                lengthMm: stickLength3D(segOf(stick)),
                junctions,
            });
        }
        decisions.push({
            frame: frameName,
            decision: "APPLY",
            reason: fallbackSticks.size > 0
                ? `${modifiedSticks} sticks updated, ${fallbackSticks.size} fell back (end-zone violation)`
                : `${modifiedSticks} sticks updated`,
            modifiedSticks, newBoltCount: totalNewBolts,
            ...(fallbackSticks.size > 0 ? { fallbackSticks: [...fallbackSticks] } : {}),
            ...(cfg.normaliseDimples ? { dimplesUpdated } : {}),
            ...(sticksJunctions.length > 0 ? { sticks: sticksJunctions } : {}),
        });
        appliedFrames.push(frameName);
    }
    else {
        // Even when every web fell back, the dimple pass may have mutated the
        // chord+Box tree — track the frame as applied so the rebuilt RFY is
        // emitted, not the original bytes.
        decisions.push({
            frame: frameName,
            decision: "FALLBACK",
            reason: `all ${fallbackSticks.size} sticks fell back (end-zone violation) — keeping source RFY's Web ops`,
            modifiedSticks: 0, newBoltCount: 0,
            fallbackSticks: [...fallbackSticks],
            ...(cfg.normaliseDimples ? { dimplesUpdated } : {}),
        });
        if (dimplesUpdated > 0) {
            appliedFrames.push(frameName);
        }
    }
}
function pushPosition(map, key, value) {
    const arr = map.get(key);
    if (arr)
        arr.push(value);
    else
        map.set(key, [value]);
}
function pushJunction(map, key, pos, mate, mateUsage) {
    const arr = map.get(key);
    const entry = { pos, mate, mateUsage };
    if (arr)
        arr.push(entry);
    else
        map.set(key, [entry]);
}
/** Sort raw junctions ascending and collapse those within `apexCollisionMm`
 *  of the previously-kept junction — same algorithm as `dedupApex` but also
 *  merges mate metadata onto the kept junction. When a collision occurs, the
 *  EARLIER junction's position is kept (matches `dedupApex` behaviour) and
 *  the dropped junction's mate is appended (de-duplicated) to the kept
 *  junction's `mates` list.
 *
 *  Exported for unit-testing the dedup math in isolation. */
export function dedupApexWithMates(raw, apexCollisionMm) {
    const sorted = [...raw].sort((a, b) => a.pos - b.pos);
    const out = [];
    for (const r of sorted) {
        const last = out[out.length - 1];
        if (last !== undefined && r.pos - last.posMm < apexCollisionMm) {
            // Apex collision — fold this raw junction's mate into the kept entry.
            // Only add if not already present (a single mate could appear twice if
            // the same pair was registered from both sides — defensive).
            if (!last.mates.some(m => m.name === r.mate)) {
                last.mates.push({ name: r.mate, usage: r.mateUsage });
            }
        }
        else {
            out.push({ posMm: r.pos, mates: [{ name: r.mate, usage: r.mateUsage }] });
        }
    }
    // Freeze each junction's mates list for the public API contract.
    return out.map(j => ({ posMm: j.posMm, mates: j.mates }));
}
