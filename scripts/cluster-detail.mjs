#!/usr/bin/env node
/**
 * Drill into a specific cluster: show all members + position distribution.
 *
 * Usage: node scripts/cluster-detail.mjs <frameType> <role> <tool> <kind> <gap>
 *   e.g. node scripts/cluster-detail.mjs LBW S InnerService point extras
 *   e.g. node scripts/cluster-detail.mjs LBW W Swage spanned extras
 */
import fs from "node:fs";
import path from "node:path";

const [, , filterFrameType, filterRole, filterTool, filterKind, filterGap] = process.argv;

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
  const m = name.match(/^([A-Za-z]+)/);
  return m ? m[1] : name;
}

function planFrameType(planFile) {
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

function isFromCorpus(file, corpus) {
  return path.basename(file).startsWith(corpus + "_") || path.basename(file).startsWith(corpus + "#");
}

const records = [];
for (const c of corpora) {
  const files = fs.readdirSync(c.dir).filter(f => f.endsWith(".json") && isFromCorpus(f, c.name));
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(c.dir, f), "utf8"));
    const { frameType, profile } = planFrameType(f);
    if (filterFrameType && frameType !== filterFrameType) continue;
    for (const frame of j.byFrame || []) {
      for (const stick of frame.sticks || []) {
        const role = stickRole(stick.name);
        if (filterRole && role !== filterRole) continue;
        const ops = filterGap === "missing" ? (stick.missing || []) : (stick.extras || []);
        for (const opStr of ops) {
          const op = parseOp(opStr);
          if (filterTool && op.tool !== filterTool) continue;
          if (filterKind && op.kind !== filterKind) continue;
          records.push({
            corpus: c.name, plan: f.replace(".json", ""), frame: frame.name, stick: stick.name, profile,
            role, ...op,
            oursLength: stick.oursLength, refLength: stick.refLength,
          });
        }
      }
    }
  }
}

console.log(`Cluster: ${filterFrameType}/${filterRole}/${filterTool}/${filterKind}/${filterGap}`);
console.log(`Total members: ${records.length}\n`);

// Distribution by profile
const byProfile = {};
for (const r of records) {
  byProfile[r.profile] = (byProfile[r.profile] || 0) + 1;
}
console.log("By profile:", byProfile);

// Position distribution
if (filterKind === "point") {
  const positions = records.map(r => r.pos);
  const distFromEnd = records.map(r => r.refLength - r.pos);
  console.log("\nposition distribution (from start):");
  showHist(positions);
  console.log("\nposition distribution (from end):");
  showHist(distFromEnd);
} else if (filterKind === "spanned") {
  const starts = records.map(r => r.start);
  const ends = records.map(r => r.end);
  const widths = records.map(r => r.end - r.start);
  console.log("\nstart distribution (from stick start):");
  showHist(starts);
  console.log("\nend distribution (from stick start):");
  showHist(ends);
  console.log("\nstart distribution (from stick END = refLength - start):");
  showHist(records.map(r => r.refLength - r.start));
  console.log("\nwidth distribution:");
  showHist(widths);
}

// Sample 20 records
console.log("\nSample 30 records:");
for (const r of records.slice(0, 30)) {
  const opStr = r.kind === "point" ? `@${r.pos}` : r.kind === "spanned" ? `${r.start}..${r.end}` : "@" + r.kind;
  console.log(`  ${r.corpus} ${r.plan} ${r.frame}/${r.stick} (refLen=${r.refLength?.toFixed(1)}) ${r.tool} ${opStr}`);
}

function showHist(values) {
  if (!values.length) return;
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0], max = sorted[sorted.length - 1];
  const median = sorted[Math.floor(sorted.length / 2)];
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  console.log(`  n=${values.length} min=${min.toFixed(2)} max=${max.toFixed(2)} mean=${mean.toFixed(2)} median=${median.toFixed(2)} std=${std.toFixed(2)}`);
  // Histogram
  const buckets = 20;
  const bucketWidth = (max - min) / buckets || 1;
  const counts = Array(buckets).fill(0);
  for (const v of values) {
    const b = Math.min(buckets - 1, Math.floor((v - min) / bucketWidth));
    counts[b]++;
  }
  for (let i = 0; i < buckets; i++) {
    const low = (min + i * bucketWidth).toFixed(0);
    const high = (min + (i + 1) * bucketWidth).toFixed(0);
    const bar = "#".repeat(Math.floor(counts[i] / Math.max(1, Math.max(...counts) / 50)));
    console.log(`  ${low.padStart(7)}..${high.padStart(7)}  ${String(counts[i]).padStart(4)} ${bar}`);
  }
}
