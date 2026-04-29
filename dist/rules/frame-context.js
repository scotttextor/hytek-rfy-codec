import { profileOffsets } from "./table.js";
/** Compute a stick's bounding box in 2D frame coords. */
export function computeBox(stick) {
    const corners = stick.outlineCorners ?? [];
    if (corners.length < 2)
        return null;
    const xs = corners.map(c => c.x);
    const ys = corners.map(c => c.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    return {
        xMin, xMax, yMin, yMax,
        cx: (xMin + xMax) / 2,
        cy: (yMin + yMax) / 2,
    };
}
/** Stick role = name prefix (e.g. "S", "T", "B", "N", "Kb"). */
export function roleFromName(name) {
    return name.replace(/[0-9_].*$/, "");
}
/** Layout a frame: assign each stick a bounding box and orientation. */
export function layoutFrame(frame) {
    const out = [];
    for (const s of frame.sticks) {
        const box = computeBox(s);
        if (!box)
            continue;
        const w = box.xMax - box.xMin;
        const h = box.yMax - box.yMin;
        out.push({
            stick: s, role: roleFromName(s.name),
            box, horizontal: w > h,
        });
    }
    return out;
}
const STUD_ROLES = new Set(["S", "Kb", "J", "H"]);
const TOP_PLATE_ROLES = new Set(["T", "Tp"]);
const BOT_PLATE_ROLES = new Set(["B", "Bp"]);
const NOG_ROLES = new Set(["N", "Nog"]);
const ALL_PLATE_ROLES = new Set([...TOP_PLATE_ROLES, ...BOT_PLATE_ROLES, ...NOG_ROLES]);
/** Convert a frame-X-coord crossing into a position along the plate's length. */
function plateLocalPosition(plate, crossingX) {
    // Plates run horizontally; the position along the plate is the crossing X
    // minus the plate's xMin. (The plate's "length" axis runs xMin → xMax.)
    return crossingX - plate.box.xMin;
}
/** Convert a frame-Y-coord crossing into a position along the stud's length. */
function studLocalPosition(stud, crossingY) {
    // Studs run vertically; position along stud is crossingY - yMin.
    // BUT some studs are "flipped" (run top-down) and the position would be
    // length - localY. We use yMin → length convention by default (matches
    // observation that the start-end ops at y=yMin & y=yMax pair with pos=0/length).
    return crossingY - stud.box.yMin;
}
/**
 * Generate frame-context tooling ops for every stick in the frame.
 * Returns: Map<stickName, RfyToolingOp[]>
 *
 * The per-stick base rules (table.ts) handle end-anchored ops. Frame-context
 * rules add LIP NOTCH + DIMPLE pairs at crossings.
 */
export function generateFrameContextOps(frame) {
    const layout = layoutFrame(frame);
    const result = new Map();
    for (const sb of layout)
        result.set(sb.stick.name, []);
    // Studs: vertical members
    const studs = layout.filter(sb => STUD_ROLES.has(sb.role));
    // Plates+nogs: horizontal members
    const plates = layout.filter(sb => ALL_PLATE_ROLES.has(sb.role));
    for (const plate of plates) {
        const offsets = profileOffsets(plate.stick.profile.metricLabel.replace(/\s/g, ""));
        const span = offsets.span;
        const internalSpan = 45; // width of internal lip notches (vs 39 at edges)
        const internalDimpleOffset = 22.5; // internal lip notch midpoint offset
        const isTop = TOP_PLATE_ROLES.has(plate.role);
        const isBot = BOT_PLATE_ROLES.has(plate.role);
        const stickOps = result.get(plate.stick.name);
        for (const stud of studs) {
            // Does this stud's bounding box overlap the plate's bounding box?
            // Plate spans the full frame horizontally; stud spans some Y range.
            // The crossing happens if stud's Y range overlaps plate's Y range.
            const yOverlap = stud.box.yMax >= plate.box.yMin && stud.box.yMin <= plate.box.yMax;
            if (!yOverlap)
                continue;
            // The crossing X is the stud's centerline (or X overlap with plate).
            const crossingX = stud.box.cx;
            // Skip if crossing is outside plate's X range (with extra tolerance for studs
            // at the very start/end — those are handled by per-stick edge rules).
            if (crossingX < plate.box.xMin + 50)
                continue;
            if (crossingX > plate.box.xMax - 50)
                continue;
            const localPos = plateLocalPosition(plate, crossingX);
            // Skip if the crossing is at or near the plate's start/end (those are handled by per-stick rules)
            if (localPos < span + 5)
                continue;
            if (localPos > plate.stick.length - span - 5)
                continue;
            // Internal lip notch: spanned, centred on stud, span 45mm typically
            const studWidth = stud.box.xMax - stud.box.xMin;
            const lipSpan = Math.max(internalSpan, studWidth + 4);
            const startPos = localPos - lipSpan / 2;
            const endPos = startPos + lipSpan;
            stickOps.push({
                kind: "spanned", type: "LipNotch",
                startPos: round(startPos), endPos: round(endPos),
            });
            // Dimple inside the lip notch
            stickOps.push({
                kind: "point", type: "InnerDimple",
                pos: round(startPos + internalDimpleOffset),
            });
        }
    }
    // Studs: nogs cross them — Detailer uses SWAGE + DIMPLE at the crossing
    // (not LipNotch — confirmed from fixture data: S2/S3 in N28 had Swage at 1303..1348).
    const nogs = layout.filter(sb => NOG_ROLES.has(sb.role));
    for (const stud of studs) {
        const stickOps = result.get(stud.stick.name);
        for (const nog of nogs) {
            // Does nog's X range cross stud's X range?
            const xOverlap = nog.box.xMax >= stud.box.xMin && nog.box.xMin <= stud.box.xMax;
            if (!xOverlap)
                continue;
            const crossingY = nog.box.cy;
            if (crossingY < stud.box.yMin - 1 || crossingY > stud.box.yMax + 1)
                continue;
            const localPos = studLocalPosition(stud, crossingY);
            if (localPos < 50)
                continue;
            if (localPos > stud.stick.length - 50)
                continue;
            const nogWidth = nog.box.yMax - nog.box.yMin;
            const swageSpan = Math.max(45, nogWidth + 4);
            const startPos = localPos - swageSpan / 2;
            const endPos = startPos + swageSpan;
            stickOps.push({
                kind: "spanned", type: "Swage",
                startPos: round(startPos), endPos: round(endPos),
            });
            stickOps.push({
                kind: "point", type: "InnerDimple",
                pos: round(startPos + 22.5),
            });
        }
    }
    // Nogs: studs cross them; emit WEB+LIP NOTCH + DIMPLE
    for (const nog of nogs) {
        const stickOps = result.get(nog.stick.name);
        for (const stud of studs) {
            const yOverlap = stud.box.yMax >= nog.box.yMin && stud.box.yMin <= nog.box.yMax;
            if (!yOverlap)
                continue;
            const crossingX = stud.box.cx;
            if (crossingX < nog.box.xMin - 1 || crossingX > nog.box.xMax + 1)
                continue;
            const localPos = plateLocalPosition(nog, crossingX);
            if (localPos < 50)
                continue;
            if (localPos > nog.stick.length - 50)
                continue;
            const studWidth = stud.box.xMax - stud.box.xMin;
            const lipSpan = Math.max(45, studWidth + 4);
            const startPos = localPos - lipSpan / 2;
            const endPos = startPos + lipSpan;
            stickOps.push({ kind: "spanned", type: "InnerNotch", startPos: round(startPos), endPos: round(endPos) });
            stickOps.push({ kind: "spanned", type: "LipNotch", startPos: round(startPos), endPos: round(endPos) });
            stickOps.push({ kind: "point", type: "InnerDimple", pos: round(startPos + 22.5) });
        }
    }
    return result;
}
function round(n) { return Math.round(n * 10000) / 10000; }
