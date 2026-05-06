#!/usr/bin/env node
/**
 * Run the codec against EVERY (XML, ref-RFY) pair in y-drive-pairs.json and
 * compute aggregate parity stats. This is the wide-sample baseline that
 * replaces the prior HG260001+HG260044 baselines (only 2 jobs).
 *
 * Output:
 *   scripts/baselines/y-pairs-baseline.json    — full per-pair detail
 *   scripts/baselines/y-pairs-baseline.md      — human readable summary
 *
 * Usage:
 *   node scripts/diff-vs-y-pairs.mjs [--limit N] [--pairs FILE]
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
}
const PAIRS_FILE = flag("--pairs", "scripts/y-drive-pairs.json");
const LIMIT = parseInt(flag("--limit", "0"), 10) || Infinity;

const pairsBundle = JSON.parse(fs.readFileSync(PAIRS_FILE, "utf-8"));
const pairs = pairsBundle.pairs.slice(0, LIMIT);
console.log(`Diffing ${pairs.length} pairs (whole-drive baseline)\n`);

const OUT_DIR = "scripts/baselines";
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(`${OUT_DIR}/raw-y-pairs`, { recursive: true });

const results = [];
const aggMissing = {};
const aggExtras = {};
const byPlanType = {};
const byProfile = {};
const byBuilder = {};
const byYear = {};

const t0 = Date.now();
for (let i = 0; i < pairs.length; i++) {
  const p = pairs[i];
  const id = `${p.jobnum}__${p.plan_name}`;
  process.stdout.write(`[${i + 1}/${pairs.length}] ${id} ... `);
  const outPrefix = path.join(OUT_DIR, "raw-y-pairs", id);
  const r = spawnSync(
    "node",
    ["scripts/diff-vs-detailer.mjs", p.xml, p.rfy, outPrefix],
    { encoding: "utf-8", timeout: 60_000 }
  );
  if (r.status !== 0) {
    console.log(`FAIL exit=${r.status}`);
    results.push({ id, ok: false, reason: `exit ${r.status}`, stderr: (r.stderr || "").slice(-500) });
    continue;
  }
  const summaryPath = `${outPrefix}.json`;
  if (!fs.existsSync(summaryPath)) {
    console.log(`OK but no summary`);
    results.push({ id, ok: false, reason: "no summary" });
    continue;
  }
  const s = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));
  const parity = s.totals?.ref ? (s.totals.matched / s.totals.ref) * 100 : 0;
  console.log(`${parity.toFixed(1)}% (${s.totals?.matched}/${s.totals?.ref})`);
  const r2 = {
    id,
    jobnum: p.jobnum,
    plan_name: p.plan_name,
    plan_type: p.plan_name.match(/-([A-Z0-9]+)-\d/)?.[1] ?? "?",
    profile: p.plan_name.match(/-(\d+\.\d+)$/)?.[1] ?? "?",
    builder: p.builder,
    year: p.year,
    parity,
    totals: s.totals,
    missing: s.missing || {},
    extras: s.extras || {},
  };
  results.push(r2);
  for (const [k, v] of Object.entries(s.missing || {})) aggMissing[k] = (aggMissing[k] || 0) + v;
  for (const [k, v] of Object.entries(s.extras || {})) aggExtras[k] = (aggExtras[k] || 0) + v;
  for (const [bucket, key] of [
    [byPlanType, r2.plan_type],
    [byProfile, r2.profile],
    [byBuilder, r2.builder],
    [byYear, r2.year],
  ]) {
    bucket[key] = bucket[key] || { ref: 0, matched: 0, count: 0 };
    bucket[key].ref += s.totals?.ref || 0;
    bucket[key].matched += s.totals?.matched || 0;
    bucket[key].count++;
  }
}

const t1 = Date.now();

let totalRef = 0, totalMatched = 0, totalMissing = 0, totalExtras = 0;
for (const r of results) {
  if (!r.totals) continue;
  totalRef += r.totals.ref;
  totalMatched += r.totals.matched;
  totalMissing += r.totals.missing;
  totalExtras += r.totals.extras;
}
const overallPct = totalRef ? (totalMatched / totalRef) * 100 : 0;

const summary = {
  generated_at: new Date().toISOString(),
  pairs_attempted: pairs.length,
  pairs_ok: results.filter(r => r.totals).length,
  elapsed_sec: (t1 - t0) / 1000,
  totals: { ref: totalRef, matched: totalMatched, missing: totalMissing, extras: totalExtras, parity: overallPct },
  byPlanType: Object.fromEntries(Object.entries(byPlanType).map(([k, v]) => [k, { ...v, parity: v.ref ? (v.matched / v.ref) * 100 : 0 }])),
  byProfile: Object.fromEntries(Object.entries(byProfile).map(([k, v]) => [k, { ...v, parity: v.ref ? (v.matched / v.ref) * 100 : 0 }])),
  byBuilder: Object.fromEntries(Object.entries(byBuilder).map(([k, v]) => [k, { ...v, parity: v.ref ? (v.matched / v.ref) * 100 : 0 }])),
  byYear: Object.fromEntries(Object.entries(byYear).map(([k, v]) => [k, { ...v, parity: v.ref ? (v.matched / v.ref) * 100 : 0 }])),
  aggMissing,
  aggExtras,
  perPair: results,
};

fs.writeFileSync(`${OUT_DIR}/y-pairs-baseline.json`, JSON.stringify(summary, null, 2));

const lines = [];
lines.push("# Y-Drive Whole-Corpus Baseline — Codec vs Detailer (388 pairs)");
lines.push("");
lines.push(`**Generated:** ${new Date().toISOString()}`);
lines.push(`**Pairs:** ${pairs.length} attempted, ${results.filter(r => r.totals).length} succeeded`);
lines.push(`**Elapsed:** ${((t1 - t0) / 1000).toFixed(0)}s`);
lines.push("");
lines.push(`## Overall: **${overallPct.toFixed(2)}%** matched`);
lines.push(`${totalMatched.toLocaleString()} / ${totalRef.toLocaleString()} ops`);
lines.push(`Missing: ${totalMissing.toLocaleString()} | Extras: ${totalExtras.toLocaleString()}`);
lines.push("");

lines.push("## Parity by plan type");
lines.push("| Plan | Pairs | Parity | Matched | Ref |");
lines.push("|---|---:|---:|---:|---:|");
for (const [k, v] of Object.entries(summary.byPlanType).sort((a, b) => b[1].ref - a[1].ref)) {
  lines.push(`| ${k} | ${v.count} | ${v.parity.toFixed(1)}% | ${v.matched.toLocaleString()} | ${v.ref.toLocaleString()} |`);
}
lines.push("");

lines.push("## Parity by profile");
lines.push("| Profile | Pairs | Parity | Matched | Ref |");
lines.push("|---|---:|---:|---:|---:|");
for (const [k, v] of Object.entries(summary.byProfile).sort((a, b) => b[1].ref - a[1].ref)) {
  lines.push(`| ${k} | ${v.count} | ${v.parity.toFixed(1)}% | ${v.matched.toLocaleString()} | ${v.ref.toLocaleString()} |`);
}
lines.push("");

lines.push("## Parity by year");
lines.push("| Year | Pairs | Parity | Matched | Ref |");
lines.push("|---|---:|---:|---:|---:|");
for (const [k, v] of Object.entries(summary.byYear)) {
  lines.push(`| ${k} | ${v.count} | ${v.parity.toFixed(1)}% | ${v.matched.toLocaleString()} | ${v.ref.toLocaleString()} |`);
}
lines.push("");

lines.push("## Worst 25 pairs");
lines.push("| Pair | Parity | Matched | Ref | Missing | Extras |");
lines.push("|---|---:|---:|---:|---:|---:|");
const ok = results.filter((r) => r.totals);
ok.sort((a, b) => a.parity - b.parity);
for (const r of ok.slice(0, 25)) {
  lines.push(`| ${r.id} | ${r.parity.toFixed(1)}% | ${r.totals.matched} | ${r.totals.ref} | ${r.totals.missing} | ${r.totals.extras} |`);
}
lines.push("");

lines.push("## Aggregate divergence by tool");
lines.push("| Tool | Missing | Extras | Net codec lacks |");
lines.push("|---|---:|---:|---:|");
const allTools = new Set([...Object.keys(aggMissing), ...Object.keys(aggExtras)]);
const rows = [...allTools].map((t) => ({ t, m: aggMissing[t] || 0, e: aggExtras[t] || 0 }));
rows.sort((a, b) => Math.abs(b.m - b.e) + b.m + b.e - (Math.abs(a.m - a.e) + a.m + a.e));
for (const r of rows) {
  lines.push(`| ${r.t} | ${r.m.toLocaleString()} | ${r.e.toLocaleString()} | ${(r.m - r.e).toLocaleString()} |`);
}
fs.writeFileSync(`${OUT_DIR}/y-pairs-baseline.md`, lines.join("\n"));
console.log(`\nOVERALL: ${overallPct.toFixed(2)}% (${totalMatched.toLocaleString()}/${totalRef.toLocaleString()})`);
console.log(`Wrote ${OUT_DIR}/y-pairs-baseline.{json,md}`);
