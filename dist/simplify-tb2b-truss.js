import { getMachineSetupForProfile, getDefaultMachineSetup, } from "./machine-setups.js";
import { HYTEK_SHORTEN_DBLES_WB_MM } from "./fc-dat-rules.js";
/** True iff the plan name marks this as a TB2B (Back-to-Back) truss plan. */
export function isTb2bPlanName(planName) {
    return /-TB2B-/i.test(planName);
}
/** True iff the frame is a truss-type TB2B frame (the only type where the
 *  rewrite applies). Set by upstream `framecad-import.ts` from
 *  `<frame type="Truss">` in the XML. */
function isTb2bTrussFrame(frame) {
    return frame.type === "Truss";
}
/** Module-level chord arc-reversal helper (subset of the in-function
 *  `needsArcReversal` in `computeTb2bWebPositions`, restricted to the
 *  chord cases — topchord and bottomchord — which is all we need for
 *  box-dimple ops since the rule only fires on same-usage chord pairs).
 *  When this returns true, positions emitted in the chord's "start→end"
 *  arc parameterisation should be reflected to L-p so they line up with
 *  Detailer's heel-end measurement. */
function chordArcReversal(s) {
    if (s.usage === "topchord" && s.flipped)
        return true;
    if (s.usage === "bottomchord" && !s.flipped) {
        const zSpan = Math.abs(s.end3D.z - s.start3D.z);
        if (s.start3D.z > s.end3D.z + 0.1)
            return true;
        if (zSpan < 5 && s.start3D.y > s.end3D.y + 0.1)
            return true;
    }
    return false;
}
/** Pairwise centerline-intersection rule for TB2B (back-to-back) trusses.
 *  Mirrors `simplify-linear-truss.ts` but works in whichever 2D plane the
 *  truss lies in (TB2B is typically YZ — sticks share a constant X — while
 *  LIN trusses are XZ). For each pair of sticks, project to 2D and find
 *  the intersection's local arc-length on each stick.
 *
 *  TB2B distinguishes W (web) members from chord/rail (T/B/R/H) members:
 *  - W members: emit Web@END_ANCHOR + Web@(len-END_ANCHOR) (fixed 35mm
 *    end-cap offsets where the web butts into the chord), plus mid-stick
 *    Web@pt at every chord/rail crossing more than END_ANCHOR+5mm from
 *    each end. Verified vs HG260001 PK10/TN6-1 ref: W10/W11/W12/W13 have
 *    only the two end-caps; W14 (which crosses R9 mid-stick) has 3 Webs.
 *  - Chord/rail members (T/B/R/H): emit Web@pt at every web/rail
 *    centerline crossing, end-zone filtered.
 *
 *  Per-instance keying: a single TB2B truss frame can contain multiple
 *  sticks with the SAME name (e.g. apex-pair top chords both named `T2`,
 *  heel webs `W7`/`W8` repeated across left/right halves). The 2D
 *  centerline-intersection logic respects each instance's coordinates, so
 *  we key the position map by `name#occurrence_index` (0-based count of
 *  prior MetaSticks with the same name, in the order they appear in
 *  `sticks`). Each chord instance receives only the bolt-pairs at its
 *  OWN geometric web crossings, eliminating the union-emit bug that was
 *  inflating T-chord Web@pt by ~3× on HG260044/HG260023 PK# TB2B plans
 *  (~1340 extras total — see frida-mined-gaps.md Gap #2). Callers must
 *  rebuild the same per-instance key when reading positions back out. */
export function computeTb2bWebPositions(sticks) {
    // Detect the constant-axis: compute per-axis range across ALL endpoints.
    // The axis with min range (within 1mm) is the "out-of-plane" axis.
    const axes = ["x", "y", "z"];
    const ranges = {
        x: [Infinity, -Infinity],
        y: [Infinity, -Infinity],
        z: [Infinity, -Infinity],
    };
    for (const s of sticks) {
        for (const p of [s.start3D, s.end3D]) {
            if (p.x < ranges.x[0])
                ranges.x[0] = p.x;
            if (p.x > ranges.x[1])
                ranges.x[1] = p.x;
            if (p.y < ranges.y[0])
                ranges.y[0] = p.y;
            if (p.y > ranges.y[1])
                ranges.y[1] = p.y;
            if (p.z < ranges.z[0])
                ranges.z[0] = p.z;
            if (p.z > ranges.z[1])
                ranges.z[1] = p.z;
        }
    }
    const spans = {
        x: ranges.x[1] - ranges.x[0],
        y: ranges.y[1] - ranges.y[0],
        z: ranges.z[1] - ranges.z[0],
    };
    // Sort axes by span ascending; constant axis = smallest. The other two are
    // the in-plane axes used for 2D intersection.
    const sortedAxes = [...axes].sort((a, b) => spans[a] - spans[b]);
    const u = sortedAxes[1];
    const v = sortedAxes[2];
    function len2D(s) {
        const du = s.end3D[u] - s.start3D[u];
        const dv = s.end3D[v] - s.start3D[v];
        return Math.hypot(du, dv);
    }
    function intersect(a, b) {
        const x1 = a.start3D[u], y1 = a.start3D[v];
        const x2 = a.end3D[u], y2 = a.end3D[v];
        const x3 = b.start3D[u], y3 = b.start3D[v];
        const x4 = b.end3D[u], y4 = b.end3D[v];
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 1e-9)
            return null;
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u_ = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
        const L1 = Math.hypot(x2 - x1, y2 - y1);
        const L2 = Math.hypot(x4 - x3, y4 - y3);
        const SLACK = 5; // mm beyond stick endpoints accepted (apex extension)
        const stA = L1 > 0 ? SLACK / L1 : 0;
        const stB = L2 > 0 ? SLACK / L2 : 0;
        if (t < -stA || t > 1 + stA)
            return null;
        if (u_ < -stB || u_ > 1 + stB)
            return null;
        return { t, u: u_, L1, L2 };
    }
    function unitDir(s) {
        const dx = s.end3D[u] - s.start3D[u];
        const dy = s.end3D[v] - s.start3D[v];
        const L = Math.hypot(dx, dy);
        return L > 0 ? [dx / L, dy / L] : [0, 0];
    }
    /** True if a stick's arc-length output should be reversed (L - x) so that
     *  Detailer's heel-end measurements line up. See full notes in
     *  `scripts/diff-vs-detailer.mjs` (now historical). */
    function needsArcReversal(s) {
        if (s.usage === "bottomchord") {
            const zSpan = Math.abs(s.end3D.z - s.start3D.z);
            if (!s.flipped) {
                if (s.start3D.z > s.end3D.z + 0.1)
                    return true;
                if (zSpan < 5 && s.start3D.y > s.end3D.y + 0.1)
                    return true;
            }
        }
        if (s.usage === "rail" && s.flipped) {
            const dy = s.end3D[u] - s.start3D[u];
            const dz = s.end3D[v] - s.start3D[v];
            const len = Math.hypot(dy, dz);
            if (len > 600)
                return true;
        }
        if (s.usage === "topchord" && s.flipped)
            return true;
        return false;
    }
    const CHORD_HALF_DEPTH = 35;
    const WEB_VS_RAIL_OFFSET = 15;
    // Build per-instance keys: `${name}#${occurrence_in_sticks}` so duplicate-
    // name sticks (apex-pair T-chords, heel-pair Ws) each get a unique key.
    // Caller must rebuild the same key when reading positions back out.
    const stickKeys = [];
    {
        const occByName = new Map();
        for (const s of sticks) {
            const occ = occByName.get(s.name) ?? 0;
            occByName.set(s.name, occ + 1);
            stickKeys.push(`${s.name}#${occ}`);
        }
    }
    const rawByKey = new Map();
    function push(key, pos) {
        const arr = rawByKey.get(key);
        if (arr)
            arr.push(pos);
        else
            rawByKey.set(key, [pos]);
    }
    // Per-chord-instance list of (web-key, posA, dot). After the main loop we
    // use this to decide which PERP webs have a PAR neighbor on the same chord
    // — gates the +98 bolt-pair emission. Keyed by per-instance chord key.
    const chordWebCrossings = new Map();
    function recordChordWeb(chordKey, webKey, pos, dot) {
        let arr = chordWebCrossings.get(chordKey);
        if (!arr) {
            arr = [];
            chordWebCrossings.set(chordKey, arr);
        }
        arr.push({ webKey, pos, dot });
    }
    for (let i = 0; i < sticks.length; i++) {
        for (let j = i + 1; j < sticks.length; j++) {
            const sA = sticks[i], sB = sticks[j];
            const keyA = stickKeys[i], keyB = stickKeys[j];
            // Web-to-web: skip (TB2B trusses fasten webs to chords, not web-to-web).
            if (sA.usage === "web" && sB.usage === "web")
                continue;
            const inter = intersect(sA, sB);
            if (inter === null)
                continue;
            const posA_arc = Math.max(0, Math.min(inter.L1, inter.t * inter.L1));
            const posB_arc = Math.max(0, Math.min(inter.L2, inter.u * inter.L2));
            const aIsChord = sA.usage === "topchord" || sA.usage === "bottomchord" || sA.usage === "rail";
            const bIsChord = sB.usage === "topchord" || sB.usage === "bottomchord" || sB.usage === "rail";
            const aIsRail = sA.usage === "rail";
            const bIsRail = sB.usage === "rail";
            let posA = posA_arc, posB = posB_arc;
            const [aux, auy] = unitDir(sA);
            const [bux, buy] = unitDir(sB);
            const dot = aux * bux + auy * buy;
            const aZ = (v === "z") ? auy : (u === "z") ? aux : 0;
            const bZ = (v === "z") ? buy : (u === "z") ? bux : 0;
            const aReversal = needsArcReversal(sA);
            const bReversal = needsArcReversal(sB);
            const aFlipSign = aReversal && (sA.usage === "bottomchord" || sA.usage === "rail");
            const bFlipSign = bReversal && (sB.usage === "bottomchord" || sB.usage === "rail");
            if (aIsChord) {
                const corrRaw = bIsChord
                    ? -CHORD_HALF_DEPTH * aZ / 2
                    : -CHORD_HALF_DEPTH * dot / 2;
                const correction = aFlipSign ? -corrRaw : corrRaw;
                posA = Math.max(0, Math.min(inter.L1, posA_arc + correction));
            }
            if (bIsChord) {
                const corrRaw = aIsChord
                    ? -CHORD_HALF_DEPTH * bZ / 2
                    : -CHORD_HALF_DEPTH * dot / 2;
                const correction = bFlipSign ? -corrRaw : corrRaw;
                posB = Math.max(0, Math.min(inter.L2, posB_arc + correction));
            }
            // Web-side bolt-position offset toward web midpoint at horizontal-
            // chord/rail crossings: shift by (half_depth - boltHoleToEnd) /
            // |sin(angle)|. Verified vs HG260001 W14∩R9 +15 perpendicular,
            // W18∩R9 +28 diagonal.
            const sin = Math.sqrt(Math.max(0, 1 - dot * dot));
            const aIsHorizMember = (bIsRail || sB.usage === "bottomchord");
            const bIsHorizMember = (aIsRail || sA.usage === "bottomchord");
            if (sA.usage === "web" && aIsHorizMember && sin > 0.05) {
                const offset = WEB_VS_RAIL_OFFSET / sin;
                const sign = posA_arc < inter.L1 / 2 ? +1 : -1;
                posA = Math.max(0, Math.min(inter.L1, posA_arc + sign * offset));
            }
            if (sB.usage === "web" && bIsHorizMember && sin > 0.05) {
                const offset = WEB_VS_RAIL_OFFSET / sin;
                const sign = posB_arc < inter.L2 / 2 ? +1 : -1;
                posB = Math.max(0, Math.min(inter.L2, posB_arc + sign * offset));
            }
            // For chord-vs-web crossings, DEFER the chord-side push: the
            // post-loop pass decides whether to emit the centerline crossing
            // (always for PERP webs; suppressed for PAR webs that share a panel
            // point with a PERP neighbor).
            const isChordWeb = (aIsChord && sB.usage === "web") || (bIsChord && sA.usage === "web");
            if (!isChordWeb) {
                push(keyA, posA);
                push(keyB, posB);
            }
            else {
                if (aIsChord) {
                    push(keyB, posB); // web-side
                }
                else {
                    push(keyA, posA); // web-side
                }
            }
            if (aIsChord && sB.usage === "web") {
                recordChordWeb(keyA, keyB, posA, dot);
            }
            else if (bIsChord && sA.usage === "web") {
                recordChordWeb(keyB, keyA, posB, dot);
            }
            // Chord-chord apex 2-bolt pair rule.
            // Verified vs HG260001 PK6/PK10/PK12: this pair-bolt fires only when
            // both top-chords meet AT THE TRUSS APEX (the highest-z point in the
            // frame). Earlier the rule fired at any chord-chord meeting point in
            // an end-zone, which produced extras at heel-side T-T meetings (e.g.
            // T4-T7 in TN6-1 PK10) where Detailer doesn't emit the pair.
            const APEX_PAIR_OFFSET = 153.4;
            const APEX_END_THRESHOLD = 50;
            const APEX_Z_TOLERANCE = 50; // mm — meeting z must be within this of frame max-z
            if (aIsChord && bIsChord) {
                const aAtEnd = Math.min(posA, inter.L1 - posA) < APEX_END_THRESHOLD;
                const bAtEnd = Math.min(posB, inter.L2 - posB) < APEX_END_THRESHOLD;
                const isTApex = (sA.usage === "topchord" || sB.usage === "topchord");
                const isTTApex = sA.usage === "topchord" && sB.usage === "topchord";
                // Meeting z = the z-coordinate of the chord-chord intersection.
                // For top chords meeting at apex this is at frame max-z; for
                // top chords meeting at heel/eaves this is at frame min-z (or
                // somewhere in between for partial-truss configurations).
                const meetingZ = sA.start3D.z + inter.t * (sA.end3D.z - sA.start3D.z);
                const atApexZ = (ranges.z[1] - meetingZ) < APEX_Z_TOLERANCE;
                if (aAtEnd && bAtEnd && isTTApex && atApexZ) {
                    const aNearStart = posA < inter.L1 / 2;
                    const bNearStart = posB < inter.L2 / 2;
                    const sign_a = aNearStart ? +1 : -1;
                    const sign_b = bNearStart ? +1 : -1;
                    const pairA = posA + sign_a * APEX_PAIR_OFFSET;
                    const pairB = posB + sign_b * APEX_PAIR_OFFSET;
                    if (pairA >= 0 && pairA <= inter.L1)
                        push(keyA, pairA);
                    if (pairB >= 0 && pairB <= inter.L2)
                        push(keyB, pairB);
                }
                else if (isTApex && (aAtEnd || bAtEnd) && atApexZ) {
                    if (aAtEnd && !bAtEnd && sB.usage === "topchord") {
                        const bNearStart = posB < inter.L2 / 2;
                        const sign_b = bNearStart ? +1 : -1;
                        const pairB = posB + sign_b * APEX_PAIR_OFFSET;
                        if (pairB >= 0 && pairB <= inter.L2)
                            push(keyB, pairB);
                    }
                    if (bAtEnd && !aAtEnd && sA.usage === "topchord") {
                        const aNearStart = posA < inter.L1 / 2;
                        const sign_a = aNearStart ? +1 : -1;
                        const pairA = posA + sign_a * APEX_PAIR_OFFSET;
                        if (pairA >= 0 && pairA <= inter.L1)
                            push(keyA, pairA);
                    }
                }
            }
            void aIsRail;
            void bIsRail; // referenced for parity with original
        }
    }
    // Panel-point bolt-pair rule (PERP centerline always, PAR centerline
    // suppressed when a PERP neighbor exists within PANEL_RANGE).
    const PAIR_OFFSET = 98;
    const PANEL_RANGE = 130;
    const PERP_GATE = 0.5;
    const PAR_GATE = 0.5;
    for (const [chordKey, crossings] of chordWebCrossings) {
        crossings.sort((a, b) => a.pos - b.pos);
        const chordIdx = stickKeys.indexOf(chordKey);
        if (chordIdx < 0)
            continue;
        const chordStick = sticks[chordIdx];
        const chordL = len2D(chordStick);
        for (const c of crossings) {
            const isPerp = Math.abs(c.dot) < PERP_GATE;
            const isPar = Math.abs(c.dot) > PAR_GATE;
            let bestNeighbor = null;
            for (const o of crossings) {
                if (o === c)
                    continue;
                const oIsPerp = Math.abs(o.dot) < PERP_GATE;
                const oIsPar = Math.abs(o.dot) > PAR_GATE;
                if (isPerp && !oIsPar)
                    continue;
                if (isPar && !oIsPerp)
                    continue;
                const dist = Math.abs(o.pos - c.pos);
                if (dist > PANEL_RANGE)
                    continue;
                if (!bestNeighbor || dist < Math.abs(bestNeighbor.pos - c.pos))
                    bestNeighbor = o;
            }
            if (isPerp) {
                push(chordKey, c.pos);
                if (bestNeighbor) {
                    const sign = bestNeighbor.pos > c.pos ? +1 : -1;
                    const pair = c.pos + sign * PAIR_OFFSET;
                    if (pair >= 0 && pair <= chordL)
                        push(chordKey, pair);
                }
            }
            else if (isPar) {
                if (!bestNeighbor) {
                    push(chordKey, c.pos);
                }
            }
            else {
                push(chordKey, c.pos);
            }
        }
    }
    const END_ZONE = 8;
    const APEX_DEDUP = 3;
    const W_END_ANCHOR = 35;
    const W_MID_BUFFER = 5;
    const out = new Map();
    for (const [key, raw] of rawByKey) {
        const idx = stickKeys.indexOf(key);
        if (idx < 0)
            continue;
        const stick = sticks[idx];
        const L = len2D(stick);
        const isWeb = stick.usage === "web";
        const sorted = raw.slice().sort((a, b) => a - b);
        const dedup = [];
        for (const p of sorted) {
            const last = dedup[dedup.length - 1];
            if (last === undefined || p - last >= APEX_DEDUP)
                dedup.push(p);
        }
        if (isWeb) {
            const result = [W_END_ANCHOR, L - W_END_ANCHOR];
            for (const p of dedup) {
                const tooNearStart = Math.abs(p - W_END_ANCHOR) < W_END_ANCHOR + W_MID_BUFFER;
                const tooNearEnd = Math.abs(p - (L - W_END_ANCHOR)) < W_END_ANCHOR + W_MID_BUFFER;
                if (!tooNearStart && !tooNearEnd)
                    result.push(p);
            }
            result.sort((a, b) => a - b);
            out.set(key, result);
        }
        else {
            let filtered = dedup.filter((p) => p >= END_ZONE - 0.5 && p <= L - END_ZONE + 0.5);
            if (needsArcReversal(stick)) {
                filtered = filtered.map((p) => L - p).sort((a, b) => a - b);
            }
            out.set(key, filtered);
        }
    }
    return out;
}
// ---------- Box-piece InnerDimple (chord-on-chord overlap) ----------
//
// When one TopChord (or BottomChord) lies over another chord of the same
// usage in the YZ plane (centerline distance < 5mm at both endpoints), the
// LONGER underlying chord receives InnerDimple ops on the overlap region.
// Per manual §4.2.5 max spacing = boxDimpleSpacing (1200mm for F325iT 70mm).
// N = ceil(overlapLen / 1200) + 1, evenly spaced from boxA+50 to boxB-50.
function distPointToLine2D(P, A, B) {
    const dy = B.y - A.y, dz = B.z - A.z;
    const lenSq = dy * dy + dz * dz;
    if (lenSq < 1e-9)
        return Infinity;
    const t = ((P.y - A.y) * dy + (P.z - A.z) * dz) / lenSq;
    const projY = A.y + t * dy;
    const projZ = A.z + t * dz;
    return Math.hypot(P.y - projY, P.z - projZ);
}
function projArc2D(P, A, B) {
    const dy = B.y - A.y, dz = B.z - A.z;
    const lenSq = dy * dy + dz * dz;
    if (lenSq < 1e-9)
        return 0;
    const t = ((P.y - A.y) * dy + (P.z - A.z) * dz) / lenSq;
    return t * Math.sqrt(lenSq);
}
function computeBoxDimples(metaSticks, setup) {
    const dimplesByKey = new Map();
    const stickKeyBySrc = new Map();
    const chordSticks = [];
    const occByName = new Map();
    for (let si = 0; si < metaSticks.length; si++) {
        const s = metaSticks[si];
        const occ = occByName.get(s.name) ?? 0;
        occByName.set(s.name, occ + 1);
        const key = `${s.name}#${occ}`;
        stickKeyBySrc.set(si, key);
        if (s.usage === "topchord" || s.usage === "bottomchord") {
            chordSticks.push({ ...s, _key: key });
        }
    }
    for (let i = 0; i < chordSticks.length; i++) {
        const A = chordSticks[i];
        const Astart = A.start3D, Aend = A.end3D;
        const Adya = Aend.y - Astart.y, Adza = Aend.z - Astart.z;
        const Alen = Math.hypot(Adya, Adza);
        if (Alen < 100)
            continue;
        for (let j = 0; j < chordSticks.length; j++) {
            if (i === j)
                continue;
            const B = chordSticks[j];
            if (B.usage !== A.usage)
                continue;
            const Bstart = B.start3D, Bend = B.end3D;
            const Bdya = Bend.y - Bstart.y, Bdza = Bend.z - Bstart.z;
            const Blen = Math.hypot(Bdya, Bdza);
            if (Blen < 100)
                continue;
            const d1 = distPointToLine2D(Bstart, Astart, Aend);
            const d2 = distPointToLine2D(Bend, Astart, Aend);
            if (d1 > 5 || d2 > 5)
                continue;
            const a1 = projArc2D(Bstart, Astart, Aend);
            const a2 = projArc2D(Bend, Astart, Aend);
            const boxA = Math.min(a1, a2);
            const boxB = Math.max(a1, a2);
            if (boxA < -1 || boxB > Alen + 1)
                continue;
            const overlapLen = boxB - boxA;
            if (overlapLen < 100)
                continue;
            const overlapMm = Math.round(overlapLen);
            // Box-piece InnerDimple max spacing on chord-on-chord overlaps. Per
            // .sups: 1200 for HYTEK 70/89mm setups, 600 for 78mm + 104mm setups.
            // Wired from the active MachineSetup 2026-05-05 (Agent Z #5).
            const BOX_DIMPLE_SPACING = setup.boxDimpleSpacing;
            const N = Math.max(2, Math.ceil(overlapMm / BOX_DIMPLE_SPACING) + 1);
            // Box-piece InnerDimple range is inset 50mm from each end of the
            // chord-on-chord overlap. Cited from FC_Textor_Qld.dat:
            //   GEOMETRY_TRUC{0..4}.shorten_dbles_wb = 50
            // (Linear truss = -50, but TB2B simplifier never runs on Linear.)
            // See docs/fc-dat-wirings.md (Agent FINAL, 2026-05-05).
            const startPos = boxA + HYTEK_SHORTEN_DBLES_WB_MM;
            const endPos = boxB - HYTEK_SHORTEN_DBLES_WB_MM;
            const positions = [];
            for (let k = 0; k < N; k++) {
                const t = N === 1 ? 0 : k / (N - 1);
                positions.push(Math.round((startPos + t * (endPos - startPos)) * 100) / 100);
            }
            const arr = dimplesByKey.get(A._key) ?? [];
            for (const p of positions)
                arr.push(p);
            dimplesByKey.set(A._key, arr);
            void Bdya;
            void Bdza;
            void Blen; // reference-parity
        }
    }
    return { dimplesByKey, stickKeyBySrc };
}
/** Rewrite tooling on a single TB2B truss frame in place. Caller must have
 *  already verified the plan/frame gate (`isTb2bPlanName` AND
 *  `frame.type === "Truss"`). */
export function simplifyTb2bTrussFrame(frame, setup) {
    // Build meta.sticks from the parsed sticks. The simplifier consumes the
    // 3D world coords (start.x/y/z, end.x/y/z) directly.
    const metaSticks = frame.sticks.map((s) => ({
        name: s.name,
        start3D: { x: s.start.x, y: s.start.y, z: s.start.z },
        end3D: { x: s.end.x, y: s.end.y, z: s.end.z },
        usage: (s.usage ?? "").toLowerCase(),
        flipped: !!s.flipped,
    }));
    // Resolve the active machine setup for this frame: caller-supplied first,
    // else from the first stick's profile web (Agent Z #5, 2026-05-05).
    // Drives box-piece InnerDimple spacing for chord-on-chord overlaps via
    // setup.boxDimpleSpacing (1200 for 70/89mm, 600 for 78mm/104mm).
    const firstStickWeb = frame.sticks[0]?.profile?.web;
    const resolvedSetup = setup ??
        (firstStickWeb !== undefined
            ? (getMachineSetupForProfile(firstStickWeb) ?? getDefaultMachineSetup())
            : getDefaultMachineSetup());
    const positionsByKey = computeTb2bWebPositions(metaSticks);
    const { dimplesByKey } = computeBoxDimples(metaSticks, resolvedSetup);
    const rewritten = [];
    // Rewrite each truss member stick. Box-piece sticks (e.g. "T4 (Box1)")
    // are NOT touched — their InnerDimple ops are pre-derived by the codec/
    // rules at the right positions for snap-fit.
    //
    // Per-instance occurrence counter mirrors `computeTb2bWebPositions` and
    // `computeBoxDimples`: each duplicate-name stick gets a unique key
    // `name#occurrence`. The full-name regex skip (`\(Box\d+\)`) means
    // "T4 (Box1)" doesn't share an occurrence counter with bare "T4".
    // metaSticks[stickIdx] gives us the per-instance MetaStick for arc-
    // reversal lookups (cap-stack rules previously used `find` by name
    // which returned only the FIRST instance — that bug is fixed below by
    // tracking `stickIdx` and using `metaSticks[stickIdx]`).
    const stickOccByName = new Map();
    for (let stickIdx = 0; stickIdx < frame.sticks.length; stickIdx++) {
        const stick = frame.sticks[stickIdx];
        if (/\(Box\d+\)/.test(stick.name))
            continue;
        if (!/^[TBWRH]\d/.test(stick.name))
            continue;
        const stOcc = stickOccByName.get(stick.name) ?? 0;
        stickOccByName.set(stick.name, stOcc + 1);
        const stKey = `${stick.name}#${stOcc}`;
        const positions = positionsByKey.get(stKey) ?? [];
        // Strip codec's wrong ops (Swage/Chamfer/mid-stick InnerDimple/mid-stick
        // LipNotch). Keep only ops we explicitly want to retain (none for now —
        // the cap-stack rules below re-add what's needed).
        stick.tooling = stick.tooling.filter((op) => {
            if (op.kind === "start" || op.kind === "end")
                return false;
            if (op.kind === "point")
                return false;
            if (op.kind === "spanned") {
                if (op.type === "Swage")
                    return false;
                if (op.type === "LipNotch")
                    return false;
                if (op.type === "LeftFlange" || op.type === "RightFlange")
                    return false;
            }
            return true;
        });
        for (const p of positions) {
            stick.tooling.push({ kind: "point", type: "Web", pos: Math.round(p * 100) / 100 });
        }
        // Per-instance MetaStick (used for both box-dimple arc-reversal and
        // cap-stack rules below). Indexed by stick array index — frame.sticks
        // and metaSticks are 1:1 in iteration order, so metaSticks[stickIdx]
        // is the right instance even when stick.name has duplicates.
        const meta3D = metaSticks[stickIdx];
        const meta3DLen = Math.hypot(meta3D.end3D.y - meta3D.start3D.y, meta3D.end3D.z - meta3D.start3D.z);
        // Outer-vertical-W InnerDimple rule (HN-frames in particular).
        // Verified vs HG260001 PK9 HN18-1: vertical Web sticks (e.g. W14, W17)
        // that have a Box-pair partner (another vertical W at the same y but with
        // z range inset by ~50mm at each end) are the "outer" piece of a
        // back-to-back pair and receive 3 InnerDimples evenly spaced from @100
        // to @(L-100). The Box-pair partner (the "inner" piece) gets only its
        // own InnerDimples via the box-piece detection elsewhere; the codec
        // currently doesn't pair-merge so we just add the InnerDimples on the
        // outer where Detailer expects them.
        //
        // Detection: stick.name matches /^W\d/ AND meta3D is vertical (horiz
        // span < 1mm) AND meta3DLen > 1500mm AND another stick in the frame
        // with same y-range start (within 1mm) but z-range INSET by 40-60mm
        // at both ends exists.
        if (/^W\d/.test(stick.name)) {
            const dy = meta3D.end3D.y - meta3D.start3D.y;
            const dz = meta3D.end3D.z - meta3D.start3D.z;
            const horizSpan = Math.hypot(dy, dz === 0 ? 1 : 0); // |Δy|
            const isVerticalW = Math.abs(dy) < 1.0 && Math.abs(dz) > 100;
            if (isVerticalW && meta3DLen > 1500) {
                const myY = meta3D.start3D.y;
                const myZmin = Math.min(meta3D.start3D.z, meta3D.end3D.z);
                const myZmax = Math.max(meta3D.start3D.z, meta3D.end3D.z);
                let hasBoxPair = false;
                for (let k = 0; k < metaSticks.length; k++) {
                    if (k === stickIdx)
                        continue;
                    const o = metaSticks[k];
                    if (!/^W\d/.test(o.name))
                        continue;
                    if (Math.abs(o.start3D.y - myY) > 1.0)
                        continue;
                    if (Math.abs(o.end3D.y - myY) > 1.0)
                        continue;
                    const oZmin = Math.min(o.start3D.z, o.end3D.z);
                    const oZmax = Math.max(o.start3D.z, o.end3D.z);
                    // partner is "inset" by 40-60mm at each end
                    const insetStart = oZmin - myZmin;
                    const insetEnd = myZmax - oZmax;
                    if (insetStart > 40 && insetStart < 60 && insetEnd > 40 && insetEnd < 60) {
                        hasBoxPair = true;
                        break;
                    }
                }
                if (hasBoxPair) {
                    const L = meta3DLen;
                    const positions = [100, L / 2, L - 100];
                    for (const p of positions) {
                        const exists = stick.tooling.some((o) => o.kind === "point" && o.type === "InnerDimple" && Math.abs(o.pos - p) < 1);
                        if (!exists) {
                            stick.tooling.push({ kind: "point", type: "InnerDimple", pos: Math.round(p * 100) / 100 });
                        }
                    }
                }
            }
            void horizSpan;
        }
        // Box-piece InnerDimple ops (chord-on-chord overlap rule). The raw
        // dimple positions from `computeBoxDimples` are in the chord's
        // start→end arc parameterisation; the same `chordArcReversal` rule
        // applied to chord Web@pt above is also needed here so that a chord
        // entered with apex-at-start (XML order) reports its heel-end IDs
        // measured from the arc=0 (heel) end, not the arc=L (apex) end.
        const boxDimples = dimplesByKey.get(stKey);
        if (boxDimples && boxDimples.length > 0) {
            const reverse = chordArcReversal(meta3D);
            for (const pRaw of boxDimples) {
                const p = reverse ? meta3DLen - pRaw : pRaw;
                const dup = stick.tooling.some((o) => o.kind === "point" &&
                    o.type === "InnerDimple" &&
                    Math.abs(o.pos - p) < 1);
                if (!dup) {
                    stick.tooling.push({ kind: "point", type: "InnerDimple", pos: Math.round(p * 100) / 100 });
                }
            }
        }
        // R-rail short-cap rule: short rails (~382mm) between truss apex and
        // webs get a fixed end-cap pattern at BOTH ends.
        const isShortRail = /^R\d/.test(stick.name) && meta3DLen > 378 && meta3DLen < 387;
        if (isShortRail) {
            const L = meta3DLen;
            const LIP_NOTCH_SPAN = 22.7;
            const LEFT_FLANGE_SPAN = 147.1;
            const RAIL_BOLT_OFFSET = 52.2;
            stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: 0, endPos: LIP_NOTCH_SPAN });
            stick.tooling.push({ kind: "spanned", type: "LeftFlange", startPos: 0, endPos: LEFT_FLANGE_SPAN });
            stick.tooling.push({ kind: "point", type: "Web", pos: RAIL_BOLT_OFFSET });
            stick.tooling.push({ kind: "point", type: "Web", pos: L - RAIL_BOLT_OFFSET });
            stick.tooling.push({ kind: "spanned", type: "LeftFlange", startPos: L - LEFT_FLANGE_SPAN, endPos: L });
            stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: L - LIP_NOTCH_SPAN, endPos: L });
        }
        // H4-header cap-stack rule.
        const isH4Header = /^H4(\b|$)/.test(stick.name) && meta3DLen > 1500;
        if (isH4Header) {
            const L = meta3DLen;
            const RF_SPAN = L > 8000 ? 32.5 : 30.8;
            const LIP_NOTCH_SPAN = 54.9;
            const LF_SPAN = L > 8000 ? 181.1 : 179.3;
            const HEADER_BOLT_OFFSET = 84.3;
            stick.tooling.push({ kind: "spanned", type: "RightFlange", startPos: 0, endPos: RF_SPAN });
            stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: 0, endPos: LIP_NOTCH_SPAN });
            stick.tooling.push({ kind: "spanned", type: "LeftFlange", startPos: 0, endPos: LF_SPAN });
            stick.tooling.push({ kind: "point", type: "Web", pos: HEADER_BOLT_OFFSET });
            stick.tooling.push({ kind: "point", type: "Web", pos: L - HEADER_BOLT_OFFSET });
            stick.tooling.push({ kind: "spanned", type: "LeftFlange", startPos: L - LF_SPAN, endPos: L });
            stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: L - LIP_NOTCH_SPAN, endPos: L });
            stick.tooling.push({ kind: "spanned", type: "RightFlange", startPos: L - RF_SPAN, endPos: L });
        }
        // H7-header start-cap-stack with WIDER caps + dual bolts; end side gets
        // just Web @(L-35) (W_END_ANCHOR).
        const isH7Header = /^H7(\b|$)/.test(stick.name) && meta3DLen > 1500;
        if (isH7Header) {
            const L = meta3DLen;
            stick.tooling.push({ kind: "spanned", type: "RightFlange", startPos: 0, endPos: 43.72 });
            stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: 0, endPos: 65.72 });
            stick.tooling.push({ kind: "spanned", type: "LeftFlange", startPos: 0, endPos: 179.28 });
            stick.tooling.push({ kind: "point", type: "Web", pos: 84.33 });
            stick.tooling.push({ kind: "point", type: "Web", pos: 91.70 });
            stick.tooling.push({ kind: "point", type: "Web", pos: L - 35 });
        }
        // B-chord cap-stack rule (refined 2026-05-09).
        // Verified vs HG260001: in TB2B trusses, only the LONGEST B-chord in the
        // frame receives the cap-stack. The cap-end depends on whether the chord
        // is sloped or horizontal:
        //
        //   • Sloped B-chord (zSpan > 5): caps at the HIGH-Z end of the XML
        //     stick. With flipped=true, this maps to OUTPUT-end (=L); with
        //     flipped=false, this maps to OUTPUT-start (=0).
        //   • Horizontal B-chord (zSpan < 5):
        //     - If it's the SOLE B-chord in the frame (TT-truss bottom span,
        //       e.g. TT6-1 B1 length 10930): caps at BOTH ends.
        //     - Otherwise (TN-frame B with a heel diagonal partner, e.g. TN17-1
        //       B1 length 6859): caps at the end opposite the heel meeting
        //       point — defaulting to OUTPUT-start when flipped=true (XML-end is
        //       the heel meeting point), OUTPUT-end when flipped=false.
        //
        // Cap-stack-end: emit RightFlange + LipNotch + LeftFlange spans at the
        // designated cap-end + Web @STUB_BOLT bolts (only for both-ends case).
        const meta3DZSpan = meta3D ? Math.abs(meta3D.end3D.z - meta3D.start3D.z) : 0;
        let isLongestB = false;
        let bChordCount = 0;
        if (/^B\d/.test(stick.name) && meta3DLen > 1000) {
            let myLen = meta3DLen;
            let isLongest = true;
            for (let k = 0; k < frame.sticks.length; k++) {
                const o = frame.sticks[k];
                if (!/^B\d/.test(o.name))
                    continue;
                if (/\(Box\d+\)/.test(o.name))
                    continue;
                if (k === stickIdx) {
                    bChordCount++;
                    continue;
                }
                const om = metaSticks[k];
                const oLen = Math.hypot(om.end3D.y - om.start3D.y, om.end3D.z - om.start3D.z);
                bChordCount++;
                if (oLen > myLen + 0.5) {
                    isLongest = false;
                }
            }
            isLongestB = isLongest;
        }
        if (isLongestB) {
            const L = meta3DLen;
            const isSloped = meta3DZSpan > 5;
            // Cap-stack span dimensions: standard for horizontal; larger sloped
            // dimensions deferred — would require accurate B-chord trim handling
            // first since cap positions are anchored to chord ends and our stick
            // length differs from ref by ~12-18mm on sloped B-chords (deferred,
            // see TODO).
            const RF_SPAN = 8.19;
            const LIP_SPAN = 32.32;
            const LF_SPAN = 156.70;
            const STUB_BOLT = 59.98;
            // Stub-end (Type C/D) cap-stack: 2-op only — RF=156.70 + LN=32.32, NO LF.
            // Used on multi-B-chord TT/TTI frames where the longest B-chord
            // terminates as a stub against another B-chord at the LOW-y end.
            // Verified 2026-05-09 vs HG260044 PK1 (5/5 sticks):
            //   TT1-1 B1, TT2-1 B2, TT3-1 B1, TT4-1 B1, TTI1-1 B2 — all
            //   horizontal long B-chords with a peer B-chord meeting at LOW-y end
            //   emit only RF=156.70 + LN=32.32 at the cap end (no LF), plus a
            //   single Web bolt @60 (or @L-60 if cap is at OUTPUT-END).
            // Anti-case: TT7-1 B1 (HG260044 PK3, 6530, +y) has B2 (400mm) meeting
            // at HIGH-y end → uses STANDARD 3-op pattern (LF+LN+RF narrow).
            const STUB_RF_SPAN = 156.70;
            const STUB_LN_SPAN = 32.32;
            const isFlipped = !!meta3D && stick.flipped;
            let capStartSide; // emit caps at OUTPUT position 0 side
            let capEndSide; // emit caps at OUTPUT position L side
            // STUB-end pattern detection: in TT/TTI frames with bChordCount >= 2,
            // long horizontal B-chord (>5000mm), where the stick's LOW-y endpoint
            // is shared (within 1mm) with another B-chord's endpoint. The LOW-y
            // shared-endpoint rule discriminates TT3-1/TT4-1 (stub) from TT7-1
            // (standard) which has its peer B-chord at HIGH-y end.
            let isStubB = false;
            if (bChordCount >= 2 && !isSloped && /^TTI?\d/.test(frame.name) && meta3DLen > 5000 && meta3D) {
                const lowYAtStart = meta3D.start3D.y < meta3D.end3D.y;
                const myLowY = lowYAtStart ? meta3D.start3D.y : meta3D.end3D.y;
                for (let k = 0; k < frame.sticks.length; k++) {
                    if (k === stickIdx)
                        continue;
                    const o = frame.sticks[k];
                    if (!/^B\d/.test(o.name))
                        continue;
                    if (/\(Box\d+\)/.test(o.name))
                        continue;
                    const om = metaSticks[k];
                    if (Math.abs(om.start3D.y - myLowY) < 1 || Math.abs(om.end3D.y - myLowY) < 1) {
                        isStubB = true;
                        break;
                    }
                }
            }
            if (isSloped) {
                // High-z end of XML stick gets caps. After flipped-aware mapping:
                //   high-z @ XML-start AND not flipped: caps at OUTPUT-start
                //   high-z @ XML-start AND     flipped: caps at OUTPUT-end
                //   high-z @ XML-end   AND not flipped: caps at OUTPUT-end
                //   high-z @ XML-end   AND     flipped: caps at OUTPUT-start
                const highZAtXmlStart = meta3D.start3D.z > meta3D.end3D.z;
                const capAtOutputStart = highZAtXmlStart !== isFlipped;
                capStartSide = capAtOutputStart;
                capEndSide = !capAtOutputStart;
            }
            else if (isStubB && meta3D) {
                // STUB-end pattern: cap goes at the LOW-y end of the world chord.
                // After flipped-aware mapping (output-start = XML-end if flipped):
                //   capAtOutputStart = (lowYAtXmlEnd === flipped)
                const lowYAtXmlEnd = meta3D.end3D.y < meta3D.start3D.y;
                const capAtOutputStart = lowYAtXmlEnd === isFlipped;
                capStartSide = capAtOutputStart;
                capEndSide = !capAtOutputStart;
            }
            else {
                // Horizontal B-chord cap-stack:
                //   • Length > 8000mm (full bottom span across truss): caps at
                //     BOTH ends. Verified TT6-1 B1 (10930), TN1-1/TN2-1 B1 (10930),
                //     TT2-1 B1 (10930) — all emit caps at both ends.
                //   • Otherwise: caps at OUTPUT-start (matches TN16-1 B1, TN17-1
                //     B1, TN7-1 B1, TN10-1 B1, TN13-x B1).
                //   • TN20-1 B2 (length 6859, caps at OUTPUT-end) is a diverging
                //     case not yet handled.
                if (L > 8000) {
                    capStartSide = true;
                    capEndSide = true;
                }
                else {
                    capStartSide = true;
                    capEndSide = false;
                }
            }
            if (capStartSide) {
                if (isStubB) {
                    // Stub-end at OUTPUT-START: 2-op (RF wide + LN), no LF, plus Web @60
                    // (Web bolt on SAME side as cap). Verified vs HG260044 PK1 TT3-1 B1.
                    stick.tooling.push({ kind: "spanned", type: "RightFlange", startPos: 0, endPos: STUB_RF_SPAN });
                    stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: 0, endPos: STUB_LN_SPAN });
                    stick.tooling.push({ kind: "point", type: "Web", pos: STUB_BOLT });
                }
                else {
                    stick.tooling.push({ kind: "spanned", type: "RightFlange", startPos: 0, endPos: RF_SPAN });
                    stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: 0, endPos: LIP_SPAN });
                    stick.tooling.push({ kind: "spanned", type: "LeftFlange", startPos: 0, endPos: LF_SPAN });
                    stick.tooling.push({ kind: "point", type: "Web", pos: STUB_BOLT });
                }
            }
            if (capEndSide) {
                if (isStubB) {
                    // Stub-end at OUTPUT-END: 2-op (RF wide + LN), no LF, plus Web @L-60
                    // (Web bolt on SAME side as cap). Verified vs HG260044 PK1 TT1-1 B1.
                    stick.tooling.push({ kind: "point", type: "Web", pos: Math.round((L - STUB_BOLT) * 100) / 100 });
                    stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: L - STUB_LN_SPAN, endPos: L });
                    stick.tooling.push({ kind: "spanned", type: "RightFlange", startPos: L - STUB_RF_SPAN, endPos: L });
                }
                else {
                    stick.tooling.push({ kind: "point", type: "Web", pos: Math.round((L - STUB_BOLT) * 100) / 100 });
                    stick.tooling.push({ kind: "spanned", type: "LeftFlange", startPos: L - LF_SPAN, endPos: L });
                    stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: L - LIP_SPAN, endPos: L });
                    stick.tooling.push({ kind: "spanned", type: "RightFlange", startPos: L - RF_SPAN, endPos: L });
                }
            }
        }
        // T-chord end-cap bolt rule (Agent G's Phase H finding, refined 2026-05-09).
        // Apply ONLY to TT-trusses (frame.name starts with "TT") on T# sticks where
        // meta3D has |zSpan| > 5mm (sloped chord). Box pieces filtered above; horizontal
        // T (no apex/heel distinction) skipped.
        //
        // Detailer's behaviour (verified vs HG260001):
        //   • TT-trusses (full top-truss with two top chords meeting at apex):
        //     emit Web @APEX_BOLT (91.21) at the OUTPUT apex-end. No heel-side bolt.
        //   • TN/HN-trusses (half-truss or hip-truss): no @91.21 bolt — apex bolts
        //     come from the TT-apex pair-rule at @22.85+@176.25 instead, which is
        //     handled by the centerline-crossing logic above. No heel-side bolt.
        //
        // The OUTPUT apex-end depends on both XML apex position AND chord arc-reversal:
        //   apexAtOutputEnd = apexAtXmlEnd XOR needsArcReversal(stick)
        // This is critical — a flipped top-chord with apex at XML-start has its apex
        // mapped to OUTPUT-end after reversal. Earlier code used XML coords directly
        // without considering the simplifier's arc-reversal, causing apex bolts to
        // fire at the heel side and heel bolts at the apex side.
        const isTTFrame = /^TT/.test(frame.name);
        const isTChordCap = isTTFrame && /^T\d/.test(stick.name) && !!meta3D &&
            Math.abs(meta3D.end3D.z - meta3D.start3D.z) > 5;
        if (isTChordCap && meta3D) {
            const apexAtXmlEnd = meta3D.end3D.z > meta3D.start3D.z;
            const reverse = chordArcReversal(meta3D);
            const apexAtOutputEnd = apexAtXmlEnd !== reverse;
            const APEX_BOLT = 91.21;
            const APPROX = 2.0;
            const apexPos = apexAtOutputEnd
                ? Math.round((meta3DLen - APEX_BOLT) * 100) / 100
                : APEX_BOLT;
            const exists = stick.tooling.some((o) => o.kind === "point" && o.type === "Web" && Math.abs(o.pos - apexPos) < APPROX);
            if (!exists)
                stick.tooling.push({ kind: "point", type: "Web", pos: apexPos });
        }
        // Final sort by position so downstream encoding emits ops in order.
        stick.tooling.sort((a, b) => {
            const pa = a.kind === "spanned" ? a.startPos : (a.kind === "point" ? a.pos : (a.kind === "start" ? -1 : 1e9));
            const pb = b.kind === "spanned" ? b.startPos : (b.kind === "point" ? b.pos : (b.kind === "start" ? -1 : 1e9));
            return pa - pb;
        });
        rewritten.push(stick.name);
    }
    if (rewritten.length === 0) {
        return { frame: frame.name, decision: "SKIP", reason: "no truss-member sticks found" };
    }
    return {
        frame: frame.name,
        decision: "APPLY",
        reason: `${rewritten.length} truss-member sticks rewritten`,
        rewritten,
    };
}
/** Public entry point for the TB2B simplifier post-pass. Walks every plan
 *  and frame in the project; for each TB2B truss frame matching the gate
 *  (plan `/-TB2B-/i` AND `frame.type === "Truss"`), runs
 *  `simplifyTb2bTrussFrame`. Mutates `project.plans[].frames[].sticks[]`
 *  in place. */
export function simplifyTb2bTrussFramesInProject(plans) {
    const decisions = [];
    for (const plan of plans) {
        if (!isTb2bPlanName(plan.name))
            continue;
        for (const frame of plan.frames) {
            if (!isTb2bTrussFrame(frame))
                continue;
            decisions.push(simplifyTb2bTrussFrame(frame));
        }
    }
    return decisions;
}
