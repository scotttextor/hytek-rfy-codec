#!/usr/bin/env node
/**
 * Read the truth corpus (JSONL) and analyze fingerprint reliability.
 *
 * For each candidate fingerprint scheme:
 *   - count distinct fingerprints
 *   - count records per fingerprint
 *   - measure agreement: when a fingerprint matches, how often is the ops_list identical?
 *
 * This drives the design of the lookup-based codec layer.
 *
 * Usage:
 *   node scripts/analyze-corpus-fingerprints.mjs [--in scripts/truth-corpus.jsonl]
 */
import fs from "node:fs";
import readline from "node:readline";

const args = process.argv.slice(2);
const IN = args[args.indexOf("--in") + 1] || "scripts/truth-corpus.jsonl";

// Canonicalize an ops_list to a single string for equality comparison
function opsKey(tooling) {
  if (!tooling || tooling.length === 0) return "<EMPTY>";
  return tooling
    .map((op) => {
      if (op.kind === "point") return `P:${op.type}@${op.pos}`;
      if (op.kind === "spanned") return `S:${op.type}[${op.startPos}..${op.endPos}]`;
      if (op.kind === "start") return `T:${op.type}@start`;
      if (op.kind === "end") return `T:${op.type}@end`;
      return JSON.stringify(op);
    })
    .sort()
    .join("|");
}

// Bucketed length for fingerprint stability
function lengthBucket(mm, bucketSize = 50) {
  return Math.round(mm / bucketSize) * bucketSize;
}

// Try several fingerprint schemes — measure each
const SCHEMES = {
  /** Just (profile, role) — coarsest possible */
  PR: (r) => `${r.stick_profile}|${r.role}`,
  /** + plan_type */
  PRP: (r) => `${r.stick_profile}|${r.role}|${r.plan_type}`,
  /** + frame_type */
  PRPF: (r) => `${r.stick_profile}|${r.role}|${r.plan_type}|${r.frame_type}`,
  /** + length-bucket-50 */
  PRPF_L50: (r) => `${r.stick_profile}|${r.role}|${r.plan_type}|${r.frame_type}|L${lengthBucket(r.length_mm, 50)}`,
  /** + length-bucket-10 */
  PRPF_L10: (r) => `${r.stick_profile}|${r.role}|${r.plan_type}|${r.frame_type}|L${lengthBucket(r.length_mm, 10)}`,
  /** + neighbours-set */
  PRPF_L50_N: (r) => `${r.stick_profile}|${r.role}|${r.plan_type}|${r.frame_type}|L${lengthBucket(r.length_mm, 50)}|N${(r.neighbours || []).slice().sort().join(",")}`,
};

const stats = {};
for (const k of Object.keys(SCHEMES)) {
  stats[k] = new Map(); // fingerprint -> { count, opsKeys: Map<key, count>, totalLen, sampleRecord }
}

let total = 0;
const rl = readline.createInterface({ input: fs.createReadStream(IN), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line) continue;
  let r;
  try {
    r = JSON.parse(line);
  } catch {
    continue;
  }
  total++;
  const ok = opsKey(r.tooling);
  for (const [name, fn] of Object.entries(SCHEMES)) {
    const fp = fn(r);
    let entry = stats[name].get(fp);
    if (!entry) {
      entry = { count: 0, opsKeys: new Map(), totalLen: 0 };
      stats[name].set(fp, entry);
    }
    entry.count++;
    entry.totalLen += r.length_mm;
    entry.opsKeys.set(ok, (entry.opsKeys.get(ok) || 0) + 1);
  }
}

console.log(`Total records: ${total.toLocaleString()}\n`);
console.log(`Fingerprint scheme analysis:`);
console.log(`(Higher agreement rate = more reliable lookup)\n`);
console.log(`Scheme           | unique-fps | avg/fp | mode-agreement | top-1-coverage`);
console.log(`-----------------|-----------:|-------:|---------------:|---------------:`);

const detailed = {};
for (const [name, m] of Object.entries(stats)) {
  let totalRecords = 0;
  let recordsAtMode = 0;
  let topCovered = 0;
  for (const entry of m.values()) {
    totalRecords += entry.count;
    let modeCount = 0;
    for (const [, c] of entry.opsKeys) {
      if (c > modeCount) modeCount = c;
    }
    recordsAtMode += modeCount;
  }
  // Top-1 coverage = sum of largest fingerprint groups that cover N% of records
  const sortedFps = [...m.values()].sort((a, b) => b.count - a.count);
  let runningCount = 0;
  for (const e of sortedFps) {
    runningCount += e.count;
    topCovered++;
    if (runningCount >= totalRecords * 0.9) break;
  }
  const agree = totalRecords > 0 ? (recordsAtMode / totalRecords) * 100 : 0;
  console.log(
    `${name.padEnd(16)} | ${String(m.size).padStart(10)} | ${(totalRecords / m.size).toFixed(1).padStart(6)} | ${agree.toFixed(2).padStart(13)}% | ${topCovered} fps cover 90%`
  );
  detailed[name] = {
    unique_fingerprints: m.size,
    avg_records_per_fp: totalRecords / m.size,
    mode_agreement_pct: agree,
    top1_90pct_coverage: topCovered,
  };
}

// For the best (richest) scheme, dump some examples
const BEST = "PRPF_L50";
const sample = [...stats[BEST].entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 15);
console.log(`\nTop 15 most-common fingerprints under scheme "${BEST}":\n`);
for (const [fp, entry] of sample) {
  const distinct = entry.opsKeys.size;
  let mode = 0;
  for (const c of entry.opsKeys.values()) if (c > mode) mode = c;
  const agreePct = (mode / entry.count) * 100;
  console.log(`  ${fp.padEnd(60)} count=${entry.count} distinct-ops=${distinct} mode-agree=${agreePct.toFixed(1)}%`);
}

// Summary report file
fs.writeFileSync(
  "scripts/baselines/fingerprint-analysis.json",
  JSON.stringify({ total, schemes: detailed }, null, 2)
);
console.log(`\nWrote scripts/baselines/fingerprint-analysis.json`);
