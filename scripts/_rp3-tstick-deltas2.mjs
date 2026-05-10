// Analyse T-stick length deltas from raw XML vs ref RFY directly.
// For each T (top plate) stick:
//   rawLen = sqrt(dx^2+dy^2+dz^2) from raw XML <start>/<end>
//   refLen = ref RFY length (from .json sidecar in reference_data)
//   delta  = refLen - rawLen
// Since the diff harness only reports frames-with-gaps, we need a clean sample.

import * as fs from "node:fs";
import * as path from "node:path";
import { XMLParser } from "fast-xml-parser";
import { decode } from "../dist/decode.js";
const parseRfy = (bytes) => decode(Buffer.from(bytes));

function parseTriple(t) {
  const n = String(t).trim().split(/[ ,\t]+/).map(Number);
  return { x: n[0] || 0, y: n[1] || 0, z: n[2] || 0 };
}

function dist3D(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const xmlPath = process.argv[2];
const rfyPath = process.argv[3];
if (!xmlPath || !rfyPath) {
  console.error("usage: node _rp3-tstick-deltas2.mjs <xml> <rfy>");
  process.exit(1);
}

const refRfy = parseRfy(new Uint8Array(fs.readFileSync(rfyPath)));
const refSticksByFrame = new Map();
for (const plan of refRfy.project.plans) {
  for (const frame of plan.frames) {
    if (!refSticksByFrame.has(frame.name)) refSticksByFrame.set(frame.name, new Map());
    for (const stick of frame.sticks) {
      const arr = refSticksByFrame.get(frame.name).get(stick.name) ?? [];
      arr.push(stick);
      refSticksByFrame.get(frame.name).set(stick.name, arr);
    }
  }
}

const xmlText = fs.readFileSync(xmlPath, "utf8");
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", isArray: (n) => n === "stick" || n === "frame" || n === "plan" });
const xmlDoc = parser.parse(xmlText);
const root = xmlDoc.framecad_import ?? xmlDoc;
const plans = root.plan ?? root.project?.plan ?? [];
const planArr = Array.isArray(plans) ? plans : [plans];

const allDeltas = [];

for (const plan of planArr) {
  const frames = Array.isArray(plan.frame) ? plan.frame : [plan.frame];
  for (const frame of frames) {
    const fname = frame["@_name"];
    const sticks = Array.isArray(frame.stick) ? frame.stick : [frame.stick];
    let hasHorizB = false, hasSlopedB = false;
    for (const s of sticks) {
      if (!s) continue;
      const name = s["@_name"] ?? "";
      if (!/^B\d/.test(name)) continue;
      const start = parseTriple(s.start);
      const end = parseTriple(s.end);
      if (Math.abs(end.z - start.z) < 5) hasHorizB = true;
      else hasSlopedB = true;
    }
    const frameMode = hasHorizB ? "horiz" : (hasSlopedB ? "rake" : "unknown");

    const tSticks = [];
    for (const s of sticks) {
      if (!s) continue;
      const name = s["@_name"] ?? "";
      if (!/^T\d/.test(name)) continue;
      const start = parseTriple(s.start);
      const end = parseTriple(s.end);
      const rawLen = dist3D(start, end);
      const refList = refSticksByFrame.get(fname)?.get(name) ?? [];
      // Pick best ref by closest length
      const refStick = refList.length > 0 ? refList.reduce((b, c) => Math.abs(c.length - rawLen) < Math.abs(b.length - rawLen) ? c : b) : null;
      const refLen = refStick ? refStick.length : null;
      const isHoriz = Math.abs(end.z - start.z) < 5;
      tSticks.push({ name, start, end, rawLen, refLen, isHoriz });
    }
    for (const t of tSticks) {
      let meetsOtherTAtPeak = false;
      let peakDistance = Infinity;
      for (const other of tSticks) {
        if (other === t) continue;
        const ee = dist3D(t.end, other.end);
        const es = dist3D(t.end, other.start);
        const se = dist3D(t.start, other.end);
        const ss = dist3D(t.start, other.start);
        const minD = Math.min(ee, es, se, ss);
        if (minD < 30) { meetsOtherTAtPeak = true; if (minD < peakDistance) peakDistance = minD; }
      }
      t.peak = meetsOtherTAtPeak;
      t.peakDist = peakDistance === Infinity ? null : peakDistance;
    }
    for (const t of tSticks) {
      if (t.refLen == null) continue;
      const delta = t.refLen - t.rawLen;
      allDeltas.push({
        frame: fname, stick: t.name,
        rawLen: t.rawLen, refLen: t.refLen,
        delta, sloped: !t.isHoriz, peak: t.peak,
        peakDist: t.peakDist,
        frameMode,
      });
    }
  }
}

console.log(`\nT-stick: refLen - rawLen  (${path.basename(xmlPath)})\n`);
console.log("frame\tstick\trawLen\trefLen\tdelta\tsloped\tpeak\tpeakDist\tmode");
for (const d of allDeltas) {
  console.log(`${d.frame}\t${d.stick}\t${d.rawLen.toFixed(2)}\t${d.refLen?.toFixed(2)}\t${d.delta.toFixed(3)}\t${d.sloped ? "Y" : "N"}\t${d.peak ? "Y" : "N"}\t${d.peakDist?.toFixed(2)}\t${d.frameMode}`);
}

const buckets = new Map();
for (const d of allDeltas) {
  const bucket = Math.round(d.delta);
  buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
}
console.log("\nHistogram (refLen - rawLen, rounded to mm):");
for (const k of [...buckets.keys()].sort((a, b) => a - b)) console.log(`  ${k}\t${buckets.get(k)}`);

console.log("\nCohort breakdown (refLen-rawLen rounded):");
function subHist(filter) {
  const m = new Map();
  for (const d of allDeltas) {
    if (!filter(d)) continue;
    const bucket = Math.round(d.delta);
    m.set(bucket, (m.get(bucket) ?? 0) + 1);
  }
  return m;
}
const cohorts = [
  ["sloped + peak", d => d.sloped && d.peak],
  ["sloped + non-peak", d => d.sloped && !d.peak],
  ["horizontal + peak", d => !d.sloped && d.peak],
  ["horizontal + non-peak", d => !d.sloped && !d.peak],
];
for (const [label, filter] of cohorts) {
  const m = subHist(filter);
  if (m.size === 0) continue;
  console.log(`  ${label}:`);
  for (const k of [...m.keys()].sort((a, b) => a - b)) console.log(`    ${k}\t${m.get(k)}`);
}

console.log(`\nTotal T-sticks analysed: ${allDeltas.length}`);
