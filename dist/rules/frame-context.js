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
const TRUSS_WEB_ROLES = new Set(["W"]); // truss web members (verticals + diagonals)
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
 * The plate's local axis runs from worldStart → worldEnd. For sticks where
 * worldStart.x > worldEnd.x (e.g. flipped plates oriented HIGH→LOW), the
 * localPos must be `start.x - crossingX`, NOT `crossingX - xMin`. Using
 * xMin always picks the LOW-X end as origin which mirrors ALL stud crossings
 * on flipped plates — verified 2026-05-02 vs HG260012 LBW T1 (start.x=23732,
 * end.x=19615 ⇒ S1 should be at localPos 20, not 4097).
 */
function plateLocalPosition(plate, crossingX) {
    const start = plate.stick.worldStart;
    const end = plate.stick.worldEnd;
    if (!start || !end)
        return crossingX - plate.box.xMin;
    // Run-axis orientation: positive direction is start → end.
    // If start.x < end.x, localPos increases as crossingX increases.
    // If start.x > end.x, localPos increases as crossingX decreases.
    return start.x <= end.x ? (crossingX - start.x) : (start.x - crossingX);
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
    const virtualStudCrossings = [];
    for (const cr of cripples) {
        virtualStudCrossings.push({
            role: "Kb-edge-left", box: { ...cr.box, xMin: cr.box.xMin, xMax: cr.box.xMin + 41, cx: cr.box.xMin + 20 },
            stick: cr.stick, horizontal: false,
        });
        virtualStudCrossings.push({
            role: "Kb-edge-right", box: { ...cr.box, xMin: cr.box.xMax - 41, xMax: cr.box.xMax, cx: cr.box.xMax - 20 },
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
        // Truss W members crossing this chord: use line-intersection geometry
        // (bbox.cx is wrong for diagonals — would give the bbox midpoint, not
        // the actual crossing-x at the chord's y-level).
        for (const web of trussWebs) {
            const crossingX = getCrossingX(web.stick, plateCenterY);
            if (crossingX === null)
                continue;
            // Skip if crossing is outside plate's X range
            if (crossingX < plate.box.xMin + 50)
                continue;
            if (crossingX > plate.box.xMax - 50)
                continue;
            const localPos = plateLocalPosition(plate, crossingX);
            if (localPos < span + 5)
                continue;
            if (localPos > plate.stick.length - span - 5)
                continue;
            const quantizedPos = Math.round(localPos / 30) * 30;
            if (seenPositions.has(quantizedPos))
                continue;
            seenPositions.add(quantizedPos);
            // Truss web on chord: same LipNotch + Dimple pattern as a stud crossing.
            const lipSpan = internalSpan; // 45mm — webs are 41mm wide
            const startPos = localPos - lipSpan / 2;
            const endPos = startPos + lipSpan;
            stickOps.push({
                kind: "spanned", type: "LipNotch",
                startPos: round(startPos), endPos: round(endPos),
            });
            stickOps.push({
                kind: "point", type: "InnerDimple",
                pos: round(startPos + internalDimpleOffset),
            });
        }
        // Detailer JOINS adjacent LipNotches into single wider notches — verified
        // 2026-05-01 against HG260044 GF-TIN PC7-1/B1: 6 W crossings emit ONE
        // wide LipNotch (513..629, span 116) instead of multiple 45mm notches.
        // Threshold: notches whose endPos is within JOIN_GAP_MM of the next
        // notch's startPos get merged. Dimples preserved (they live at the
        // original crossing positions, not at notch endpoints).
        //
        // For trusses (top/bottom chord), the join distance is LARGER because
        // truss panel-points are spaced wider. For walls, join only very-close
        // notches (e.g. virtual-stud-crossings on the same Kb).
        const isTrussChord = trussWebs.length > 0 && stickOps.some(o => o.kind === "spanned" && o.type === "LipNotch");
        // 2026-05-02 — wall LipNotches are NEVER joined. Detailer keeps every
        // stud crossing as its own 45mm notch even when they overlap. Verified
        // vs HG260001 LBW L2/T1: triple stud cluster at x=505/547/589 produces
        // 3 OVERLAPPING LipNotches [441..486]+[483..528]+[525..570]. Joining any
        // pair was wrong.
        // Trusses still join (HG260044 TIN PC7-1-B1: 4-web cluster joins to one
        // 102mm-wide notch).
        if (isTrussChord) {
            joinAdjacentLipNotches(stickOps, 8);
        }
        // InnerService — handled by per-stick rule in table.ts (fixed @306, @906,
        // @1506... every 600mm). The frame-context midpoint approach was reverted
        // 2026-05-02 — it matched HG260044 but produced wrong positions on HG260001.
        void studCrossingsOnPlate;
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
    for (const stud of studs) {
        const stickOps = result.get(stud.stick.name);
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
        // Nog crossing rule: ALWAYS emit LipNotch on the stud at the crossing.
        //
        // 2026-05-02 — reverted the "Swage if nog passes through" heuristic. It
        // matched HG260044's continuous-nog walls but produced WRONG cuts on
        // HG260001 (segmented nogs) where Detailer always emits LipNotch. The
        // rollformer test cut showed Swage stiffening ribs where stud-receiving
        // notches should have been — physically wrong steel. Until we can
        // distinguish the two configurations from XML data, default to LipNotch
        // (always safe — a notch won't break a stud, an unnecessary Swage might
        // misalign a B2B partner).
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
            stickOps.push({ kind: "spanned", type: "LipNotch", startPos: round(startPos), endPos: round(endPos) });
            stickOps.push({ kind: "point", type: "InnerDimple", pos: round(startPos + 22.5) });
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
        // Other horizontal members → LIP NOTCH
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
            stickOps.push({ kind: "spanned", type: "LipNotch", startPos: round(startPos), endPos: round(endPos) });
            stickOps.push({ kind: "point", type: "InnerDimple", pos: round(startPos + 22.5) });
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
    const headers = layout.filter(sb => sb.role === "H" && sb.horizontal);
    const HEADER_JOIN_GAP = 22; // Detailer's merge threshold for H stud crossings
    for (const header of headers) {
        const stickOps = result.get(header.stick.name);
        const seenPositions = new Set();
        const crossings = [];
        for (const stud of allCrossingStuds) {
            // Stud must overlap header in Y (i.e., its centerline crosses through
            // header's y-band)
            const yOverlap = stud.box.yMax >= header.box.yMin && stud.box.yMin <= header.box.yMax;
            if (!yOverlap)
                continue;
            const crossingX = stud.box.cx;
            if (crossingX < header.box.xMin + 50)
                continue;
            if (crossingX > header.box.xMax - 50)
                continue;
            const localPos = plateLocalPosition(header, crossingX);
            // Skip king crossings within the cap region (~80mm) — Detailer absorbs
            // them into the wide cap LipNotch instead of emitting a separate notch.
            // Cap dimples at 16.5 + 58.5 (+optional 109.5) cover this range.
            if (localPos < 80)
                continue;
            if (localPos > header.stick.length - 80)
                continue;
            // Skip exact duplicates
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
    // Nogs: studs cross them; emit WEB+LIP NOTCH + DIMPLE + service holes at midpoints
    for (const nog of nogs) {
        const stickOps = result.get(nog.stick.name);
        const studCrossingsOnNog = [];
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
            studCrossingsOnNog.push(localPos);
        }
        // InnerService on nogs — disabled 2026-05-02. Was emitting at stud-pair
        // midpoints but Detailer's nog ops match the T-plate pattern (every 600mm
        // from start). For now skip nogs entirely; the rule's per-stick emission
        // doesn't fire for NOG_ROLES and Detailer's exact rule is still TBD.
        void studCrossingsOnNog;
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
