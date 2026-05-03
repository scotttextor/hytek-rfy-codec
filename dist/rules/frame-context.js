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
const STUD_ROLES = new Set(["S", "J"]); // narrow vertical members only
const TRUSS_WEB_ROLES = new Set(["W", "V"]); // truss web members: W=diagonal, V=vertical post (FJ joists)
const CRIPPLE_ROLES = new Set(["Kb", "H"]); // wide horizontal+vertical hybrids — handled separately
const TOP_PLATE_ROLES = new Set(["T", "Tp"]);
const BOT_PLATE_ROLES = new Set(["B", "Bp"]);
const NOG_ROLES = new Set(["N", "Nog"]);
const ALL_PLATE_ROLES = new Set([...TOP_PLATE_ROLES, ...BOT_PLATE_ROLES, ...NOG_ROLES]);
const STUD_MAX_WIDTH = 100; // real studs are ~40mm wide; Kb/H outlines can be 500mm+
/** Get the stick's 2D centerline midpoints at start and end, derived from
 *  outlineCorners. The corners are the 4-point CCW rectangle around the
 *  diagonal axis, so:
 *    start_centerline = midpoint of corners[0] + corners[3]
 *    end_centerline   = midpoint of corners[1] + corners[2]
 */
function getCenterlineEndpoints(stick) {
    const c = stick.outlineCorners;
    if (!c || c.length < 4)
        return null;
    return {
        startL: { x: (c[0].x + c[3].x) / 2, y: (c[0].y + c[3].y) / 2 },
        endL: { x: (c[1].x + c[2].x) / 2, y: (c[1].y + c[2].y) / 2 },
    };
}
/** Compute the x-position where the stick's centerline intersects y = atY.
 *  Works for both axis-aligned and diagonal sticks. Returns null if the
 *  stick's centerline doesn't span atY or is purely horizontal. */
function getCrossingX(stick, atY) {
    const c = getCenterlineEndpoints(stick);
    if (!c)
        return null;
    const dy = c.endL.y - c.startL.y;
    if (Math.abs(dy) < 1e-6)
        return null; // horizontal stick — doesn't cross horizontal chord
    // Allow small tolerance outside the strict y-range so chord-level crossings near
    // the stick's endpoints still register.
    const yMin = Math.min(c.startL.y, c.endL.y) - 5;
    const yMax = Math.max(c.startL.y, c.endL.y) + 5;
    if (atY < yMin || atY > yMax)
        return null;
    const t = (atY - c.startL.y) / dy;
    return c.startL.x + t * (c.endL.x - c.startL.x);
}
/** Convert a frame-X-coord crossing into a position along the plate's length.
 *
 * Detailer's frame projection always orients corners[0] at the stick's
 * worldStart end and corners[1] at worldEnd. So in frame-local 2D coords
 * the stick-local axis (pos 0 → pos length) maps directly to xMin → xMax.
 * Verified vs HG260012 LBW T1+H1: corners[0]=(4,_) and (877.5,_)
 * respectively, both at xMin, both at worldStart end of the stick.
 */
function plateLocalPosition(plate, crossingX) {
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
    // Studs: narrow vertical members (S, J). Filter out wide outlines (Kb/H).
    const studs = layout.filter(sb => STUD_ROLES.has(sb.role) && (sb.box.xMax - sb.box.xMin) <= STUD_MAX_WIDTH);
    // Truss webs (W): vertical posts AND diagonal members in trusses. They
    // cross top/bottom chords like studs but for diagonals the bbox.cx isn't
    // meaningful — we use line-intersection geometry to find the actual
    // crossing X at the chord's y-level.
    // ONLY actual truss webs (usage="web") — LBW walls have W-named sticks
    // with usage="Stud" (B2B partner studs); those are NOT truss webs and
    // shouldn't trigger truss-chord behavior on plates.
    const trussWebs = layout.filter(sb => TRUSS_WEB_ROLES.has(sb.role) &&
        String(sb.stick.usage ?? "").toLowerCase() === "web");
    // Cripple studs: also vertical, but their outlines are too wide to be useful for crossing detection.
    // Their connection point is at one of their X edges (which we treat as a virtual stud).
    const cripples = layout.filter(sb => CRIPPLE_ROLES.has(sb.role));
    // Plates: top + bottom plates only (NOT nogs — nogs are handled in their
    // own loop below with InnerNotch + LipNotch ops at each stud crossing.
    // Including nogs here would double-emit LipNotch + InnerDimple at each
    // crossing — verified 2026-04-30 against HG260044 reference where the
    // duplicate emissions accounted for ~660 over-emissions of LipNotch).
    const plates = layout.filter(sb => ALL_PLATE_ROLES.has(sb.role) && !NOG_ROLES.has(sb.role));
    // Build virtual stud crossings from cripple sticks at each X edge of bbox.
    // Kb-edge centerline is 22.5mm from xMin/xMax (NOT 20). Verified
    // 2026-05-03 vs HG260012 L1101 (Kb1 x=235.6-523.1, ref T1 dimple at 496.6
    // = 523.1 - 4 - 22.5) and L1104 (Kb1 x=104.7-409.2, ref T1 dimple at
    // 123.4 = 104.7 + 22.7 - 4). The 20mm offset was systematically off by
    // 2.5mm, producing 2-3mm InnerDimple drift on every Kb-bordering plate
    // crossing across the LBW corpus.
    const virtualStudCrossings = [];
    for (const cr of cripples) {
        virtualStudCrossings.push({
            role: "Kb-edge-left", box: { ...cr.box, xMin: cr.box.xMin, xMax: cr.box.xMin + 41, cx: cr.box.xMin + 22.5 },
            stick: cr.stick, horizontal: false,
        });
        virtualStudCrossings.push({
            role: "Kb-edge-right", box: { ...cr.box, xMin: cr.box.xMax - 41, xMax: cr.box.xMax, cx: cr.box.xMax - 22.5 },
            stick: cr.stick, horizontal: false,
        });
    }
    const allCrossingStuds = [...studs, ...virtualStudCrossings];
    // Determine if this is a wall plan (LBW/NLBW): there are nogs in the layout.
    // Trusses (TIN, TB2B) and truss-roof (CP, RP, MH) frames don't have nogs and
    // shouldn't get service holes on T plates.
    const isWallFrame = layout.some(sb => NOG_ROLES.has(sb.role));
    for (const plate of plates) {
        const offsets = profileOffsets(plate.stick.profile.metricLabel.replace(/\s/g, ""));
        const span = offsets.span;
        const internalSpan = 45; // width of internal lip notches (vs 39 at edges)
        const internalDimpleOffset = 22.5; // internal lip notch midpoint offset
        const stickOps = result.get(plate.stick.name);
        const seenPositions = new Set(); // dedupe crossings at same localPos
        // Track stud crossing positions on this plate so we can emit InnerService
        // at midpoints between adjacent studs (panel-point grid).
        const studCrossingsOnPlate = [];
        // Plate centerline y for diagonal-W intersection calc
        const plateCenterY = (plate.box.yMin + plate.box.yMax) / 2;
        // Process REAL studs first, then virtual Kb edges. Virtual Kb-edge
        // crossings get a SIDE-SPECIFIC suppression rule:
        //
        //   PLATE-CONNECTED side (where the Kb's high-Z or low-Z end actually
        //     touches this plate): ALWAYS emit. Real connection point.
        //   MID-WALL side (the OTHER endpoint, hovering between plates):
        //     emit only if the Kb's mid-wall endpoint is at LOWER world X
        //     than the nearest stud (i.e., on the LEFT side of the stud).
        //
        // 2026-05-02 — derived from HG260001 analysis across all 5 LBW frames
        // with Kbs (L1, L18, L24, L28, L30). L28 is the only frame where the
        // Kb's mid-wall endpoint is at LOWER world X than its closest stud,
        // and L28 is the only frame Detailer emits the paired notch on.
        // Hypothesised structural reason: the C-section Kb's lip orientation
        // depends on its diagonal direction; lip facing one specific side
        // requires an extra notch in the plate to clear it.
        const realStudInfos = [];
        for (const stud of allCrossingStuds) {
            const yOverlap = stud.box.yMax >= plate.box.yMin && stud.box.yMin <= plate.box.yMax;
            if (!yOverlap)
                continue;
            const crossingX = stud.box.cx;
            if (crossingX < plate.box.xMin + 50)
                continue;
            if (crossingX > plate.box.xMax - 50)
                continue;
            const localPos = plateLocalPosition(plate, crossingX);
            if (localPos < span + 5)
                continue;
            if (localPos > plate.stick.length - span - 5)
                continue;
            const isVirtualKbCrossing = stud.role?.startsWith?.("Kb-edge");
            if (isVirtualKbCrossing) {
                // Find nearest real stud (within 30mm)
                let nearestWorldX = null;
                let nearestDist = Infinity;
                for (const real of realStudInfos) {
                    const d = Math.abs(real.localPos - localPos);
                    if (d < nearestDist) {
                        nearestDist = d;
                        nearestWorldX = real.worldX;
                    }
                }
                if (nearestDist < 30 && nearestWorldX !== null) {
                    // Determine if this virtualKb is on the MID-WALL side (close to
                    // Kb.start.x — which after normalization is the mid-wall endpoint)
                    // or the PLATE-CONNECTED side (close to Kb.end.x).
                    const kbStick = stud.stick;
                    const kbMidWallX = kbStick.worldStart?.x ?? 0;
                    const kbPlateX = kbStick.worldEnd?.x ?? 0;
                    // Identify if this virtualKb represents the MID-WALL side or
                    // the PLATE-CONNECTED side. Use Z (height) of the worldStart vs
                    // worldEnd: after normalization, worldStart is the mid-wall end.
                    // If Kb's two endpoints have nearly identical X (perpendicular
                    // wall), all virtualKb crossings count as "mid-wall side" for
                    // this rule (the suppression always applies — there's no
                    // meaningful left/right in that dimension).
                    const distMidWallToStud = Math.abs(kbMidWallX - nearestWorldX);
                    const distPlateToStud = Math.abs(kbPlateX - nearestWorldX);
                    const isMidWallSide = distMidWallToStud <= distPlateToStud;
                    if (isMidWallSide) {
                        // Mid-wall side: emit only if Kb's mid-wall is STRICTLY at lower
                        // world X than the stud (Kb on LEFT of stud in world coords).
                        // Suppress when greater-or-equal (covers perpendicular walls
                        // where all sticks share an X coord — there's no meaningful
                        // left/right relationship there, so default to suppress).
                        if (kbMidWallX >= nearestWorldX - 0.5)
                            continue; // suppress
                    }
                    // Plate-connected side: never suppress (real connection point).
                }
            }
            else {
                // Real stud — track its world X for virtualKb suppression check.
                realStudInfos.push({ localPos, cx: crossingX, worldX: stud.stick.worldStart?.x ?? 0 });
            }
            // Dedupe: skip ONLY exact duplicates. Overlapping-but-distinct
            // stud crossings (B2B partner pairs) MUST stay separate.
            const quantizedPos = Math.round(localPos * 10) / 10;
            if (seenPositions.has(quantizedPos))
                continue;
            seenPositions.add(quantizedPos);
            studCrossingsOnPlate.push(localPos);
            // Internal lip notch: spanned, centred on stud, span 45mm typically
            const studWidth = stud.box.xMax - stud.box.xMin;
            const lipSpan = Math.max(internalSpan, Math.min(studWidth + 4, 80)); // cap at 80 to avoid huge spans
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
        // Truss W/V members crossing this chord — use the agent-derived edge
        // formula (verified 2026-05-02 vs HG260012 FJ corpus, all 14 notches on
        // JB1210-1/T4 exact within 0.05mm):
        //   For each web, compute long-edge intersections with chord's INNER
        //   face. Each web contributes [edge_lo - offset, edge_hi + offset]
        //   where offset = 2.0 / sin(θ), θ being the web's angle vs chord.
        //   Adjacent webs whose extended ranges overlap MERGE into one notch.
        //
        // Determine inner face: for top chord, inner face is the lower y of
        // the chord's bbox (where webs come up from below). For bottom chord,
        // inner face is the upper y.
        const usage = String(plate.stick.usage ?? "").toLowerCase();
        const isBottom = usage === "bottomplate" || usage === "bottomchord";
        const innerY = isBottom ? plate.box.yMax : plate.box.yMin;
        // Use FJ +2mm offset for all plates. Agent's lip-inset formula didn't
        // verify well against full corpus — wall LBW W stiffeners are sparse
        // and the dominant notches come from stud crossings (separate loop).
        const offsetSign = +1;
        const offsetMagnitudeBase = 2.0;
        const webCrossings = [];
        for (const web of trussWebs) {
            const corners = web.stick.outlineCorners;
            if (!corners || corners.length < 4)
                continue;
            // Long edges of web rectangle: [0]→[1] and [3]→[2] (the two parallel
            // long sides). For vertical V both have x1==x2; for diagonal W they
            // are sloped lines.
            const edge1 = { p1: corners[0], p2: corners[1] };
            const edge2 = { p1: corners[3], p2: corners[2] };
            function intersectAtY(p1, p2, atY) {
                const dy = p2.y - p1.y;
                if (Math.abs(dy) < 1e-6)
                    return null;
                const t = (atY - p1.y) / dy;
                return p1.x + t * (p2.x - p1.x);
            }
            const x1 = intersectAtY(edge1.p1, edge1.p2, innerY);
            const x2 = intersectAtY(edge2.p1, edge2.p2, innerY);
            if (x1 === null || x2 === null)
                continue;
            const edge_lo = Math.min(x1, x2);
            const edge_hi = Math.max(x1, x2);
            // Compute angle θ between long edge and chord axis (horizontal).
            const e1dx = edge1.p2.x - edge1.p1.x;
            const e1dy = edge1.p2.y - edge1.p1.y;
            const e1len = Math.sqrt(e1dx * e1dx + e1dy * e1dy);
            if (e1len < 1)
                continue;
            const sinTheta = Math.abs(e1dy) / e1len;
            if (sinTheta < 0.1)
                continue; // near-horizontal edge — degenerate
            const offset = (offsetSign * offsetMagnitudeBase) / sinTheta;
            // Dimple sits at the web's CENTERLINE crossing at the chord's
            // CENTERLINE Y (not the inner-face edge midpoint). For vertical
            // V the two are identical; for diagonal W they differ by ~6mm.
            // Verified vs HG260012 JB1210-1/T4: ref dimple at 260.6 = W8 centerline
            // at chord-center, NOT 254.3 = W8 edges' midpoint at chord-inner.
            const centerCrossingX = getCrossingX(web.stick, plateCenterY);
            if (centerCrossingX === null)
                continue;
            const centerLocalPos = plateLocalPosition(plate, centerCrossingX);
            // Convert edge intersections to chord-local position
            const localLo = plateLocalPosition(plate, edge_lo);
            const localHi = plateLocalPosition(plate, edge_hi);
            // Skip if centerline crossing is outside plate's range
            if (centerLocalPos < span + 5)
                continue;
            if (centerLocalPos > plate.stick.length - span - 5)
                continue;
            webCrossings.push({
                localPosLo: Math.min(localLo, localHi),
                localPosHi: Math.max(localLo, localHi),
                offset,
                centerLocalPos: centerLocalPos,
            });
        }
        // Sort by center, cluster: webs whose extended ranges overlap merge.
        webCrossings.sort((a, b) => a.centerLocalPos - b.centerLocalPos);
        const clusters = [];
        // Cluster threshold: webs whose extended ranges have <= ~15mm gap merge.
        // Strict overlap is too tight — real Detailer output joins V+W pairs that
        // are 10mm apart (one panel-point's V + neighboring W). Verified vs HG260012
        // JB1210-1/T4 ref: V6@311 + W8@260.6 with edges 290.5/331.5 + 232.9/275.8
        // (gap ~15mm) emit single LipNotch [230.7..333.5].
        const CHORD_CLUSTER_GAP = 15;
        for (const wc of webCrossings) {
            const wcStart = wc.localPosLo - wc.offset;
            const wcEnd = wc.localPosHi + wc.offset;
            const last = clusters[clusters.length - 1];
            if (last && wcStart <= last.endPos + CHORD_CLUSTER_GAP) {
                last.endPos = Math.max(last.endPos, wcEnd);
                last.centers.push(wc.centerLocalPos);
            }
            else {
                clusters.push({ startPos: wcStart, endPos: wcEnd, centers: [wc.centerLocalPos] });
            }
        }
        // Cap clamping: if cluster reaches plate end, clamp to [0, length]
        for (const c of clusters) {
            if (c.startPos < 0)
                c.startPos = 0;
            if (c.endPos > plate.stick.length)
                c.endPos = plate.stick.length;
            const quantizedCenter = Math.round((c.centers[0]) / 30) * 30;
            if (seenPositions.has(quantizedCenter))
                continue;
            seenPositions.add(quantizedCenter);
            stickOps.push({ kind: "spanned", type: "LipNotch", startPos: round(c.startPos), endPos: round(c.endPos) });
            // InnerDimple at each web's center within the cluster
            for (const center of c.centers) {
                stickOps.push({ kind: "point", type: "InnerDimple", pos: round(center) });
            }
        }
        // InnerService — handled by per-stick rule in table.ts.
        void studCrossingsOnPlate;
        // Merge adjacent LipNotches on this plate. Studs+webs may emit
        // overlapping 45mm notches (B2B partner pairs at 42mm centers,
        // trim-stud trios) — Detailer joins them into single wider spans.
        // Verified vs HG260012 LBW T1: S4+S5+S6 at 848+890+932 → [825..954].
        if (stickOps.some(o => o.kind === "spanned" && o.type === "LipNotch")) {
            // Wall plates: agent verified vs HG260012 LBW T1: ref [1120.7..1291.2]
            // includes notches at 1131.5+1203.5+1254.5 — a span of 169mm. Adjacent
            // notches with gap up to ~20mm get joined. Increase threshold from 8
            // to 18mm (still conservative — won't merge wall-stud-pairs at 200mm).
            joinAdjacentLipNotches(stickOps, 12);
        }
    }
    // Studs: nogs cross them — LIP NOTCH + DIMPLE at the crossing.
    // (Verified 2026-04-30 against PK5-DETAILER-RAW.xml: Detailer emits
    // LipNotch at nog crossings on studs, NOT Swage. Swage is reserved for
    // end-anchored stiffening cuts only. The previous rule table comment
    // had this backwards.)
    // Other horizontal members (headers H, lintels L, ribbons R, etc.) also
    // cross studs and produce LIP NOTCH + DIMPLE.
    const nogs = layout.filter(sb => NOG_ROLES.has(sb.role));
    const otherHorizontal = layout.filter(sb => !NOG_ROLES.has(sb.role) && !STUD_ROLES.has(sb.role) && !ALL_PLATE_ROLES.has(sb.role) && sb.horizontal);
    // Detect back-to-back (B2B) stud pairs: two studs with centerlines within
    // ~50mm of each other. Verified 2026-05-01 against HG260044 GF-LBW: S3+S4
    // at x=969 and x=1011 (42mm apart) both get Web@38, Web@485, Web@932,
    // Web@1379, Web@1826, Web@2273, Web@2719 (spaced ~447mm, anchored 38mm
    // from each end). Single (non-paired) studs do NOT get these Web ops.
    const b2bStudNames = new Set();
    for (let i = 0; i < studs.length; i++) {
        for (let j = i + 1; j < studs.length; j++) {
            const a = studs[i];
            const b = studs[j];
            const xDelta = Math.abs(a.box.cx - b.box.cx);
            // Y range similarity: both studs must span essentially the same Y range
            // (indicating they're full-height paired studs at the same column).
            const yMinDelta = Math.abs(a.box.yMin - b.box.yMin);
            const yMaxDelta = Math.abs(a.box.yMax - b.box.yMax);
            // Length similarity: paired studs are identical sticks
            const lenDelta = Math.abs(a.stick.length - b.stick.length);
            // Tight criteria: < 45mm X-apart, < 5mm Y-range diff, identical length
            if (xDelta < 45 && yMinDelta < 5 && yMaxDelta < 5 && lenDelta < 5) {
                b2bStudNames.add(a.stick.name);
                b2bStudNames.add(b.stick.name);
            }
        }
    }
    // Per-stud lip-side neighbor detection. At any horizontal-member crossing
    // on a stud, Detailer emits Swage if another stud's web is within ~45mm on
    // the lip-facing side (lip flange pinned by partner web), else LipNotch.
    // Verified 2026-05-02 vs HG260012 L1101–L1112 corpus (87 stud crossings).
    // flipped=false: lip points to −x. flipped=true: lip points to +x.
    // The stud-bbox half-width is 20.5mm (89S41 web width 41mm), so search
    // range is [cx + sign*5, cx + sign*45] (skip self via 5mm gap).
    function studHasLipNeighbor(stud) {
        const sign = stud.stick.flipped ? +1 : -1;
        const cx = stud.box.cx;
        for (const other of studs) {
            if (other.stick.name === stud.stick.name)
                continue;
            const dx = other.box.cx - cx;
            if (sign > 0 && dx >= 5 && dx <= 45)
                return true;
            if (sign < 0 && dx <= -5 && dx >= -45)
                return true;
        }
        return false;
    }
    // Compute the wall's overall x-extent from plate bboxes (used for
    // leftmost/rightmost stud detection in the continuous-nog rule below).
    let wallXMin = Infinity, wallXMax = -Infinity;
    for (const p of plates) {
        if (p.box.xMin < wallXMin)
            wallXMin = p.box.xMin;
        if (p.box.xMax > wallXMax)
            wallXMax = p.box.xMax;
    }
    const wallSpanX = wallXMax - wallXMin;
    // Detect leftmost/rightmost FULL-HEIGHT studs (the wall-end studs that
    // connect to perpendicular walls). Only studs whose box reaches both
    // top and bottom plates count. Verified 2026-05-03 vs HG260012 LBW
    // L1101/L1103/L1112: ref emits LipNotch (NOT Swage) on these end studs
    // even at continuous-nog crossings.
    let plateYMin = Infinity, plateYMax = -Infinity;
    for (const p of plates) {
        if (p.box.yMin < plateYMin)
            plateYMin = p.box.yMin;
        if (p.box.yMax > plateYMax)
            plateYMax = p.box.yMax;
    }
    const fullHeightStuds = studs.filter(s => plates.length >= 2 &&
        s.box.yMin <= plateYMin + 60 &&
        s.box.yMax >= plateYMax - 60);
    let leftmostStudName = null;
    let rightmostStudName = null;
    if (fullHeightStuds.length >= 2 && wallSpanX > 0) {
        let leftmostX = Infinity;
        let rightmostX = -Infinity;
        for (const s of fullHeightStuds) {
            if (s.box.cx < leftmostX) {
                leftmostX = s.box.cx;
                leftmostStudName = s.stick.name;
            }
            if (s.box.cx > rightmostX) {
                rightmostX = s.box.cx;
                rightmostStudName = s.stick.name;
            }
        }
    }
    for (const stud of studs) {
        const stickOps = result.get(stud.stick.name);
        const lipNeighbor = studHasLipNeighbor(stud);
        const isWallEndStud = stud.stick.name === leftmostStudName || stud.stick.name === rightmostStudName;
        // B2B stud-pair Web emission DISABLED 2026-05-02:
        //   The geometric detection (xDelta<45, identical Y range, identical length)
        //   over-fires on HG260001 LBW — every adjacent S stud pair gets flagged,
        //   producing 467 false-positive Web holes (S2-S7 all got Web@38, @485,
        //   @932, etc.). Detailer reference shows NONE of these on those studs.
        //   The pattern is real (HG260044 GF-LBW S3+S4 do have these Webs) but
        //   Detailer's actual gating criterion is more specific than simple
        //   geometric pairing — likely tied to a structural-attachment marker in
        //   the XML we haven't identified. Until that's understood, emitting NO
        //   Webs is safer than emitting wrong ones.
        // if (b2bStudNames.has(stud.stick.name)) { ... }
        // Nog crossing rule.
        //
        // 2026-05-03 — re-introduced "continuous nog → Swage on interior studs"
        // heuristic with TWO safety gates that the previous attempt lacked
        // (which had over-fired on HG260001 segmented-nog walls):
        //
        //   1. The NOG itself must be continuous (spans ≥80% of wall length).
        //      A short/segmented nog (e.g. between two trim studs) still
        //      produces LipNotch — that was the HG260001 case where the old
        //      heuristic was wrong.
        //   2. The STUD must NOT be the leftmost/rightmost full-height stud.
        //      Wall-end studs always get LipNotch at every nog crossing,
        //      regardless of continuity — they need to interlock with the
        //      perpendicular wall. Verified vs HG260012 corpus: every L11xx
        //      frame's leftmost+rightmost full-height stud gets LipNotch at
        //      the continuous-nog crossing while interior studs get Swage.
        //
        // Verified 2026-05-03 vs HG260012 TH01-1F-LBW: the previous all-LipNotch
        // rule emitted 60+ extras at position 1163..1208 across L1101/L1103/
        // L1109/L1110/L1111/L1112 (the continuous wall-spanning nog at z=1185.5).
        // Ref emits Swage on every interior stud and LipNotch only on S1/S15
        // (the wall-end full-height studs).
        for (const nog of nogs) {
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
            const lipSpan = Math.max(45, nogWidth + 4);
            const startPos = localPos - lipSpan / 2;
            const endPos = startPos + lipSpan;
            // Continuous-nog detection: nog spans ≥80% of the wall's plate length.
            const nogXSpan = nog.box.xMax - nog.box.xMin;
            const isContinuousNog = wallSpanX > 0 && nogXSpan >= 0.8 * wallSpanX;
            // Lip-neighbor rule (existing): if another stud's web is within 45mm
            // on the lip-facing side, the lip can't open here — Swage.
            // Continuous-nog rule (new): interior full-height studs at a continuous
            // nog crossing get Swage; wall-end studs keep LipNotch.
            const useSwage = lipNeighbor ||
                (isContinuousNog && !isWallEndStud);
            if (useSwage) {
                stickOps.push({ kind: "spanned", type: "Swage", startPos: round(startPos), endPos: round(endPos) });
                // Swage at a nog crossing also emits InnerDimple at its center
                // (verified vs HG260012 L1103/S2 which has 3 Swages + 3 InnerDimples
                // at their respective centers).
                stickOps.push({ kind: "point", type: "InnerDimple", pos: round(localPos) });
            }
            else {
                stickOps.push({ kind: "spanned", type: "LipNotch", startPos: round(startPos), endPos: round(endPos) });
                stickOps.push({ kind: "point", type: "InnerDimple", pos: round(startPos + 22.5) });
            }
            // Iter 5: B2B partner studs ALSO get InnerNotch at nog crossings.
            // Verified vs HG260012 LBW-89 L1107/S7 + L1111/S19/S20: paired studs
            // get InnerNotch+LipNotch [z-24..z+24] (48mm wide) when a nog passes
            // between them. Width 48mm differs from non-paired 45mm — includes
            // partner's flange-overlap allowance.
            if (b2bStudNames.has(stud.stick.name)) {
                const innerSpan = 48;
                const iStart = localPos - innerSpan / 2;
                const iEnd = iStart + innerSpan;
                stickOps.push({ kind: "spanned", type: "InnerNotch", startPos: round(iStart), endPos: round(iEnd) });
            }
        }
        // Other horizontal members → LipNotch (or Swage if lip is pinned)
        for (const h of otherHorizontal) {
            const xOverlap = h.box.xMax >= stud.box.xMin && h.box.xMin <= stud.box.xMax;
            if (!xOverlap)
                continue;
            const crossingY = h.box.cy;
            if (crossingY < stud.box.yMin - 1 || crossingY > stud.box.yMax + 1)
                continue;
            const localPos = studLocalPosition(stud, crossingY);
            if (localPos < 50)
                continue;
            if (localPos > stud.stick.length - 50)
                continue;
            const memberWidth = h.box.yMax - h.box.yMin;
            const lipSpan = Math.max(45, memberWidth + 4);
            const startPos = localPos - lipSpan / 2;
            const endPos = startPos + lipSpan;
            if (lipNeighbor) {
                stickOps.push({ kind: "spanned", type: "Swage", startPos: round(startPos), endPos: round(endPos) });
            }
            else {
                stickOps.push({ kind: "spanned", type: "LipNotch", startPos: round(startPos), endPos: round(endPos) });
                stickOps.push({ kind: "point", type: "InnerDimple", pos: round(startPos + 22.5) });
            }
        }
    }
    // Headers (H): receive LipNotch + InnerDimple at every king-stud crossing
    // (verified 2026-05-02 vs HG260012 corpus by agent reverse-engineering).
    // Headers ARE plate-like receivers, not just cripples. The previous code
    // treated H as cripple-only (generating virtual stud crossings on plates
    // but not receiving any of its own). Headers cross studs from BELOW —
    // each king stud's x-position becomes a notch on the header.
    // Merge threshold: 22mm (smaller than truss 8mm but larger than nothing).
    // 2026-05-02 — Cat A "Web Lintel" headers (most common) use this rule.
    // Cat B "secondary" headers (no king studs underneath) emit nothing here.
    // Cat C "boxed" headers (flipped=false, Web@pt instead of notches) need
    // separate detection — TBD.
    // Headers (H) AND 89mm sills (L) are header-like receivers.
    // 70mm L lintels also benefit from panel-point detection.
    const headers = layout.filter(sb => (sb.role === "H" || sb.role === "L") && sb.horizontal);
    const HEADER_JOIN_GAP = 22; // Detailer's merge threshold for H stud crossings
    for (const header of headers) {
        const stickOps = result.get(header.stick.name);
        const seenPositions = new Set();
        const crossings = [];
        // Pass 1: full-height king studs that pass THROUGH the header.
        for (const stud of allCrossingStuds) {
            const yOverlap = stud.box.yMax >= header.box.yMin && stud.box.yMin <= header.box.yMax;
            if (!yOverlap)
                continue;
            const crossingX = stud.box.cx;
            if (crossingX < header.box.xMin + 50)
                continue;
            if (crossingX > header.box.xMax - 50)
                continue;
            const localPos = plateLocalPosition(header, crossingX);
            if (localPos < 80)
                continue;
            if (localPos > header.stick.length - 80)
                continue;
            const q = Math.round(localPos * 10) / 10;
            if (seenPositions.has(q))
                continue;
            seenPositions.add(q);
            crossings.push(localPos);
        }
        // Pass 2: truss-web (W) stiffeners that terminate AT the header from
        // ABOVE (lower end touches header's upper face). Verified 2026-05-02 vs
        // HG260012 LBW L1101/H1: ref has InnerDimple at 109.6/624/816/1614/1716/
        // 2507/2672 corresponding to W1-W7 stick lower-ends in world X. These get
        // a LipNotch + InnerDimple just like king-stud crossings.
        // The W's lower end y is within the header's y range (≈ embedded in H
        // in the 2D projection). Detect: webYMin ∈ [H.yMin - 30, H.yMax + 30].
        const headerTopY = Math.max(header.box.yMin, header.box.yMax);
        const headerCenterY = (header.box.yMin + header.box.yMax) / 2;
        for (const web of trussWebs) {
            const ws = web.stick.outlineCorners ?? [];
            if (ws.length < 2)
                continue;
            // Bottom-end y of the web in frame-local
            const webYMin = Math.min(...ws.map(c => c.y));
            // Only include webs whose lower end is at/near header's body
            if (webYMin < header.box.yMin - 30 || webYMin > header.box.yMax + 30)
                continue;
            // X at the connection point — use header centerline for line intersection
            const crossingX = getCrossingX(web.stick, headerCenterY);
            if (crossingX === null)
                continue;
            if (crossingX < header.box.xMin + 50)
                continue;
            if (crossingX > header.box.xMax - 50)
                continue;
            const localPos = plateLocalPosition(header, crossingX);
            if (localPos < 80)
                continue;
            if (localPos > header.stick.length - 80)
                continue;
            const q = Math.round(localPos * 10) / 10;
            if (seenPositions.has(q))
                continue;
            seenPositions.add(q);
            crossings.push(localPos);
        }
        crossings.sort((a, b) => a - b);
        for (const localPos of crossings) {
            const startPos = localPos - 22.5;
            const endPos = localPos + 22.5;
            stickOps.push({ kind: "spanned", type: "LipNotch", startPos: round(startPos), endPos: round(endPos) });
            stickOps.push({ kind: "point", type: "InnerDimple", pos: round(localPos) });
        }
        // Merge LipNotches with gap < 22mm
        if (crossings.length >= 2) {
            joinAdjacentLipNotches(stickOps, HEADER_JOIN_GAP);
        }
    }
    // Nogs: studs cross them; emit InnerNotch + LipNotch + InnerDimple at every
    // stud crossing. Per agent reverse-engineering (2026-05-02 vs HG260012 N1):
    // adjacent stud pairs (centers within 45mm) get JOINED into a single wider
    // notch (e.g. studs at 848+890 → notch [825.5..912.5] = 87mm).
    for (const nog of nogs) {
        const stickOps = result.get(nog.stick.name);
        // Collect all stud crossings first, then join adjacent ones
        const nogCrossings = [];
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
            nogCrossings.push({ localPos, lipSpan });
        }
        nogCrossings.sort((a, b) => a.localPos - b.localPos);
        // Build notch ranges: each crossing creates [center-span/2 .. center+span/2].
        // Merge ranges that overlap or touch within 0.1mm gap.
        const ranges = [];
        for (const c of nogCrossings) {
            const s = c.localPos - c.lipSpan / 2;
            const e = c.localPos + c.lipSpan / 2;
            const last = ranges[ranges.length - 1];
            if (last && s <= last.endPos + 0.1) {
                // Merge — extend end, add center
                last.endPos = Math.max(last.endPos, e);
                last.centers.push(c.localPos);
            }
            else {
                ranges.push({ startPos: s, endPos: e, centers: [c.localPos] });
            }
        }
        // Emit InnerNotch + LipNotch (paired) for each merged range,
        // InnerDimple at each ORIGINAL stud center within the range.
        for (const r of ranges) {
            stickOps.push({ kind: "spanned", type: "InnerNotch", startPos: round(r.startPos), endPos: round(r.endPos) });
            stickOps.push({ kind: "spanned", type: "LipNotch", startPos: round(r.startPos), endPos: round(r.endPos) });
            for (const c of r.centers) {
                stickOps.push({ kind: "point", type: "InnerDimple", pos: round(c) });
            }
        }
    }
    return result;
}
function round(n) { return Math.round(n * 10000) / 10000; }
/**
 * Mutates `stickOps` in-place: merges any LipNotch ops whose endPos is within
 * `gap` mm of the next LipNotch's startPos into a single wider notch.
 *
 * Detailer's behaviour (verified 2026-05-01 against HG260044 GF-TIN PC7-1/B1):
 * adjacent W crossings on a chord get joined into one continuous notch rather
 * than multiple narrow notches. E.g. 3 webs at x=70, 130, 190 with 45mm
 * individual spans → one 156mm-wide notch from 47..213 instead of 3 separate.
 *
 * Other op types (Dimple, Swage, etc.) are untouched.
 */
function joinAdjacentLipNotches(stickOps, gap) {
    // Pull out LipNotches, sort by startPos, merge runs.
    const lipNotches = [];
    for (let i = 0; i < stickOps.length; i++) {
        const op = stickOps[i];
        if (op && op.kind === "spanned" && op.type === "LipNotch") {
            lipNotches.push({ idx: i, startPos: op.startPos, endPos: op.endPos });
        }
    }
    if (lipNotches.length < 2)
        return;
    lipNotches.sort((a, b) => a.startPos - b.startPos);
    // Build merged ranges
    const merged = [];
    for (const ln of lipNotches) {
        const last = merged[merged.length - 1];
        if (last && ln.startPos <= last.endPos + gap) {
            last.endPos = Math.max(last.endPos, ln.endPos);
        }
        else {
            merged.push({ startPos: ln.startPos, endPos: ln.endPos });
        }
    }
    // If no actual merging happened (every notch separate), bail
    if (merged.length === lipNotches.length)
        return;
    // Remove all original LipNotches (highest index first to preserve lower indices)
    const indices = lipNotches.map(ln => ln.idx).sort((a, b) => b - a);
    for (const i of indices)
        stickOps.splice(i, 1);
    // Append merged notches
    for (const m of merged) {
        stickOps.push({
            kind: "spanned", type: "LipNotch",
            startPos: round(m.startPos), endPos: round(m.endPos),
        });
    }
}
