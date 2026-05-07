#!/usr/bin/env node
/**
 * Mine the truth corpus to build per-bucket statistics that drive the
 * operator review's "looks-unusual?" flag.
 *
 * Output: scripts/corpus-stats.json
 *
 * Per (profile, role, plan_type, length_bucket_50mm):
 *   - count, mean_ops, p25_ops, p50_ops, p75_ops, max_ops
 *   - mode op_type distribution (e.g., {InnerDimple: 0.92, Swage: 0.85, ...})
 *
 * The web app (operator review) uses this to compare a new stick's ops to
 * the historical norm. >2σ deviation in op count, or missing-mode-op, →
 * flag for human review.
 */
import fs from "node:fs";
import readline from "node:readline";

const IN = process.argv[2] || "scripts/truth-corpus.jsonl";
const OUT = "scripts/corpus-stats.json";

function lengthBucket(mm, size = 50) {
  return Math.round(mm / size) * size;
}

const buckets = new Map();

const rl = readline.createInterface({ input: fs.createReadStream(IN), crlfDelay: Infinity });
let total = 0;
for await (const line of rl) {
  if (!line) continue;
  let r;
  try { r = JSON.parse(line); } catch { continue; }
  total++;
  const key = `${r.stick_profile}|${r.role}|${r.plan_type}|L${lengthBucket(r.length_mm)}`;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { count: 0, op_counts: [], op_types: new Map() };
    buckets.set(key, bucket);
  }
  bucket.count++;
  bucket.op_counts.push((r.tooling || []).length);
  // Track which op types appear (and how often) per stick
  const seenTypes = new Set();
  for (const op of r.tooling || []) {
    seenTypes.add(op.type);
  }
  for (const t of seenTypes) {
    bucket.op_types.set(t, (bucket.op_types.get(t) || 0) + 1);
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const i = Math.min(Math.floor((sorted.length - 1) * p), sorted.length - 1);
  return sorted[i];
}

const out = {};
for (const [key, b] of buckets) {
  if (b.count < 3) continue; // need at least 3 samples to report anything useful
  const sorted = [...b.op_counts].sort((a, b) => a - b);
  const mean = sorted.reduce((s, x) => s + x, 0) / sorted.length;
  const variance = sorted.reduce((s, x) => s + (x - mean) ** 2, 0) / sorted.length;
  const stdev = Math.sqrt(variance);
  const op_type_freq = {};
  for (const [t, c] of b.op_types) {
    op_type_freq[t] = c / b.count;
  }
  out[key] = {
    count: b.count,
    op_count: {
      mean: Math.round(mean * 10) / 10,
      stdev: Math.round(stdev * 10) / 10,
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      max: percentile(sorted, 1),
    },
    op_type_freq, // {InnerDimple: 0.95, Swage: 0.82, ...}
  };
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 0));
console.log(`Total records: ${total.toLocaleString()}`);
console.log(`Unique buckets: ${buckets.size}, kept ${Object.keys(out).length} (≥3 samples)`);
console.log(`Wrote ${OUT}`);
console.log();
console.log("Sample buckets (top 5 by count):");
const top = Object.entries(out).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
for (const [k, v] of top) {
  console.log(`  ${k} count=${v.count} ops_mean=${v.op_count.mean}±${v.op_count.stdev}`);
}
