// Analyse T-stick length deltas in HG260044 GF-RP and HG260001 GF-RP corpora.
// For each T (top plate) stick, compute:
//   rawLen = sqrt(dx^2+dy^2+dz^2) from raw XML <start>/<end>
//   refLen = ref RFY length (in /tmp/rp3-diff.json)
//   delta  = refLen - rawLen
//
// Also count: per-frame, how many T-sticks; whether the frame has any rake bottom.

import * as fs from "node:fs";
import * as path from "node:path";
import { XMLParser } from "fast-xml-parser";

function parseTriple(t) {
  const n = String(t).trim().split(/[ ,\t]+/).map(Number);
  return { x: n[0] || 0, y: n[1] || 0, z: n[2] || 0 };
}

function dist3D(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const xmlFiles = process.argv.slice(2);
if (xmlFiles.length < 2) {
  console.error("usage: node _rp3-tstick-deltas.mjs <xml> <diff-json>");
  process.exit(1);
}

const xmlPath = xmlFiles[0];
const diffJson = JSON.parse(fs.readFileSync(xmlFiles[1], "utf8"));

const refLengths = new Map();  // frame->{stickName -> refLength}
const oursLengths = new Map();
for (const fr of diffJson.byFrame) {
  refLengths.set(fr.name, new Map());
  oursLengths.set(fr.name, new Map());
  for (const st of fr.sticks) {
    refLengths.get(fr.name).set(st.name, st.refLength);
    oursLengths.get(fr.name).set(st.name, st.oursLength);
  }
}

const xmlText = fs.readFileSync(xmlPath, "utf8");
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", isArray: (n) => n === "stick" || n === "frame" || n === "plan" });
const xmlDoc = parser.parse(xmlText);

const plans = xmlDoc.framecad_import?.project?.plan ?? [];
const planArr = Array.isArray(plans) ? plans : [plans];

const allDeltas = [];
const horizDeltas = [];
const rakeDeltas = [];
const horizFrameSticks = [];
const rakeFrameSticks = [];

for (const plan of planArr) {
  const frames = Array.isArray(plan.frame) ? plan.frame : [plan.frame];
  for (const frame of frames) {
    const fname = frame["@_name"];
    const sticks = Array.isArray(frame.stick) ? frame.stick : [frame.stick];
    // Determine frame rake mode: any horizontal B-plate?
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

    // Find sloped T-sticks for peak-mitre identification:
    // a T meeting another T at a peak should have a slight extension
    const tSticks = [];
    for (const s of sticks) {
      if (!s) continue;
      const name = s["@_name"] ?? "";
      if (!/^T\d/.test(name)) continue;
      const start = parseTriple(s.start);
      const end = parseTriple(s.end);
      const rawLen = dist3D(start, end);
      const refLen = refLengths.get(fname)?.get(name) ?? null;
      const oursLen = oursLengths.get(fname)?.get(name) ?? null;
      const isHoriz = Math.abs(end.z - start.z) < 5;
      tSticks.push({ name, start, end, rawLen, refLen, oursLen, isHoriz });
    }
    // For each T-stick determine if it's part of a peak (T-T meeting)
    for (const t of tSticks) {
      let meetsOtherTAtPeak = false;
      for (const other of tSticks) {
        if (other === t) continue;
        // Endpoints close together?
        const ee = dist3D(t.end, other.end);
        const es = dist3D(t.end, other.start);
        const se = dist3D(t.start, other.end);
        const ss = dist3D(t.start, other.start);
        if (ee < 30 || es < 30 || se < 30 || ss < 30) {
          meetsOtherTAtPeak = true;
          break;
        }
      }
      t.peak = meetsOtherTAtPeak;
    }
    for (const t of tSticks) {
      if (t.refLen == null) continue;  // skip if no diff entry
      const delta = t.refLen - t.rawLen;
      const deltaOurs = t.oursLen != null ? t.oursLen - t.rawLen : null;
      const refMinusOurs = (t.oursLen != null) ? (t.refLen - t.oursLen) : null;
      allDeltas.push({
        frame: fname, stick: t.name,
        rawLen: t.rawLen, refLen: t.refLen, oursLen: t.oursLen,
        deltaRaw: delta, deltaOurs: deltaOurs, refMinusOurs,
        sloped: !t.isHoriz, peak: t.peak, frameMode,
      });
      if (frameMode === "horiz") horizDeltas.push(delta);
      else if (frameMode === "rake") rakeDeltas.push(delta);
    }
  }
}

console.log(`\nT-stick length deltas (${path.basename(xmlPath)}):\n`);
console.log("frame\tstick\trawLen\trefLen\toursLen\tref-raw\tref-ours\tsloped\tpeak\tmode");
for (const d of allDeltas) {
  console.log(`${d.frame}\t${d.stick}\t${d.rawLen.toFixed(2)}\t${d.refLen?.toFixed(2)}\t${d.oursLen?.toFixed(2)}\t${d.deltaRaw.toFixed(2)}\t${d.refMinusOurs?.toFixed(2)}\t${d.sloped ? "Y" : "N"}\t${d.peak ? "Y" : "N"}\t${d.frameMode}`);
}

// Histogram: ref - ours for T-sticks (the trim drift)
const buckets = new Map();
for (const d of allDeltas) {
  if (d.refMinusOurs == null) continue;
  const bucket = Math.round(d.refMinusOurs);
  buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
}
console.log("\nHistogram (refLen - oursLen, rounded to mm):");
const sortedKeys = [...buckets.keys()].sort((a, b) => a - b);
for (const k of sortedKeys) console.log(`  ${k}\t${buckets.get(k)}`);

// Sub-histograms by mode + sloped
function subHist(filter) {
  const m = new Map();
  for (const d of allDeltas) {
    if (!filter(d)) continue;
    if (d.refMinusOurs == null) continue;
    const bucket = Math.round(d.refMinusOurs);
    m.set(bucket, (m.get(bucket) ?? 0) + 1);
  }
  return m;
}

console.log("\nBY FRAME MODE × SLOPED:");
for (const mode of ["horiz", "rake"]) {
  for (const sloped of [true, false]) {
    const m = subHist(d => d.frameMode === mode && d.sloped === sloped);
    if (m.size === 0) continue;
    console.log(`  mode=${mode} sloped=${sloped}:`);
    const keys = [...m.keys()].sort((a, b) => a - b);
    for (const k of keys) console.log(`    ${k}\t${m.get(k)}`);
  }
}
console.log("\nBY PEAK:");
for (const peak of [true, false]) {
  const m = subHist(d => d.peak === peak);
  if (m.size === 0) continue;
  console.log(`  peak=${peak}:`);
  const keys = [...m.keys()].sort((a, b) => a - b);
  for (const k of keys) console.log(`    ${k}\t${m.get(k)}`);
}
