#!/usr/bin/env node
/**
 * Mine wall-W Swage angle vs ref-span pairs from existing baselines.
 *
 * For each baseline JSON in scripts/baselines/{raw,hg260044/raw,hg260023/raw}:
 *   - Open inputXml (from baseline JSON header)
 *   - For each LBW/NLBW frame, for each W-prefixed stick:
 *     - Compute angleFromVertical from start/end (xml triples)
 *     - Look up baseline missing[] for "Swage <a>..<b>" — that's ref Swage
 *     - Compute spans for both ref ends and the codec emits (extras)
 *   - Emit `{plan, frame, stick, refLength, angle, refSpanStart, refSpanEnd}`
 *
 * Output: writes /tmp/wallw-mining.json + a human-readable table to stdout.
 */
import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";

const corpora = [
  { name: "HG260001", dir: "scripts/baselines/raw" },
  { name: "HG260044", dir: "scripts/baselines/hg260044/raw" },
  { name: "HG260023", dir: "scripts/baselines/hg260023/raw" },
];

function parseTriple(t) {
  const n = String(t).trim().split(/[ ,\t]+/).map(Number);
  return { x: n[0] || 0, y: n[1] || 0, z: n[2] || 0 };
}

function angleFromVerticalDeg(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const horiz = Math.hypot(dx, dy);
  return Math.atan2(horiz, Math.abs(dz)) * 180 / Math.PI;
}

function parseSpannedOp(opStr) {
  const m = opStr.match(/^Swage (-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return { start: parseFloat(m[1]), end: parseFloat(m[2]) };
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => ["plan", "frame", "stick", "tool_action"].includes(name),
});

const records = [];

for (const c of corpora) {
  const dir = c.dir;
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f =>
    f.endsWith(".json") &&
    (path.basename(f).startsWith(c.name + "_") || path.basename(f).startsWith(c.name + "#")) &&
    /-LBW-/i.test(f)  // wall plans only
  );
  for (const f of files) {
    const baseline = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const xmlPath = baseline.inputXml;
    if (!xmlPath || !fs.existsSync(xmlPath)) {
      console.error(`SKIP (no xml): ${f}`);
      continue;
    }
    const xml = fs.readFileSync(xmlPath, "utf8");
    const root = xmlParser.parse(xml).framecad_import;
    const plans = root?.plan ?? [];
    // Index sticks by frame name + stick name with their start/end coords.
    const stickCoords = new Map();  // key = `${frame}|${stick}` -> {start, end}
    for (const p of plans) {
      for (const frame of p.frame ?? []) {
        const fname = String(frame["@_name"]);
        for (const s of frame.stick ?? []) {
          const sname = String(s["@_name"]);
          const start = parseTriple(String(s.start ?? "0,0,0"));
          const end = parseTriple(String(s.end ?? "0,0,0"));
          stickCoords.set(`${fname}|${sname}`, { start, end });
        }
      }
    }
    // Walk baseline and collect W-stick records with refSwage
    for (const frame of baseline.byFrame ?? []) {
      const fname = frame.name;
      for (const stick of frame.sticks ?? []) {
        const sname = stick.name;
        if (!/^W\d/.test(sname)) continue;
        const coords = stickCoords.get(`${fname}|${sname}`);
        if (!coords) continue;
        const angle = angleFromVerticalDeg(coords.start, coords.end);
        const refSpannedSwages = (stick.missing ?? []).map(parseSpannedOp).filter(Boolean);
        const oursSpannedSwages = (stick.extras ?? []).map(parseSpannedOp).filter(Boolean);
        // Only collect when there is at least one ref Swage missing (the
        // angle-dependent gap)
        if (refSpannedSwages.length === 0) continue;
        for (const refSw of refSpannedSwages) {
          // categorize: start-cap (start<refLength*0.5) vs end-cap
          const refLen = stick.refLength ?? 0;
          const isEndCap = refSw.start > refLen * 0.5;
          const refSpan = refSw.end - refSw.start;
          // pair with corresponding codec extras Swage at same approximate position
          const oursMatch = oursSpannedSwages.find(o =>
            Math.abs(o.start - refSw.start) < 30 || Math.abs(o.end - refSw.end) < 30
          );
          records.push({
            corpus: c.name,
            plan: f.replace(".json", ""),
            frame: fname,
            stick: sname,
            refLen,
            angle,
            isEndCap,
            refStart: refSw.start,
            refEnd: refSw.end,
            refSpan,
            oursStart: oursMatch?.start ?? null,
            oursEnd: oursMatch?.end ?? null,
            oursSpan: oursMatch ? oursMatch.end - oursMatch.start : null,
            // Save lengths and angle inputs for further analysis
            dx: coords.end.x - coords.start.x,
            dy: coords.end.y - coords.start.y,
            dz: coords.end.z - coords.start.z,
          });
        }
      }
    }
  }
}

console.log(`Mined ${records.length} wall-W Swage records across ${corpora.length} corpora.`);

// Group by isEndCap
const startCaps = records.filter(r => !r.isEndCap);
const endCaps = records.filter(r => r.isEndCap);
console.log(`Start caps: ${startCaps.length}, End caps: ${endCaps.length}`);

function fmt(n, w = 6) {
  if (n === null || n === undefined) return "  null".padStart(w);
  return n.toFixed(2).padStart(w);
}

// Print sorted by angle to spot trends — START caps
console.log("\nSTART CAPS (sorted by angle):");
console.log("  angle  refSpan  oursSpan  refLen   plan/frame/stick");
const startSorted = [...startCaps].sort((a, b) => a.angle - b.angle);
for (const r of startSorted.slice(0, 60)) {
  console.log(`  ${fmt(r.angle, 6)}  ${fmt(r.refSpan, 6)}  ${fmt(r.oursSpan, 6)}  ${fmt(r.refLen, 7)}   ${r.corpus}/${r.frame}/${r.stick}`);
}

console.log("\nEND CAPS (sorted by angle):");
console.log("  angle  refSpan  oursSpan  refLen   plan/frame/stick");
const endSorted = [...endCaps].sort((a, b) => a.angle - b.angle);
for (const r of endSorted.slice(0, 60)) {
  console.log(`  ${fmt(r.angle, 6)}  ${fmt(r.refSpan, 6)}  ${fmt(r.oursSpan, 6)}  ${fmt(r.refLen, 7)}   ${r.corpus}/${r.frame}/${r.stick}`);
}

// Bucketed angle vs refSpan stats
function bucketStats(arr, label) {
  if (!arr.length) return;
  const buckets = new Map();
  for (const r of arr) {
    const a = Math.round(r.angle);
    if (!buckets.has(a)) buckets.set(a, []);
    buckets.get(a).push(r.refSpan);
  }
  console.log(`\n${label} — by angle bucket (n / mean / min / max):`);
  for (const k of [...buckets.keys()].sort((a, b) => a - b)) {
    const arr = buckets.get(k);
    const min = Math.min(...arr), max = Math.max(...arr);
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    console.log(`  ${String(k).padStart(3)}°  n=${String(arr.length).padStart(3)}  mean=${mean.toFixed(2)}  min=${min.toFixed(2)}  max=${max.toFixed(2)}`);
  }
}

bucketStats(startCaps, "START CAP");
bucketStats(endCaps, "END CAP");

// Save full data
fs.writeFileSync("/tmp/wallw-mining.json", JSON.stringify(records, null, 2));
console.log("\nFull data in /tmp/wallw-mining.json");
