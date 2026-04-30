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
  if(u==="topplate")return"T";
  if(u==="bottomplate")return"B";
  if(u==="headplate"||u==="head")return"H";
  if(u==="nog"||u==="noggin")return"N";
  if(u==="endstud"||u==="stud")return"S";
  if(u==="jackstud"||u==="trimstud")return"J";
  if(u==="brace")return"Br";
  return prefix||(type==="plate"?"T":"S");
}

function buildOurProject(xmlText) {
  const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_", parseAttributeValue:true, parseTagValue:false, isArray:n=>["plan","frame","stick","vertex"].includes(n) });
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
      let frameBasis = null;
      try { frameBasis = deriveFrameBasis(env, true); } catch {}
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
        const usage = String(s["@_usage"] ?? "").toLowerCase();
        // EndClearance plate trim
        if (usage === "topplate" || usage === "bottomplate") {
          const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z;
          const len=Math.sqrt(dx*dx+dy*dy+dz*dz);
          const ec = setup?.endClearance ?? 4;
          if (len > ec*2+1) {
            const ux=dx/len,uy=dy/len,uz=dz/len;
            start = { x: start.x+ux*ec, y: start.y+uy*ec, z: start.z+uz*ec };
            end = { x: end.x-ux*ec, y: end.y-uy*ec, z: end.z-uz*ec };
          }
        }
        // Stud 2mm end-trim (verified Detailer convention)
        const isFullStud = usage === "stud" || usage === "endstud" || usage === "jackstud" || usage === "trimstud";
        if (isFullStud) {
          const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z;
          const len=Math.sqrt(dx*dx+dy*dy+dz*dz);
          const T = 2.0;
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
        const stick = { name: stickName, start, end, flipped, profile, usage: String(s["@_usage"] ?? ""), tooling: [] };
        const length = Math.round(distance3D(stick.start, stick.end) * 10) / 10;
        const role = roleForUsage(stick.usage, String(s["@_type"] ?? ""), stick.name);
        const profileFamily = profileCode(profile.web, profile.lFlange, profile.rFlange, parseFloat(profile.gauge) || 0.75).split("_")[0];
        stick.tooling = generateTooling({
          role, length, profileFamily,
          gauge: profile.gauge, flipped,
          planName: plan.name, frameName: String(f["@_name"]),
          usage: stick.usage,
        });
        if (/^Kb\d/.test(stickName) && length > 100) {
          stick.tooling.push({ kind: "point", type: "InnerService", pos: Math.round((length/2)*10)/10 });
        }
        // Truss W angle-conditional chamfer (vertical posts get none, diagonals get both)
        if (/^W\d/.test(stickName) && frameBasis) {
          const startL = projectToFrameLocal(stick.start, frameBasis);
          const endL = projectToFrameLocal(stick.end, frameBasis);
          const dxL = Math.abs(endL.x - startL.x);
          if (dxL > 1.0) {
            stick.tooling.push({ kind: "start", type: "Chamfer" });
            stick.tooling.push({ kind: "end", type: "Chamfer" });
          }
        }
        // Web@pt rule: predicate not yet derived (Detailer is selective per stud) — skip.
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
