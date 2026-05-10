// Debug TSN panel-point detection: print the chord coords + web crossings
// AT THE TIME my function would see them (post-harness, pre-vertical-W-trim).
//
// Hooks into synthesizeRfyFromPlans by importing internal modules. Quickest:
// re-implement the parse + project logic to mirror what `simplify-tin-truss.ts`
// sees. We need the parsed frame.sticks AFTER the codec's per-stick rule
// engine has run but BEFORE simplifyTinTrussFramesInProject — same order.
import { synthesizeRfyFromPlans, generateTooling, decode, getMachineSetupForProfile, deriveFrameBasis, coerceEnvelopeToRect, projectToFrameLocal, resolveProjectConfigFromHints } from "../dist/index.js";
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";

const xmlPath = process.argv[2];
const refRfyPath = process.argv[3];

// ---------------------------------------------------------------------------
// Parse XML the same way diff-vs-detailer.mjs does (build the parsedPlans).
// ---------------------------------------------------------------------------
function parseTriple(t) { const n = String(t).trim().split(/[ ,\t]+/).map(Number); return {x:n[0]||0,y:n[1]||0,z:n[2]||0}; }
function distance3D(a,b) { const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z; return Math.sqrt(dx*dx+dy*dy+dz*dz); }

const xmlSrc = fs.readFileSync(xmlPath, "utf8");
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", preserveOrder: false, trimValues: true });
const doc = parser.parse(xmlSrc);

// We just want to see the post-codec frame.sticks, so easiest: run the actual
// synthesize pipeline and intercept via console.log inside the function.
// Instead of re-plumbing, let's do a simpler thing: just decode our generated
// RFY (which is what we'd see after synthesis) and check its T2 stick coords.
// But that's too late — the panel rule operates on frame.sticks pre-render.
//
// Simpler: compute crossings ON THE XML directly. The harness applies very
// minor transformations (chord-end trim of a few mm) so the XML projection
// should be close. Print both XML and codec-generated tins to see drift.

import { execFileSync } from "node:child_process";
// Actually easiest: read OUR ours.rfy and look at T2's tooling positions —
// where my rule produced dimples — vs ref's expected positions.

const ours = decode(fs.readFileSync("scripts/baselines/raw/HG260001_GF-TIN-70.075.ours.rfy"));
const ref = decode(fs.readFileSync(refRfyPath));

function findFrame(rfy, name) {
  for (const p of rfy.project?.plans || []) {
    for (const f of p.frames || []) {
      if (f.name === name) return f;
    }
  }
  return null;
}

for (const fname of ["TN8-1", "TN18-1", "TS1-1"]) {
  console.log("\n===== ", fname, "=====");
  const oursFr = findFrame(ours, fname);
  const refFr = findFrame(ref, fname);
  if (!oursFr || !refFr) { console.log("  not found"); continue; }
  const t2sticks = oursFr.sticks.filter(s => s.name === "T2");
  const refT2 = refFr.sticks.filter(s => s.name === "T2");
  for (let i = 0; i < t2sticks.length; i++) {
    const o = t2sticks[i];
    const r = refT2[i];
    console.log(` T2 #${i}: ours len=${o.length.toFixed(2)}, ref len=${r?.length.toFixed(2)}`);
    console.log("   ours dimples:", o.tooling.filter(t => t.type === "InnerDimple").map(t => t.pos.toFixed(2)).join(", "));
    console.log("   ref  dimples:", r?.tooling.filter(t => t.type === "InnerDimple").map(t => t.pos.toFixed(2)).join(", "));
    console.log("   ours LNs:", o.tooling.filter(t => t.type === "LipNotch").map(t => `[${t.startPos.toFixed(2)}..${t.endPos.toFixed(2)}]`).join(", "));
    console.log("   ref  LNs:", r?.tooling.filter(t => t.type === "LipNotch").map(t => `[${t.startPos.toFixed(2)}..${t.endPos.toFixed(2)}]`).join(", "));
  }
}
