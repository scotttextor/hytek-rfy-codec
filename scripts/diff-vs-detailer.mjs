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
      for (const ta of (f.tool_action ?? [])) {
        const name = String(ta["@_name"]);
        const sStart = parseTriple(typeof ta.start === "string" ? ta.start : ta.start?.["#text"] ?? "0,0,0");
        const sEnd = parseTriple(typeof ta.end === "string" ? ta.end : ta.end?.["#text"] ?? "0,0,0");
        if (name === "Service") serviceActions.push({ start: sStart, end: sEnd });
        else if (name === "Web") webActions.push({ start: sStart, end: sEnd });
        else if (name === "FlangeHole") flangeHoleActions.push({ start: sStart, end: sEnd });
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
        // Detect raised 89mm B-plate (z=elevation+61.5) — header-style ops
        const stickZ = (start.z + end.z) / 2;
        const isRaised89B = usage === "bottomplate" && profile.web === 89
                          && Math.abs(stickZ - frameElevation - 61.5) < 1;
        if (isRaised89B) {
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
        // EndClearance plate/chord trim (skip raised B which has its own 1mm trim)
        if (!isRaised89B && (usage === "topplate" || usage === "bottomplate" || usage === "topchord" || usage === "bottomchord")) {
          const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z;
          const len=Math.sqrt(dx*dx+dy*dy+dz*dz);
          const ec = setup?.endClearance ?? 4;
          if (len > ec*2+1) {
            const ux=dx/len,uy=dy/len,uz=dz/len;
            start = { x: start.x+ux*ec, y: start.y+uy*ec, z: start.z+uz*ec };
            end = { x: end.x-ux*ec, y: end.y-uy*ec, z: end.z-uz*ec };
          }
        }
        // Stud (2mm/end) + Header (1mm/end) end-trim
        const isFullStud = usage === "stud" || usage === "endstud" || usage === "jackstud" || usage === "trimstud";
        const isHeader = /^H\d/.test(stickName);
        const isNog = usage === "nog" || usage === "noggin";
        const isJoistWeb = /^V\d/.test(stickName) && usage === "web";
        // H header: 1mm/end trim (verified 2026-05-02 vs HG260012 L1101/H1
        // input 2782 → ref output 2780). The earlier "no trim" comment was
        // wrong — H IS trimmed, but only 1mm/end vs studs' 2mm/end.
        const T = (isFullStud || isJoistWeb) ? 2.0 : ((isNog || isHeader) ? 1.0 : 0);
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
        if (/^W\d/.test(stickName) && usage === "web") {
          const dx = end.x - start.x, dy = end.y - start.y;
          const horizDelta = Math.sqrt(dx*dx + dy*dy);
          if (horizDelta < 1.0) {
            // VERTICAL W → extend by lip depth
            const lipDepth = profile.rLip > 0 ? profile.rLip : 11;
            const dz = end.z - start.z;
            if (Math.abs(dz) > 0.1) {
              const sign = dz > 0 ? 1 : -1;
              end = { x: end.x, y: end.y, z: end.z + sign * lipDepth };
            }
          } else {
            // DIAGONAL W → trim 2mm at end (Kb-style)
            const T = 2.0;
            const dz = end.z - start.z;
            const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (len > T * 2) {
              const ux = dx / len, uy = dy / len, uz = dz / len;
              end = { x: end.x - ux*T, y: end.y - uy*T, z: end.z - uz*T };
            }
          }
        }
        const stick = { name: stickName, start, end, flipped, profile, usage: String(s["@_usage"] ?? ""), tooling: [] };
        const length = Math.round(distance3D(stick.start, stick.end) * 10) / 10;
        const role = roleForUsage(stick.usage, String(s["@_type"] ?? ""), stick.name);
        const profileFamily = profileCode(profile.web, profile.lFlange, profile.rFlange, parseFloat(profile.gauge) || 0.75).split("_")[0];
        stick.tooling = generateTooling({
          role, length, profileFamily,
          gauge: profile.gauge, flipped,
          planName: plan.name, frameName: String(f["@_name"]),
          usage: stick.usage,
          stickName: stick.name,
        });
        if (/^Kb\d/.test(stickName) && length > 100) {
          stick.tooling.push({ kind: "point", type: "InnerService", pos: Math.round((length/2)*10)/10 });
        }

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
              const dyL = Math.abs(endL.y - startL.y);
              const lenL = Math.sqrt(dxL * dxL + dyL * dyL);
              const sinTheta = lenL > 1 ? (dyL / lenL) : 1;
              if (sinTheta > 0.1 && sinTheta < 0.99) {
                const variableSpan = Math.min(80, Math.max(39, 41 / sinTheta));
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
            // Only Chamfer@end (the high-end side meeting sloped top plate).
            const hasEnd = s.tooling.some(t => t.kind === "end" && t.type === "Chamfer");
            if (!hasEnd) s.tooling.push({ kind: "end", type: "Chamfer" });
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
// at panel-points on chords. RP frames need NO Chamfer.
for (const plan of ourDoc.project.plans) {
  const isLINPlan = /-LIN-/i.test(plan.name);
  const isRPPlan = /-(RP|HJ)-/i.test(plan.name);
  for (const frame of plan.frames) {
    for (const stick of frame.sticks) {
      const len = stick.length;
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
          // CHORD: convert mid-stick LipNotch+InnerDimple to Web@pt, keep cap.
          const newOps = [];
          for (const op of stick.tooling) {
            if (op.kind === "spanned" && op.type === "LipNotch") {
              const isCap = op.startPos < 0.5 || Math.abs(op.endPos - len) < 0.5;
              if (!isCap) {
                newOps.push({ kind: "point", type: "Web", pos: Math.round(((op.startPos + op.endPos) / 2) * 10000) / 10000 });
                continue;
              }
            }
            if (op.kind === "point" && op.type === "InnerDimple") {
              const isCapDimple = op.pos < 50 || op.pos > len - 50;
              if (!isCapDimple) continue;  // drop mid-stick dimples
            }
            newOps.push(op);
          }
          stick.tooling = newOps;

          // Add LIN-specific cap stack: RightFlange + LeftFlange (paired with
          // the LipNotch cap that already exists). Standard values for B
          // chord (3-cap stack): RightFlange[0..45.89], LeftFlange[0..258.94].
          // T chord typically gets RightFlange only (interior end abuts apex).
          // We add the standard "B-chord" cap stack at any end where there's
          // already a LipNotch[0..39] cap. The LipNotch span needs widening
          // from 39 → 68.22.
          const isBChord = /^B\d/.test(stick.name);
          const isTChord = /^T\d/.test(stick.name);
          if (isBChord || isTChord) {
            // Process each cap LipNotch
            for (const op of stick.tooling) {
              if (op.kind !== "spanned" || op.type !== "LipNotch") continue;
              const isStartCap = op.startPos < 0.5 && Math.abs(op.endPos - 39) < 1;
              const isEndCap = Math.abs(op.endPos - len) < 0.5 && Math.abs(op.startPos - (len - 39)) < 1;
              if (!isStartCap && !isEndCap) continue;
              // Widen LipNotch cap from 39 → 68.22
              if (isStartCap) {
                op.endPos = 68.22;
              } else {
                op.startPos = Math.round((len - 68.22) * 100) / 100;
              }
            }
            // Add Flange caps where a LipNotch cap exists
            const hasStartCap = stick.tooling.some(o =>
              o.kind === "spanned" && o.type === "LipNotch" &&
              o.startPos < 0.5 && o.endPos < 100,
            );
            const hasEndCap = stick.tooling.some(o =>
              o.kind === "spanned" && o.type === "LipNotch" &&
              Math.abs(o.endPos - len) < 0.5,
            );
            if (hasStartCap) {
              stick.tooling.push({ kind: "spanned", type: "RightFlange", startPos: 0, endPos: 45.89 });
              if (isBChord) {
                stick.tooling.push({ kind: "spanned", type: "LeftFlange", startPos: 0, endPos: 258.94 });
              }
            }
            if (hasEndCap) {
              if (isBChord) {
                stick.tooling.push({ kind: "spanned", type: "LeftFlange", startPos: Math.round((len - 258.94) * 100) / 100, endPos: len });
              }
              stick.tooling.push({ kind: "spanned", type: "RightFlange", startPos: Math.round((len - 45.89) * 100) / 100, endPos: len });
            }
          }
        } else if (/^W\d/.test(stick.name)) {
          // WEB STICK: replace cap-style ops with full-length Swage + partial flanges.
          // Drop existing Swage[0..39], Swage[L-39..L], InnerDimple@10, InnerDimple@L-10, Chamfers.
          const newOps = [];
          for (const op of stick.tooling) {
            if ((op.kind === "start" || op.kind === "end") && op.type === "Chamfer") continue;
            if (op.kind === "spanned" && op.type === "Swage") {
              // Drop start/end caps (will be replaced)
              const isStartCap = op.startPos < 0.5 && Math.abs(op.endPos - 39) < 1;
              const isEndCap = Math.abs(op.endPos - len) < 0.5 && Math.abs(op.startPos - (len - 39)) < 1;
              if (isStartCap || isEndCap) continue;
            }
            if (op.kind === "point" && op.type === "InnerDimple") {
              // Drop end-anchored dimples at ~10mm offsets (LIN webs don't have these)
              if (op.pos < 15 || op.pos > len - 15) continue;
            }
            newOps.push(op);
          }
          stick.tooling = newOps;

          // Add LIN web ops:
          // Always: full-length Swage (or 2 segments for longer sticks)
          if (len <= 250) {
            stick.tooling.push({ kind: "spanned", type: "Swage", startPos: 0, endPos: len });
          } else {
            // Two-segment Swage for longer webs (start band 0..119.5, end band L-141.6..L)
            stick.tooling.push({ kind: "spanned", type: "Swage", startPos: 0, endPos: 119.5 });
            stick.tooling.push({ kind: "spanned", type: "Swage", startPos: Math.round((len - 141.6) * 100) / 100, endPos: len });
          }

          // RightPartialFlange + LeftPartialFlange end caps (76.5mm each)
          stick.tooling.push({ kind: "spanned", type: "RightPartialFlange", startPos: 0, endPos: 76.5 });
          stick.tooling.push({ kind: "spanned", type: "LeftPartialFlange", startPos: 0, endPos: 76.5 });
          stick.tooling.push({ kind: "spanned", type: "RightPartialFlange", startPos: Math.round((len - 76.5) * 100) / 100, endPos: len });
          stick.tooling.push({ kind: "spanned", type: "LeftPartialFlange", startPos: Math.round((len - 76.5) * 100) / 100, endPos: len });

          // Web@pt cluster: 5 holes at fixed offsets near each end (47, 65.5, 114.53, 128.62, 141.60)
          const webOffsets = [47.0, 65.5, 114.53, 128.62, 141.60];
          for (const off of webOffsets) {
            if (off < len - 50) {
              stick.tooling.push({ kind: "point", type: "Web", pos: off });
            }
          }
          if (len > 250) {
            // For longer webs, add 5 more Web@pt near the END
            for (const off of webOffsets) {
              const endPos = len - off;
              if (endPos > 50) {
                stick.tooling.push({ kind: "point", type: "Web", pos: Math.round(endPos * 100) / 100 });
              }
            }
          }

          // End-region LipNotch (at end side, ~at length-66 to length)
          stick.tooling.push({
            kind: "spanned", type: "LipNotch",
            startPos: Math.round((len - 66) * 100) / 100,
            endPos: len,
          });
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
console.log(txt.join("\n"));
console.log("");
console.log(`Reports written:`);
console.log(`  ${outPrefix}.txt`);
console.log(`  ${outPrefix}.json`);
