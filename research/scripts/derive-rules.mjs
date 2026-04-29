// Read the corpus output (stick-database.csv) and derive Detailer's per-op
// placement rules: spacings, length-relative anchors, end-relative anchors.
//
// Outputs:
//   research/output/rules-derived.json   — programmatic rules
//   research/output/rules-derived.txt    — human-readable summary
//
// This is the rule-derivation step. Run AFTER scan-fast.mjs has produced
// stick-database.csv.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, "..", "output");
// Allow override: node derive-rules.mjs path/to/db.csv [path/to/output-prefix]
const DB_PATH = process.argv[2] ?? join(OUTPUT, "stick-database.csv");
const OUT_PREFIX = process.argv[3] ?? "rules-derived";

if (!existsSync(DB_PATH)) {
  console.error(`Missing: ${DB_PATH}`);
  console.error("Run scan-fast.mjs (or analyze-fixture.mjs for a quick test) first.");
  process.exit(1);
}

const log = (msg) => process.stdout.write(msg + "\n");

// ---------- CSV parser (tolerant of JSON-quoted cells) ----------
function parseCsvLine(line) {
  const out = [];
  let i = 0, buf = "", inQ = false;
  while (i < line.length) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { buf += '"'; i += 2; continue; }
      if (ch === '"') { inQ = false; i++; continue; }
      buf += ch; i++;
    } else {
      if (ch === '"') { inQ = true; i++; continue; }
      if (ch === ",") { out.push(buf); buf = ""; i++; continue; }
      buf += ch; i++;
    }
  }
  out.push(buf);
  return out;
}
function loadDb() {
  const text = readFileSync(DB_PATH, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const cols = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const r = {};
    cols.forEach((c, j) => { r[c] = cells[j] ?? ""; });
    // Tolerate fixture column variants
    if (!("opPosition" in r) && "opPos" in r) r.opPosition = r.opPos;
    if (!("opPositionFromEnd" in r) && "opFromEnd" in r) r.opPositionFromEnd = r.opFromEnd;
    if (!("opEndPosition" in r) && "opEndPos" in r) r.opEndPosition = r.opEndPos;
    if (!("jobName" in r)) r.jobName = "fixture";
    if (!("sourceRfy" in r)) r.sourceRfy = "fixture.rfy";
    // Coerce numerics
    for (const k of ["length", "totalOps", "opIndex", "opPosition", "opPositionFromEnd", "opEndPosition", "frameLength", "frameHeight"]) {
      if (k in r) r[k] = parseFloat(r[k]) || 0;
    }
    rows.push(r);
  }
  return rows;
}

const rows = loadDb();
log(`Loaded ${rows.length} rows from stick-database.csv`);

// ---------- Group rows by stick (jobName + sourceRfy + planName + frameName + stickName) ----------
const stickGroups = new Map();
for (const r of rows) {
  if (r.opType === "(none)") continue;
  const k = `${r.jobName}\x01${r.sourceRfy}\x01${r.planName}\x01${r.frameName}\x01${r.stickName}`;
  if (!stickGroups.has(k)) stickGroups.set(k, { meta: r, ops: [] });
  stickGroups.get(k).ops.push(r);
}
log(`Sticks with ops: ${stickGroups.size}`);

// ---------- Group sticks by (role, profileFamily, lengthBucket) ----------
const stickKey = (r) => `${r.role}|${r.profileFamily}|${r.lengthBucket}`;
const groups = new Map();
for (const { meta, ops } of stickGroups.values()) {
  const k = stickKey(meta);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push({ meta, ops });
}
log(`Stick groups: ${groups.size}`);

// ---------- Helpers ----------
function median(arr) { const a = [...arr].sort((x,y)=>x-y); return a[Math.floor(a.length/2)]; }
function quantiles(arr) {
  const a = [...arr].sort((x,y)=>x-y);
  if (a.length === 0) return null;
  return {
    min: a[0],
    p25: a[Math.floor(a.length*0.25)],
    median: a[Math.floor(a.length*0.5)],
    p75: a[Math.floor(a.length*0.75)],
    max: a[a.length-1],
  };
}
function clusterValues(values, tolerance = 5) {
  // Group values into clusters where consecutive values are within `tolerance`
  const sorted = [...values].sort((a,b)=>a-b);
  const clusters = [];
  let cur = [];
  for (const v of sorted) {
    if (cur.length === 0 || v - cur[cur.length - 1] <= tolerance) cur.push(v);
    else { clusters.push(cur); cur = [v]; }
  }
  if (cur.length) clusters.push(cur);
  return clusters.map(c => ({ value: median(c), count: c.length, min: c[0], max: c[c.length-1] }));
}

// ---------- Per-group analysis ----------
const rulesDerived = {};
for (const [groupKey, sticks] of groups) {
  const [role, profileFamily, lengthBucket] = groupKey.split("|");

  // For each op-type in this group, derive:
  //   1. Frequency (how often does this op-type appear?)
  //   2. Per-stick count distribution
  //   3. Position patterns:
  //        a. Absolute position clusters (e.g. "always at 125mm and length-125mm")
  //        b. End-relative clusters
  //        c. Length-fraction clusters (pos/length distribution → 0.5? 0.25/0.75?)
  //        d. Spacing pattern (gap between consecutive same-type ops on same stick)

  const opTypes = new Set();
  for (const { ops } of sticks) for (const o of ops) opTypes.add(o.opType);

  const groupResult = {
    role, profileFamily, lengthBucket,
    sticksObserved: sticks.length,
    ops: {},
  };

  for (const opType of opTypes) {
    // Per-stick: collect positions of this op-type for each stick
    const perStickPositions = [];
    for (const { meta, ops } of sticks) {
      const positions = ops.filter(o => o.opType === opType).map(o => o.opPosition).sort((a,b)=>a-b);
      perStickPositions.push({ length: meta.length, positions });
    }
    const sticksWith = perStickPositions.filter(p => p.positions.length > 0);
    const freq = sticksWith.length / sticks.length;

    // Position clusters (absolute)
    const allPositions = sticksWith.flatMap(p => p.positions);
    const allFromEnd = sticksWith.flatMap(p => p.positions.map(pos => p.length - pos));
    const allLengthFractions = sticksWith.flatMap(p => p.positions.map(pos => pos / p.length));

    // Spacing on sticks with >=2 ops
    const allSpacings = [];
    for (const { positions } of sticksWith) {
      for (let i = 1; i < positions.length; i++) {
        allSpacings.push(positions[i] - positions[i-1]);
      }
    }

    // Cluster absolute positions and end-relative positions
    const absClusters = clusterValues(allPositions, 10).filter(c => c.count >= Math.max(3, sticksWith.length * 0.05));
    const endClusters = clusterValues(allFromEnd, 10).filter(c => c.count >= Math.max(3, sticksWith.length * 0.05));
    const spacingClusters = clusterValues(allSpacings, 10).filter(c => c.count >= 3);
    const fractionClusters = clusterValues(allLengthFractions, 0.02).filter(c => c.count >= Math.max(3, sticksWith.length * 0.05));

    // Per-stick counts
    const perStickCounts = sticksWith.map(p => p.positions.length).sort((a,b)=>a-b);

    let confidence = "noise";
    if (freq >= 0.9) confidence = "high";
    else if (freq >= 0.5) confidence = "medium";
    else if (freq >= 0.1) confidence = "low";

    groupResult.ops[opType] = {
      sticksWith: sticksWith.length,
      groupSticks: sticks.length,
      frequency: Math.round(freq * 1000) / 1000,
      confidence,
      perStickCount: quantiles(perStickCounts),
      positionStats: quantiles(allPositions),
      fromEndStats: quantiles(allFromEnd),
      // Top 5 absolute-position clusters: places this op tends to land
      absoluteClusters: absClusters.sort((a,b)=>b.count-a.count).slice(0, 8),
      // Top 5 end-relative clusters: places relative to end of stick
      endRelativeClusters: endClusters.sort((a,b)=>b.count-a.count).slice(0, 8),
      // Spacing patterns
      spacingClusters: spacingClusters.sort((a,b)=>b.count-a.count).slice(0, 5),
      // Length fraction clusters
      lengthFractionClusters: fractionClusters.sort((a,b)=>b.count-a.count).slice(0, 8),
    };
  }
  rulesDerived[groupKey] = groupResult;
}

writeFileSync(join(OUTPUT, `${OUT_PREFIX}.json`), JSON.stringify(rulesDerived, null, 2));
log(`✓ ${OUT_PREFIX}.json (${Object.keys(rulesDerived).length} groups)`);

// Human-readable
const summary = [];
summary.push("# Detailer rules — derived placement patterns");
summary.push(`# ${stickGroups.size} sticks across ${Object.keys(rulesDerived).length} (role × profile × length) groups`);
summary.push("");

const sortedGroups = Object.entries(rulesDerived).sort((a,b)=>b[1].sticksObserved - a[1].sticksObserved);
for (const [, g] of sortedGroups) {
  if (g.sticksObserved < 5) continue;  // skip very small groups
  summary.push(`## ${g.role} on ${g.profileFamily} — ${g.lengthBucket} (${g.sticksObserved} sticks)`);
  const sortedOps = Object.entries(g.ops).sort((a,b)=>b[1].frequency - a[1].frequency);
  for (const [opType, p] of sortedOps) {
    if (p.confidence === "noise" && p.frequency < 0.05) continue;
    summary.push(`  ${p.confidence.toUpperCase().padEnd(6)} ${opType.padEnd(15)} ${(p.frequency*100).toFixed(0).padStart(3)}%  count: ${p.perStickCount.median} (range ${p.perStickCount.min}-${p.perStickCount.max})`);

    if (p.absoluteClusters.length) {
      const tops = p.absoluteClusters.slice(0, 3).map(c => `${c.value.toFixed(0)}mm×${c.count}`).join("  ");
      summary.push(`         abs hotspots:  ${tops}`);
    }
    if (p.endRelativeClusters.length) {
      const tops = p.endRelativeClusters.slice(0, 3).map(c => `${c.value.toFixed(0)}mm×${c.count}`).join("  ");
      summary.push(`         end hotspots:  ${tops}`);
    }
    if (p.spacingClusters.length) {
      const tops = p.spacingClusters.slice(0, 3).map(c => `${c.value.toFixed(0)}mm×${c.count}`).join("  ");
      summary.push(`         spacings:      ${tops}`);
    }
    if (p.lengthFractionClusters.length) {
      const tops = p.lengthFractionClusters.slice(0, 3).map(c => `${(c.value*100).toFixed(0)}%×${c.count}`).join("  ");
      summary.push(`         length-frac:   ${tops}`);
    }
  }
  summary.push("");
}
writeFileSync(join(OUTPUT, `${OUT_PREFIX}.txt`), summary.join("\n"));
log(`✓ ${OUT_PREFIX}.txt`);
log(`\nNext: read ${OUT_PREFIX}.txt to spot the patterns to encode.`);
