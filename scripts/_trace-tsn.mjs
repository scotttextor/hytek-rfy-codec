// Re-implement TSN crossing logic but on the parsed (post-harness) frame.
// Needs us to invoke synthesizeRfyFromPlans(... ) but break in at
// pre-simplify-tin time. Easiest: temporarily hook the simplify-tin
// function. Instead — do a simpler thing: import the parsed plans by
// re-running the same parse logic the diff harness uses, then poke at
// frame.sticks before simplify runs. We'll use the public synthesize
// function and hack around it: just re-implement the parser logic.
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";
import {
  resolveProjectConfigFromHints,
  generateTooling,
  getMachineSetupForProfile,
} from "../dist/index.js";

const xmlPath = process.argv[2];
const xml = fs.readFileSync(xmlPath, "utf8");
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: false,
  trimValues: true,
});
const doc = parser.parse(xml);

// Just look at TS1-1 in the XML, after a dry run that mimics the codec's
// pre-simplify state. The codec extends vertical Ws by +11mm in z (wall
// rule). We need to replicate that on our test webs.

function parseTriple(t) {
  const n = String(t).trim().split(/[ ,\t]+/).map(Number);
  return { x: n[0]||0, y: n[1]||0, z: n[2]||0 };
}

function findFrame(node, name) {
  if (!node || typeof node !== "object") return null;
  if (node["@_name"] === name) return node;
  for (const k of Object.keys(node)) {
    if (k.startsWith("@_")) continue;
    const v = node[k];
    if (Array.isArray(v)) for (const it of v) { const r = findFrame(it, name); if (r) return r; }
    else if (v && typeof v === "object") { const r = findFrame(v, name); if (r) return r; }
  }
  return null;
}

function project(p, a, b) {
  const ab = { x: b.x-a.x, y: b.y-a.y, z: b.z-a.z };
  const ap = { x: p.x-a.x, y: p.y-a.y, z: p.z-a.z };
  const len2 = ab.x*ab.x + ab.y*ab.y + ab.z*ab.z;
  const t = (ap.x*ab.x + ap.y*ab.y + ap.z*ab.z) / len2;
  const proj = { x: a.x + ab.x*t, y: a.y + ab.y*t, z: a.z + ab.z*t };
  const d = Math.hypot(p.x-proj.x, p.y-proj.y, p.z-proj.z);
  return { d, t, len: Math.sqrt(len2), pos: t*Math.sqrt(len2) };
}

const frame = findFrame(doc, "TS1-1");
const sticks = Array.isArray(frame.stick) ? frame.stick : [frame.stick];
const t2sticks = sticks.filter(s => s["@_name"] === "T2");
const webs = sticks.filter(s => /^W\d/.test(s["@_name"] || "") && (s["@_usage"]||"").toLowerCase()==="web");

// Simulate: harness extends each W's far-from-chord endpoint inward by some
// amount (vertical-W trim of -6.5mm runs AFTER simplify-tin, so at panel-pt
// time we're looking at +11mm extension from wall rule).

for (let ti = 0; ti < t2sticks.length; ti++) {
  const t2 = t2sticks[ti];
  const t2start = parseTriple(t2.start);
  const t2end = parseTriple(t2.end);
  console.log("\n===== T2#"+ti+" =====");
  console.log("  XML start:", t2start);
  console.log("  XML end:", t2end);
  // Now project XML web endpoints onto XML chord
  console.log("\n  XML projection (no transform):");
  for (const w of webs) {
    const ws = parseTriple(w.start);
    const we = parseTriple(w.end);
    const ps = project(ws, t2start, t2end);
    const pe = project(we, t2start, t2end);
    const better = ps.d < pe.d ? ps : pe;
    if (better.d > 100) continue;
    if (better.pos < -10 || better.pos > better.len + 10) continue;
    console.log(`    ${w["@_name"].padEnd(6)} tin=${better.pos.toFixed(2).padStart(8)} perp=${better.d.toFixed(2).padStart(6)}`);
  }
}
