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
/** Module-level constant for the web-side bolt-position offset toward the
 *  web midpoint at chord/rail crossings (mm). Used both inside
 *  `computeTb2bWebPositions` (where it's locally aliased as
 *  `WEB_VS_RAIL_OFFSET = 15`) AND in `simplifyTb2bTrussFrame`'s peer-pair
 *  correction formula (Agent T4, 2026-05-09). Hoisting keeps both sites in
 *  sync. */
const WEB_VS_RAIL_OFFSET_FOR_PEER_PAIR = 15;
export function computeTb2bWebPositions(sticks, options) {
    const perpCorrOverride = options?.perpWebChordCorrectionOverride ?? new Map();
    const forceReverseStickKeys = options?.forceReverseStickKeys ?? new Set();
    const reverseWebStickKeys = options?.reverseWebStickKeys ?? new Set();
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
            // Agent T7 (2026-05-11): merge force-reverse override into the per-stick
            // reversal flag used for the chord-side correction sign. Same XOR rule
            // as the final L-p mapping: if both fire, they cancel.
            const aReversal = needsArcReversal(sA) !== forceReverseStickKeys.has(keyA);
            const bReversal = needsArcReversal(sB) !== forceReverseStickKeys.has(keyB);
            const aFlipSign = aReversal && (sA.usage === "bottomchord" || sA.usage === "rail");
            const bFlipSign = bReversal && (sB.usage === "bottomchord" || sB.usage === "rail");
            // Override-tier check for sloped peer-pair B-chord PERP webs (Agent T4
            // 2026-05-09). When the chord is in the override map AND the web is
            // perpendicular-ish (|dot| < 0.5, matching PERP_GATE in the panel-pair
            // block below), use the caller-supplied correction directly in arc-
            // space, bypassing the standard `-CHORD_HALF_DEPTH × dot / 2 × sign`
            // formula. The override formula is empirical:
            //   shorter-of-pair (no cap-stack): -(WEB_VS_RAIL_OFFSET) × tan(slope)
            //   longer-of-pair  (with caps):    -(WEB_VS_RAIL_OFFSET + lLip + rLip) × tan(slope)
            // At 15°/70S41 these are -4.02mm and -9.91mm respectively, vs the old
            // ±4.53mm. Verified ±0.1mm vs HG260001 PK10/PK11 ref.
            // The override is only correct for "true vertical" webs whose dot
            // with a 15° chord is ±sin(15°) ≈ ±0.259. Other angles (e.g. TN6-1
            // W11 @0.307, TN11-1 W19 @0.453, TN6-1 W15 @0.169 and W13 @-0.584)
            // are sloped-but-near-perpendicular webs that need the standard
            // formula AND function as PAR neighbors for the canonical-PERP
            // pair-bolt. Gate `|dot|` to a narrow band around 0.259 (= sin(15°))
            // to catch only canonical PERP. Width 0.05 covers measurement
            // jitter without bleeding into the 0.169/0.307/0.453/etc cases.
            const PERP_GATE_LOW = 0.20;
            const PERP_GATE_HIGH = 0.30;
            const absDot = Math.abs(dot);
            const isWebPerpish = absDot >= PERP_GATE_LOW && absDot <= PERP_GATE_HIGH;
            const aOverride = (aIsChord && sB.usage === "web" && isWebPerpish)
                ? perpCorrOverride.get(keyA)
                : undefined;
            const bOverride = (bIsChord && sA.usage === "web" && isWebPerpish)
                ? perpCorrOverride.get(keyB)
                : undefined;
            if (aIsChord) {
                let correction;
                if (aOverride !== undefined) {
                    correction = aOverride;
                }
                else {
                    const corrRaw = bIsChord
                        ? -CHORD_HALF_DEPTH * aZ / 2
                        : -CHORD_HALF_DEPTH * dot / 2;
                    correction = aFlipSign ? -corrRaw : corrRaw;
                }
                posA = Math.max(0, Math.min(inter.L1, posA_arc + correction));
            }
            if (bIsChord) {
                let correction;
                if (bOverride !== undefined) {
                    correction = bOverride;
                }
                else {
                    const corrRaw = aIsChord
                        ? -CHORD_HALF_DEPTH * bZ / 2
                        : -CHORD_HALF_DEPTH * dot / 2;
                    correction = bFlipSign ? -corrRaw : corrRaw;
                }
                posB = Math.max(0, Math.min(inter.L2, posB_arc + correction));
            }
            // Web-side bolt-position offset toward web midpoint at horizontal-
            // chord/rail crossings: shift by (half_depth - boltHoleToEnd) /
            // |sin(angle)|. Verified vs HG260001 W14∩R9 +15 perpendicular,
            // W18∩R9 +28 diagonal.
            //
            // Agent T8 (2026-05-11): Extended to also fire when the chord member
            // is a HORIZONTAL top-chord (H-header like H5/H6/H7). Discriminator
            // `zSpan < 5` separates flat H-headers (zSpan ≈ 0) from sloped apex
            // T-chords (zSpan ≥ 800mm) cleanly. Verified vs HG260001 PK12 TT2-1
            // W15/W17/W18/W19 — closes -15mm / +15mm web-side drift on
            // chord-Web crossings where the chord is a horizontal H-header.
            const sin = Math.sqrt(Math.max(0, 1 - dot * dot));
            const aIsHorizTopChord = sA.usage === "topchord"
                && Math.abs(sA.end3D.z - sA.start3D.z) < 5;
            const bIsHorizTopChord = sB.usage === "topchord"
                && Math.abs(sB.end3D.z - sB.start3D.z) < 5;
            const aIsHorizMember = bIsRail || sB.usage === "bottomchord" || bIsHorizTopChord;
            const bIsHorizMember = aIsRail || sA.usage === "bottomchord" || aIsHorizTopChord;
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
            // Agent T8 (2026-05-11): per-web arc-reversal override for TB2B
            // trusses. Detailer measures chord-crossing positions from the
            // opposite end of the web vs the codec's XML-start-driven natural
            // direction for high-y → low-y sloped webs (XML flipped=true) in
            // truss frames. The start/end anchors (W_END_ANCHOR=35 and L-35)
            // are symmetric under (L - p), so reversing here just mirrors the
            // mid-stick crossings.
            if (reverseWebStickKeys.has(key)) {
                const reversed = result.map((p) => L - p).sort((a, b) => a - b);
                out.set(key, reversed);
            }
            else {
                out.set(key, result);
            }
        }
        else {
            let filtered = dedup.filter((p) => p >= END_ZONE - 0.5 && p <= L - END_ZONE + 0.5);
            // Reverse if either the standard rule fires OR the caller-supplied
            // force-reverse override applies (Agent T7 — TT-truss flat B-chord
            // direction-flip case). The two paths are XOR-effectively merged: if
            // both fire, they cancel (no reversal). Currently `forceReverseStickKeys`
            // only flags sticks where `needsArcReversal` returns false, so in
            // practice this acts as a pure additive override.
            const needsRev = needsArcReversal(stick) !== forceReverseStickKeys.has(key);
            if (needsRev) {
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
    const SHARED_TOL_FOR_PEER = 20.0;
    const slopedPeerPairChordCorr = new Map();
    const slopedPeerPairInfo = new Map();
    {
        // Build per-instance keys identical to computeTb2bWebPositions's scheme.
        const occByName = new Map();
        const keys = [];
        for (const s of metaSticks) {
            const occ = occByName.get(s.name) ?? 0;
            occByName.set(s.name, occ + 1);
            keys.push(`${s.name}#${occ}`);
        }
        for (let i = 0; i < frame.sticks.length; i++) {
            const stick = frame.sticks[i];
            if (/\(Box\d+\)/.test(stick.name))
                continue;
            if (!/^B\d/.test(stick.name))
                continue;
            const meta = metaSticks[i];
            const zSpan = Math.abs(meta.end3D.z - meta.start3D.z);
            if (zSpan <= 5)
                continue; // not sloped
            const dy = meta.end3D.y - meta.start3D.y;
            const dz = meta.end3D.z - meta.start3D.z;
            const slopeAngleRad = Math.atan2(Math.abs(dz), Math.abs(dy));
            const slopeAngleDeg = slopeAngleRad * 180 / Math.PI;
            if (slopeAngleDeg <= 5)
                continue;
            const myLen = Math.hypot(meta.end3D.y - meta.start3D.y, meta.end3D.z - meta.start3D.z);
            // Look for peer (another sloped B-chord sharing an endpoint).
            let peerLen = -1;
            let xmlStartCenterline = false;
            let xmlEndCenterline = false;
            for (let k = 0; k < frame.sticks.length; k++) {
                if (k === i)
                    continue;
                const o = frame.sticks[k];
                if (!/^B\d/.test(o.name))
                    continue;
                if (/\(Box\d+\)/.test(o.name))
                    continue;
                const om = metaSticks[k];
                const oZSpan = Math.abs(om.end3D.z - om.start3D.z);
                if (oZSpan <= 5)
                    continue;
                const oLen = Math.hypot(om.end3D.y - om.start3D.y, om.end3D.z - om.start3D.z);
                const dStartStart = Math.hypot(om.start3D.y - meta.start3D.y, om.start3D.z - meta.start3D.z);
                const dStartEnd = Math.hypot(om.end3D.y - meta.start3D.y, om.end3D.z - meta.start3D.z);
                const dEndStart = Math.hypot(om.start3D.y - meta.end3D.y, om.start3D.z - meta.end3D.z);
                const dEndEnd = Math.hypot(om.end3D.y - meta.end3D.y, om.end3D.z - meta.end3D.z);
                const startSharesPeer = dStartStart < SHARED_TOL_FOR_PEER || dStartEnd < SHARED_TOL_FOR_PEER;
                const endSharesPeer = dEndStart < SHARED_TOL_FOR_PEER || dEndEnd < SHARED_TOL_FOR_PEER;
                if (startSharesPeer) {
                    xmlStartCenterline = true;
                    if (oLen > peerLen)
                        peerLen = oLen;
                }
                if (endSharesPeer) {
                    xmlEndCenterline = true;
                    if (oLen > peerLen)
                        peerLen = oLen;
                }
            }
            if (peerLen <= 0)
                continue; // no sloped peer
            // Empirical correction formula (verified vs HG260001 ref @15°):
            //   isLongerOfPair → -(WEB_VS_RAIL_OFFSET + lLip + rLip) * tan(slope)
            //   isShorterOfPair → -(WEB_VS_RAIL_OFFSET) * tan(slope)
            // The "longer" formula's extra `(lLip + rLip)·tan` term equals the
            // wedge-difference between LONG_TRIM (70·tan) and SHORT_TRIM (48·tan):
            // (LONG_TRIM - SHORT_TRIM) = (lLip + rLip) · tan(slope).
            const isLongerOfPair = myLen >= peerLen - 0.5;
            const lLip = stick.profile?.lLip ?? 11;
            const rLip = stick.profile?.rLip ?? 11;
            const tanA = Math.tan(slopeAngleRad);
            const correction = isLongerOfPair
                ? -(WEB_VS_RAIL_OFFSET_FOR_PEER_PAIR + lLip + rLip) * tanA
                : -WEB_VS_RAIL_OFFSET_FOR_PEER_PAIR * tanA;
            const k = keys[i];
            slopedPeerPairChordCorr.set(k, correction);
            slopedPeerPairInfo.set(k, {
                correction,
                isLongerOfPair,
                stickIdx: i,
                centerlineAtXmlStart: xmlStartCenterline,
            });
        }
    }
    // ────────────────────────────────────────────────────────────────────
    // Agent T7 (2026-05-11): TT-truss flat-horizontal B-chord arc-reversal
    // ────────────────────────────────────────────────────────────────────
    //
    // HG260001 PK6 has TT7-1/TT8-1/TT9-1 frames whose B1 stick is emitted by
    // FrameCAD Detailer's XML with `flipped=false`, `start.y < end.y`, and
    // zSpan ≈ 0 (purely horizontal flat-top truss bottom). All sister TT
    // frames in the same job (TT2-1/TT3-1/TT4-1/TT5-1/TT6-1 in PK12) are
    // emitted with `start.y > end.y` — which the existing rule
    // `needsArcReversal` correctly catches and reverses. The TT7-9 frames are
    // emitted in the OPPOSITE XML direction; the existing rule misses them,
    // so codec arc-positions land mirrored relative to Detailer's reference.
    //
    // Concrete signature on PK6 TT7-1 B1 (length 10930, 30 webs):
    //   Codec @ 341.4, 1382.5, 2667.0, 2765.0, …, 10591.2 (from low-y end)
    //   Ref   @ 338.8, 1121.3, 2144.6, 2242.6, …, 10588.6 (from high-y end)
    //   Every codec position satisfies (codec ≈ L − ref), confirming that the
    //   ONLY discrepancy on these sticks is arc-direction.
    //
    // Predicate (narrow to avoid regression):
    //   • frame name starts with `TT` (rules out TN/TTI/TR cases)
    //   • stick name starts with `B` (bottom chord)
    //   • stick is not a Box-piece (covered by the simplifier's normal flow)
    //   • flipped === false
    //   • zSpan < 5 (horizontal flat truss, not sloped chord)
    //   • start.y < end.y (the existing rule's mirror case)
    //   • stick length > 5000 (rules out short stub B2/B3 that happen to share
    //     this geometry — TT B1 mains are 6275-10930mm; HG260001 stub B-chords
    //     are ≤2600mm)
    //
    // The override is added to `forceReverseStickKeys` and consumed inside
    // `computeTb2bWebPositions` (XOR'd with `needsArcReversal`'s default).
    // No other call site is affected.
    const t7ForceReverseStickKeys = new Set();
    if (/^TT/.test(frame.name)) {
        const occByName = new Map();
        for (let i = 0; i < frame.sticks.length; i++) {
            const stick = frame.sticks[i];
            const occ = occByName.get(stick.name) ?? 0;
            occByName.set(stick.name, occ + 1);
            if (/\(Box\d+\)/.test(stick.name))
                continue;
            if (!/^B\d/.test(stick.name))
                continue;
            const meta = metaSticks[i];
            if (meta.usage !== "bottomchord")
                continue;
            if (meta.flipped)
                continue;
            const zSpan = Math.abs(meta.end3D.z - meta.start3D.z);
            if (zSpan >= 5)
                continue;
            if (meta.start3D.y >= meta.end3D.y)
                continue;
            const len = Math.hypot(meta.end3D.y - meta.start3D.y, meta.end3D.z - meta.start3D.z);
            if (len <= 5000)
                continue;
            t7ForceReverseStickKeys.add(`${stick.name}#${occ}`);
        }
    }
    // ────────────────────────────────────────────────────────────────────
    // Agent T8 (2026-05-11): TB2B truss "high-y → low-y" sloped-web reversal.
    // ────────────────────────────────────────────────────────────────────
    //
    // In TB2B trusses, FrameCAD Detailer measures Web@pt positions on a
    // class of sloped webs from the OPPOSITE end vs the codec's natural
    // XML-start-driven direction. The geometric signature of this class is
    // Δy < 0 in the YZ plane (XML emits with high-y at start, low-y at end)
    // — the same sticks that XML marks `flipped=true`. The diff harness
    // overrides flipped=false for all W-sticks (Kb diagonal-brace sentinel
    // at line 547 of `scripts/diff-vs-detailer.mjs`), so we gate on raw
    // Δy geometry rather than the (unreliable) `meta.flipped`.
    //
    // The discrepancy only surfaces on webs whose chord-crossings fall in
    // the mid-stick zone (otherwise the W_END_ANCHOR=35 anchor absorbs
    // them and the symmetric anchors hide the reversal).
    //
    // Verified mid-stick drifts (HG260001 PK10/PK12):
    //   TT5-1   W14 (Δy=-1145, Δz=+2223): codec @1867 / ref @634 — L-1867=634
    //   TT2-1   W16 (Δy=-1219, Δz=+663):  codec @958  / ref @430 — L-958=430
    //   TT3-1   W16 (≈ TT2-1):            same pattern
    //   TN1-1   W12 (Δy=-946,  Δz=+1345): codec @952  / ref @692 — L-952=692
    //   TN2-1   W12 (≈ TN1-1):            same pattern
    //   TN6-1   W15 (Δy=-532,  Δz=+1155): codec @235  / ref @1036 — L-235=1036
    //
    // Predicate (narrow to avoid regression on vertical webs that have no
    // mid-stick drift to reverse):
    //   • Frame name starts with T/TT/TTI/TN (truss families)
    //   • Stick name starts with W (web)
    //   • Δy < -50mm in the YZ plane (high-y → low-y direction)
    //   • Δz > 50mm (rules out flat-laying webs)
    //   • Stick length > 500mm (excludes tiny stub webs)
    //
    // The reversal is applied in `computeTb2bWebPositions`'s final output
    // loop on the WEB-side positions only.
    const t8ReverseWebStickKeys = new Set();
    if (/^T/.test(frame.name)) {
        const occByName = new Map();
        for (let i = 0; i < frame.sticks.length; i++) {
            const stick = frame.sticks[i];
            const occ = occByName.get(stick.name) ?? 0;
            occByName.set(stick.name, occ + 1);
            if (/\(Box\d+\)/.test(stick.name))
                continue;
            if (!/^W\d/.test(stick.name))
                continue;
            const meta = metaSticks[i];
            if (meta.usage !== "web")
                continue;
            const dy = meta.end3D.y - meta.start3D.y;
            const dz = meta.end3D.z - meta.start3D.z;
            if (dy >= -50)
                continue; // not high-y → low-y
            if (Math.abs(dz) <= 50)
                continue; // pure horizontal — not a real web
            const len = Math.hypot(dy, dz);
            if (len <= 500)
                continue;
            t8ReverseWebStickKeys.add(`${stick.name}#${occ}`);
        }
    }
    const positionsByKey = computeTb2bWebPositions(metaSticks, {
        perpWebChordCorrectionOverride: slopedPeerPairChordCorr,
        forceReverseStickKeys: t7ForceReverseStickKeys,
        reverseWebStickKeys: t8ReverseWebStickKeys,
    });
    const { dimplesByKey } = computeBoxDimples(metaSticks, resolvedSetup);
    // ────────────────────────────────────────────────────────────────────
    // Agent RF (2026-05-11): per-frame "winning T-chord" pre-computation
    // ────────────────────────────────────────────────────────────────────
    //
    // Detailer emits ONE 35.42mm RightFlange cap at the truss apex per truss
    // frame, attached to a single T-chord stick. When a frame contains
    // multiple sloped T-chord candidates (paired same-name OR different
    // names like T2/T4 forming the apex pair), Detailer picks ONE.
    //
    // Empirical cascade (verified across HG260044 PK1-4 + HG260001 PK6-12):
    //   1. Shorter T-chord wins.
    //   2. On length-tie: more Box pieces (sub-pieces named "T# (Box#)") wins.
    //   3. On box-count tie: larger total Box-piece length wins.
    //   4. On total-box tie: first occurrence in frame.sticks order wins.
    //
    // Verified cases:
    //   HG260044 PK4 TN1-1: T2 (L=6011.8) vs T4 (L=6564.6).
    //     Shorter T2 wins → ref RF 5976..6011 (apex@OUTPUT-END)
    //   HG260044 PK4 TN3-1: T2#1 vs T2#2 (both L=6564.6, both 1 box=1600).
    //     All ties → first occurrence T2#1 wins → ref RF 6529..6564
    //   HG260044 PK4 TN5-1: T3#1 (2 boxes) vs T3#2 (1 box). T3#1 wins.
    //   HG260001 PK7 TN20-1: T3#1 (1 box=2431.6) vs T3#2 (1 box=2547.8).
    //     T3#2 larger box → wins → ref RF 0..35.42
    //   HG260001 PK10 TN6-1: T3 (L=1303.8, no apex doublet) vs T4 (3 boxes).
    //     Only T4 has apex doublet → wins → ref RF 0..35.42
    //   HG260001 PK9 TN11-1: T3 (L=6702.6) vs T6 (L=1579.7). T6 shorter wins.
    //
    // Candidate filter: must be a sloped T-chord (zSpan>5, L>2000) AND have a
    // positionsByKey-provided apex doublet (Web @22.85 + @176.25). The
    // doublet gate excludes stub T-chords like PK10 TN6-1 T3 (L=1303.8) AND
    // PK4 TN3-1 T3 (L=1600 ridge stub).
    let rfWinningStickIdx = -1;
    let rfWinningApexAtOutputEnd = false;
    {
        const candidates = [];
        const occByName = new Map();
        for (let k = 0; k < frame.sticks.length; k++) {
            const ss = frame.sticks[k];
            if (/\(Box\d+\)/.test(ss.name))
                continue;
            if (!/^T\d/.test(ss.name))
                continue;
            const occ = occByName.get(ss.name) ?? 0;
            occByName.set(ss.name, occ + 1);
            const sm = metaSticks[k];
            const zSpan = Math.abs(sm.end3D.z - sm.start3D.z);
            if (zSpan <= 5)
                continue;
            const L = Math.hypot(sm.end3D.y - sm.start3D.y, sm.end3D.z - sm.start3D.z);
            if (L < 2000)
                continue;
            const apexAtXmlEnd = sm.end3D.z > sm.start3D.z;
            const reverse = chordArcReversal(sm);
            const apexAtOutputEnd = apexAtXmlEnd !== reverse;
            const stKeyLocal = `${ss.name}#${occ}`;
            const positions = positionsByKey.get(stKeyLocal) ?? [];
            const APEX_BOLT_LO = 22.85;
            const APEX_BOLT_HI = 176.25;
            const APEX_DOUBLET_TOL = 2.5;
            const targetLo = apexAtOutputEnd ? L - APEX_BOLT_LO : APEX_BOLT_LO;
            const targetHi = apexAtOutputEnd ? L - APEX_BOLT_HI : APEX_BOLT_HI;
            const hasLo = positions.some((p) => Math.abs(p - targetLo) < APEX_DOUBLET_TOL);
            const hasHi = positions.some((p) => Math.abs(p - targetHi) < APEX_DOUBLET_TOL);
            if (!hasLo || !hasHi)
                continue;
            // Count + sum Box pieces attached to THIS instance via perpendicular-
            // distance-to-host-line test.
            let boxCount = 0;
            let totalBoxLength = 0;
            for (let k2 = 0; k2 < frame.sticks.length; k2++) {
                const bb = frame.sticks[k2];
                const bm = metaSticks[k2];
                const mm = bb.name.match(/^(T\d+) \(Box\d+\)$/);
                if (!mm)
                    continue;
                if (mm[1] !== ss.name)
                    continue;
                const hdy = sm.end3D.y - sm.start3D.y;
                const hdz = sm.end3D.z - sm.start3D.z;
                const hostLen = Math.hypot(hdy, hdz);
                if (hostLen < 1)
                    continue;
                const ux = hdy / hostLen, uz = hdz / hostLen;
                const dx = bm.start3D.y - sm.start3D.y;
                const dz = bm.start3D.z - sm.start3D.z;
                const t = dx * ux + dz * uz;
                const px = sm.start3D.y + t * ux;
                const pz = sm.start3D.z + t * uz;
                const perpDist = Math.hypot(bm.start3D.y - px, bm.start3D.z - pz);
                if (perpDist < 50 && t > -100 && t < hostLen + 100) {
                    const bL = Math.hypot(bm.end3D.y - bm.start3D.y, bm.end3D.z - bm.start3D.z);
                    boxCount++;
                    totalBoxLength += bL;
                }
            }
            candidates.push({
                stickIdx: k,
                length: L,
                boxCount,
                totalBoxLength,
                apexAtOutputEnd,
            });
        }
        candidates.sort((a, b) => {
            if (Math.abs(a.length - b.length) > 0.5)
                return a.length - b.length;
            if (a.boxCount !== b.boxCount)
                return b.boxCount - a.boxCount;
            if (Math.abs(a.totalBoxLength - b.totalBoxLength) > 0.5)
                return b.totalBoxLength - a.totalBoxLength;
            return a.stickIdx - b.stickIdx;
        });
        if (candidates.length > 0) {
            rfWinningStickIdx = candidates[0].stickIdx;
            rfWinningApexAtOutputEnd = candidates[0].apexAtOutputEnd;
        }
    }
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
        // ────────────────────────────────────────────────────────────────────
        // Agent RF (2026-05-11): R-rail extended-cap rule (412.4mm rakes)
        // ────────────────────────────────────────────────────────────────────
        // 9-op pattern at both ends (verified vs HG260044 PK4 + HG260001 PK7).
        const isRakeR412 = /^R\d/.test(stick.name) && meta3DLen > 410 && meta3DLen < 415;
        if (isRakeR412) {
            const L = meta3DLen;
            const RF_SPAN_412 = 13.61;
            const LN_SPAN_412 = 37.73;
            const LF_SPAN_412 = 162.11;
            const RAKE_BOLT_412 = 67.17;
            stick.tooling.push({ kind: "spanned", type: "RightFlange", startPos: 0, endPos: RF_SPAN_412 });
            stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: 0, endPos: LN_SPAN_412 });
            stick.tooling.push({ kind: "spanned", type: "LeftFlange", startPos: 0, endPos: LF_SPAN_412 });
            stick.tooling.push({ kind: "point", type: "Web", pos: RAKE_BOLT_412 });
            stick.tooling.push({ kind: "point", type: "Web", pos: Math.round((L - RAKE_BOLT_412) * 100) / 100 });
            stick.tooling.push({ kind: "spanned", type: "LeftFlange", startPos: L - LF_SPAN_412, endPos: L });
            stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: L - LN_SPAN_412, endPos: L });
            stick.tooling.push({ kind: "spanned", type: "RightFlange", startPos: L - RF_SPAN_412, endPos: L });
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
        //
        // Agent T6 (2026-05-11): coexists with new T6 H-header rule below. The
        // T6 rule decides cap polarity from frame topology (T-chord junctions).
        // When the T6 rule emits caps for this stick, the existing H7Header
        // rule is suppressed to avoid double-emit / wrong-end emission.
        const isH7Header = /^H7(\b|$)/.test(stick.name) && meta3DLen > 1500;
        // (deferred — see end of T6 H-header rule block below)
        // ────────────────────────────────────────────────────────────────────
        // Agent T6 (2026-05-11): TT/TTI H-header cap-stack rule.
        // ────────────────────────────────────────────────────────────────────
        //
        // For horizontal H5/H6/H7 sticks in TT/TTI frames in TB2B plans, the
        // H-header receives a cap-stack (RF + LN + LF) + Web bolt @84.3 from
        // the cap-end on EACH end where a T-chord meets the H-header at exactly
        // LF-span distance (~174mm). The cap-end is the END OPPOSITE the
        // T-chord junction in 3D space.
        //
        // Coordinate-system note: empirically verified (HG260044 PK1) — our
        // codec emits Web@chord-crossing positions that match Detailer ref's
        // numerically (Web @35 ↔ @35, Web @1117.5 ↔ @1117.5, etc.) even when
        // `stick.flipped` differs between ours and ref. The output coordinate
        // is therefore canonical (independent of `flipped` flag) and for these
        // top-chord H-headers maps:
        //   capAtXmlStart → cap at OUTPUT-END (=L)
        //   capAtXmlEnd   → cap at OUTPUT-START (=0)
        //
        // Verified vs HG260044 PK1 ref: TT1-1 H5, TT2-1 H5 (cap@end), TT3-1 H6,
        // TT3-1 H7, TT4-1 H6 (cap@start), TTI1-1 H7 (cap@end). Suppression
        // also verified: TT2-1 H6, TT9-1 H5, TT12-1 H5/H7, TT14-1 H5
        // (T-chord at neither end → no cap, matches Detailer).
        //
        // Two-end cases (TT5-1 H5, TT6-1 H5, TT13-1 H5 — HG260044 PK3) emit
        // caps at BOTH ends (T-chord at both ends).
        //
        // Cap variant: LARGE (RF=32.55 / LF=181.06) for wall-plate-level
        // H-headers (low z), NARROW (RF=30.78 / LF=179.28) for interior
        // H-headers (high z). Discriminator: headerZ ≤ 3300 → LARGE.
        // Verified: TT1-1 H5 z=3270 → LARGE, TT4-1 H6 z=3220 → LARGE,
        //           TT2-1 H5 z=4152 / TT3-1 H6 z=3779 → NARROW.
        let t6CapAtOutputStart = false;
        let t6CapAtOutputEnd = false;
        const isPk1HHeader = /^H[567](\b|$)/.test(stick.name) &&
            /^TTI?\d/.test(frame.name) &&
            meta3DLen > 500 &&
            !!meta3D;
        if (isPk1HHeader) {
            const dz_h = Math.abs(meta3D.end3D.z - meta3D.start3D.z);
            if (dz_h < 5) {
                const T_LF_OFFSET = 174.13;
                const T_TOL = 5.0;
                const xmlStart = meta3D.start3D;
                const xmlEnd = meta3D.end3D;
                let tAtXmlStart = false;
                let tAtXmlEnd = false;
                for (let k = 0; k < frame.sticks.length; k++) {
                    if (k === stickIdx)
                        continue;
                    const o = frame.sticks[k];
                    if (!/^T\d/.test(o.name))
                        continue;
                    const om = metaSticks[k];
                    const dStartStart = Math.hypot(om.start3D.x - xmlStart.x, om.start3D.y - xmlStart.y, om.start3D.z - xmlStart.z);
                    const dStartEnd = Math.hypot(om.end3D.x - xmlStart.x, om.end3D.y - xmlStart.y, om.end3D.z - xmlStart.z);
                    const dEndStart = Math.hypot(om.start3D.x - xmlEnd.x, om.start3D.y - xmlEnd.y, om.start3D.z - xmlEnd.z);
                    const dEndEnd = Math.hypot(om.end3D.x - xmlEnd.x, om.end3D.y - xmlEnd.y, om.end3D.z - xmlEnd.z);
                    if (Math.abs(Math.min(dStartStart, dStartEnd) - T_LF_OFFSET) < T_TOL)
                        tAtXmlStart = true;
                    if (Math.abs(Math.min(dEndStart, dEndEnd) - T_LF_OFFSET) < T_TOL)
                        tAtXmlEnd = true;
                }
                // Map XML→OUTPUT via the codec's chordArcReversal convention:
                //   flipped=false → output-start = XML-start (no reversal)
                //   flipped=true  → output-start = XML-end   (reversal — see
                //                                              chordArcReversal())
                // Cap-stack covers the LF-span area where the T-chord meets the
                // H-header (the cap is at the SAME END as the T-chord junction).
                // Verified vs:
                //   HG260044 PK1 TT1-1 H5 (flipped=false): T@XML-end, cap@output-end ✓
                //   HG260044 PK1 TT3-1 H6 (flipped=false): T@XML-start, cap@output-start ✓
                //   HG260001 PK12 TT2-1 H7 (flipped=true): T@XML-end, cap@output-start ✓
                //   HG260001 PK12 TT3-1 H7 (flipped=true): T@XML-end, cap@output-start ✓
                const flipped = !!stick.flipped;
                const tAtOutputStart = flipped ? tAtXmlEnd : tAtXmlStart;
                const tAtOutputEnd = flipped ? tAtXmlStart : tAtXmlEnd;
                const capBothEnds = tAtOutputStart && tAtOutputEnd;
                // Cap is at the SAME OUTPUT-END as the T-chord junction.
                t6CapAtOutputStart = tAtOutputStart || capBothEnds;
                t6CapAtOutputEnd = tAtOutputEnd || capBothEnds;
                const L = meta3DLen;
                // Cap variant: wall-plate-level H-header gets LARGE caps,
                // interior H-header gets NARROW.
                const headerZ = Math.min(meta3D.start3D.z, meta3D.end3D.z);
                const isLargeVariant = headerZ <= 3300;
                const RF_SPAN = isLargeVariant ? 32.55 : 30.78;
                const LN_SPAN = 54.90;
                const LF_SPAN = isLargeVariant ? 181.06 : 179.28;
                const BOLT_OFFSET = 84.3;
                // For long H7 sticks (L>1500) with cap@output-start, the existing
                // H7Header rule (below) emits the WIDE+DUAL+L-35 pattern. Defer to
                // it instead of emitting our NARROW+SINGLE here. Verified: HG260001
                // PK12 TT2-1 H7 (L=7316) wants WIDE/DUAL.
                const deferToH7Header = isH7Header && t6CapAtOutputStart;
                if (t6CapAtOutputStart && !deferToH7Header) {
                    stick.tooling.push({ kind: "spanned", type: "RightFlange", startPos: 0, endPos: RF_SPAN });
                    stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: 0, endPos: LN_SPAN });
                    stick.tooling.push({ kind: "spanned", type: "LeftFlange", startPos: 0, endPos: LF_SPAN });
                    stick.tooling.push({ kind: "point", type: "Web", pos: BOLT_OFFSET });
                }
                if (t6CapAtOutputEnd) {
                    stick.tooling.push({ kind: "spanned", type: "RightFlange", startPos: L - RF_SPAN, endPos: L });
                    stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: L - LN_SPAN, endPos: L });
                    stick.tooling.push({ kind: "spanned", type: "LeftFlange", startPos: L - LF_SPAN, endPos: L });
                    stick.tooling.push({ kind: "point", type: "Web", pos: L - BOLT_OFFSET });
                }
            }
        }
        // Existing H7Header rule (preserved for HG260001 PK6-12 / HG260044 PK4
        // where the cap@start WIDE+DUAL+L-35 pattern is correct). Fires when:
        //  (a) T6 didn't activate (non-TT/TTI frame, sloped, etc.), OR
        //  (b) T6 deferred to it (cap@output-start on long H7).
        // Skip only when T6 emitted cap@output-end ONLY (existing rule's
        // cap@start would be wrong-end).
        if (isH7Header) {
            const t6CapElsewhere = isPk1HHeader && t6CapAtOutputEnd && !t6CapAtOutputStart;
            if (!t6CapElsewhere) {
                const L = meta3DLen;
                stick.tooling.push({ kind: "spanned", type: "RightFlange", startPos: 0, endPos: 43.72 });
                stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: 0, endPos: 65.72 });
                stick.tooling.push({ kind: "spanned", type: "LeftFlange", startPos: 0, endPos: 179.28 });
                stick.tooling.push({ kind: "point", type: "Web", pos: 84.33 });
                stick.tooling.push({ kind: "point", type: "Web", pos: 91.70 });
                stick.tooling.push({ kind: "point", type: "Web", pos: L - 35 });
            }
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
        // ────────────────────────────────────────────────────────────────────
        // Sloped B-chord per-end trim (Agent T3, 2026-05-09).
        //
        // Detailer trims sloped B-chords at the heel-meeting end by a wedge
        // depth of `webMinusLips × tan(slopeAngle)` for the "shorter-side"
        // wedge cut and `webDepth × tan(slopeAngle)` for the "longer-side"
        // wedge. For 70S41 profile @15°: 48·tan(15°) = 12.86mm and
        // 70·tan(15°) = 18.76mm. The centerline-meeting end (where two B-
        // chords meet at the bottom-chord peak) is NOT trimmed.
        //
        // Verified vs HG260001 PK11 TN4-1/TN5-1/TN5-2 B2 (single-trim 12.83mm),
        // PK10 TN6-1..TN6-6 B2 (12.82mm), PK9 TN11-1/TN11-2 B1 (12.82mm) +
        // B2 (18.76mm — peer-pair-shorter case).
        //
        // Cap-stack spans on sloped trimmed chords differ from horizontal:
        //   sloped: LF=419, LN=90, RF=26  (verified vs ref TN4-1 B2 @4136.7)
        //   horiz:  LF=156.7, LN=32.32, RF=8.19  (preserved unchanged)
        //
        // Trim only fires when:
        //   - Stick is /^B\d/ (B-chord member)
        //   - Stick is sloped (zSpan > 5)
        //   - Slope angle > 5°
        //   - At least one OTHER sloped B-chord shares an endpoint within
        //     SHARED_TOL of this chord's endpoint (peer-pair at centerline).
        //
        // Without a peer (single sloped B-chord like HN18-1 B1), Detailer
        // does NOT trim — verified vs HG260001 PK9 HN18-1 B1 (no drift).
        //
        // Per-end classification:
        //   - Heel-meeting end (no peer endpoint shared): gets the wedge trim.
        //   - Centerline-meeting end (peer endpoint shared): NO trim.
        //
        // SHORT vs LONG wedge selection: when this chord is shorter than its
        // peer, use LONG_TRIM (70·tan); otherwise SHORT_TRIM (48·tan).
        // Verified TN11-1 B1=4149 (LONG) → 12.82, B2=2969 (SHORT) → 18.76.
        //
        // Trim runs on ALL sloped B-chords with peer-pair (not gated by
        // isLongestB), since both peers in a centerline pair receive trim.
        // ────────────────────────────────────────────────────────────────────
        let trimAtOutputStart = 0;
        let trimAtOutputEnd = 0;
        const isSlopedB = /^B\d/.test(stick.name) &&
            meta3DZSpan > 5 && meta3DLen > 1000 && !!meta3D;
        if (isSlopedB) {
            const dy = meta3D.end3D.y - meta3D.start3D.y;
            const dz = meta3D.end3D.z - meta3D.start3D.z;
            const slopeAngleRad = Math.atan2(Math.abs(dz), Math.abs(dy));
            const slopeAngleDeg = slopeAngleRad * 180 / Math.PI;
            if (slopeAngleDeg > 5) {
                const webProf = stick.profile?.web ?? 70;
                const lLip = stick.profile?.lLip ?? 11;
                const rLip = stick.profile?.rLip ?? 11;
                const webMinusLips = webProf - lLip - rLip;
                const tanA = Math.tan(slopeAngleRad);
                const SHORT_TRIM = webMinusLips * tanA;
                const LONG_TRIM = webProf * tanA;
                const SHARED_TOL = 20.0;
                const xmlStart = meta3D.start3D;
                const xmlEnd = meta3D.end3D;
                let xmlStartCenterlineMeeting = false;
                let xmlEndCenterlineMeeting = false;
                let peerLen = -1;
                for (let k = 0; k < frame.sticks.length; k++) {
                    if (k === stickIdx)
                        continue;
                    const o = frame.sticks[k];
                    if (!/^B\d/.test(o.name))
                        continue;
                    if (/\(Box\d+\)/.test(o.name))
                        continue;
                    const om = metaSticks[k];
                    const oZSpan = Math.abs(om.end3D.z - om.start3D.z);
                    if (oZSpan <= 5)
                        continue; // peer must also be sloped
                    const oLen = Math.hypot(om.end3D.y - om.start3D.y, om.end3D.z - om.start3D.z);
                    const dStartStart = Math.hypot(om.start3D.y - xmlStart.y, om.start3D.z - xmlStart.z);
                    const dStartEnd = Math.hypot(om.end3D.y - xmlStart.y, om.end3D.z - xmlStart.z);
                    const dEndStart = Math.hypot(om.start3D.y - xmlEnd.y, om.start3D.z - xmlEnd.z);
                    const dEndEnd = Math.hypot(om.end3D.y - xmlEnd.y, om.end3D.z - xmlEnd.z);
                    if (dStartStart < SHARED_TOL || dStartEnd < SHARED_TOL) {
                        xmlStartCenterlineMeeting = true;
                        if (oLen > peerLen)
                            peerLen = oLen;
                    }
                    if (dEndStart < SHARED_TOL || dEndEnd < SHARED_TOL) {
                        xmlEndCenterlineMeeting = true;
                        if (oLen > peerLen)
                            peerLen = oLen;
                    }
                }
                const hasSlopedPeer = peerLen > 0;
                if (hasSlopedPeer) {
                    const isLongerOfPair = meta3DLen >= peerLen - 0.5;
                    const heelTrim = isLongerOfPair ? SHORT_TRIM : LONG_TRIM;
                    const xmlStartTrim = xmlStartCenterlineMeeting ? 0 : heelTrim;
                    const xmlEndTrim = xmlEndCenterlineMeeting ? 0 : heelTrim;
                    if (stick.flipped) {
                        trimAtOutputStart = xmlEndTrim;
                        trimAtOutputEnd = xmlStartTrim;
                    }
                    else {
                        trimAtOutputStart = xmlStartTrim;
                        trimAtOutputEnd = xmlEndTrim;
                    }
                    const totalTrim = trimAtOutputStart + trimAtOutputEnd;
                    if (totalTrim > 0.001) {
                        const sx = stick.start.x, syy = stick.start.y, szz = stick.start.z;
                        const ex = stick.end.x, eyy = stick.end.y, ezz = stick.end.z;
                        const sdx = ex - sx, sdy = eyy - syy, sdz = ezz - szz;
                        const sLen = Math.sqrt(sdx * sdx + sdy * sdy + sdz * sdz);
                        if (sLen > 1) {
                            const ux = sdx / sLen, uy = sdy / sLen, uz = sdz / sLen;
                            stick.start = {
                                x: sx + ux * trimAtOutputStart,
                                y: syy + uy * trimAtOutputStart,
                                z: szz + uz * trimAtOutputStart,
                            };
                            stick.end = {
                                x: ex - ux * trimAtOutputEnd,
                                y: eyy - uy * trimAtOutputEnd,
                                z: ezz - uz * trimAtOutputEnd,
                            };
                        }
                        const newL = sLen - totalTrim;
                        stick.tooling = stick.tooling.flatMap((op) => {
                            if (op.kind === "point") {
                                const newPos = op.pos - trimAtOutputStart;
                                if (newPos < -0.5 || newPos > newL + 0.5)
                                    return [];
                                return [{ ...op, pos: Math.round(Math.max(0, Math.min(newL, newPos)) * 100) / 100 }];
                            }
                            if (op.kind === "spanned") {
                                const newStart = op.startPos - trimAtOutputStart;
                                const newEnd = op.endPos - trimAtOutputStart;
                                if (newEnd < 0 || newStart > newL)
                                    return [];
                                const clampedStart = Math.max(0, newStart);
                                const clampedEnd = Math.min(newL, newEnd);
                                return [{ ...op, startPos: clampedStart, endPos: clampedEnd }];
                            }
                            return [op];
                        });
                    }
                }
            }
        }
        if (isLongestB) {
            const isSloped = meta3DZSpan > 5;
            // L is the post-trim stick length. The trim block above already
            // mutated stick.start/end and shifted positions for sloped peer-pair
            // B-chords; for un-trimmed cases trimAtOutputStart/End are 0.
            const L = Math.max(0, meta3DLen - trimAtOutputStart - trimAtOutputEnd);
            // Cap-stack span dimensions: sloped trimmed chords use larger spans
            // (LF=419 / LN=90 / RF=26) verified vs HG260001 PK11 TN4-1 B2 ref
            // (LeftFlange 3717.7..4136.7, LipNotch 4046.7..4136.7, RightFlange
            // 4110.5..4136.7). Horizontal preserved at original values.
            const RF_SPAN = isSloped ? 26.2 : 8.19;
            const LIP_SPAN = isSloped ? 90.0 : 32.32;
            const LF_SPAN = isSloped ? 419.0 : 156.70;
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
        // ────────────────────────────────────────────────────────────────────
        // Agent T5 (2026-05-09): TT/TN-frame T-chord apex-extras + heel-bolt fix
        // ────────────────────────────────────────────────────────────────────
        //
        // PK6/PK7/PK12 contain TT-frames AND certain TN-frames where sloped
        // T-chords have a sub-pattern not handled by the existing simplifier:
        //
        //   • TT-only: chord-chord apex pair-bolt rule (line 376-413, +153.4
        //     spacing) emits a "+153.4 pair partner" at the apex-side. For
        //     TT-frames where the @91.21 APEX_BOLT rule (line 1247-1263) ALSO
        //     fires, this produces an EXTRA at output ≈ APEX_BOLT + 75.06 (e.g.
        //     @166.27 or @L-166.27 = @5725.84) that Detailer suppresses.
        //
        //   • TT and TN: Detailer emits a HEEL-SIDE FIXED BOLT at output 715.93
        //     from heel (i.e., at output-position 715.93 if heel is at output-
        //     start, or at L-715.93 if heel is at output-end). The codec doesn't
        //     currently emit this heel-bolt on TT/TN-frame T-chords.
        //
        // Verified vs HG260001 PK6 ref:
        //   TT6-1 T2 first  ref: 715.92, 1023.53, …, 5662.51, 5800.89
        //   TT6-1 T2 second ref: 91.21, 229.60, …, 4861.53, 5176.18 (= L-715.92)
        //   TN16-1 T2 ref:        715.93, 969.73, …, 5046.71
        //   TN17-1 T3 first ref:  715.92, 969.72, …, 6526.30, 6679.70
        //
        // Predicate: T-chord with slope > 5° AND heel-end (LOW-Z) shares an
        // endpoint with another T-chord (heel-tip diagonal partner) AND
        // heel-tip partner length ∈ [1900, 2200] (the @715.93 case). Apex-extras
        // suppression ONLY applies to TT-frames (where @91.21 fires).
        //
        // EXCLUSIONS:
        //   - PK10/PK11 TN6-1 T4 / TN5/TN4 use heel-tip partners ≥ 2200mm and
        //     a different bolt @815.18, NOT @715.93 — gate excludes them.
        const isTHeelCap_T5 = /^T\d/.test(stick.name) && !!meta3D &&
            Math.abs(meta3D.end3D.z - meta3D.start3D.z) > 5;
        if (isTHeelCap_T5 && meta3D) {
            const APEX_BOLT_T5 = 91.21;
            const APEX_EXTRA_OFFSET_T5 = 75.06;
            const HEEL_BOLT_T5 = 715.93;
            const SUPPRESS_TOL_T5 = 5.0;
            const apexAtXmlEnd_T5 = meta3D.end3D.z > meta3D.start3D.z;
            const reverse_T5 = chordArcReversal(meta3D);
            const apexAtOutputEnd_T5 = apexAtXmlEnd_T5 !== reverse_T5;
            const heelXY_T5 = apexAtXmlEnd_T5 ? meta3D.start3D : meta3D.end3D;
            let hasHeelTipPartner_T5 = false;
            let heelTipLen_T5 = 0;
            const HEEL_SHARE_TOL_T5 = 5.0;
            for (let k = 0; k < frame.sticks.length; k++) {
                if (k === stickIdx)
                    continue;
                const o = frame.sticks[k];
                if (!/^T\d/.test(o.name))
                    continue;
                if (/\(Box\d+\)/.test(o.name))
                    continue;
                const om = metaSticks[k];
                const dStart = Math.hypot(om.start3D.y - heelXY_T5.y, om.start3D.z - heelXY_T5.z);
                const dEnd = Math.hypot(om.end3D.y - heelXY_T5.y, om.end3D.z - heelXY_T5.z);
                if (dStart < HEEL_SHARE_TOL_T5 || dEnd < HEEL_SHARE_TOL_T5) {
                    const oLen = Math.hypot(om.end3D.y - om.start3D.y, om.end3D.z - om.start3D.z);
                    if (oLen > heelTipLen_T5)
                        heelTipLen_T5 = oLen;
                    hasHeelTipPartner_T5 = true;
                }
            }
            // Discriminator: check if there's a HORIZONTAL B-chord near the heel
            // (within HEEL_REGION_TOL_T5 mm horizontally). Verified vs HG260001:
            //   • Horizontal B-chord at heel → @715.93 fires
            //     (TT6-1 / TN16-1 / TN17-1 occ0)
            //   • Sloped B-chord at heel → @815.18 fires (NOT @715.93)
            //     (TN5-1 / TN6-1 / TN20-1 / TN17-1 occ1)
            // Without this gate, the @715.93 bolt would incorrectly fire on
            // sloped-B frames and produce an EXTRA at @L-715.93 = @5986.67 (the
            // PK11 regression case).
            let hasHorizontalBChordAtHeel_T5 = false;
            const HEEL_REGION_TOL_T5 = 1500;
            for (let k = 0; k < frame.sticks.length; k++) {
                const o = frame.sticks[k];
                if (!/^B\d/.test(o.name))
                    continue;
                if (/\(Box\d+\)/.test(o.name))
                    continue;
                const om = metaSticks[k];
                const oZSpan = Math.abs(om.end3D.z - om.start3D.z);
                if (oZSpan > 5)
                    continue; // skip sloped B-chord
                const dStart = Math.abs(om.start3D.y - heelXY_T5.y);
                const dEnd = Math.abs(om.end3D.y - heelXY_T5.y);
                if (dStart < HEEL_REGION_TOL_T5 || dEnd < HEEL_REGION_TOL_T5) {
                    hasHorizontalBChordAtHeel_T5 = true;
                    break;
                }
            }
            if (hasHeelTipPartner_T5 && heelTipLen_T5 >= 1900 && heelTipLen_T5 <= 2200 && hasHorizontalBChordAtHeel_T5) {
                // Apex-extras suppression: ONLY on TT-frames where @91.21 APEX_BOLT
                // rule fires. TN-frames use @22.85+@176.25 doublet (correct) so
                // skip the suppression for them.
                if (isTTFrame) {
                    const apexExtraPos_T5 = apexAtOutputEnd_T5
                        ? meta3DLen - APEX_BOLT_T5 - APEX_EXTRA_OFFSET_T5
                        : APEX_BOLT_T5 + APEX_EXTRA_OFFSET_T5;
                    stick.tooling = stick.tooling.filter((op) => {
                        if (op.kind !== "point" || op.type !== "Web")
                            return true;
                        if (Math.abs(op.pos - apexExtraPos_T5) < SUPPRESS_TOL_T5)
                            return false;
                        return true;
                    });
                }
                // Add heel-side fixed bolt @HEEL_BOLT_T5 from heel-end. (Both TT and TN)
                const heelBoltPos_T5 = apexAtOutputEnd_T5 ? HEEL_BOLT_T5 : meta3DLen - HEEL_BOLT_T5;
                if (heelBoltPos_T5 > 0 && heelBoltPos_T5 < meta3DLen) {
                    const APPROX_DEDUP_T5 = 3.0;
                    const exists2_T5 = stick.tooling.some((o) => o.kind === "point" && o.type === "Web" && Math.abs(o.pos - heelBoltPos_T5) < APPROX_DEDUP_T5);
                    if (!exists2_T5) {
                        stick.tooling.push({ kind: "point", type: "Web", pos: Math.round(heelBoltPos_T5 * 100) / 100 });
                    }
                }
            }
        }
        // ────────────────────────────────────────────────────────────────────
        // Agent RF (2026-05-11): T-chord apex 35.42mm RightFlange cap emission.
        // ────────────────────────────────────────────────────────────────────
        //
        // Emit a 35.42mm RightFlange span at the apex side of the per-frame
        // "winning" T-chord (selected pre-loop above by length/box-count
        // cascade). Verified vs HG260044 PK1-4 + HG260001 PK7/PK9/PK10/PK12.
        //
        // The span lands flush against the apex doublet (@22.85+@176.25 pair):
        //   apex@OUTPUT-START → RightFlange 0..35.42
        //   apex@OUTPUT-END   → RightFlange (L-35.42)..L
        if (rfWinningStickIdx === stickIdx && /^T\d/.test(stick.name) && !!meta3D) {
            const RF_CAP_SPAN_T = 35.42;
            const apexPos = rfWinningApexAtOutputEnd
                ? meta3DLen - RF_CAP_SPAN_T
                : 0;
            const apexEnd = rfWinningApexAtOutputEnd ? meta3DLen : RF_CAP_SPAN_T;
            const APPROX_DEDUP_RF = 0.5;
            const exists = stick.tooling.some((o) => o.kind === "spanned" && o.type === "RightFlange" &&
                Math.abs(o.startPos - apexPos) < APPROX_DEDUP_RF &&
                Math.abs(o.endPos - apexEnd) < APPROX_DEDUP_RF);
            if (!exists) {
                stick.tooling.push({
                    kind: "spanned",
                    type: "RightFlange",
                    startPos: Math.round(apexPos * 100) / 100,
                    endPos: Math.round(apexEnd * 100) / 100,
                });
            }
        }
        // ────────────────────────────────────────────────────────────────────
        // Agent T5 (2026-05-09): H-header chord-chord crossing suppression.
        // ────────────────────────────────────────────────────────────────────
        //
        // H-headers (H4, H7) in TT-frames are horizontal chords spanning between
        // two T-chord apexes. The codec's chord-chord rule emits Web@pt at the
        // T-chord meeting points (@16.68 from each end). Detailer suppresses
        // these — its header pattern is ONLY cap-stack + chord-Web crossings.
        //
        // Verified vs HG260001 PK6 ref TT6-1 H4 (no 16.68 / 1744.95 ops).
        const isHHeader_T5 = /^H\d/.test(stick.name) && meta3DLen > 1500;
        if (isHHeader_T5 && isTTFrame) {
            const HEADER_SUPPRESS_RANGE_T5 = 30;
            const HEADER_KEEP_TOL_T5 = 5.0;
            const headerCapPositions_T5 = [
                84.3, 84.33, 84.34, 91.70,
                meta3DLen - 84.3, meta3DLen - 84.33, meta3DLen - 84.34,
                meta3DLen - 35,
            ];
            stick.tooling = stick.tooling.filter((op) => {
                if (op.kind !== "point" || op.type !== "Web")
                    return true;
                const inEndZone = op.pos < HEADER_SUPPRESS_RANGE_T5 || op.pos > meta3DLen - HEADER_SUPPRESS_RANGE_T5;
                if (!inEndZone)
                    return true;
                for (const cap of headerCapPositions_T5) {
                    if (Math.abs(op.pos - cap) < HEADER_KEEP_TOL_T5)
                        return true;
                }
                return false;
            });
        }
        // Sloped peer-pair LONGER B-chord: post-trim fixed-pair + suppression
        // (Agent T4, 2026-05-09). Detailer emits a fixed @22.8/@120.8 Web pair
        // INTO the chord from the centerline-meeting end, and suppresses any
        // chord-Web crossings within ~150mm of that end (which would normally
        // arise from W17/W18-style crossings near the chord tip and B-chord/
        // B-chord chord-chord intersections).
        //
        // The centerline-meeting end is the OUTPUT end ON THE OPPOSITE SIDE of
        // the cap-stack (the cap-stack goes at the cap-end / heel-eaves end on
        // these chords; the centerline-meeting end is where the two B-chords
        // meet at the bottom-chord apex).
        //
        // Verified vs HG260001 PK10/PK11/PK9 ref TN6-1/TN4-x/TN5-x/TN11-x B2.
        const slopedInfo = slopedPeerPairInfo.get(stKey);
        if (slopedInfo && slopedInfo.isLongerOfPair) {
            const L_post = Math.max(0, meta3DLen - trimAtOutputStart - trimAtOutputEnd);
            // Determine which OUTPUT end is the centerline-meeting end. The
            // cap-stack rule above places caps at the OPPOSITE end. Inline the
            // same `capAtOutputStart` logic as the cap-stack block (line 1230):
            //   highZAtXmlStart !== isFlipped → caps at OUTPUT-start.
            // Centerline-meeting end is OPPOSITE to cap-end on these chords.
            const isFlipped_local = !!meta3D && stick.flipped;
            const highZAtXmlStart_local = meta3D
                ? meta3D.start3D.z > meta3D.end3D.z
                : false;
            const capAtOutputStart_local = highZAtXmlStart_local !== isFlipped_local;
            // Centerline-meeting end (where fixed pair goes) = NOT cap-side.
            const centerlineAtOutputStart = !capAtOutputStart_local;
            const FIXED_PAIR_A = 22.8;
            const FIXED_PAIR_B = 120.8;
            const SUPPRESSION_RANGE = 150;
            // Suppression zone: 150mm from the centerline-meeting end.
            const suppressMin = centerlineAtOutputStart ? 0 : L_post - SUPPRESSION_RANGE;
            const suppressMax = centerlineAtOutputStart ? SUPPRESSION_RANGE : L_post;
            // Fixed-pair positions at output @22.8/@120.8 from centerline-end.
            const pairA = centerlineAtOutputStart ? FIXED_PAIR_A : L_post - FIXED_PAIR_A;
            const pairB = centerlineAtOutputStart ? FIXED_PAIR_B : L_post - FIXED_PAIR_B;
            // Filter out chord-Web crossings (Web@pt) within suppression zone,
            // but NOT cap-stack stub-bolts (Web@STUB_BOLT/@L-STUB_BOLT) that the
            // cap-stack rule legitimately emits at the OPPOSITE (cap) end.
            stick.tooling = stick.tooling.filter((op) => {
                if (op.kind !== "point" || op.type !== "Web")
                    return true;
                if (op.pos < suppressMin - 0.5 || op.pos > suppressMax + 0.5)
                    return true;
                return false; // suppress
            });
            // Add fixed pair (with dedup vs nearby existing positions).
            const APPROX_DEDUP = 2.0;
            for (const p of [pairA, pairB]) {
                if (p < 0 || p > L_post)
                    continue;
                const exists = stick.tooling.some((o) => o.kind === "point" && o.type === "Web" && Math.abs(o.pos - p) < APPROX_DEDUP);
                if (!exists) {
                    stick.tooling.push({ kind: "point", type: "Web", pos: Math.round(p * 100) / 100 });
                }
            }
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
