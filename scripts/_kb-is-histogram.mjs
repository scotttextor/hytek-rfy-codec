// Build histogram: for each Kb stick in HG260044 GF-LBW with missing
// InnerService, parse XML geometry + ref RFY to find the world-Z that
// the local-pos projects from. Goal: derive Kb-InnerService rule.

import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { decode } from "../dist/index.js";

const xmlPath = process.argv[2];
const refRfyPath = process.argv[3];

const xml = fs.readFileSync(xmlPath, "utf8");
const p = new XMLParser({ ignoreAttributes: false, parseAttributeValue: true, isArray: (n) => ["plan","frame","stick","tool_action"].includes(n) });
const doc = p.parse(xml);

function parseTriple(t) { const n = String(t).trim().split(/[ ,\t]+/).map(Number); return {x:n[0]||0,y:n[1]||0,z:n[2]||0}; }

const project = doc.framecad_import || doc;
const plans = project.plans?.plan ?? project.plan ?? [];

// Decode ref rfy
const refBytes = fs.readFileSync(refRfyPath);
const refDecoded = decode(refBytes);

// Build map: planNumber -> frameName -> stickName -> ops
function planNumFromName(planName) {
  const m = (planName || "").match(/PK(\d+)/i);
  return m ? parseInt(m[1]) : null;
}
const refByFrame = new Map(); // key: frameName/stickName
for (const plan of refDecoded.project?.plans || []) {
  for (const f of plan.frames || []) {
    const fname = f.name || `F${f.index}`;
    for (const stick of f.sticks || []) {
      const k = `${fname}|${stick.name}`;
      refByFrame.set(k, stick);
    }
  }
}

// Process Kb sticks
const planEntries = [];
for (const plan of plans) {
  const pname = plan["@_name"] || "";
  if (!/-(N?LBW)-/i.test(pname)) continue;
  const frames = plan.frames?.frame ?? plan.frame ?? [];
  for (const frame of frames) {
    const fName = frame["@_name"];
    const sticks = frame.sticks?.stick ?? frame.stick ?? [];
    const tas = frame.tool_actions?.tool_action ?? frame.tool_action ?? [];
    const services = tas.filter(t => (t["@_name"] || "").toLowerCase() === "service").map(t => ({
      start: parseTriple(t.start ?? "0,0,0"),
      end: parseTriple(t.end ?? "0,0,0"),
    }));
    for (const stick of sticks) {
      const name = stick["@_name"];
      if (!/^Kb\d/.test(name || "")) continue;
      const start = parseTriple(stick.start);
      const end = parseTriple(stick.end);
      const inputFlipped = stick.flipped === true || stick.flipped === "true";
      const dz = end.z - start.z;
      const len = Math.sqrt((end.x-start.x)**2 + (end.y-start.y)**2 + (end.z-start.z)**2);

      // Replicate codec normalization: swap if end is closer to plate
      // Approximate fzMin=0, fzMax=2775 (frame z bounds for ground floor 70mm wall)
      const fzMin = 0, fzMax = 2775;
      const sb = Math.min(start.z - fzMin, fzMax - start.z);
      const eb = Math.min(end.z - fzMin, fzMax - end.z);
      let s = start, e = end;
      if (eb > sb) { const t = s; s = e; e = t; }
      const T_START = 2.0, T_END = 1.46;
      const ux = (e.x-s.x)/len, uy = (e.y-s.y)/len, uz = (e.z-s.z)/len;
      const ns = { x: s.x+ux*T_START, y: s.y+uy*T_START, z: s.z+uz*T_START };
      const ne = { x: e.x-ux*T_END, y: e.y-uy*T_END, z: e.z-uz*T_END };
      const nlen = Math.round(Math.sqrt((ne.x-ns.x)**2 + (ne.y-ns.y)**2 + (ne.z-ns.z)**2) * 10) / 10;
      const sinTheta = Math.abs(ne.z - ns.z) / nlen;
      const isTopKb = ne.z > ns.z;

      // Find ref stick
      const refStick = refByFrame.get(`${fName}|${name}`);
      const refIs = (refStick?.tooling || []).filter(op => op.type === "InnerService" && op.kind === "point").map(op => op.pos).sort((a,b)=>a-b);

      planEntries.push({
        planName: pname, fName, name, raw: {start, end, len, inputFlipped},
        norm: {start: ns, end: ne, len: nlen, sinTheta, isTopKb},
        refIs,
        services,
      });
    }
  }
}

// Print analysis for each Kb
console.log("Plan/Frame | Kb | inputFlipped isTopKb sinTheta | nlen | refIs | tried-projections");
for (const pe of planEntries) {
  const {planName, fName, name, raw, norm, refIs, services} = pe;
  console.log(`\n${planName} ${fName} ${name}: rawStart=(${raw.start.x.toFixed(1)},${raw.start.z.toFixed(1)}) rawEnd=(${raw.end.x.toFixed(1)},${raw.end.z.toFixed(1)}) flipped=${raw.inputFlipped} | normStart=(${norm.start.x.toFixed(1)},${norm.start.z.toFixed(1)}) normEnd=(${norm.end.x.toFixed(1)},${norm.end.z.toFixed(1)}) sinθ=${norm.sinTheta.toFixed(3)} isTopKb=${norm.isTopKb} nlen=${norm.len}`);
  console.log(`  refIs: [${refIs.map(x => x.toFixed(1)).join(", ")}]`);

  // For each service line, compute projection candidates
  for (const svc of services) {
    const isHoriz = Math.abs(svc.start.z - svc.end.z) < 0.01;
    if (isHoriz) {
      const z_h = svc.start.z;
      // Check z range
      const zMin = Math.min(norm.start.z, norm.end.z), zMax = Math.max(norm.start.z, norm.end.z);
      if (z_h < zMin - 0.5 || z_h > zMax + 0.5) continue;
      // Check perpendicular
      const dxk = norm.end.x - norm.start.x, dyk = norm.end.y - norm.start.y;
      const stickPerpAxis = Math.abs(dxk) > Math.abs(dyk) ? "y" : "x";
      const stickRunAxis = stickPerpAxis === "y" ? "x" : "y";
      const svcDx = Math.abs(svc.end.x - svc.start.x), svcDy = Math.abs(svc.end.y - svc.start.y);
      const svcAxis = svcDx > svcDy ? "x" : "y";
      if (svcAxis !== stickRunAxis) continue;
      const svcPerp = stickPerpAxis === "y" ? svc.start.y : svc.start.x;
      const stickPerp = stickPerpAxis === "y" ? norm.start.y : norm.start.x;
      if (Math.abs(svcPerp - stickPerp) > 5) continue;
      // posFromStart and posFromEnd
      const posFromStart = (z_h - norm.start.z) / (norm.isTopKb ? norm.sinTheta : -norm.sinTheta);
      const posFromEnd = norm.len - posFromStart;
      console.log(`  H z=${z_h}: posFromStart=${posFromStart.toFixed(1)} posFromEnd=${posFromEnd.toFixed(1)}`);
    } else {
      // Vertical service line at fixed x or y
      const svcDx = Math.abs(svc.end.x - svc.start.x), svcDy = Math.abs(svc.end.y - svc.start.y);
      const svcAxis = svcDx > svcDy ? "x" : "y"; // axis it varies in (none for V); use perp instead
      // V service is at fixed x AND fixed y, varies in z
      const sx = svc.start.x, sy = svc.start.y;
      const sz_lo = Math.min(svc.start.z, svc.end.z), sz_hi = Math.max(svc.start.z, svc.end.z);
      // Find Kb position where x or y matches the service
      const dxk = norm.end.x - norm.start.x, dyk = norm.end.y - norm.start.y, dzk = norm.end.z - norm.start.z;
      // Use x as the dominant variation axis on Kbs (since y=constant in wall plane)
      let t;
      if (Math.abs(dxk) > Math.abs(dyk)) {
        t = (sx - norm.start.x) / dxk;
      } else {
        t = (sy - norm.start.y) / dyk;
      }
      if (t < -0.05 || t > 1.05) continue;
      const z_at = norm.start.z + t * dzk;
      if (z_at < sz_lo - 0.5 || z_at > sz_hi + 0.5) continue;
      const posFromStart = t * norm.len;
      const posFromEnd = norm.len - posFromStart;
      console.log(`  V@x=${sx.toFixed(1)} (z range ${sz_lo}..${sz_hi}): t=${t.toFixed(3)} z_at=${z_at.toFixed(1)} posFromStart=${posFromStart.toFixed(1)} posFromEnd=${posFromEnd.toFixed(1)}`);
    }
  }
}
