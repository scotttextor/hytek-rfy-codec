#!/usr/bin/env node
/**
 * Cluster gap analysis — Agent T's rule-derivation engine.
 *
 * Reads all per-plan baseline JSONs (scripts/baselines/raw/, hg260044/raw/,
 * hg260023/raw/) and clusters missing/extra ops by:
 *   (corpus × plan-frametype × stick-role × tool × position-bucket)
 *
 * Identifies clusters with >= MIN_CLUSTER_SIZE that share a systematic pattern
 * (consistent position formula, frame-type bound, stick-role bound).
 *
 * Output: docs/auto-derived-clusters.md + scripts/baselines/truth-diff/clusters.json
 */
import fs from "node:fs";
import path from "node:path";

const MIN_CLUSTER_SIZE = 5;

// Parse op string into structured data
// Examples:
//   "InnerDimple @326.5"           -> {tool:"InnerDimple", kind:"point", pos:326.5}
//   "LipNotch 32.0..77.0"          -> {tool:"LipNotch", kind:"spanned", start:32, end:77}
//   "Chamfer @start"               -> {tool:"Chamfer", kind:"start"}
//   "Chamfer @end"                 -> {tool:"Chamfer", kind:"end"}
//   "Swage @end"                   -> {tool:"Swage", kind:"end"}
function parseOp(opStr) {
  const m1 = opStr.match(/^(\w+) @(start|end)$/);
  if (m1) return { tool: m1[1], kind: m1[2] };
  const m2 = opStr.match(/^(\w+) @(-?\d+(?:\.\d+)?)$/);
  if (m2) return { tool: m2[1], kind: "point", pos: parseFloat(m2[2]) };
  const m3 = opStr.match(/^(\w+) (-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/);
  if (m3) return { tool: m3[1], kind: "spanned", start: parseFloat(m3[2]), end: parseFloat(m3[3]) };
  return { tool: opStr.split(/\s/)[0], kind: "unknown", raw: opStr };
}

function stickRole(name) {
  // Strip trailing digits to get role prefix
  const m = name.match(/^([A-Za-z]+)/);
  return m ? m[1] : name;
}

function planFrameType(planFile) {
  // e.g. "HG260001_PK4-GF-LBW-70.075.json" -> "LBW-70.075"
  // e.g. "HG260001_GF-RP-70.075.json"      -> "RP-70.075"
  const base = path.basename(planFile, ".json");
  const m = base.match(/GF-([A-Za-z0-9]+)-(\d+\.\d+)/);
  if (m) return { frameType: m[1], profile: m[2] };
  return { frameType: "?", profile: "?" };
}

const corpora = [
  { name: "HG260001", dir: "scripts/baselines/raw" },
  { name: "HG260044", dir: "scripts/baselines/hg260044/raw" },
  { name: "HG260023", dir: "scripts/baselines/hg260023/raw" },
];

// Filter for HG260001 (its raw dir holds files for all jobs since refactor)
function isFromCorpus(file, corpus) {
  return path.basename(file).startsWith(corpus + "_") || path.basename(file).startsWith(corpus + "#");
}

const allRecords = []; // { corpus, plan, frame, stick, role, opKind, opTool, opPos|opStart|opEnd, kind: 'missing'|'extras', planFrameType, planProfile, oursLength, refLength, lengthDelta }

for (const c of corpora) {
  const files = fs.readdirSync(c.dir).filter(f => f.endsWith(".json") && isFromCorpus(f, c.name));
  for (const f of files) {
    const fullPath = path.join(c.dir, f);
    const j = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    const { frameType, profile } = planFrameType(f);
    for (const frame of j.byFrame || []) {
      for (const stick of frame.sticks || []) {
        const role = stickRole(stick.name);
        const lengthDelta = (stick.refLength || 0) - (stick.oursLength || 0);
        for (const m of stick.missing || []) {
          const op = parseOp(m);
          allRecords.push({
            corpus: c.name, plan: f.replace(".json", ""), frame: frame.name, stick: stick.name, role,
            ...op, gap: "missing", planFrameType: frameType, planProfile: profile,
            oursLength: stick.oursLength, refLength: stick.refLength, lengthDelta,
          });
        }
        for (const e of stick.extras || []) {
          const op = parseOp(e);
          allRecords.push({
            corpus: c.name, plan: f.replace(".json", ""), frame: frame.name, stick: stick.name, role,
            ...op, gap: "extras", planFrameType: frameType, planProfile: profile,
            oursLength: stick.oursLength, refLength: stick.refLength, lengthDelta,
          });
        }
      }
    }
  }
}

console.log("Total records:", allRecords.length);
console.log("  missing:", allRecords.filter(r => r.gap === "missing").length);
console.log("  extras :", allRecords.filter(r => r.gap === "extras").length);

// Cluster key = corpus × frameType × role × tool × kind × gap
function clusterKey(r) {
  return [r.planFrameType, r.role, r.tool, r.kind, r.gap].join("|");
}

const clusters = new Map();
for (const r of allRecords) {
  const k = clusterKey(r);
  if (!clusters.has(k)) clusters.set(k, []);
  clusters.get(k).push(r);
}

// Cross-corpus aggregation: a cluster is more interesting if it spans multiple corpora
const clusterStats = [];
for (const [k, members] of clusters.entries()) {
  if (members.length < MIN_CLUSTER_SIZE) continue;
  const corpora = new Set(members.map(m => m.corpus));
  const positions = members.filter(m => m.kind === "point").map(m => m.pos);
  const starts = members.filter(m => m.kind === "spanned").map(m => m.start);
  const ends = members.filter(m => m.kind === "spanned").map(m => m.end);
  const widths = members.filter(m => m.kind === "spanned").map(m => m.end - m.start);
  // Distance from start of stick (pos or start-pos) and from end of stick (refLength - pos or refLength - end)
  const distFromStart = members.map(m => m.kind === "point" ? m.pos : m.start);
  const distFromEnd = members.map(m => {
    const refLen = m.refLength || 0;
    const refPos = m.kind === "point" ? m.pos : m.end;
    return refLen - refPos;
  }).filter(v => Number.isFinite(v));
  function summarize(arr) {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const min = sorted[0], max = sorted[sorted.length - 1];
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    return { n: arr.length, min, max, mean, median, range: max - min };
  }
  clusterStats.push({
    key: k,
    size: members.length,
    corporaCount: corpora.size,
    corpora: [...corpora],
    distFromStart: summarize(distFromStart),
    distFromEnd: summarize(distFromEnd),
    widths: summarize(widths),
    sample: members.slice(0, 3).map(m => `${m.corpus}/${m.plan}:${m.frame}:${m.stick} ${m.tool} ${m.kind === "point" ? "@" + m.pos : m.kind === "spanned" ? `${m.start}..${m.end}` : "@" + m.kind}`),
  });
}

clusterStats.sort((a, b) => b.size - a.size);

const outDir = "scripts/baselines/truth-diff";
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/clusters.json`, JSON.stringify(clusterStats, null, 2));

console.log(`\nTop 30 clusters (size >= ${MIN_CLUSTER_SIZE}):`);
console.log("size  cor  key                                                                 distFromStart  distFromEnd  widthRange");
for (const c of clusterStats.slice(0, 30)) {
  const ds = c.distFromStart ? `${c.distFromStart.min.toFixed(0)}..${c.distFromStart.max.toFixed(0)}/${c.distFromStart.median.toFixed(0)}` : "-";
  const de = c.distFromEnd ? `${c.distFromEnd.min.toFixed(0)}..${c.distFromEnd.max.toFixed(0)}/${c.distFromEnd.median.toFixed(0)}` : "-";
  const wr = c.widths ? `${c.widths.min.toFixed(1)}..${c.widths.max.toFixed(1)}` : "-";
  console.log(`${String(c.size).padStart(4)}  ${c.corporaCount}    ${c.key.padEnd(60)} ${ds.padEnd(15)} ${de.padEnd(13)} ${wr}`);
}

// Build clusters narrowed by stick role + frametype + tool (more useful for rule-derivation)
console.log(`\nCross-corpus consistent clusters (in ALL 3 corpora, missing/extras):`);
const cross3 = clusterStats.filter(c => c.corporaCount === 3);
console.log("count:", cross3.length);
for (const c of cross3.slice(0, 40)) {
  const ds = c.distFromStart ? `[${c.distFromStart.min.toFixed(0)},${c.distFromStart.max.toFixed(0)}]/med=${c.distFromStart.median.toFixed(0)}` : "-";
  console.log(`  ${String(c.size).padStart(4)}  ${c.key.padEnd(60)} ${ds}`);
}

console.log(`\nWrote ${outDir}/clusters.json`);
