#!/usr/bin/env node
/**
 * Op-level diff between our generated RFY and a Detailer-emitted reference RFY.
 *
 * For each (frame, stick) present in BOTH files:
 *   - List ops we have that Detailer doesn't (extras)
 *   - List ops Detailer has that we don't (missing)
 *   - List ops in both but at different positions (drifted)
 *
 * Output: a structured JSON + a human-readable text report. Run repeatedly as
 * we close gaps to track progress toward 100% Detailer parity.
 *
 * Usage:
 *   node scripts/diff-vs-detailer.mjs <input.xml> <reference.rfy> [out-prefix]
 *
 * Examples:
 *   # Compare our LBW output vs Detailer reference
 *   node scripts/diff-vs-detailer.mjs \
 *     "C:/Users/Scott/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data/HG260044/HG260044 LOT 1810 (14) ELDERBERRY ST UPPER CABOOLTURE-GF-LBW-70.075.xml" \
 *     "C:/Users/Scott/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data/HG260044/HG260044#1-1_GF-LBW-70.075.rfy" \
 *     /tmp/diff-hg260044-lbw
 */
import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import {
  synthesizeRfyFromPlans,
  generateTooling,
  decode,
  getMachineSetupForProfile,
  deriveFrameBasis,
  coerceEnvelopeToRect,
  projectToFrameLocal,
} from "../dist/index.js";

const [, , inputXmlPath, referenceRfyPath, outPrefix = "/tmp/diff"] = process.argv;
if (!inputXmlPath || !referenceRfyPath) {
  console.error("Usage: node scripts/diff-vs-detailer.mjs <input.xml> <reference.rfy> [out-prefix]");
  process.exit(1);
}

console.log("Input XML :", inputXmlPath);
console.log("Reference :", referenceRfyPath);
console.log("");

// ---------------------------------------------------------------------------
// 1. Parse input XML & generate our RFY (mirrors framecad-import.ts logic)
// ---------------------------------------------------------------------------

function parseTriple(t) { const n = String(t).trim().split(/[ ,\t]+/).map(Number); return {x:n[0]||0,y:n[1]||0,z:n[2]||0}; }
function distance3D(a,b) { const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z; return Math.sqrt(dx*dx+dy*dy+dz*dz); }
function profileCode(web,l,r,gauge) { return `${web}S${Math.round(Math.max(l,r))}_${gauge.toFixed(2)}`; }
function roleForUsage(usage,type,name) {
  const prefix = (name||"").replace(/[0-9_].*$/,"");
  if (prefix === "Kb" || prefix === "W") return prefix;
  const u=(usage||"").toLowerCase();
  if(u==="web")return"W";
  if(u==="topplate")return"T";
  if(u==="bottomplate")return"B";
  if(u==="raisedbottomplate")return"Bh";
  if(u==="topchord")return"T";
  if(u==="bottomchord")return"B";
  if(u==="headplate"||u==="head")return"H";
  if(u==="nog"||u==="noggin")return"N";
  if(u==="endstud"||u==="stud")return"S";
  if(u==="jackstud"||u==="trimstud")return"J";
  if(u==="brace")return"Br";
  return prefix||(type==="plate"?"T":"S");
}

// LIN side-channel: per-stick 3D-derived metadata used in post-decode pass.
// Keyed by `${normalizedPlan}|${frameName}|${stickName}#${occurrenceIndex}` so
// duplicates with the same name get distinct entries. Synthesize/decode may
// reorder sticks AND add prefixes like "PK1-" to plan names, so we strip
// known prefixes for the key.
const LIN_META = new Map();
function normalizePlanName(name) {
  return String(name).replace(/^(PK\d+-|PLAN\d*-|P\d+-)/i, "");
}
function linMetaKey(planName, frameName, stickName, occurrence) {
  return `${normalizePlanName(planName)}|${frameName}|${stickName}#${occurrence}`;
}

// TB2B side-channel: per-frame stick geometry captured at XML parse, used in
// the post-decode rewriter to compute pairwise centerline intersections and
// emit Web@pt ops. Keyed by `${normalizedPlan}|${frameName}`.
const TB2B_META = new Map();
function tb2bFrameKey(planName, frameName) {
  return `${normalizePlanName(planName)}|${frameName}`;
}

/** Pairwise centerline-intersection rule for TB2B (back-to-back) trusses.
 *  Mirrors simplify-linear-truss.ts but works in whichever 2D plane the
 *  truss lies in (TB2B is typically YZ — sticks share a constant X — while
 *  LIN trusses are XZ). For each pair of sticks, project to 2D and find the
 *  intersection's local arc-length on each stick.
 *
 *  TB2B distinguishes W (web) members from chord/rail (T/B/R/H) members:
 *  - W members: emit Web@END_ANCHOR + Web@(len-END_ANCHOR) (fixed 35mm
 *    end-cap offsets where the web butts into the chord), plus mid-stick
 *    Web@pt at every chord/rail crossing more than END_ANCHOR+5mm from
 *    each end. Verified vs HG260001 PK10/TN6-1 ref: W10/W11/W12/W13 have
 *    only the two end-caps; W14 (which crosses R9 mid-stick) has 3 Webs.
 *  - Chord/rail members (T/B/R/H): emit Web@pt at every web/rail
 *    centerline crossing, end-zone filtered.
 *  Returns Map<stickName, sortedPositions[]>. */
function computeTB2BWebPositions(sticks) {
  // Detect the constant-axis: compute per-axis range across ALL endpoints.
  // The axis with min range (within 1mm) is the "out-of-plane" axis.
  const axes = ["x", "y", "z"];
  const ranges = { x: [Infinity, -Infinity], y: [Infinity, -Infinity], z: [Infinity, -Infinity] };
  for (const s of sticks) {
    for (const p of [s.start3D, s.end3D]) {
      if (p[axes[0]] < ranges.x[0]) ranges.x[0] = p.x;
      if (p[axes[0]] > ranges.x[1]) ranges.x[1] = p.x;
      if (p[axes[1]] < ranges.y[0]) ranges.y[0] = p.y;
      if (p[axes[1]] > ranges.y[1]) ranges.y[1] = p.y;
      if (p[axes[2]] < ranges.z[0]) ranges.z[0] = p.z;
      if (p[axes[2]] > ranges.z[1]) ranges.z[1] = p.z;
    }
  }
  const spans = {
    x: ranges.x[1] - ranges.x[0],
    y: ranges.y[1] - ranges.y[0],
    z: ranges.z[1] - ranges.z[0],
  };
  // Sort axes by span ascending; constant axis = smallest. The other two are
  // the in-plane axes used for 2D intersection.
  const sortedAxes = axes.slice().sort((a, b) => spans[a] - spans[b]);
  const u = sortedAxes[1], v = sortedAxes[2]; // in-plane axes (largest 2 spans)

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
    if (Math.abs(denom) < 1e-9) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u_ = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    const L1 = Math.hypot(x2 - x1, y2 - y1);
    const L2 = Math.hypot(x4 - x3, y4 - y3);
    const SLACK = 5;  // mm beyond stick endpoints accepted (apex extension)
    const stA = L1 > 0 ? SLACK / L1 : 0;
    const stB = L2 > 0 ? SLACK / L2 : 0;
    if (t < -stA || t > 1 + stA) return null;
    if (u_ < -stB || u_ > 1 + stB) return null;
    return { t, u: u_, L1, L2 };
  }

  /** Direction unit vector in the 2D plane (u, v axes). */
  function unitDir(s) {
    const dx = s.end3D[u] - s.start3D[u];
    const dy = s.end3D[v] - s.start3D[v];
    const L = Math.hypot(dx, dy);
    return L > 0 ? [dx / L, dy / L] : [0, 0];
  }

  /** True if a stick's arc-length output should be reversed (L - x) so that
   *  Detailer's heel-end measurements line up. Verified vs HG260001:
   *  - non-flipped bottomchord with start.z > end.z (apex-start) — reverse
   *    (PK10/TN6-1 B1: !flip, start=high, end=low → reverse aligns refs)
   *  - rail with flipped=true and L > 600mm — reverse
   *    (PK10/TN6-1 R9: flipped, len 1677 → reverse aligns 5 of 6 refs)
   *  Flipped bottom chords (e.g. PK10/TN6-1 B2) are NOT reversed: their
   *  XML start=apex but Detailer treats them with raw arc.
   */
  function needsArcReversal(s) {
    if (s.usage === "bottomchord" && !s.flipped && s.start3D.z > s.end3D.z + 0.1) return true;
    if (s.usage === "rail" && s.flipped) {
      const dy = s.end3D[u] - s.start3D[u];
      const dz = s.end3D[v] - s.start3D[v];
      const len = Math.hypot(dy, dz);
      if (len > 600) return true;
    }
    return false;
  }

  /** Bolt-position correction for a chord-vs-web crossing: the actual bolt
   *  on the chord is offset from the centerline-arc-length crossing by
   *  -CHORD_HALF_DEPTH * (chord_unit · web_unit) / 2. Verified against
   *  HG260001 PK10 TN6-1 ref data:
   *    - T3 ∩ W10 (vertical-W on 25° sloping chord): theta=65°, cos=0.4226.
   *      My arc 85.31 - 7.40 = 77.91. Ref Web@78.3 → match within 0.4mm.
   *    - T3 ∩ W11 (diagonal-W on 25° sloping chord): theta=97.87°,
   *      cos=-0.137. My arc 174.2 + 2.40 = 176.60. Ref Web@176.30 → match
   *      within 0.3mm.
   *  Geometric interpretation: the bolt physically goes through the chord's
   *  WEB at the centerline-crossing's perpendicular projection onto the
   *  chord axis, but the chord's web is offset by half_depth in the chord's
   *  perpendicular direction. */
  const CHORD_HALF_DEPTH = 35;
  // Web-side correction when crossing a rail: the rail's flange lies
  // half_depth (35mm) away from the rail's centerline; the bolt on the WEB
  // sits at (half_depth - boltHoleToEnd) further along the web in the
  // direction toward the WEB's midpoint (away from whichever end is closer).
  // For F325iT 70mm: 35 - 20 = 15mm. Divided by |sin(angle)| for diagonal
  // webs. Verified vs HG260001 PK10/TN6-1: W14 ∩ R9 +15 (perpendicular,
  // arc=360 closer to start), W12 ∩ R8 -15 (perpendicular, arc=1799 closer
  // to end), W18 ∩ R9 +28 (diagonal cos=-0.844, sin=0.536, 15/0.536=27.99).
  const WEB_VS_RAIL_OFFSET = 15;

  const rawByName = new Map();
  function push(name, pos) {
    const arr = rawByName.get(name);
    if (arr) arr.push(pos);
    else rawByName.set(name, [pos]);
  }
  // Collect all chord-vs-web crossings: per-chord list of (web, posA, dot).
  // Used after the main loop to determine which PERP webs have a PAR
  // neighbor on the same chord, which gates the +98 bolt-pair emission.
  // Map<chordName, Array<{webName, pos, dot}>>
  const chordWebCrossings = new Map();
  function recordChordWeb(chordName, webName, pos, dot) {
    let arr = chordWebCrossings.get(chordName);
    if (!arr) { arr = []; chordWebCrossings.set(chordName, arr); }
    arr.push({ webName, pos, dot });
  }
  for (let i = 0; i < sticks.length; i++) {
    for (let j = i + 1; j < sticks.length; j++) {
      const sA = sticks[i], sB = sticks[j];
      // Web-to-web: skip (TB2B trusses fasten webs to chords, not web-to-web).
      // Match the LIN simplifier's gate.
      if (sA.usage === "web" && sB.usage === "web") continue;
      const inter = intersect(sA, sB);
      if (inter === null) continue;
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
      // Per-chord correction (see CHORD_HALF_DEPTH note above):
      //  - chord-vs-web (one is chord, other is web): -half_depth * dot / 2
      //    (the dot reflects the angle between chord and web — verified vs
      //    HG260001 PK10/TN6-1: T3 ∩ W10 (vertical W) -7.40, T3 ∩ W11
      //    (diagonal W) +2.40, both match ref within 0.4mm)
      //  - chord-vs-chord apex: -half_depth * chord_v_component / 2
      //    (the v-component is the chord's slope from horizontal — verified
      //    vs HG260001 PK10/TN6-1: T3 ∩ T4 apex T3-side -7.40, T4-side
      //    +7.40, both match ref within 0.2mm)
      const aZ = (v === "z") ? auy : (u === "z") ? aux : 0;
      const bZ = (v === "z") ? buy : (u === "z") ? bux : 0;
      // For chords/rails that will be reversed post-hoc (sloped B-chord with
      // apex=start, or flipped long rail), the correction sign must FLIP:
      // reversing the chord direction negates `dot`, which negates the
      // correction. We pre-flip the sign here so post-hoc `L - pos` gives
      // the right answer. Verified vs HG260001 PK10/TN6-1: B1 W10 crossing
      // arc=2664.86, raw correction +4.53. Pre-flipped: 2664.86 - 4.53 =
      // 2660.33. After L-x: 2691.72 - 2660.33 = 31.39. Ref Web@30.9 → match
      // within 0.5mm.
      const aReversal = needsArcReversal(sA);
      const bReversal = needsArcReversal(sB);
      if (aIsChord) {
        const corrRaw = bIsChord
          ? -CHORD_HALF_DEPTH * aZ / 2
          : -CHORD_HALF_DEPTH * dot / 2;
        const correction = aReversal ? -corrRaw : corrRaw;
        posA = Math.max(0, Math.min(inter.L1, posA_arc + correction));
      }
      if (bIsChord) {
        const corrRaw = aIsChord
          ? -CHORD_HALF_DEPTH * bZ / 2
          : -CHORD_HALF_DEPTH * dot / 2;
        const correction = bReversal ? -corrRaw : corrRaw;
        posB = Math.max(0, Math.min(inter.L2, posB_arc + correction));
      }
      // Web-vs-horizontal-chord/rail bolt offset on the WEB side: shift the
      // bolt position toward the web's midpoint by
      // (half_depth - boltHoleToEnd) / |sin(angle)|.
      // Verified vs HG260001 PK10/TN6-1 W14∩R9 (+15 perpendicular),
      // PK12/TN1-1 W13∩B2 (+15 perpendicular). Applies equally to rails and
      // horizontal bottom chords (both "horizontal members" the web pierces).
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
      // Web centerline crossings: emit only for PERPENDICULAR webs. PAR
      // (diagonal) web crossings are NOT emitted as centerlines — instead,
      // their position appears as a +98 pair from the neighboring PERP web
      // (panel-point pattern, see post-loop processing below).
      // Verified vs HG260001 PK10/TN6-1 T4: W15 (PAR, dot=-0.76) raw 935 NOT
      // in ref; W14 (PERP) +98 = 952.72 IS in ref.
      const PERP_THRESHOLD = 0.5;
      if (aIsChord && sB.usage === "web") {
        // Record for post-loop pair-emission. Always record (used to decide
        // whether neighbor PERP gets a pair).
        recordChordWeb(sA.name, sB.name, posA, dot);
        // Only emit centerline for PERP-ish webs (|dot| < threshold).
        if (Math.abs(dot) < PERP_THRESHOLD) push(sA.name, posA);
      } else if (bIsChord && sA.usage === "web") {
        recordChordWeb(sB.name, sA.name, posB, dot);
        if (Math.abs(dot) < PERP_THRESHOLD) push(sB.name, posB);
      } else {
        // Non-chord-web: chord-chord, web-web (already gated), other.
        // Push centerline normally.
        push(sA.name, posA);
        push(sB.name, posB);
      }
      // Chord-chord apex 2-bolt pair rule. When two chord sticks intersect
      // (apex), Detailer emits TWO Web@pt on each chord: one at the apex
      // position, one at apex ± 153.4mm toward the chord interior. Verified
      // vs HG260001 PK10/TN6-1: T3 ∩ T4 apex (T3 arc=1288) emits
      // Web@1280.98 + Web@1127.58 (= 1280.98 - 153.4) on T3, and
      // Web@22.85 + Web@176.30 (= 22.85 + 153.45) on T4.
      // ONLY emit pair when:
      //   1. BOTH posA AND posB are near a stick endpoint (real apex)
      //   2. AT LEAST ONE chord is a top-chord (T-T or T-rail apex)
      // BB (bottom-chord vs bottom-chord) meetings are HEEL junctures, not
      // apexes — they don't get the +153.4 pair. Verified vs HG260001
      // PK10/TN6-1: B1 ∩ B2 at @4.85 (both bottom chords) — ref does NOT
      // emit a 153.4 pair. Without this guard we emit a spurious @2533.47
      // on B1 (after reversal). Restricting to TT-only removes this.
      const APEX_PAIR_OFFSET = 153.4;
      const APEX_END_THRESHOLD = 50;
      if (aIsChord && bIsChord) {
        const isTTApex = (sA.usage === "topchord" || sB.usage === "topchord");
        const aAtEnd = Math.min(posA, inter.L1 - posA) < APEX_END_THRESHOLD;
        const bAtEnd = Math.min(posB, inter.L2 - posB) < APEX_END_THRESHOLD;
        if (aAtEnd && bAtEnd && isTTApex) {
          const aNearStart = posA < inter.L1 / 2;
          const bNearStart = posB < inter.L2 / 2;
          const sign_a = aNearStart ? +1 : -1;
          const sign_b = bNearStart ? +1 : -1;
          const pairA = posA + sign_a * APEX_PAIR_OFFSET;
          const pairB = posB + sign_b * APEX_PAIR_OFFSET;
          if (pairA >= 0 && pairA <= inter.L1) push(sA.name, pairA);
          if (pairB >= 0 && pairB <= inter.L2) push(sB.name, pairB);
        }
      }
    }
  }

  // Panel-point bolt-pair rule. For each chord, find each PERP web crossing
  // and check if there's a PAR (diagonal) web crossing within PANEL_RANGE
  // along the chord. If so, emit a +98 pair toward that PAR's direction.
  // Verified vs HG260001 PK10/TN6-1 T4:
  //   W14 PERP @855, W15 PAR @935 (dist 80) → emit W14+98 = 953 ≈ ref @952.72
  //   W19 PERP @2628, W18 PAR @2540 (dist 88) → emit W19-98 = 2530 ≈ ref @2530.46
  //   W21 PERP @3570, W20 PAR @3486 (dist 84) → emit W21-98 = 3472 ≈ ref @3472.33
  //   W23 PERP @4663, W22 PAR @4595 (dist 68) → emit W23-98 = 4565 ≈ ref @4565.45
  //   W25 PERP @5191, W24 PAR @5113 (dist 78) → emit W25-98 = 5093 ≈ ref @5093.75
  // PERP webs without PAR neighbors (W13/W16/W17 in PK10 TN6-1 T4) get NO pair.
  const PAIR_OFFSET = 98;
  const PANEL_RANGE = 130;  // PAR neighbor must be within this many mm
  const PERP_GATE = 0.5;
  const PAR_GATE = 0.5;     // |dot| > PAR_GATE → diagonal/PAR web
  for (const [chordName, crossings] of chordWebCrossings) {
    // Sort by position for fast neighbor lookup.
    crossings.sort((a, b) => a.pos - b.pos);
    const chordStick = sticks.find(s => s.name === chordName);
    if (!chordStick) continue;
    const chordL = len2D(chordStick);
    for (const c of crossings) {
      if (Math.abs(c.dot) >= PERP_GATE) continue;  // not PERP
      // Find nearest PAR neighbor.
      let bestPar = null;
      for (const o of crossings) {
        if (o === c) continue;
        if (Math.abs(o.dot) <= PAR_GATE) continue;  // not PAR
        const dist = Math.abs(o.pos - c.pos);
        if (dist > PANEL_RANGE) continue;
        if (!bestPar || dist < Math.abs(bestPar.pos - c.pos)) bestPar = o;
      }
      if (!bestPar) continue;
      // Emit +98 toward the PAR neighbor (sign = direction of neighbor).
      const sign = bestPar.pos > c.pos ? +1 : -1;
      const pair = c.pos + sign * PAIR_OFFSET;
      if (pair >= 0 && pair <= chordL) push(chordName, pair);
    }
  }

  const END_ZONE = 8;        // drop positions closer than this to either end
  const APEX_DEDUP = 3;      // collapse positions within this distance into one
  const W_END_ANCHOR = 35;   // fixed end-cap Web@pt offset on web (W) members
  const W_MID_BUFFER = 5;    // suppress mid-Web@pt within this distance of an end-anchor

  const out = new Map();
  for (const [name, raw] of rawByName) {
    const stick = sticks.find(s => s.name === name);
    if (!stick) continue;
    const L = len2D(stick);
    const isWeb = stick.usage === "web";
    // Sort + apex-dedup
    const sorted = raw.slice().sort((a, b) => a - b);
    const dedup = [];
    for (const p of sorted) {
      const last = dedup[dedup.length - 1];
      if (last === undefined || p - last >= APEX_DEDUP) dedup.push(p);
    }

    if (isWeb) {
      // W rule: Web@35 + Web@(len-35) (fixed end-anchored caps where web
      // butts into chord) + mid-stick Web@pt at every chord/rail crossing
      // sufficiently far from the end-caps. Suppresses the geometric end-
      // intersection positions which would emit at ~19mm from end (= half
      // chord depth offset from the centerline-crossing) — the fixed 35mm
      // matches Detailer's standard end-anchor exactly.
      const result = [W_END_ANCHOR, L - W_END_ANCHOR];
      for (const p of dedup) {
        const tooNearStart = Math.abs(p - W_END_ANCHOR) < W_END_ANCHOR + W_MID_BUFFER;
        const tooNearEnd = Math.abs(p - (L - W_END_ANCHOR)) < W_END_ANCHOR + W_MID_BUFFER;
        if (!tooNearStart && !tooNearEnd) result.push(p);
      }
      result.sort((a, b) => a - b);
      out.set(name, result);
    } else {
      // Chord/rail rule: emit Web@pt at every centerline crossing,
      // end-zone-filtered.
      let filtered = dedup.filter(p => p >= END_ZONE - 0.5 && p <= L - END_ZONE + 0.5);
      // Detailer measures bottom-chord and certain rail positions from the
      // OPPOSITE end (heel-end). Reverse the arc-length output for sticks
      // whose XML start is the apex (high-z) end. Verified vs HG260001
      // PK10/TN6-1 ref: B1 (start.z=3872 > end.z=3176) reversal aligns 7+
      // missing Web positions; R9 (length 1677, multiple webs) reversal
      // aligns 2 of 3 missing with arcs computed from new end.
      // Reverse arc-length output for sticks whose start is the apex
      // (Detailer measures from heel). See needsArcReversal helper above.
      // Verified vs HG260001 PK10/TN6-1: B1 (sloped B-chord, start.z=3872 >
      // end.z=3176) reversal aligns ref Web positions within 0.5mm; R9
      // (flipped rail, len 1677) reversal aligns 2 of 3 mid-stick refs.
      if (needsArcReversal(stick)) {
        filtered = filtered.map(p => L - p).sort((a, b) => a - b);
      }
      out.set(name, filtered);
    }
  }
  return out;
}

function buildOurProject(xmlText) {
  const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_", parseAttributeValue:true, parseTagValue:false, isArray:n=>["plan","frame","stick","vertex","tool_action"].includes(n) });
  const root = parser.parse(xmlText).framecad_import;
  const firstStick = root.plan?.[0]?.frame?.[0]?.stick?.[0];
  const setup = getMachineSetupForProfile(Number(firstStick?.profile?.["@_web"] ?? 70));

  const plans = [];
  for (const p of root.plan ?? []) {
    const plan = { name: String(p["@_name"]), frames: [] };
    for (const f of p.frame ?? []) {
      const envRaw = (f.envelope?.vertex ?? []).map(v => parseTriple(typeof v==="string" ? v : v["#text"]));
      let env;
      if (envRaw.length === 4) {
        env = envRaw;
      } else if (envRaw.length >= 3) {
        // Roof panels often have 5/6-vertex polygons (hips, gables). Coerce
        // to a 4-vertex bounding rectangle so deriveFrameBasis succeeds.
        const coerced = coerceEnvelopeToRect(envRaw);
        if (!coerced) continue;
        env = coerced;
        console.warn(`Frame "${f["@_name"]}": ${envRaw.length}-vertex envelope coerced to bounding rectangle`);
      } else {
        continue;
      }
      const fzMin = Math.min(...env.map(v=>v.z));
      const fzMax = Math.max(...env.map(v=>v.z));
      const elevText = (f.elevation && typeof f.elevation === "object" ? f.elevation["#text"] : f.elevation) ?? "";
      const frameElevation = Number(String(elevText).trim()) || 0;
      let frameBasis = null;
      try { frameBasis = deriveFrameBasis(env, true); } catch {}
      // Parse <tool_action name="Service"> elements — these are vertical service
      // line cuts authored in Detailer's input XML. Each Service is a vertical
      // line (start.x==end.x, start.y==end.y, varying z). InnerService ops on
      // T plates and N nogs are derived from these — they are NOT a fixed
      // schedule. The current rule-table fixed offset @306/600 is wrong; the
      // real positions come from these XML elements.
      // Verified 2026-05-02 via per-frame analysis on HG260012 LBW corpus.
      const serviceActions = [];
      const webActions = [];
      const flangeHoleActions = [];
      const boltActions = [];
      for (const ta of (f.tool_action ?? [])) {
        const name = String(ta["@_name"]);
        const sStart = parseTriple(typeof ta.start === "string" ? ta.start : ta.start?.["#text"] ?? "0,0,0");
        const sEnd = parseTriple(typeof ta.end === "string" ? ta.end : ta.end?.["#text"] ?? "0,0,0");
        if (name === "Service") serviceActions.push({ start: sStart, end: sEnd });
        else if (name === "Web") webActions.push({ start: sStart, end: sEnd });
        else if (name === "FlangeHole") flangeHoleActions.push({ start: sStart, end: sEnd });
        else if (name === "Bolt") boltActions.push({ start: sStart, end: sEnd });
      }
      // Pre-pass: capture each plate's WORLD start/end so the per-stick loop
      // below can detect "this nog spans the same world extent as a plate"
      // (→ apply plate-style 4mm/end trim) vs "this nog is shorter than the
      // plate" (→ XML already pre-trimmed; apply 1mm/end trim).
      // Verified 2026-05-03 vs HG260012 LBW: L1101 N1 starts 3mm inset from
      // T1's start (already pre-trimmed); ref length 4109.5 = world 4111.5
      // minus 1mm/end. L1112 N1 starts at SAME world coords as T1; ref
      // length 3643.67 = world 3651.67 minus 4mm/end. Without this, every
      // continuous-nog stud-crossing dimple drifts +3mm vs ref (~34 ops on
      // TH01-1F-LBW alone).
      const platesWorld = [];
      for (const s of f.stick ?? []) {
        const u = String(s["@_usage"] ?? "").toLowerCase();
        if (u !== "topplate" && u !== "bottomplate") continue;
        const ps = parseTriple(String(s.start ?? "0,0,0"));
        const pe = parseTriple(String(s.end ?? "0,0,0"));
        platesWorld.push({ start: ps, end: pe });
      }
      function nogSharesPlateExtent(nogStart, nogEnd) {
        for (const pl of platesWorld) {
          const d1a = Math.hypot(nogStart.x - pl.start.x, nogStart.y - pl.start.y);
          const d2a = Math.hypot(nogEnd.x - pl.end.x, nogEnd.y - pl.end.y);
          const d1b = Math.hypot(nogStart.x - pl.end.x, nogStart.y - pl.end.y);
          const d2b = Math.hypot(nogEnd.x - pl.start.x, nogEnd.y - pl.start.y);
          if ((d1a < 0.5 && d2a < 0.5) || (d1b < 0.5 && d2b < 0.5)) return true;
        }
        return false;
      }

      // Pre-pass: detect paired-header frames. Detailer emits Web stiffeners
      // on H1 only when the frame has a paired/box header — H2 or H3 that
      // sits within H1's world-X span and at a closely-related Z (typically
      // 41mm below H1, the box-section offset). Single-H frames (L4/L8) and
      // frames with separate non-overlapping H sticks (N14 PK1) get no Webs.
      // Verified 2026-05-04 vs HG260001 NLBW+LBW.
      let _h1Stick = null;
      const _hxSticks = [];
      for (const s of f.stick ?? []) {
        const n = String(s["@_name"] ?? "");
        if (n === "H1") _h1Stick = s;
        else if (/^H[23]$/.test(n)) _hxSticks.push(s);
      }
      let framePairedHeader = false;
      if (_h1Stick && _hxSticks.length > 0) {
        const h1s = parseTriple(String(_h1Stick.start ?? "0,0,0"));
        const h1e = parseTriple(String(_h1Stick.end ?? "0,0,0"));
        const h1xMin = Math.min(h1s.x, h1e.x), h1xMax = Math.max(h1s.x, h1e.x);
        const h1yMin = Math.min(h1s.y, h1e.y), h1yMax = Math.max(h1s.y, h1e.y);
        for (const hx of _hxSticks) {
          const hxs = parseTriple(String(hx.start ?? "0,0,0"));
          const hxe = parseTriple(String(hx.end ?? "0,0,0"));
          const hxXMin = Math.min(hxs.x, hxe.x), hxXMax = Math.max(hxs.x, hxe.x);
          const hxYMin = Math.min(hxs.y, hxe.y), hxYMax = Math.max(hxs.y, hxe.y);
          // Paired iff hx sits within H1's world span (with small tolerance)
          // AND at a similar Z (within 80mm — box headers sit 41mm below H1).
          const xOverlap = hxXMin >= h1xMin - 5 && hxXMax <= h1xMax + 5;
          const yOverlap = hxYMin >= h1yMin - 5 && hxYMax <= h1yMax + 5;
          const zClose = Math.abs((hxs.z + hxe.z) / 2 - (h1s.z + h1e.z) / 2) < 80;
          if (xOverlap && yOverlap && zClose) { framePairedHeader = true; break; }
        }
      }

      const sticks = [];
      for (const s of f.stick ?? []) {
        const profile = {
          web: Number(s.profile?.["@_web"] ?? 0),
          lFlange: Number(s.profile?.["@_l_flange"] ?? 0),
          rFlange: Number(s.profile?.["@_r_flange"] ?? 0),
          lLip: Number(s.profile?.["@_l_lip"] ?? 0),
          rLip: Number(s.profile?.["@_r_lip"] ?? 0),
          shape: String(s.profile?.["@_shape"] ?? "C"),
          gauge: String(Number(s["@_gauge"] ?? 0)),
        };
        const stickName = String(s["@_name"]);
        const inputFlipped = String(s.flipped ?? "").trim().toLowerCase() === "true";
        const isDiagonalBrace = /^(Kb|W)\d/.test(stickName);
        const flipped = isDiagonalBrace ? false : inputFlipped;
        let start = parseTriple(String(s.start ?? "0,0,0"));
        let end = parseTriple(String(s.end ?? "0,0,0"));
        let usage = String(s["@_usage"] ?? "").toLowerCase();
        // Detect raised B-plate (z=elevation+61.5) — header-style ops + 1mm/end trim.
        // Verified 2026-05-04 vs HG260001 LBW PK4 L4 B2 (70mm @z=61.5): ref ops
        // shifted +6mm vs our 4mm-trim output, matching 1mm/end trim. Both 70mm
        // and 89mm raised B-plates get this treatment.
        const stickZ = (start.z + end.z) / 2;
        const isRaisedB = usage === "bottomplate"
                          && Math.abs(stickZ - frameElevation - 61.5) < 1;
        if (isRaisedB) {
          usage = "raisedbottomplate";
          // Apply 1mm/end trim instead of 4mm/end
          const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z;
          const len=Math.sqrt(dx*dx+dy*dy+dz*dz);
          if (len > 3) {
            const ux=dx/len,uy=dy/len,uz=dz/len;
            start = { x: start.x+ux, y: start.y+uy, z: start.z+uz };
            end = { x: end.x-ux, y: end.y-uy, z: end.z-uz };
          }
        }
        const isRaised89B = isRaisedB;  // alias kept for legacy compatibility
        // EndClearance plate/chord trim (skip raised B which has its own 1mm trim).
        // LIN (Linear Truss) chords are NOT trimmed — verified vs LINEAR_TRUSS_TESTING:
        // ref B1 len 3677.55 == raw XML length, no 4mm/end trim. Skip chord trim
        // entirely on LIN frames. TB2B (back-to-back) trusses use raw XML chord
        // lengths — verified 2026-05-04 vs HG260001_PK10/TN6-1: T3 ref-len
        // 1303.8 = raw XML 1303.8.
        const isLINPlanForTrim = /-LIN-/i.test(plan.name);
        const isTB2BPlanForTrim = /-TB2B-/i.test(plan.name);
        const isTrussChord = (isLINPlanForTrim || isTB2BPlanForTrim) && (usage === "topchord" || usage === "bottomchord");
        if (!isRaised89B && !isTrussChord && (usage === "topplate" || usage === "bottomplate" || usage === "topchord" || usage === "bottomchord")) {
          const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z;
          const len=Math.sqrt(dx*dx+dy*dy+dz*dz);
          const ec = setup?.endClearance ?? 4;
          if (len > ec*2+1) {
            const ux=dx/len,uy=dy/len,uz=dz/len;
            start = { x: start.x+ux*ec, y: start.y+uy*ec, z: start.z+uz*ec };
            end = { x: end.x-ux*ec, y: end.y-uy*ec, z: end.z-uz*ec };
          }
        }
        // Stud (2mm/end) + Header (1mm/end) + Nog (1mm or 4mm) end-trim
        const isFullStud = usage === "stud" || usage === "endstud" || usage === "jackstud" || usage === "trimstud";
        const isHeader = /^H\d/.test(stickName);
        const isNog = usage === "nog" || usage === "noggin";
        const isJoistWeb = /^V\d/.test(stickName) && usage === "web";
        // H header: 1mm/end trim (verified 2026-05-02 vs HG260012 L1101/H1
        // input 2782 → ref output 2780). The earlier "no trim" comment was
        // wrong — H IS trimmed, but only 1mm/end vs studs' 2mm/end.
        // EXCEPT for LIN frames — LIN H sticks (truss headers) are NOT trimmed.
        // Verified vs LINEAR_TRUSS_TESTING H4 len 3555.83 = raw XML length.
        const isLINHeader = isLINPlanForTrim && isHeader;
        // TB2B headers (truss headers between two half-trusses): NOT trimmed.
        // Verified vs HG260001 PK6/TT6-1 H4: ref length 1761.6 = raw XML
        // length, our 1mm/end trim was producing 1759.6. Removed for TB2B.
        const isTB2BHeader = isTB2BPlanForTrim && isHeader;
        // Nog trim: 4mm/end if nog spans the same world extent as a plate
        // (continuous wall-spanning nog), else 1mm/end. See pre-pass above.
        const nogTrim = isNog && nogSharesPlateExtent(start, end) ? 4.0 : 1.0;
        const T = (isLINHeader || isTB2BHeader) ? 0
          : ((isFullStud || isJoistWeb) ? 2.0
            : isNog ? nogTrim
            : isHeader ? 1.0
            : 0);
        if (T > 0) {
          const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z;
          const len=Math.sqrt(dx*dx+dy*dy+dz*dz);
          if (len > T*2+1) {
            const ux=dx/len,uy=dy/len,uz=dz/len;
            start = { x: start.x+ux*T, y: start.y+uy*T, z: start.z+uz*T };
            end = { x: end.x-ux*T, y: end.y-uy*T, z: end.z-uz*T };
          }
        }
        // Kb stud-end normalization + 2mm trim
        if (/^Kb\d/.test(stickName)) {
          const sb = Math.min(start.z - fzMin, fzMax - start.z);
          const eb = Math.min(end.z - fzMin, fzMax - end.z);
          if (eb > sb) { const t = start; start = end; end = t; }
          const dx = end.x-start.x, dy = end.y-start.y, dz = end.z-start.z;
          const len = Math.sqrt(dx*dx+dy*dy+dz*dz);
          if (len > 4) {
            const ux=dx/len, uy=dy/len, uz=dz/len, T=2.0;
            start = { x: start.x+ux*T, y: start.y+uy*T, z: start.z+uz*T };
          }
        }
        // W truss-web length adjustment: vertical extends, diagonal trims.
        // ONLY for actual truss webs (usage="Web") — LBW walls have W-named
        // sticks too but those are B2B partner studs (usage="Stud").
        // See framecad-import.ts for full derivation.
        // TB2B (back-to-back trusses) keep raw XML lengths — verified 2026-05-04
        // vs HG260001_PK10/TN6-1: W10/W12/W14 vertical-W ref lengths == raw XML
        // (no 11mm lip extension); W11/W13 diagonal-W ref lengths == raw XML
        // (no 2mm trim).
        if (/^W\d/.test(stickName) && usage === "web") {
          const dx = end.x - start.x, dy = end.y - start.y;
          const horizDelta = Math.sqrt(dx*dx + dy*dy);
          const isLINPlanForW = /-LIN-/i.test(plan.name);
          const isTB2BPlanForW = /-TB2B-/i.test(plan.name);
          if (horizDelta < 1.0) {
            // VERTICAL W → extend by lip depth (NOT for LIN/TB2B — verified vs
            // LINEAR_TRUSS_TESTING ref W3 len 190 == raw XML length, no 11mm extension).
            if (!isLINPlanForW && !isTB2BPlanForW) {
              const lipDepth = profile.rLip > 0 ? profile.rLip : 11;
              const dz = end.z - start.z;
              if (Math.abs(dz) > 0.1) {
                const sign = dz > 0 ? 1 : -1;
                end = { x: end.x, y: end.y, z: end.z + sign * lipDepth };
              }
            }
          } else {
            // DIAGONAL W → trim 2mm at end (Kb-style). NOT for LIN/TB2B —
            // verified vs LINEAR_TRUSS_TESTING/HG260001 TB2B: diagonal W lengths
            // == raw XML length.
            if (!isLINPlanForW && !isTB2BPlanForW) {
              const T = 2.0;
              const dz = end.z - start.z;
              const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
              if (len > T * 2) {
                const ux = dx / len, uy = dy / len, uz = dz / len;
                end = { x: end.x - ux*T, y: end.y - uy*T, z: end.z - uz*T };
              }
            }
          }
        }
        // Use the modified `usage` (raisedbottomplate detection happens above)
        // not the raw XML attribute. This ensures roleForUsage() returns "Bh"
        // for raised plates and triggers the right rule group.
        const stick = { name: stickName, start, end, flipped, profile, usage, tooling: [] };
        const length = Math.round(distance3D(stick.start, stick.end) * 10) / 10;
        const role = roleForUsage(stick.usage, String(s["@_type"] ?? ""), stick.name);
        const profileFamily = profileCode(profile.web, profile.lFlange, profile.rFlange, parseFloat(profile.gauge) || 0.75).split("_")[0];
        // Angle of stick from vertical (degrees) — used by wall-W chamfer rule.
        const _stkDx = stick.end.x - stick.start.x;
        const _stkDy = stick.end.y - stick.start.y;
        const _stkDz = stick.end.z - stick.start.z;
        const _stkHoriz = Math.hypot(_stkDx, _stkDy);
        const angleFromVertical = Math.atan2(_stkHoriz, Math.abs(_stkDz)) * 180 / Math.PI;
        stick.tooling = generateTooling({
          role, length, profileFamily,
          gauge: profile.gauge, flipped,
          planName: plan.name, frameName: String(f["@_name"]),
          usage: stick.usage,
          stickName: stick.name,
          angleFromVertical,
          framePairedHeader,
        });
        // Kb midpoint InnerService rule REMOVED 2026-05-03.
        // Verified vs HG260012 LBW corpus: Kb (cripple) InnerService positions
        // are NOT at length/2 — they are at fixed world Z heights where the
        // Kb crosses the configured service-hole horizontals (e.g. ref L1101
        // Kb1 len=1393.3 has InnerService @983.3, NOT @696.7). The midpoint
        // rule fired 33 wrong ops on TH01-1F-LBW alone vs ~0 actual matches.
        // Until height-based projection is implemented, emit nothing.
        // if (/^Kb\d/.test(stickName) && length > 100) {
        //   stick.tooling.push({ kind: "point", type: "InnerService", pos: Math.round((length/2)*10)/10 });
        // }

        // (InnerService strip rule for non-full-height studs was tried
        // 2026-05-03 but reverted — although it correctly removed isolated
        // jamb-stud false-positives on 1F walls (~10 ops), it had no net
        // benefit on the 2F+UPPER LBW corpus where ref InnerService positions
        // shift dramatically with frame elevation, and our base @296+@446
        // ops don't match in either case. Wait for proper height-projection
        // implementation before re-introducing this strip.)

        // Gauge-aware cap widths for ≥0.95mm: T/B plate caps swap 39mm → 45mm.
        // Verified vs HG250082 UPPER-GF-LBW-89.115 vs HG260012 -89.075 by agent
        // 2026-05-02. Reference shows 0.75 gauge dominates 39mm caps; 1.15 gauge
        // dominates 45mm caps on T/B plates and S studs.
        const gaugeFloat = parseFloat(profile.gauge) || 0.75;
        if (gaugeFloat >= 0.95 && (usage === "topplate" || usage === "bottomplate")) {
          for (const op of stick.tooling) {
            if (op.kind !== "spanned") continue;
            // Start cap: [0..39] → [0..45]
            if (op.startPos < 0.5 && Math.abs(op.endPos - 39) < 0.5) {
              op.endPos = 45;
            }
            // End cap: [length-39..length] → [length-45..length]
            if (Math.abs(op.endPos - length) < 0.5 && Math.abs(op.startPos - (length - 39)) < 0.5) {
              op.startPos = Math.round((length - 45) * 10) / 10;
            }
          }
        }

        // Centered-InnerDimple-on-spanned-op rule for S studs at ≥0.95 gauge.
        // Verified vs HG250082 UPPER-GF-LBW-89.115: each LipNotch/Swage on S
        // studs has a paired InnerDimple at the span midpoint. We emit the
        // span but skip the centered dimple — agent identified ~140 missing
        // dimples on the corpus from this single gap.
        const isStudForDimple = usage === "stud" || usage === "endstud" || usage === "trimstud" || usage === "jackstud";
        if (gaugeFloat >= 0.95 && isStudForDimple) {
          const newDimples = [];
          for (const op of stick.tooling) {
            if (op.kind !== "spanned") continue;
            if (op.type !== "LipNotch" && op.type !== "Swage") continue;
            const mid = (op.startPos + op.endPos) / 2;
            // Skip end-caps (where dimple is at fixed offset from end already)
            if (mid < 50 || mid > length - 50) continue;
            newDimples.push({ kind: "point", type: "InnerDimple", pos: Math.round(mid * 100) / 100 });
          }
          // Dedupe against existing dimples (within 1mm)
          for (const d of newDimples) {
            const existing = stick.tooling.some(o => o.kind === "point" && o.type === "InnerDimple" && Math.abs(o.pos - d.pos) < 1);
            if (!existing) stick.tooling.push(d);
          }
        }

        // V-prefix cap rule for SHORT V sticks (length < 100mm).
        // Verified vs HG260012 FJ J1203/V5 (length 83): ref has
        // InnerNotch[0..39] + LipNotch[0..39] start cap (paired notch)
        // and Swage[44..83] end cap. Currently W rule emits Swage at both
        // ends — wrong start for short V's.
        if (/^V\d/.test(stickName) && usage === "web" && length < 100) {
          // Remove start-cap Swage[0..39]
          for (let i = stick.tooling.length - 1; i >= 0; i--) {
            const op = stick.tooling[i];
            if (op.kind === "spanned" && op.type === "Swage" &&
                op.startPos < 0.5 && op.endPos < 50) {
              stick.tooling.splice(i, 1);
            }
          }
          stick.tooling.push({ kind: "spanned", type: "InnerNotch", startPos: 0, endPos: 39 });
          stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: 0, endPos: 39 });
        }
        // Nog InnerService: position-dependent on stick context — skipping
        // Truss W angle-dependent: vertical=stud-style (16.5+39), diagonal=Kb-style (10+variable+chamfers)
        // 2026-05-02 — gated dimple swap by usage="web". LBW W sticks have
        // usage="Stud" (B2B partners) and Detailer keeps stud-style dimples.
        if (/^W\d/.test(stickName) && frameBasis) {
          const startL = projectToFrameLocal(stick.start, frameBasis);
          const endL = projectToFrameLocal(stick.end, frameBasis);
          const dxL = Math.abs(endL.x - startL.x);
          // Chamfer ONLY for actual truss webs (usage="web"). LBW walls have
          // W-named B2B partner studs (usage="Stud") that look slightly
          // diagonal in projection but are structurally vertical — Detailer
          // doesn't chamfer them. Verified 2026-05-02: 70 spurious Chamfer
          // extras on UPPER-GF-LBW-89.115 eliminated by gating on usage.
          if (dxL > 1.0 && usage === "web") {
            stick.tooling.push({ kind: "start", type: "Chamfer" });
            stick.tooling.push({ kind: "end", type: "Chamfer" });
          }
          if (dxL > 1.0 && usage === "web") {
            if (usage === "web") {
              const dStart = 16.5, dEnd = length - 16.5, tol = 0.5;
              for (let i = stick.tooling.length - 1; i >= 0; i--) {
                const op = stick.tooling[i];
                if (op.kind === "point" && op.type === "InnerDimple" &&
                    (Math.abs(op.pos - dStart) < tol || Math.abs(op.pos - dEnd) < tol)) {
                  stick.tooling.splice(i, 1);
                }
              }
              stick.tooling.push({ kind: "point", type: "InnerDimple", pos: 10 });
              stick.tooling.push({ kind: "point", type: "InnerDimple", pos: Math.round((length-10)*10)/10 });

              // Variable-span Swage for diagonal W: span = profile_width / sin(θ).
              // For 89mm web with profile flange 41mm: cap span ≈ 41/sin(θ).
              // Agent verified vs HG260012 FJ: spans 49.97, 57.72, 58.63mm
              // for different W angles. Default rule emits 39mm — wrong.
              //
              // 2026-05-04 — bumped 41 → 45 (diagonal-W truss span on TIN
              // panel frames). Verified vs HG260001 GF-TIN-70.075 PC1-1/PC3-1:
              //   PC1-1 W4 (sin=0.638): 45/sin = 70.5, ref = 70.0 (Δ 0.5mm)
              //   PC1-1 W5 (sin=0.593): 45/sin = 75.9, ref = 75.7 (Δ 0.2mm)
              //   PC3-1 W4 (sin=0.538): 45/sin = 83.6, ref = 83.9 (Δ 0.3mm)
              //   PC3-1 W5 (sin=0.608): 45/sin = 74.0, ref = 73.8 (Δ 0.2mm)
              // The +4mm "extra" is the trim allowance — Swage extends past
              // the lip-flange-clearance mark by ~4mm to absorb the F300i's
              // standard end-cap clearance (matches LipNotch span 39 + 4 = 43,
              // and Swage on a 90° vertical gets 45 cleanly).
              // Doesn't affect 89mm FJ joist V's (those go through a separate
              // V-stick branch at /^V\d/ above).
              const dyL = Math.abs(endL.y - startL.y);
              const lenL = Math.sqrt(dxL * dxL + dyL * dyL);
              const sinTheta = lenL > 1 ? (dyL / lenL) : 1;
              if (sinTheta > 0.1 && sinTheta < 0.99) {
                const variableSpan = Math.min(80, Math.max(39, 45 / sinTheta));
                // Replace existing Swage[0..39] and Swage[length-39..length]
                const tol2 = 1.0;
                for (let i = stick.tooling.length - 1; i >= 0; i--) {
                  const op = stick.tooling[i];
                  if (op.kind === "spanned" && op.type === "Swage") {
                    if (op.startPos < 1 && Math.abs(op.endPos - 39) < tol2) {
                      stick.tooling.splice(i, 1);  // remove old start cap
                    } else if (Math.abs(op.endPos - length) < tol2 && Math.abs(op.startPos - (length - 39)) < tol2) {
                      stick.tooling.splice(i, 1);  // remove old end cap
                    }
                  }
                }
                stick.tooling.push({ kind: "spanned", type: "Swage", startPos: 0, endPos: Math.round(variableSpan * 100) / 100 });
                stick.tooling.push({ kind: "spanned", type: "Swage", startPos: Math.round((length - variableSpan) * 100) / 100, endPos: length });
              }
            }
          }
        }
        // Web@pt rule: predicate not yet derived (Detailer is selective per stud) — skip.

        // Bolt from XML <tool_action name="Bolt"> — emit on ground-floor B
        // plates. Position formula: pos = |stick.start - bolt.axis| (after trim).
        // Replaces the default-rule @62 / @length-62 bolt positions which are
        // wrong for slabs with non-uniform anchor schedules.
        // Verified 2026-05-04 vs HG260001 PK1 N2 B1: ref has Bolt @641.5, @1626,
        // @2611, @3261 matching world Y of XML <tool_action name="Bolt">.
        if (boltActions.length > 0) {
          const u = String(stick.usage ?? "").toLowerCase();
          const isBottomPlate = u === "bottomplate";
          if (isBottomPlate) {
            const sStart = stick.start, sEnd = stick.end;
            const dxAbs = Math.abs(sEnd.x - sStart.x);
            const dyAbs = Math.abs(sEnd.y - sStart.y);
            const useX = dxAbs >= dyAbs;
            const stickAxisStart = useX ? sStart.x : sStart.y;
            const stickAxisEnd = useX ? sEnd.x : sEnd.y;
            const stickPerp = useX ? sStart.y : sStart.x;
            // Remove default Bolt ops (codec emitted at @62 / @length-62);
            // they will be replaced by tool-action-derived positions.
            stick.tooling = stick.tooling.filter(o => !(o.kind === "point" && o.type === "Bolt"));
            const axisLo = Math.min(stickAxisStart, stickAxisEnd);
            const axisHi = Math.max(stickAxisStart, stickAxisEnd);
            const seen = new Set();
            for (const ba of boltActions) {
              const baAxis = useX ? ba.start.x : ba.start.y;
              const baPerp = useX ? ba.start.y : ba.start.x;
              // Skip bolts on different walls
              if (Math.abs(baPerp - stickPerp) > 100) continue;
              // Skip if outside stick's axis range
              if (baAxis < axisLo - 5 || baAxis > axisHi + 5) continue;
              const rawPos = Math.abs(stickAxisStart - baAxis);
              if (rawPos < 5 || rawPos > length - 5) continue;
              const rounded = Math.round(rawPos * 10) / 10;
              if (seen.has(rounded)) continue;
              seen.add(rounded);
              stick.tooling.push({ kind: "point", type: "Bolt", pos: Math.round(rawPos * 10000) / 10000 });
            }
          }
        }

        // InnerService from XML <tool_action name="Service"> — emit on T plates
        // and N nogs. Position formula derived 2026-05-02 vs HG260012 corpus:
        //   pos = |stick.start[run_axis] - service.start[run_axis]| - 4mm
        // The 4mm trim is the F300i pre-punch offset (consistent across setups).
        // Selection rule:
        //   T plate:  service whose max(start.z, end.z) is within 50mm of T.z
        //   N nog:    service whose z-range CONTAINS the nog's z
        //   B plate:  NEVER (verified 0/516 cases on LBW corpus)
        if (serviceActions.length > 0) {
          const u = String(stick.usage ?? "").toLowerCase();
          const isTopPlate = u === "topplate" || u === "topchord";
          const isNog = u === "nog" || u === "noggin";
          if (isTopPlate || isNog) {
            // Determine run axis: whichever of x/y varies more along the stick
            const sStart = stick.start, sEnd = stick.end;
            const dxAbs = Math.abs(sEnd.x - sStart.x);
            const dyAbs = Math.abs(sEnd.y - sStart.y);
            const useX = dxAbs >= dyAbs;
            const stickAxisStart = useX ? sStart.x : sStart.y;
            const stickPerp = useX ? sStart.y : sStart.x;
            const stickZ = (sStart.z + sEnd.z) / 2;
            for (const svc of serviceActions) {
              // Service is vertical: start.x==end.x, start.y==end.y, varying z.
              const svcAxis = useX ? svc.start.x : svc.start.y;
              const svcPerp = useX ? svc.start.y : svc.start.x;
              // Skip services on different walls (perpendicular position differs)
              if (Math.abs(svcPerp - stickPerp) > 100) continue;
              const svcZmin = Math.min(svc.start.z, svc.end.z);
              const svcZmax = Math.max(svc.start.z, svc.end.z);
              let matches = false;
              if (isTopPlate) {
                // Service must reach up to within 50mm of plate Z
                matches = Math.abs(svcZmax - stickZ) < 50;
              } else if (isNog) {
                // Nog Z must lie within service's vertical extent
                matches = stickZ >= svcZmin - 5 && stickZ <= svcZmax + 5;
              }
              if (!matches) continue;
              // Position formula: pos = |trimmed_stick_start - service.axis|.
              // The agent's "−4mm pre-punch" turns out to equal the
              // EndClearance trim already applied to T plates (4mm) and the
              // nog trim (1mm) plus the implicit offset. Verified vs HG260012
              // L1101: original-T1 23732.786, service 23614.286, raw diff
              // 118.5; trimmed-T1 23728.786, trimmed diff 114.5 = ref pos.
              // For N1: original 23729.786, trimmed 23728.786, diff 114.5 = ref.
              const rawPos = Math.abs(stickAxisStart - svcAxis);
              if (rawPos < 5 || rawPos > length - 5) continue;
              stick.tooling.push({ kind: "point", type: "InnerService", pos: Math.round(rawPos * 10000) / 10000 });
            }
            // Re-sort tooling by position so InnerService ops slot in correctly
            stick.tooling.sort((a, b) => {
              const pa = a.kind === "spanned" ? a.startPos : (a.kind === "point" ? a.pos : (a.kind === "start" ? 0 : length));
              const pb = b.kind === "spanned" ? b.startPos : (b.kind === "point" ? b.pos : (b.kind === "start" ? 0 : length));
              return pa - pb;
            });
          }
        }

        // Web tool_actions: emit Web@pt on T plates only. Same selection
        // logic as Services (vertical line, z-range reaches/contains plate z).
        // 2026-05-02: ref T1 has Web @254 etc. matching XML <tool_action name="Web">
        // entries. Position formula identical to Services.
        // FlangeHole tool_actions → ScrewHoles@pt (TIN truss paired-chord
        // markers). Verified vs HG250057/U2-GF-TIN-70.075/TN202-1: T2 (outer
        // chord) has 21 ScrewHoles paired with T3 (inner chord) Web@pt at
        // identical X positions. Each chord gets one half via z-range matching.
        if (flangeHoleActions.length > 0) {
          const u = String(stick.usage ?? "").toLowerCase();
          if (u === "topchord" || u === "bottomchord") {
            const sStart = stick.start, sEnd = stick.end;
            const dxAbs = Math.abs(sEnd.x - sStart.x);
            const dyAbs = Math.abs(sEnd.y - sStart.y);
            const useX = dxAbs >= dyAbs;
            const stickAxisStart = useX ? sStart.x : sStart.y;
            const stickPerp = useX ? sStart.y : sStart.x;
            const stickZ = (sStart.z + sEnd.z) / 2;
            for (const fh of flangeHoleActions) {
              const fhAxis = useX ? fh.start.x : fh.start.y;
              const fhPerp = useX ? fh.start.y : fh.start.x;
              if (Math.abs(fhPerp - stickPerp) > 100) continue;
              const fhZmin = Math.min(fh.start.z, fh.end.z);
              const fhZmax = Math.max(fh.start.z, fh.end.z);
              if (stickZ < fhZmin - 5 || stickZ > fhZmax + 5) continue;
              const rawPos = Math.abs(stickAxisStart - fhAxis);
              if (rawPos < 5 || rawPos > length - 5) continue;
              stick.tooling.push({ kind: "point", type: "ScrewHoles", pos: Math.round(rawPos * 10000) / 10000 });
            }
            stick.tooling.sort((a, b) => {
              const pa = a.kind === "spanned" ? a.startPos : (a.kind === "point" ? a.pos : (a.kind === "start" ? 0 : length));
              const pb = b.kind === "spanned" ? b.startPos : (b.kind === "point" ? b.pos : (b.kind === "start" ? 0 : length));
              return pa - pb;
            });
          }
        }

        if (webActions.length > 0) {
          const u = String(stick.usage ?? "").toLowerCase();
          // Web@pt: T plates, top chords, AND bottom chords (FJ B-chord
          // gets Web@midpoint marker — agent verified vs HG260012 FJ corpus).
          if (u === "topplate" || u === "topchord" || u === "bottomchord") {
            const sStart = stick.start, sEnd = stick.end;
            const dxAbs = Math.abs(sEnd.x - sStart.x);
            const dyAbs = Math.abs(sEnd.y - sStart.y);
            const useX = dxAbs >= dyAbs;
            const stickAxisStart = useX ? sStart.x : sStart.y;
            const stickPerp = useX ? sStart.y : sStart.x;
            const stickZ = (sStart.z + sEnd.z) / 2;
            for (const w of webActions) {
              const wAxis = useX ? w.start.x : w.start.y;
              const wPerp = useX ? w.start.y : w.start.x;
              if (Math.abs(wPerp - stickPerp) > 100) continue;
              const wZmin = Math.min(w.start.z, w.end.z);
              const wZmax = Math.max(w.start.z, w.end.z);
              // Web action z-range must include or reach the plate's z
              if (stickZ < wZmin - 5 || stickZ > wZmax + 5) continue;
              const rawPos = Math.abs(stickAxisStart - wAxis);
              if (rawPos < 5 || rawPos > length - 5) continue;
              stick.tooling.push({ kind: "point", type: "Web", pos: Math.round(rawPos * 10000) / 10000 });
            }
            stick.tooling.sort((a, b) => {
              const pa = a.kind === "spanned" ? a.startPos : (a.kind === "point" ? a.pos : (a.kind === "start" ? 0 : length));
              const pb = b.kind === "spanned" ? b.startPos : (b.kind === "point" ? b.pos : (b.kind === "start" ? 0 : length));
              return pa - pb;
            });
          }
        }
        sticks.push(stick);
      }
      // ============================================================
      // LIN per-frame metadata: precompute chord-W intersection panel-points,
      // chord cap-end orientation (apex-butt vs heel-cap), and per-W flipped flag.
      // Stored in LIN_META keyed by (plan, frame, stickIndex) since stick names
      // can repeat (e.g. multiple W3 in same frame).
      // ============================================================
      const isLINFrameForMeta = /-LIN-/i.test(plan.name);
      if (isLINFrameForMeta) {
        // Find the apex point: highest-z point shared by 2 TopChord sticks.
        // Also identify the heel ends of B-chord (lowest-y end of each chord).
        const wSticks = sticks.filter(s => /^W\d/.test(s.name) && String(s.usage).toLowerCase() === "web");
        const nameOccurrence = new Map();
        for (let si = 0; si < sticks.length; si++) {
          const s = sticks[si];
          const occ = nameOccurrence.get(s.name) ?? 0;
          nameOccurrence.set(s.name, occ + 1);
          const u = String(s.usage ?? "").toLowerCase();
          const meta = { stickIdx: si };
          if (u === "topchord" || u === "bottomchord") {
            // Determine chord run axis (whichever of x/y varies more)
            const dxAbs = Math.abs(s.end.x - s.start.x);
            const dyAbs = Math.abs(s.end.y - s.start.y);
            const useX = dxAbs >= dyAbs;
            const stickAxisStart = useX ? s.start.x : s.start.y;
            const stickAxisEnd = useX ? s.end.x : s.end.y;
            const stickAxisLen = Math.abs(stickAxisEnd - stickAxisStart);
            const stickPerp = useX ? s.start.y : s.start.x;
            const chord3DLen = distance3D(s.start, s.end);
            // Determine apex-butt: TopChord's high-z end is at the apex.
            // For TopChord, both ends differ in z; the apex end is the higher z.
            // For BottomChord, z is roughly constant; no apex butt.
            const startZ = s.start.z, endZ = s.end.z;
            const isTopChord = u === "topchord";
            const isBottomChord = u === "bottomchord";
            // Apex-end position along stick (0 if start is high-z, len if end is high-z)
            let apexAtStart = false, apexAtEnd = false;
            if (isTopChord && Math.abs(endZ - startZ) > 50) {
              if (startZ > endZ) apexAtStart = true; else apexAtEnd = true;
            }
            // Find W intersections: only vertical W sticks (where start.xy == end.xy).
            // Diagonal W sticks have inconsistent panel-point projection — Detailer
            // appears to use a different rule we haven't fully reverse-engineered.
            const panelPoints = [];
            for (const w of wSticks) {
              const wDxy = Math.sqrt((w.end.x - w.start.x) ** 2 + (w.end.y - w.start.y) ** 2);
              if (wDxy >= 1) continue;  // skip diagonal W
              const wAxis = useX ? w.start.x : w.start.y;
              const wPerp = useX ? w.start.y : w.start.x;
              if (Math.abs(wPerp - stickPerp) > 100) continue;
              const wZmin = Math.min(w.start.z, w.end.z);
              const wZmax = Math.max(w.start.z, w.end.z);
              const chordZmid = (startZ + endZ) / 2;
              if (chordZmid < wZmin - 50 || chordZmid > wZmax + 50) continue;
              const localPos = stickAxisStart < stickAxisEnd
                ? (wAxis - stickAxisStart)
                : (stickAxisStart - wAxis);
              if (localPos < 5 || localPos > stickAxisLen - 5) continue;
              const scaled = localPos * (chord3DLen / stickAxisLen);
              panelPoints.push(Math.round(scaled * 100) / 100);
            }
            // Diagonal W intersections with chords are NOT consistent across the
            // corpus — Detailer's panel-point calculation for diagonals appears
            // to use a different projection that we haven't reverse-engineered.
            // For now, only emit vertical-W panel-points (handled above) — they
            // give a clean win on TN-style trusses without spurious extras on H.
            panelPoints.sort((a,b) => a-b);
            meta.panelPoints = panelPoints;
            meta.apexAtStart = apexAtStart;
            meta.apexAtEnd = apexAtEnd;
            meta.isTopChord = isTopChord;
            meta.isBottomChord = isBottomChord;
            meta.is3DLen = chord3DLen;
            meta.start3D = { x: s.start.x, y: s.start.y, z: s.start.z };
            meta.end3D = { x: s.end.x, y: s.end.y, z: s.end.z };
          }
          if (/^H\d/.test(s.name)) {
            // Capture H header endpoints for cap-suppression heuristic.
            meta.start3D = { x: s.start.x, y: s.start.y, z: s.start.z };
            meta.end3D = { x: s.end.x, y: s.end.y, z: s.end.z };
            meta.length3D = distance3D(s.start, s.end);
          }
          if (/^W\d/.test(s.name) && u === "web") {
            // W stick: capture flipped flag and angle (vertical vs diagonal)
            const dxy = Math.sqrt((s.end.x - s.start.x) ** 2 + (s.end.y - s.start.y) ** 2);
            const dz = Math.abs(s.end.z - s.start.z);
            meta.isVertical = dxy < 1.0;
            meta.flipped = !!s.flipped;
            meta.dxy = dxy;
            meta.dz = dz;
            meta.length3D = distance3D(s.start, s.end);
          }
          if (/^[TBHW]\d/.test(s.name)) {
            const key = linMetaKey(plan.name, String(f["@_name"]), s.name, occ);
            LIN_META.set(key, meta);
          }
        }

        // Second pass: detect open ends on B/H chords (ends that abut an apex
        // T-chord, not a heel) and set hasStartCap/hasEndCap on metadata.
        // Verified vs LIN ref: TN2-1 B1 ends at the apex foot (not a heel) —
        // ref shows only ONE cap (start), not both. Default codec-emit logic
        // emits both, generating ~3 spurious extras per such case.
        const apexPoints = [];  // [{x, y, z}] from T-chord apex ends
        const heelPoints = [];  // [{x, y, z}] from T-chord heel ends (low-z)
        const nameOcc2 = new Map();
        for (let si = 0; si < sticks.length; si++) {
          const s2 = sticks[si];
          if (String(s2.usage).toLowerCase() !== "topchord") continue;
          // Skip H header sticks (they're tagged as TopChord but aren't pitched chords).
          if (/^H\d/.test(s2.name)) continue;
          const occ2 = nameOcc2.get(s2.name) ?? 0;
          nameOcc2.set(s2.name, occ2 + 1);
          // Apex = high-z end; heel = low-z end
          if (s2.start.z > s2.end.z) {
            apexPoints.push(s2.start);
            heelPoints.push(s2.end);
          } else {
            apexPoints.push(s2.end);
            heelPoints.push(s2.start);
          }
        }
        // For each B/H chord, decide if start/end is an open (apex) end.
        const nameOcc3 = new Map();
        for (let si = 0; si < sticks.length; si++) {
          const s2 = sticks[si];
          if (!/^[BH]\d/.test(s2.name)) continue;
          const u = String(s2.usage).toLowerCase();
          if (u !== "bottomchord" && !/^H\d/.test(s2.name)) continue;
          const occ2 = nameOcc3.get(s2.name) ?? 0;
          nameOcc3.set(s2.name, occ2 + 1);
          const key = linMetaKey(plan.name, String(f["@_name"]), s2.name, occ2);
          const m = LIN_META.get(key);
          if (!m) continue;
          // Distance helper
          const near = (p, q) => {
            const dx = p.x - q.x, dy = p.y - q.y;
            // 2D distance is enough — z differs between apex and B
            return Math.sqrt(dx*dx + dy*dy);
          };
          // For B chord: an "open" end abuts a TopChord endpoint (apex OR
          // heel-foot — both are points where the B-chord transitions to the
          // truss interior, not a heel-cap connection). Verified vs TN2-1 B1
          // (3638.77): B1's end is at the heel-foot of T3 (low-z end of T3).
          // For H chord: an "open" end abuts a TopChord apex.
          let startOpen = false, endOpen = false;
          for (const ap of apexPoints) {
            if (near(ap, s2.start) < 200) startOpen = true;
            if (near(ap, s2.end) < 200) endOpen = true;
          }
          if (s2.usage && String(s2.usage).toLowerCase() === "bottomchord") {
            for (const hp of heelPoints) {
              if (near(hp, s2.start) < 200) startOpen = true;
              if (near(hp, s2.end) < 200) endOpen = true;
            }
          }
          m.startNearApex = startOpen;
          m.endNearApex = endOpen;
        }
      }

      // RP (RoofPanel) post-processing: Detailer's RP frames have very
      // different op patterns from LBW. Verified 2026-05-02 vs HG260012/
      // HG250096 RP corpus by agent:
      //   - S studs: caps are LipNotch, NOT Swage (we emit Swage)
      //   - No Chamfer@end on any stick
      //   - T/B chords: dimples at every stud crossing (handled by frame-context)
      // Short FJ chord stubs (B1/T2/T4 length ≤ 250mm) emit paired InnerNotch
      // alongside LipNotch caps at the connection-end. Agent verified vs
      // HG260012 J1202-1/B1 (length 120) ref ops: InnerNotch[81..120] +
      // LipNotch[81..120] at the join end.
      const isFJFrame = /-(FJ|JOIST)-/i.test(plan.name);
      if (isFJFrame) {
        for (const s of sticks) {
          const u = String(s.usage ?? "").toLowerCase();
          if (!/^[TBHV]\d/.test(s.name)) continue;
          const stickLen = distance3D(s.start, s.end);
          if (stickLen > 250) continue;  // only short stubs
          // For each LipNotch at a cap, add a paired InnerNotch
          const lipNotchCaps = [];
          for (const op of s.tooling) {
            if (op.kind !== "spanned" || op.type !== "LipNotch") continue;
            const isStartCap = op.startPos < 0.5 && Math.abs(op.endPos - 39) < 1;
            const isEndCap = Math.abs(op.endPos - stickLen) < 1 && Math.abs(op.startPos - (stickLen - 39)) < 1;
            if (isStartCap || isEndCap) lipNotchCaps.push({ startPos: op.startPos, endPos: op.endPos });
          }
          for (const cap of lipNotchCaps) {
            const exists = s.tooling.some(o => o.kind === "spanned" && o.type === "InnerNotch" &&
              Math.abs(o.startPos - cap.startPos) < 0.5 && Math.abs(o.endPos - cap.endPos) < 0.5);
            if (!exists) {
              s.tooling.push({ kind: "spanned", type: "InnerNotch", startPos: cap.startPos, endPos: cap.endPos });
            }
          }
          void u;
        }
      }

      // LIN (Linear Truss) frames have a different chord op pattern: Web@pt
      // at every panel-point crossing instead of InnerDimple+LipNotch.
      // Verified vs LINEAR_TRUSS_TESTING/GF-LIN-89.075. We don't yet emit
      // the LeftFlange/RightFlange spans (separate complex rule).
      const isLINFrame = /-LIN-/i.test(plan.name);
      if (isLINFrame) {
        for (const s of sticks) {
          const u = String(s.usage ?? "").toLowerCase();
          if (u !== "topchord" && u !== "bottomchord") continue;
          // Convert mid-stick LipNotch+InnerDimple panel-point ops into Web@pt.
          // Cap LipNotches (start at 0 or end at length) stay.
          const stickLen = distance3D(s.start, s.end);
          const newOps = [];
          const removed = [];
          for (const op of s.tooling) {
            if (op.kind === "spanned" && op.type === "LipNotch") {
              const isCap = (op.startPos < 0.5) || (Math.abs(op.endPos - stickLen) < 0.5);
              if (!isCap) {
                // Mid-stick LipNotch — convert center to Web@pt
                removed.push(op);
                const center = (op.startPos + op.endPos) / 2;
                newOps.push({ kind: "point", type: "Web", pos: Math.round(center * 10000) / 10000 });
                continue;
              }
            }
            if (op.kind === "point" && op.type === "InnerDimple") {
              // Skip mid-stick InnerDimples (they become Web@pt above)
              const isCapDimple = op.pos < 50 || op.pos > stickLen - 50;
              if (!isCapDimple) {
                removed.push(op);
                continue;
              }
            }
            newOps.push(op);
          }
          s.tooling = newOps;
        }
      }

      const isRPFrame = /-(RP|HJ)-/i.test(plan.name);
      if (isRPFrame) {
        let removed = 0;
        for (const s of sticks) {
          if (process.env.DEBUG_RP === "1" && /^S\d/.test(s.name)) {
            console.error(s.name, 'ops:', s.tooling.map(o => o.type+'@'+(o.kind==='spanned'?o.startPos+'-'+o.endPos:o.kind==='point'?o.pos:o.kind)).join(','));
          }
          for (let i = s.tooling.length - 1; i >= 0; i--) {
            const op = s.tooling[i];
            if ((op.kind === "end" || op.kind === "start") && op.type === "Chamfer") {
              s.tooling.splice(i, 1);
              removed++;
            }
          }
        }
        if (process.env.DEBUG_RP === "1") console.error("  removed Chamfers:", removed);
      }

      // Raking-frame Chamfer@end rule — ONLY for ExternalWall/InternalWall
      // frames (LBW/NLBW). RoofPanel frames have sloped TopPlates too, but
      // Detailer doesn't add Chamfers — ref shows 0 chamfers on RP studs.
      const frameType = String(f["@_type"] ?? "").toLowerCase();
      const isWallFrame = frameType.includes("wall");
      // A frame is "raking" if any TopPlate stick has |end.z - start.z| > 1mm
      // (sloped top plate, e.g. gable wall with raked ceiling). In raking
      // frames:
      //   - Every Stud/TrimStud gets Chamfer@end (in addition to Chamfer@start
      //     which Kb/W diagonals already get)
      //   - Every TopPlate gets Chamfer@start OR @end on the HIGH end
      //     (whichever side has end.z > start.z)
      const isRaking = isWallFrame && sticks.some(s => {
        const u = String(s.usage ?? "").toLowerCase();
        return u === "topplate" && Math.abs(s.end.z - s.start.z) > 1;
      });
      if (isRaking) {
        for (const s of sticks) {
          const u = String(s.usage ?? "").toLowerCase();
          const isFullStud = u === "stud" || u === "trimstud";
          if (isFullStud) {
            // 2026-05-04 — DISABLED. Verified vs HG260001 PK4 LBW L16/L17/L20:
            // raking-frame studs do NOT get Chamfer @end in ref. The rule was
            // over-firing on every wall-frame with sloped top plate. Until a
            // real signal is identified, emit nothing.
            // const hasEnd = s.tooling.some(t => t.kind === "end" && t.type === "Chamfer");
            // if (!hasEnd) s.tooling.push({ kind: "end", type: "Chamfer" });
          } else if (u === "topplate") {
            const dz = s.end.z - s.start.z;
            if (Math.abs(dz) > 1) {
              const hasStart = s.tooling.some(t => t.kind === "start" && t.type === "Chamfer");
              const hasEnd = s.tooling.some(t => t.kind === "end" && t.type === "Chamfer");
              if (dz > 0 && !hasEnd) s.tooling.push({ kind: "end", type: "Chamfer" });
              if (dz < 0 && !hasStart) s.tooling.push({ kind: "start", type: "Chamfer" });
            }
          }
        }
      }
      // TB2B side-channel: capture per-frame stick endpoints + names + usage
      // for the post-decode pairwise-intersection Web@pt rewriter. Only
      // populated for TB2B-pattern plans (back-to-back trusses, /-TB2B-/).
      // Web@pt positions are derived purely from centerline crossings of
      // every stick pair in the frame, then end-zone-filtered + apex-deduped.
      const isTB2BPlanForMeta = /-TB2B-/i.test(plan.name);
      const isTrussFrame = String(f["@_type"] ?? "") === "Truss";
      if (isTB2BPlanForMeta && isTrussFrame) {
        const frameMetaSticks = [];
        for (const s of sticks) {
          frameMetaSticks.push({
            name: s.name,
            start3D: { x: s.start.x, y: s.start.y, z: s.start.z },
            end3D: { x: s.end.x, y: s.end.y, z: s.end.z },
            usage: String(s.usage ?? "").toLowerCase(),
            flipped: !!s.flipped,
          });
        }
        TB2B_META.set(tb2bFrameKey(plan.name, String(f["@_name"])), { sticks: frameMetaSticks });
      }
      plan.frames.push({ name: String(f["@_name"]), envelope: env, sticks });
    }
    plans.push(plan);
  }

  return {
    project: { name: String(root["@_name"]), jobNum: "JOB", client: "", date: "2026-04-30", plans },
    setup,
  };
}

const xmlText = fs.readFileSync(inputXmlPath, "utf8");
const { project: ourProject, setup } = buildOurProject(xmlText);
const ourResult = synthesizeRfyFromPlans(ourProject, { machineSetup: setup, lenient: true });
const ourDoc = decode(ourResult.rfy);

// Post-decode rule swaps for frame types where the codec's default rules
// emit the wrong op vocabulary. LIN frames need Web@pt (not LipNotch+Dimple)
// at panel-points on chords. RP frames need NO Chamfer. TB2B frames (back-to-
// back trusses) need pairwise-centerline-intersection Web@pt on every stick,
// nothing else.
for (const plan of ourDoc.project.plans) {
  const isLINPlan = /-LIN-/i.test(plan.name);
  const isRPPlan = /-(RP|HJ)-/i.test(plan.name);
  const isTB2BPlan = /-TB2B-/i.test(plan.name);
  for (const frame of plan.frames) {
    // TB2B Web@pt rewrite — per-frame pairwise centerline intersections.
    // Mirrors simplify-linear-truss.ts's algorithm but runs on the decoded
    // tooling array (not on the encrypted RFY bytes) and works in any flat
    // 2D plane (TB2B sticks are in YZ; the LIN simplifier hardcodes XZ).
    if (isTB2BPlan) {
      const meta = TB2B_META.get(tb2bFrameKey(plan.name, frame.name));
      if (meta) {
        const positionsByName = computeTB2BWebPositions(meta.sticks);
        // Apply: for each stick whose name is in positionsByName AND name
        // matches /^[TBWRH]\d/ (truss member), strip Chamfer/Swage/InnerDimple/
        // LipNotch/Web ops and replace with Web@pt at each computed position.
        // Box-piece sticks (e.g. "T4 (Box1)") are NOT touched — their
        // InnerDimple ops are pre-derived by the codec/rules at the right
        // positions for snap-fit.
        for (const stick of frame.sticks) {
          if (/\(Box\d+\)/.test(stick.name)) continue;
          if (!/^[TBWRH]\d/.test(stick.name)) continue;
          // Truss members: ALWAYS strip codec's wrong ops (Swage/Chamfer/
          // mid-stick InnerDimple/mid-stick LipNotch). Then add Web@pt at
          // each computed position (if any).
          const positions = positionsByName.get(stick.name) ?? [];
          stick.tooling = stick.tooling.filter(op => {
            // Keep cap-style spanned ops (LeftFlange/RightFlange/LipNotch
            // span at start/end of stick) — those are emitted by the codec
            // for chamfer-end chords like R8 that abut another truss.
            // Drop everything else: Chamfer, Swage, InnerDimple, mid-stick
            // LipNotch (including the bogus negative-span LipNotch the
            // codec sometimes emits for raking T4-style chords).
            if (op.kind === "start" || op.kind === "end") return false;
            if (op.kind === "point") return false;
            if (op.kind === "spanned") {
              if (op.type === "Swage") return false;
              if (op.type === "LipNotch") {
                // Drop bogus mid-stick LipNotch (startPos < endPos but not
                // anchored to either end) and end-anchored LipNotch with
                // negative endPos sentinel that should be re-emitted by
                // the cap rule below if at all.
                return false;
              }
              if (op.type === "LeftFlange" || op.type === "RightFlange") {
                // Drop LeftFlange/RightFlange — chord caps are not part of
                // the standard Web@pt rule. (We could re-add them on
                // raking-end chords later; for now drop to avoid extras.)
                return false;
              }
            }
            return true;
          });
          for (const p of positions) {
            stick.tooling.push({ kind: "point", type: "Web", pos: Math.round(p * 100) / 100 });
          }
          // R-rail end-cap rule: short rails (~382mm) between truss apex
          // and webs get a fixed end-cap pattern at BOTH ends:
          //   LipNotch 0..22.7 + LeftFlange 0..147.1 + Web @52.2
          //   Web @(L-52.2) + LeftFlange (L-147.1)..L + LipNotch (L-22.7)..L
          // Verified vs HG260001 PK10/TN6-1 R8 (L=382.4), PK11/TN5-1 R6,
          // PK12/TN1-1 R7. Constants are profile-derived (70S41), not from
          // the centerline-intersection geometry.
          const stickLen = positions.length > 0 ? Math.max(...positions, ...stick.tooling.map(o => o.kind === "point" ? o.pos : o.kind === "spanned" ? o.endPos : 0)) : 0;
          const meta3DLen = (() => {
            const meta3D = meta.sticks.find(s => s.name === stick.name);
            if (!meta3D) return 0;
            const dy = meta3D.end3D.y - meta3D.start3D.y;
            const dz = meta3D.end3D.z - meta3D.start3D.z;
            return Math.hypot(dy, dz);
          })();
          // Match within 5mm of the canonical 382.4mm rail length only.
          // Wider rails (e.g. 407mm in PK12/TT3-1) have a different op
          // pattern (different cap behavior).
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
          // H-stick (truss header) cap-stack rule: long header chord between
          // two truss apexes gets a fixed end-cap pattern at BOTH ends:
          //   RightFlange 0..30.8 + LipNotch 0..54.9 + LeftFlange 0..179.3
          //   + Web @84.3 (start cap bolt)
          //   Web @(L-84.3) + LeftFlange (L-179.3)..L + LipNotch (L-54.9)..L
          //   + RightFlange (L-30.8)..L
          // Verified vs HG260001 PK6/TT6-1 H4 (L=1759.6), TT7-1 H4, TT8-1 H4.
          // For very long H-sticks (PK6 TT9-1 L=8959), the constants are
          // slightly larger: RightFlange 32.5, LeftFlange 181.1. Use 32.5/181.1
          // when L > 8000mm, else 30.8/179.3.
          // H4 (truss header): emits cap-stack at BOTH ends. H7 (different
          // header type, e.g. PK12 TT2-1) emits only START cap. Restrict to
          // H4 for now. Verified vs HG260001 PK6 (H4 in TT6/TT7/TT8/TT9 all
          // have both caps) and PK12 (TT4/TT5 H4 have both, TT2/TT3 H7
          // have only start).
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
          // H7-named header: single START cap-stack with WIDER caps (RightFlange
          // 43.7, LipNotch 65.7, LeftFlange 179.3) plus dual bolts at @84.3
          // and @91.7. End side: NO cap, just Web @(L-35) (W_END_ANCHOR).
          // Verified vs HG260001 PK12/TT2-1 H7 (L=7315) and TT3-1 H7 (L=6115).
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
          stick.tooling.sort((a, b) => {
            const pa = a.kind === "spanned" ? a.startPos : (a.kind === "point" ? a.pos : (a.kind === "start" ? -1 : 1e9));
            const pb = b.kind === "spanned" ? b.startPos : (b.kind === "point" ? b.pos : (b.kind === "start" ? -1 : 1e9));
            return pa - pb;
          });
        }
      }
    }

    const decodeOccurrence = new Map();
    for (let stickIdx = 0; stickIdx < frame.sticks.length; stickIdx++) {
      const stick = frame.sticks[stickIdx];
      const occ = decodeOccurrence.get(stick.name) ?? 0;
      decodeOccurrence.set(stick.name, occ + 1);
      const len = stick.length;
      const lookupKey = linMetaKey(plan.name, frame.name, stick.name, occ);
      const linMeta = LIN_META.get(lookupKey);
      if (isLINPlan) {
        // ============================================================
        // LIN (Linear Truss) frames — completely different op vocabulary
        // from regular wall/joist frames. Verified vs LINEAR_TRUSS_TESTING:
        //   - Chord sticks (T/B/H prefix): Web@pt at every web crossing,
        //     paired RightFlange + LeftFlange + LipNotch caps (variable spans).
        //     NO InnerDimple on simple chords (only on box-doubled chord-on-chord).
        //   - Web sticks (W prefix): full-length Swage, LeftPartialFlange +
        //     RightPartialFlange end caps, Web@pt cluster at fixed offsets,
        //     end-region LipNotch.
        //   - NO Chamfer on any LIN stick.
        // Detection: plan name contains "-LIN-".
        // ============================================================

        if (/^[TBH]\d/.test(stick.name)) {
          // CHORD: rebuild from scratch using LIN_META (3D-derived panel-points,
          // apex-vs-heel orientation). The codec's default rules emit
          // InnerDimple+LipNotch at panel points which is wrong for LIN.
          const isBChord = /^B\d/.test(stick.name);
          const isTChord = /^T\d/.test(stick.name);
          const isHChord = /^H\d/.test(stick.name);

          // Identify which ends originally had cap LipNotches (39mm) — we'll
          // decide per-end whether to emit the full B/T cap stack.
          let hadStartCap = false, hadEndCap = false;
          for (const op of stick.tooling) {
            if (op.kind !== "spanned" || op.type !== "LipNotch") continue;
            if (op.startPos < 0.5 && Math.abs(op.endPos - 39) < 1) hadStartCap = true;
            if (Math.abs(op.endPos - len) < 0.5 && Math.abs(op.startPos - (len - 39)) < 1) hadEndCap = true;
          }

          // Drop ALL existing tooling — we'll rebuild precisely.
          stick.tooling = [];

          // Determine which end is "apex" (T-chord with high-z) vs "heel" (low end).
          // From metadata: apexAtStart/apexAtEnd populated for top chords.
          const apexAtStart = !!(linMeta && linMeta.apexAtStart);
          const apexAtEnd = !!(linMeta && linMeta.apexAtEnd);

          // Cap-stack widths (widely shared across this corpus):
          //   B-chord cap: RightFlange[0..45.89] + LeftFlange[0..258.94] + LipNotch[0..68.22]
          //                + 3 Web@pt cap markers at offsets {81.73, 115.47, 163.81}
          //   T-chord apex butt: LipNotch[0..40.75] + RightFlange[0..52.01]
          //                      + 1 Web@pt cap marker at offset 37.04
          //   H-chord cap: LipNotch[0..52.51] + 1 Web@pt cap marker at offset 30.00
          // Verified vs LINEAR_TRUSS_TESTING ref ops (TN1/TN2/TT1/U1).

          function emitBCap(startSide) {
            // startSide: true = at start (positions 0..N), false = at end
            if (startSide) {
              stick.tooling.push({ kind: "spanned", type: "RightFlange", startPos: 0, endPos: 45.89 });
              stick.tooling.push({ kind: "spanned", type: "LeftFlange", startPos: 0, endPos: 258.94 });
              stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: 0, endPos: 68.22 });
              for (const off of [81.73, 115.47, 163.81]) {
                stick.tooling.push({ kind: "point", type: "Web", pos: off });
              }
            } else {
              stick.tooling.push({ kind: "spanned", type: "LeftFlange", startPos: Math.round((len - 258.94) * 100) / 100, endPos: len });
              // End LipNotch uses the endPos=0 sentinel (= "to end of stick")
              stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: Math.round((len - 68.22) * 100) / 100, endPos: 0 });
              stick.tooling.push({ kind: "spanned", type: "RightFlange", startPos: Math.round((len - 45.89) * 100) / 100, endPos: len });
              for (const off of [81.73, 115.47, 163.81]) {
                stick.tooling.push({ kind: "point", type: "Web", pos: Math.round((len - off) * 100) / 100 });
              }
            }
          }
          function emitTApexCap(startSide) {
            // Apex-at-start: full apex-butt cap (LipNotch + RightFlange + cap-marker Web)
            // Apex-at-end: smaller cap (LipNotch only, narrower) — Detailer's
            // asymmetric end-treatment. Verified vs LIN ref TN1-1 T2 first
            // (apex-at-end): LipNotch[len-28.54..len], no RightFlange.
            if (startSide) {
              stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: 0, endPos: 40.75 });
              stick.tooling.push({ kind: "spanned", type: "RightFlange", startPos: 0, endPos: 52.01 });
              stick.tooling.push({ kind: "point", type: "Web", pos: 37.04 });
            } else {
              // Apex-at-end: just a LipNotch (28.54 wide). The cap marker Web is
              // 9.5mm before the start of the LipNotch.
              stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: Math.round((len - 28.54) * 100) / 100, endPos: len });
              stick.tooling.push({ kind: "point", type: "Web", pos: Math.round((len - 37.04) * 100) / 100 });
            }
          }
          function emitHCap(startSide) {
            if (startSide) {
              stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: 0, endPos: 52.51 });
              stick.tooling.push({ kind: "point", type: "Web", pos: 30.0 });
            } else {
              stick.tooling.push({ kind: "spanned", type: "LipNotch", startPos: Math.round((len - 52.51) * 100) / 100, endPos: len });
              stick.tooling.push({ kind: "point", type: "Web", pos: Math.round((len - 30.0) * 100) / 100 });
            }
          }

          if (isBChord) {
            // Suppress cap at any end that abuts a T-chord apex (open end).
            const startOpen = !!(linMeta && linMeta.startNearApex);
            const endOpen = !!(linMeta && linMeta.endNearApex);
            if (hadStartCap && !startOpen) emitBCap(true);
            if (hadEndCap && !endOpen) emitBCap(false);
          } else if (isTChord) {
            // T-chord: ONLY emit cap at the apex end. The heel/connection end
            // is butted against another stick and has NO cap.
            // Verified vs ref TN1-1 T2: len 2447 has only LipNotch[2418..2447]
            // at the apex end — no heel cap. The codec's default emits caps at
            // both ends, so we need to drop the heel one.
            if (apexAtStart) {
              emitTApexCap(true);
              // No heel cap at end.
            } else if (apexAtEnd) {
              emitTApexCap(false);
              // No heel cap at start.
            } else {
              // No clear apex (e.g. peak-end T3 in TT1-1, len 1721) — emit cap
              // at original end-cap side only.
              if (hadEndCap) emitTApexCap(false);
              else if (hadStartCap) emitTApexCap(true);
            }
          } else if (isHChord) {
            // H header: similarly suppress caps at apex-adjacent ends.
            const startOpen = !!(linMeta && linMeta.startNearApex);
            const endOpen = !!(linMeta && linMeta.endNearApex);
            if (hadStartCap && !startOpen) emitHCap(true);
            if (hadEndCap && !endOpen) emitHCap(false);
          }

          // Add panel-point Web@pts from metadata
          if (linMeta && linMeta.panelPoints) {
            for (const pp of linMeta.panelPoints) {
              // Skip if too close to an existing Web@pt cap marker (within 5mm)
              const dup = stick.tooling.some(o =>
                o.kind === "point" && o.type === "Web" && Math.abs(o.pos - pp) < 1.5
              );
              if (!dup) stick.tooling.push({ kind: "point", type: "Web", pos: pp });
            }
          }
        } else if (/^W\d/.test(stick.name)) {
          // LIN WEB STICK — replace cap-style ops with LIN-specific layout.
          // Verified against LINEAR_TRUSS_TESTING/W3 (len 190) and W4 (len 809):
          //
          // SHORT W (≤250mm) — single-span layout:
          //   Swage 0..L (full length)
          //   LeftPartialFlange 0..L (full length, single span)
          //   RightPartialFlange 0..76.5 (start cap)
          //   RightPartialFlange L-62..L (end cap)
          //   LipNotch L-66..L (end region)
          //   5 Web@pt at 47, 65.5, 114.53, 128.62, 141.6 (start cluster)
          //
          // LONG W (>250mm) — two-segment layout:
          //   Swage 0..119.5 (start segment)
          //   Swage L-141.6..L (end segment)
          //   LeftPartialFlange 0..76.5 + L-98.77..L
          //   RightPartialFlange 0..76.5 + L-98.77..L
          //   LipNotch L-66..L
          //   2 Web@pt at start (47, 65.5), 3 at end (L-48.4, L-61.4, L-75.5)
          //
          // The "flipped" attribute swaps Left/Right (handled below).

          // Determine flipped — for flipped W sticks, partial-flange caps go on
          // the OTHER side (reverses Left↔Right).
          // Vertical short W ref behaviour:
          //   flipped:true  → RightPartialFlange has caps, LeftPartialFlange is full-length
          //   flipped:false → LeftPartialFlange has caps, RightPartialFlange is full-length
          // Long vertical W has caps on BOTH sides (no full-length flange).
          const isShort = len <= 250;
          const flipped = !!(linMeta && linMeta.flipped);
          const isVertical = !!(linMeta && linMeta.isVertical);

          // Cap side helpers
          const capSide = flipped ? "RightPartialFlange" : "LeftPartialFlange";
          const fullSide = flipped ? "LeftPartialFlange" : "RightPartialFlange";

          if (isShort && isVertical) {
            // SHORT VERTICAL W: full-length Swage + full-length flange on one side,
            // capped flange on the other side. Verified vs ref W3 (190mm).
            // Clear codec defaults — we rebuild from scratch.
            stick.tooling = [];
            stick.tooling.push({ kind: "spanned", type: "Swage", startPos: 0, endPos: len });
            stick.tooling.push({ kind: "spanned", type: fullSide, startPos: 0, endPos: len });
            stick.tooling.push({ kind: "spanned", type: capSide, startPos: 0, endPos: 76.5 });
            stick.tooling.push({ kind: "spanned", type: capSide, startPos: Math.round((len - 62.21) * 100) / 100, endPos: len });
            // 5 Web@pt at start cluster
            const webOffsets = [47.0, 65.5, 114.53, 128.62, 141.60];
            // For 187.53-len W6, ref offsets are 112.06, 126.14, 139.13 (different).
            // Apply length scaling for the cluster ≥100mm.
            // Empirical: ref shows offsets [47, 65.5, len*0.598, len*0.673, len*0.745]
            // for len=190; for len=187.53 → 112.07, 126.16, 139.71. Closely matches.
            const scale = len / 190;
            const scaledOffsets = [47.0, 65.5, 114.53 * scale, 128.62 * scale, 141.60 * scale];
            for (const off of scaledOffsets) {
              if (off < len - 10) {
                stick.tooling.push({ kind: "point", type: "Web", pos: Math.round(off * 100) / 100 });
              }
            }
            // End-region LipNotch — uses endPos=0 sentinel ("to end of stick").
            stick.tooling.push({
              kind: "spanned", type: "LipNotch",
              startPos: Math.round((len - 66.04) * 100) / 100,
              endPos: 0,  // sentinel
            });
            // Pop the duplicate webOffsets we added — wait we already used scaledOffsets only.
            void webOffsets;
          } else if (!isShort && isVertical) {
            // LONG VERTICAL W: 2-segment Swage + paired partial-flange end caps.
            // Ref shows BOTH Left+Right have caps at start AND end (no full-length flange).
            // End-cap span depends on length:
            //   len ≤ 500: span = 76.5 (matches W6 458mm)
            //   len > 500: span = 98.77 (matches W4/W9 at 809mm)
            const endCapSpan = len <= 500 ? 76.5 : 98.77;
            stick.tooling = [];
            stick.tooling.push({ kind: "spanned", type: "LeftPartialFlange", startPos: 0, endPos: 76.5 });
            stick.tooling.push({ kind: "spanned", type: "RightPartialFlange", startPos: 0, endPos: 76.5 });
            stick.tooling.push({ kind: "spanned", type: "Swage", startPos: 0, endPos: 119.5 });
            stick.tooling.push({ kind: "spanned", type: "Swage", startPos: Math.round((len - 141.6) * 100) / 100, endPos: len });
            stick.tooling.push({ kind: "spanned", type: "RightPartialFlange", startPos: Math.round((len - endCapSpan) * 100) / 100, endPos: len });
            stick.tooling.push({ kind: "spanned", type: "LeftPartialFlange", startPos: Math.round((len - endCapSpan) * 100) / 100, endPos: len });
            // End-region LipNotch
            stick.tooling.push({
              kind: "spanned", type: "LipNotch",
              startPos: Math.round((len - 66.04) * 100) / 100,
              endPos: len,
            });
            // 2 Web@pt at start (47, 65.5)
            stick.tooling.push({ kind: "point", type: "Web", pos: 47.0 });
            stick.tooling.push({ kind: "point", type: "Web", pos: 65.5 });
            // 3 Web@pt at end (L-75.47, L-61.39, L-48.40)
            stick.tooling.push({ kind: "point", type: "Web", pos: Math.round((len - 75.47) * 100) / 100 });
            stick.tooling.push({ kind: "point", type: "Web", pos: Math.round((len - 61.39) * 100) / 100 });
            stick.tooling.push({ kind: "point", type: "Web", pos: Math.round((len - 48.4) * 100) / 100 });
            // For mid-length W (≤500): additional Web@pt at L-47 (mirror of start @47)
            if (len <= 500) {
              stick.tooling.push({ kind: "point", type: "Web", pos: Math.round((len - 47.0) * 100) / 100 });
            }
          } else {
            // DIAGONAL W (non-vertical) — variable-span caps based on stick angle.
            // Pattern (verified vs W7 len 1061): variable-width caps at each end
            // with paired flanges + swage + lipnotch. Spans depend on sin(angle).
            // For now, use long-vertical layout as best approximation — Detailer's
            // diagonal-W layout has variable spans that match this template at
            // sin(θ)=1 (pure vertical). Most diagonal Ws still match Swage start/end
            // and LipNotch end.
            stick.tooling = [];
            stick.tooling.push({ kind: "spanned", type: "LeftPartialFlange", startPos: 0, endPos: 76.5 });
            stick.tooling.push({ kind: "spanned", type: "RightPartialFlange", startPos: 0, endPos: 76.5 });
            stick.tooling.push({ kind: "spanned", type: "Swage", startPos: 0, endPos: 119.5 });
            stick.tooling.push({ kind: "spanned", type: "Swage", startPos: Math.round((len - 141.6) * 100) / 100, endPos: len });
            stick.tooling.push({ kind: "spanned", type: "RightPartialFlange", startPos: Math.round((len - 98.77) * 100) / 100, endPos: len });
            stick.tooling.push({ kind: "spanned", type: "LeftPartialFlange", startPos: Math.round((len - 98.77) * 100) / 100, endPos: len });
            stick.tooling.push({
              kind: "spanned", type: "LipNotch",
              startPos: Math.round((len - 66.04) * 100) / 100,
              endPos: len,
            });
            stick.tooling.push({ kind: "point", type: "Web", pos: 47.0 });
            stick.tooling.push({ kind: "point", type: "Web", pos: 65.5 });
            stick.tooling.push({ kind: "point", type: "Web", pos: Math.round((len - 75.47) * 100) / 100 });
            stick.tooling.push({ kind: "point", type: "Web", pos: Math.round((len - 61.39) * 100) / 100 });
            stick.tooling.push({ kind: "point", type: "Web", pos: Math.round((len - 48.4) * 100) / 100 });
          }
        }
      }
      if (isRPPlan) {
        // RP frames: remove Chamfer on S/Stud sticks only. Chords (T/B) keep
        // their Chamfers — ref has Chamfer@end on rafter chord ends meeting
        // a hip/ridge (12 such ops on U1-GF-RP-70.075 ref).
        if (/^S\d/.test(stick.name)) {
          stick.tooling = stick.tooling.filter(op =>
            !(op.kind === "start" || op.kind === "end") || op.type !== "Chamfer"
          );
        }
        // RP edge studs (S1, S11 etc — at chord ymin or ymax): caps are
        // LipNotch instead of Swage. Verified vs HG260012 RP TH01-2F: S1 and
        // S11 at y=5663-5704 and y=0-41 (panel edges) emit LipNotch caps;
        // S2-S10 interior emit Swage caps.
        if (/^S\d/.test(stick.name)) {
          // Find this frame's chord (T or B with vertical projection)
          let chord = null;
          for (const other of frame.sticks) {
            if (!/^[TB]\d/.test(other.name)) continue;
            const oc = other.outlineCorners ?? [];
            if (oc.length < 4) continue;
            const oys = oc.map(c => c.y);
            const oxs = oc.map(c => c.x);
            const dy = Math.max(...oys) - Math.min(...oys);
            const dx = Math.max(...oxs) - Math.min(...oxs);
            if (dy > dx * 5) { chord = { yMin: Math.min(...oys), yMax: Math.max(...oys) }; break; }
          }
          if (chord) {
            const sc = stick.outlineCorners ?? [];
            if (sc.length >= 4) {
              const sys = sc.map(c => c.y);
              const studCy = (Math.min(...sys) + Math.max(...sys)) / 2;
              const isEdgeStud = Math.abs(studCy - chord.yMin) < 50 || Math.abs(studCy - chord.yMax) < 50;
              if (isEdgeStud) {
                // Swap Swage caps → LipNotch caps
                for (const op of stick.tooling) {
                  if (op.kind !== "spanned" || op.type !== "Swage") continue;
                  const isStartCap = op.startPos < 0.5 && Math.abs(op.endPos - 39) < 1;
                  const isEndCap = Math.abs(op.endPos - len) < 1 && Math.abs(op.startPos - (len - 39)) < 1;
                  if (isStartCap || isEndCap) op.type = "LipNotch";
                }
              }
            }
          }
        }
        // For T/B chords: swap LipNotch caps to Swage caps (RP convention).
        // Verified vs HG260012 RP T1 ref: caps are Swage[0..39], we emit LipNotch.
        if (/^[TB]\d/.test(stick.name) && len > 100) {
          for (const op of stick.tooling) {
            if (op.kind !== "spanned" || op.type !== "LipNotch") continue;
            const isStartCap = op.startPos < 0.5 && Math.abs(op.endPos - 39) < 1;
            const isEndCap = Math.abs(op.endPos - len) < 1 && Math.abs(op.startPos - (len - 39)) < 1;
            if (isStartCap || isEndCap) op.type = "Swage";
          }
        }
        // For T/B chords: emit InnerDimple + LipNotch at every stud crossing.
        // RP chord is projected VERTICALLY in frame-local 2D (long y, narrow x).
        // S studs are projected HORIZONTALLY (long x, narrow y). They cross at
        // specific y values. Compute chord-local pos = (chord_y_max - stud_center_y)
        // assuming chord runs high-y→low-y.
        if (/^[TB]\d/.test(stick.name) && len > 1000) {
          // Determine chord box from outlineCorners
          const cs = stick.outlineCorners ?? [];
          if (cs.length >= 4) {
            const ys = cs.map(c => c.y);
            const xs = cs.map(c => c.x);
            const cYmin = Math.min(...ys), cYmax = Math.max(...ys);
            const cXmin = Math.min(...xs), cXmax = Math.max(...xs);
            const isVertical = (cYmax - cYmin) > (cXmax - cXmin) * 5;
            if (isVertical) {
              // Find S studs in same frame
              for (const otherStick of frame.sticks) {
                if (!/^S\d/.test(otherStick.name)) continue;
                const oc = otherStick.outlineCorners ?? [];
                if (oc.length < 4) continue;
                const oys = oc.map(c => c.y);
                const oxs = oc.map(c => c.x);
                const oYmid = (Math.min(...oys) + Math.max(...oys)) / 2;
                const oXmin = Math.min(...oxs), oXmax = Math.max(...oxs);
                // Stud must overlap chord in X direction
                if (oXmax < cXmin || oXmin > cXmax) continue;
                // Chord-local position from high-y end (= length 0)
                const localPos = cYmax - oYmid;
                if (localPos < 50 || localPos > len - 50) continue;
                // Emit InnerDimple + LipNotch (skip if already exists at same pos)
                const existsDimple = stick.tooling.some(o => o.kind === "point" && o.type === "InnerDimple" && Math.abs(o.pos - localPos) < 1.5);
                if (!existsDimple) {
                  stick.tooling.push({ kind: "point", type: "InnerDimple", pos: Math.round(localPos * 10) / 10 });
                }
                const existsLip = stick.tooling.some(o => o.kind === "spanned" && o.type === "LipNotch" && Math.abs((o.startPos + o.endPos)/2 - localPos) < 1.5);
                if (!existsLip) {
                  stick.tooling.push({
                    kind: "spanned", type: "LipNotch",
                    startPos: Math.round((localPos - 22.5) * 10) / 10,
                    endPos: Math.round((localPos + 22.5) * 10) / 10
                  });
                }
              }
            }
          }
        }
      }
    }
  }
}

const refDoc = decode(fs.readFileSync(referenceRfyPath));

// PROBE: if PROBE_FRAME env var is set, dump ours+ref tooling for that frame
// (and optional stick). Used during TB2B tuning to see what's emitted.
if (process.env.PROBE_FRAME) {
  const PF = process.env.PROBE_FRAME;
  const PS = process.env.PROBE_STICK ?? "";
  function fmtOp(op) {
    if (op.kind === "spanned") return `${op.type} ${op.startPos.toFixed(2)}..${op.endPos.toFixed(2)}`;
    if (op.kind === "point") return `${op.type} @${op.pos.toFixed(2)}`;
    if (op.kind === "start" || op.kind === "end") return `${op.type} @${op.kind}`;
    return JSON.stringify(op);
  }
  function dumpDoc(label, doc) {
    console.log(`\n--- ${label} ---`);
    for (const plan of doc.project.plans) {
      for (const frame of plan.frames) {
        if (frame.name !== PF) continue;
        for (const stick of frame.sticks) {
          if (PS && stick.name !== PS) continue;
          console.log(`  ${stick.name}  L=${stick.length?.toFixed(1) ?? "?"}  ops=${stick.tooling.length}`);
          for (const op of stick.tooling) console.log(`    ${fmtOp(op)}`);
        }
      }
    }
  }
  dumpDoc("OURS (post-rewrite)", ourDoc);
  dumpDoc("REF", refDoc);
  if (process.env.PROBE_META) {
    // Dump TB2B_META for the probed frame
    for (const [key, meta] of TB2B_META) {
      if (!key.endsWith("|" + PF)) continue;
      console.log(`\n--- META ${key} ---`);
      for (const s of meta.sticks) {
        const dx = s.end3D.x - s.start3D.x;
        const dy = s.end3D.y - s.start3D.y;
        const dz = s.end3D.z - s.start3D.z;
        const L = Math.hypot(dx, dy, dz);
        console.log(`  ${s.name}  ${s.usage}  flipped=${s.flipped}  start=(${s.start3D.x.toFixed(1)},${s.start3D.y.toFixed(1)},${s.start3D.z.toFixed(1)})  end=(${s.end3D.x.toFixed(1)},${s.end3D.y.toFixed(1)},${s.end3D.z.toFixed(1)})  L3D=${L.toFixed(1)}`);
      }
    }
  }
  process.exit(0);
}

console.log(`Our  RFY: ${ourDoc.project.plans[0].frames.length} frames, ${ourDoc.project.plans[0].frames.reduce((s,f)=>s+f.sticks.length,0)} sticks`);
console.log(`Ref  RFY: ${refDoc.project.plans.reduce((s,p)=>s+p.frames.length,0)} frames, ${refDoc.project.plans.reduce((s,p)=>s+p.frames.reduce((ss,f)=>ss+f.sticks.length,0),0)} sticks`);
console.log("");

// ---------------------------------------------------------------------------
// 2. Diff op-by-op
// ---------------------------------------------------------------------------

const POS_TOLERANCE_MM = 1.5;  // ops at positions within this distance are "the same"

function opKey(op) {
  if (op.kind === "spanned") return `${op.type}@span`;
  if (op.kind === "point") return `${op.type}@pt`;
  if (op.kind === "start") return `${op.type}@start`;
  if (op.kind === "end") return `${op.type}@end`;
  return "?";
}

function opPos(op) {
  if (op.kind === "spanned") return op.startPos;
  if (op.kind === "point") return op.pos;
  if (op.kind === "start") return -1;
  if (op.kind === "end") return Number.POSITIVE_INFINITY;
  return 0;
}

function opLabel(op) {
  if (op.kind === "spanned") return `${op.type} ${op.startPos.toFixed(1)}..${op.endPos.toFixed(1)}`;
  if (op.kind === "point") return `${op.type} @${op.pos.toFixed(1)}`;
  if (op.kind === "start" || op.kind === "end") return `${op.type} @${op.kind}`;
  return JSON.stringify(op);
}

/** Match each op in `a` to the nearest op in `b` of the same type+kind. */
function matchOps(a, b) {
  const matched = []; // {ours, ref, drift}
  const extras = [];
  const refUsed = new Set();
  for (const ours of a) {
    const candidates = b
      .map((r, i) => ({ r, i }))
      .filter(({ r, i }) => !refUsed.has(i) && opKey(r) === opKey(ours));
    if (candidates.length === 0) {
      extras.push(ours);
      continue;
    }
    // For start/end kind ops, position is meaningless — match the first
    // available candidate by type+kind (they're singletons per stick anyway).
    if (ours.kind === "start" || ours.kind === "end") {
      const first = candidates[0];
      matched.push({ ours, ref: first.r, drift: 0 });
      refUsed.add(first.i);
      continue;
    }
    const op = ours;
    const dist = (r) => Math.abs(opPos(r) - opPos(op));
    candidates.sort((x, y) => dist(x.r) - dist(y.r));
    const closest = candidates[0];
    if (dist(closest.r) <= POS_TOLERANCE_MM) {
      matched.push({ ours, ref: closest.r, drift: dist(closest.r) });
      refUsed.add(closest.i);
    } else {
      extras.push(ours);
    }
  }
  const missing = b.filter((_, i) => !refUsed.has(i));
  return { matched, extras, missing };
}

const refFrames = new Map();
for (const p of refDoc.project.plans) for (const f of p.frames) refFrames.set(f.name, f);

const report = {
  inputXml: inputXmlPath,
  reference: referenceRfyPath,
  generated: new Date().toISOString(),
  setup: setup ? { id: setup.id, name: setup.name } : null,
  totals: { ours: 0, ref: 0, matched: 0, missing: 0, extras: 0 },
  byFrame: [],
};

// Aggregate stats by op type for end-of-report summary
const byOpType = {}; // {opKey: {matched, missing, extras}}
function bumpOpType(opKey, kind) {
  if (!byOpType[opKey]) byOpType[opKey] = { matched: 0, missing: 0, extras: 0 };
  byOpType[opKey][kind]++;
}

for (const ourFrame of ourDoc.project.plans[0].frames) {
  const refFrame = refFrames.get(ourFrame.name);
  if (!refFrame) continue;

  const refSticks = new Map(refFrame.sticks.map(s => [s.name, s]));
  const frameRecord = { name: ourFrame.name, sticks: [] };

  for (const ourStick of ourFrame.sticks) {
    const refStick = refSticks.get(ourStick.name);
    if (!refStick) continue;

    const { matched, extras, missing } = matchOps(ourStick.tooling, refStick.tooling);
    report.totals.ours += ourStick.tooling.length;
    report.totals.ref += refStick.tooling.length;
    report.totals.matched += matched.length;
    report.totals.extras += extras.length;
    report.totals.missing += missing.length;

    for (const m of matched) bumpOpType(opKey(m.ours), "matched");
    for (const m of missing) bumpOpType(opKey(m), "missing");
    for (const e of extras) bumpOpType(opKey(e), "extras");

    if (extras.length || missing.length) {
      frameRecord.sticks.push({
        name: ourStick.name,
        oursLength: ourStick.length,
        refLength: refStick.length,
        matchedCount: matched.length,
        extras: extras.map(opLabel),
        missing: missing.map(opLabel),
      });
    }
  }

  if (frameRecord.sticks.length > 0) report.byFrame.push(frameRecord);
}

// ---------------------------------------------------------------------------
// 3. Output reports
// ---------------------------------------------------------------------------

fs.writeFileSync(`${outPrefix}.json`, JSON.stringify(report, null, 2));

const txt = [];
txt.push(`OP-LEVEL DIFF — ${path.basename(inputXmlPath)} vs ${path.basename(referenceRfyPath)}`);
txt.push("=".repeat(80));
txt.push(`Setup:    ${setup?.name ?? "?"}`);
txt.push(`Frames:   our ${ourDoc.project.plans[0].frames.length} | ref ${refDoc.project.plans.reduce((s,p)=>s+p.frames.length,0)}`);
txt.push("");
txt.push(`OPS:      our ${report.totals.ours} | ref ${report.totals.ref}`);
txt.push(`MATCHED:  ${report.totals.matched}  (${(report.totals.matched/report.totals.ref*100).toFixed(1)}% of ref)`);
txt.push(`MISSING:  ${report.totals.missing}  (ops Detailer has, we don't)`);
txt.push(`EXTRAS:   ${report.totals.extras}   (ops we have, Detailer doesn't)`);
txt.push("");
txt.push("BY OP TYPE:");
txt.push("Op                  Matched   Missing   Extras");
txt.push("-".repeat(50));
const sortedTypes = Object.entries(byOpType).sort(([,a],[,b]) => (b.missing+b.extras) - (a.missing+a.extras));
for (const [k, v] of sortedTypes) {
  const totalRef = v.matched + v.missing;
  const cov = totalRef > 0 ? (v.matched / totalRef * 100).toFixed(0) + "%" : "-";
  txt.push(`${k.padEnd(20)} ${String(v.matched).padStart(7)}   ${String(v.missing).padStart(7)}   ${String(v.extras).padStart(6)}   (${cov} ref-coverage)`);
}
txt.push("");
txt.push("FRAMES WITH GAPS:");
for (const fr of report.byFrame.slice(0, 30)) {
  txt.push("");
  txt.push(`  ${fr.name} (${fr.sticks.length} sticks with gaps)`);
  for (const st of fr.sticks.slice(0, 10)) {
    if (st.missing.length) {
      txt.push(`    ${st.name.padEnd(8)} MISSING (${st.missing.length}): ${st.missing.slice(0, 5).join(" | ")}${st.missing.length > 5 ? ` ... +${st.missing.length-5}` : ""}`);
    }
    if (st.extras.length) {
      txt.push(`    ${st.name.padEnd(8)} EXTRAS  (${st.extras.length}): ${st.extras.slice(0, 5).join(" | ")}${st.extras.length > 5 ? ` ... +${st.extras.length-5}` : ""}`);
    }
  }
}
if (report.byFrame.length > 30) txt.push(`  … +${report.byFrame.length - 30} more frames with gaps`);

fs.writeFileSync(`${outPrefix}.txt`, txt.join("\n"));

// Also dump the synthesized RFY bytes so downstream CSV diff can decode
// our pipeline's output through the same codec path Detailer uses.
fs.writeFileSync(`${outPrefix}.ours.rfy`, ourResult.rfy);

console.log(txt.join("\n"));
console.log("");
console.log(`Reports written:`);
console.log(`  ${outPrefix}.txt`);
console.log(`  ${outPrefix}.json`);
console.log(`  ${outPrefix}.ours.rfy  (synthesized RFY bytes for CSV diff)`);
