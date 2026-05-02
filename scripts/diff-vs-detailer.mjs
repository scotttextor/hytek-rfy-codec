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
      const env = (f.envelope?.vertex ?? []).map(v => parseTriple(typeof v==="string" ? v : v["#text"]));
      if (env.length !== 4) continue;
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
      for (const ta of (f.tool_action ?? [])) {
        const name = String(ta["@_name"]);
        const sStart = parseTriple(typeof ta.start === "string" ? ta.start : ta.start?.["#text"] ?? "0,0,0");
        const sEnd = parseTriple(typeof ta.end === "string" ? ta.end : ta.end?.["#text"] ?? "0,0,0");
        if (name === "Service") serviceActions.push({ start: sStart, end: sEnd });
        else if (name === "Web") webActions.push({ start: sStart, end: sEnd });
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
        // Nog InnerService: position-dependent on stick context — skipping
        // Truss W angle-dependent: vertical=stud-style (16.5+39), diagonal=Kb-style (10+variable+chamfers)
        // 2026-05-02 — gated dimple swap by usage="web". LBW W sticks have
        // usage="Stud" (B2B partners) and Detailer keeps stud-style dimples.
        if (/^W\d/.test(stickName) && frameBasis) {
          const startL = projectToFrameLocal(stick.start, frameBasis);
          const endL = projectToFrameLocal(stick.end, frameBasis);
          const dxL = Math.abs(endL.x - startL.x);
          if (dxL > 1.0) {
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
        if (webActions.length > 0) {
          const u = String(stick.usage ?? "").toLowerCase();
          if (u === "topplate" || u === "topchord") {
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
const ourResult = synthesizeRfyFromPlans(ourProject, { machineSetup: setup });
const ourDoc = decode(ourResult.rfy);

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
