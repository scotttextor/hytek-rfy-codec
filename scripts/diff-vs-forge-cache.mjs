#!/usr/bin/env node
/**
 * Unified diff harness — walks the Forge cache (every job we've Detailer-rolled)
 * and runs scripts/diff-vs-detailer.mjs against each entry. Aggregates per-plan-type
 * parity + per-tool divergences across the entire cache.
 *
 * Output: scripts/baselines/forge-cache-baseline.{json,md}
 *
 * Usage:
 *   npm run build
 *   node scripts/diff-vs-forge-cache.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const HOME = process.env.USERPROFILE || os.homedir();
// Resolve the cache root the same way forge/cache/store.py does
function resolveCacheRoot() {
  if (process.env.FORGE_CACHE_DIR) return process.env.FORGE_CACHE_DIR;
  // Prefer "OneDrive - <suffix>" over plain "OneDrive"
  const onedrives = fs.readdirSync(HOME)
    .filter((e) => e.startsWith("OneDrive"))
    .sort((a, b) => (a === "OneDrive" ? 1 : 0) - (b === "OneDrive" ? 1 : 0));
  for (const e of onedrives) {
    const c = path.join(HOME, e, "CLAUDE DATA FILE", "detailer-oracle-cache");
    if (fs.existsSync(c)) return c;
  }
  throw new Error("No forge cache found");
}

const CACHE_ROOT = resolveCacheRoot();
const INDEX_PATH = path.join(CACHE_ROOT, "_index.json");
if (!fs.existsSync(INDEX_PATH)) {
  console.error(`No _index.json at ${CACHE_ROOT}`);
  process.exit(1);
}
const idx = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));
const entries = Object.values(idx.entries || {});
console.log(`Forge cache: ${CACHE_ROOT}`);
console.log(`Entries:     ${entries.length}\n`);

const OUT_DIR = "scripts/baselines";
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(`${OUT_DIR}/raw-cache`, { recursive: true });

const results = [];
const aggMissing = {};
const aggExtras = {};
const aggMatched = { byPlanType: {}, byProfile: {} };

for (const e of entries) {
  const xml = e.source_xml_path;
  const rfy = path.join(CACHE_ROOT, e.rfy_path_relative.replace(/\//g, path.sep));
  const id = `${e.jobnum}__${e.plan_name}`;
  if (!xml || !fs.existsSync(xml)) {
    results.push({ id, ok: false, reason: `XML not accessible: ${xml}` });
    console.log(`SKIP ${id} — XML not accessible`);
    continue;
  }
  if (!fs.existsSync(rfy)) {
    results.push({ id, ok: false, reason: `RFY missing in cache: ${rfy}` });
    console.log(`SKIP ${id} — RFY missing`);
    continue;
  }
  const outPrefix = path.join(OUT_DIR, "raw-cache", id);
  process.stdout.write(`DIFF ${id} ... `);
  const t0 = Date.now();
  const r = spawnSync(
    "node",
    ["scripts/diff-vs-detailer.mjs", xml, rfy, outPrefix],
    { encoding: "utf-8", timeout: 120_000 }
  );
  const ms = Date.now() - t0;
  if (r.status !== 0) {
    console.log(`FAIL (${ms}ms): ${r.stderr.slice(-300)}`);
    results.push({ id, ok: false, reason: `diff exit ${r.status}`, stderr: r.stderr.slice(-1000) });
    continue;
  }

  // Diff harness writes <prefix>.json with totals + per-tool breakdown
  const summaryPath = `${outPrefix}.json`;
  if (!fs.existsSync(summaryPath)) {
    console.log(`OK but no summary at ${summaryPath}`);
    results.push({ id, ok: false, reason: "no summary file" });
    continue;
  }
  const s = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));
  const parity = s.totals?.ref ? (s.totals.matched / s.totals.ref) * 100 : 0;
  console.log(`${parity.toFixed(1)}% (${s.totals?.matched}/${s.totals?.ref}, ${ms}ms)`);

  const planType = (e.plan_name.match(/-([A-Z0-9]+)-\d/) || [])[1] || "unknown";
  const profile = (e.plan_name.match(/-(\d+\.\d+)$/) || [])[1] || "unknown";

  results.push({
    id,
    jobnum: e.jobnum,
    plan_name: e.plan_name,
    plan_type: planType,
    profile,
    parity,
    totals: s.totals,
    missing: s.missing || {},
    extras: s.extras || {},
  });

  for (const [k, v] of Object.entries(s.missing || {})) aggMissing[k] = (aggMissing[k] || 0) + v;
  for (const [k, v] of Object.entries(s.extras || {})) aggExtras[k] = (aggExtras[k] || 0) + v;
  aggMatched.byPlanType[planType] = aggMatched.byPlanType[planType] || { ref: 0, matched: 0 };
  aggMatched.byPlanType[planType].ref += s.totals?.ref || 0;
  aggMatched.byPlanType[planType].matched += s.totals?.matched || 0;
  aggMatched.byProfile[profile] = aggMatched.byProfile[profile] || { ref: 0, matched: 0 };
  aggMatched.byProfile[profile].ref += s.totals?.ref || 0;
  aggMatched.byProfile[profile].matched += s.totals?.matched || 0;
}

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
  cache_root: CACHE_ROOT,
  totals: { ref: totalRef, matched: totalMatched, missing: totalMissing, extras: totalExtras, parity: overallPct },
  byPlanType: Object.fromEntries(
    Object.entries(aggMatched.byPlanType).map(([k, v]) => [k, { ...v, parity: v.ref ? (v.matched / v.ref) * 100 : 0 }])
  ),
  byProfile: Object.fromEntries(
    Object.entries(aggMatched.byProfile).map(([k, v]) => [k, { ...v, parity: v.ref ? (v.matched / v.ref) * 100 : 0 }])
  ),
  aggMissing,
  aggExtras,
  perEntry: results,
};
fs.writeFileSync(`${OUT_DIR}/forge-cache-baseline.json`, JSON.stringify(summary, null, 2));

const lines = [];
lines.push("# Forge Cache Baseline — Codec vs Detailer-cached RFYs");
lines.push("");
lines.push(`**Generated:** ${new Date().toISOString()}`);
lines.push(`**Cache:** \`${CACHE_ROOT}\``);
lines.push(`**Entries:** ${entries.length}`);
lines.push("");
lines.push(`## Overall: ${overallPct.toFixed(2)}% matched`);
lines.push(`${totalMatched.toLocaleString()} / ${totalRef.toLocaleString()} ops`);
lines.push(`Missing (Detailer has, codec lacks): ${totalMissing.toLocaleString()}`);
lines.push(`Extras (codec emits, Detailer doesn't): ${totalExtras.toLocaleString()}`);
lines.push("");

lines.push("## Parity by plan type");
lines.push("| Plan | Parity | Matched | Ref |");
lines.push("|---|---:|---:|---:|");
for (const [k, v] of Object.entries(summary.byPlanType).sort((a, b) => b[1].ref - a[1].ref)) {
  lines.push(`| ${k} | ${v.parity.toFixed(1)}% | ${v.matched.toLocaleString()} | ${v.ref.toLocaleString()} |`);
}
lines.push("");

lines.push("## Parity by profile");
lines.push("| Profile | Parity | Matched | Ref |");
lines.push("|---|---:|---:|---:|");
for (const [k, v] of Object.entries(summary.byProfile).sort((a, b) => b[1].ref - a[1].ref)) {
  lines.push(`| ${k} | ${v.parity.toFixed(1)}% | ${v.matched.toLocaleString()} | ${v.ref.toLocaleString()} |`);
}
lines.push("");

lines.push("## Per-entry parity (sorted worst first)");
lines.push("| Entry | Plan-type | Profile | Parity | Matched | Ref | Missing | Extras |");
lines.push("|---|---|---|---:|---:|---:|---:|---:|");
const okResults = results.filter((r) => r.totals);
okResults.sort((a, b) => a.parity - b.parity);
for (const r of okResults) {
  lines.push(
    `| ${r.id} | ${r.plan_type} | ${r.profile} | ${r.parity.toFixed(1)}% | ${r.totals.matched} | ${r.totals.ref} | ${r.totals.missing} | ${r.totals.extras} |`
  );
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

const failedResults = results.filter((r) => !r.ok && r.reason);
if (failedResults.length > 0) {
  lines.push("");
  lines.push("## Skipped / failed entries");
  for (const r of failedResults) {
    lines.push(`- **${r.id}** — ${r.reason}`);
  }
}

fs.writeFileSync(`${OUT_DIR}/forge-cache-baseline.md`, lines.join("\n"));
console.log(`\nwrote ${OUT_DIR}/forge-cache-baseline.{json,md}`);
console.log(`\nOVERALL: ${overallPct.toFixed(2)}% matched (${totalMatched.toLocaleString()}/${totalRef.toLocaleString()})`);
