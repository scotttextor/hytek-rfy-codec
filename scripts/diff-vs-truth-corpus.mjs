#!/usr/bin/env node
/**
 * Per-stick parity harness using the cached truth-corpus.jsonl.
 *
 * The truth corpus has 66,262 sticks across 381 pairs, each with the
 * Detailer-emitted reference tooling list. This harness runs the codec's
 * per-stick rules engine against each stick and computes (matched, missing,
 * extras) parity vs. the Detailer reference.
 *
 * IMPORTANT LIMITATION: this harness only measures the per-stick rules
 * engine, NOT frame-context crossings, NOT the TB2B/RP/wall-service
 * simplifiers. For tracking incremental rule-table changes (which is what
 * the DT-miner findings target), this is the right level — every fix's
 * delta is observable here without the noise of unrelated systems.
 *
 * Aggregate parity here will be LOWER than the full codec parity (since
 * frame-context Web/LipNotch crossings on plates are missing). What matters
 * is the DELTA between successive rule-table edits.
 *
 * Usage:
 *   node scripts/diff-vs-truth-corpus.mjs [--out FILE] [--limit N]
 *
 * Output:
 *   scripts/baselines/truth-corpus-parity.json   per-pair detail
 *   scripts/baselines/truth-corpus-parity.md     human readable summary
 */
import fs from "node:fs";
import path from "node:path";
import { generateTooling } from "../dist/rules/index.js";

const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
}
const CORPUS = flag("--corpus", "scripts/truth-corpus.jsonl");
const OUT = flag("--out", "scripts/baselines/truth-corpus-parity");
const LIMIT = parseInt(flag("--limit", "0"), 10) || Infinity;

const POS_TOLERANCE_MM = 1.5;
function opKey(op) {
  if (op.kind === "spanned") return `${op.type}@span`;
  if (op.kind === "point") return `${op.type}@pt`;
  if (op.kind === "start") return `${op.type}@start`;
  if (op.kind === "end") return `${op.type}@end`;
  return "?";
}
function opPos(op) {
  if (op.kind === "spanned") return op.startPos;
  if (op.kind === "point") return op.pos;
  if (op.kind === "start") return -1;
  if (op.kind === "end") return Number.POSITIVE_INFINITY;
  return 0;
}

function matchOps(ours, ref) {
  const refUsed = new Set();
  let matched = 0, extras = 0;
  for (const o of ours) {
    const candidates = ref
      .map((r, i) => ({ r, i }))
      .filter(({ r, i }) => !refUsed.has(i) && opKey(r) === opKey(o));
    if (candidates.length === 0) { extras++; continue; }
    if (o.kind === "start" || o.kind === "end") {
      matched++; refUsed.add(candidates[0].i); continue;
    }
    const dist = (r) => Math.abs(opPos(r) - opPos(o));
    candidates.sort((x, y) => dist(x.r) - dist(y.r));
    if (dist(candidates[0].r) <= POS_TOLERANCE_MM) {
      matched++; refUsed.add(candidates[0].i);
    } else {
      extras++;
    }
  }
  const missing = ref.length - refUsed.size;
  return { matched, missing, extras };
}

function angleFromVerticalDeg(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const horiz = Math.hypot(dx, dy);
  return Math.atan2(horiz, Math.abs(dz)) * 180 / Math.PI;
}

const t0 = Date.now();
let total = 0, matched = 0, missing = 0, extras = 0, sticks = 0, withRule = 0;
const byPlanType = {};
const byProfile = {};
const byRolePlan = {};

const stream = fs.readFileSync(CORPUS, "utf-8").split("\n");
for (const line of stream) {
  if (!line.trim()) continue;
  if (sticks >= LIMIT) break;
  const r = JSON.parse(line);
  sticks++;

  // Profile family — strip gauge suffix.
  const profileFamily = r.stick_profile?.split("_")[0] ?? "70S41";
  const gauge = r.stick_profile?.split("_")[1] ?? "0.75";

  const ctx = {
    role: r.role,
    length: r.length_mm,
    profileFamily,
    gauge,
    flipped: false,
    planName: r.plan_name,
    frameName: r.frame_name,
    usage: r.usage,
    stickName: r.stick_name,
    angleFromVertical: angleFromVerticalDeg(r.start3D, r.end3D),
    framePairedHeader: undefined,  // not captured in truth corpus
  };

  let ourOps = [];
  try {
    ourOps = generateTooling(ctx);
    if (ourOps.length > 0) withRule++;
  } catch (e) {
    // skip on rule engine error
  }
  const refOps = r.tooling || [];
  const m = matchOps(ourOps, refOps);
  total += refOps.length;
  matched += m.matched;
  missing += m.missing;
  extras += m.extras;

  for (const [bucket, key] of [
    [byPlanType, r.plan_type],
    [byProfile, r.profile],
    [byRolePlan, `${r.plan_type}/${r.role}`],
  ]) {
    bucket[key] = bucket[key] || { ref: 0, matched: 0, missing: 0, extras: 0, sticks: 0 };
    bucket[key].ref += refOps.length;
    bucket[key].matched += m.matched;
    bucket[key].missing += m.missing;
    bucket[key].extras += m.extras;
    bucket[key].sticks++;
  }
}
const t1 = Date.now();

const parity = total ? (matched / total) * 100 : 0;
const summary = {
  generated_at: new Date().toISOString(),
  corpus: CORPUS,
  sticks,
  withRuleHit: withRule,
  elapsed_sec: (t1 - t0) / 1000,
  totals: { ref: total, matched, missing, extras, parity },
  byPlanType: Object.fromEntries(Object.entries(byPlanType).map(([k, v]) => [k, { ...v, parity: v.ref ? (v.matched / v.ref) * 100 : 0 }])),
  byProfile: Object.fromEntries(Object.entries(byProfile).map(([k, v]) => [k, { ...v, parity: v.ref ? (v.matched / v.ref) * 100 : 0 }])),
  byRolePlan: Object.fromEntries(Object.entries(byRolePlan).map(([k, v]) => [k, { ...v, parity: v.ref ? (v.matched / v.ref) * 100 : 0 }])),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(`${OUT}.json`, JSON.stringify(summary, null, 2));

const lines = [];
lines.push("# Truth-corpus per-stick parity (rules engine only)");
lines.push("");
lines.push(`**Generated:** ${new Date().toISOString()}`);
lines.push(`**Corpus:** ${CORPUS}`);
lines.push(`**Sticks:** ${sticks.toLocaleString()} (${withRule.toLocaleString()} hit a rule group)`);
lines.push(`**Elapsed:** ${((t1 - t0) / 1000).toFixed(1)}s`);
lines.push("");
lines.push(`## Overall: **${parity.toFixed(2)}%** of ref ops matched`);
lines.push(`${matched.toLocaleString()} matched / ${total.toLocaleString()} ref`);
lines.push(`Missing: ${missing.toLocaleString()} | Extras: ${extras.toLocaleString()}`);
lines.push("");
lines.push("## Parity by plan type");
lines.push("| Plan | Sticks | Parity | Matched | Ref | Missing | Extras |");
lines.push("|---|---:|---:|---:|---:|---:|---:|");
for (const [k, v] of Object.entries(summary.byPlanType).sort((a, b) => b[1].ref - a[1].ref)) {
  lines.push(`| ${k} | ${v.sticks.toLocaleString()} | ${v.parity.toFixed(2)}% | ${v.matched.toLocaleString()} | ${v.ref.toLocaleString()} | ${v.missing.toLocaleString()} | ${v.extras.toLocaleString()} |`);
}
lines.push("");
lines.push("## Parity by profile");
lines.push("| Profile | Sticks | Parity | Matched | Ref |");
lines.push("|---|---:|---:|---:|---:|");
for (const [k, v] of Object.entries(summary.byProfile).sort((a, b) => b[1].ref - a[1].ref)) {
  lines.push(`| ${k} | ${v.sticks.toLocaleString()} | ${v.parity.toFixed(2)}% | ${v.matched.toLocaleString()} | ${v.ref.toLocaleString()} |`);
}
lines.push("");
lines.push("## Parity by (plan, role) — top 30 by ref count");
lines.push("| Plan/Role | Sticks | Parity | Matched | Ref | Missing | Extras |");
lines.push("|---|---:|---:|---:|---:|---:|---:|");
const rolePlans = Object.entries(summary.byRolePlan).sort((a, b) => b[1].ref - a[1].ref).slice(0, 30);
for (const [k, v] of rolePlans) {
  lines.push(`| ${k} | ${v.sticks.toLocaleString()} | ${v.parity.toFixed(2)}% | ${v.matched.toLocaleString()} | ${v.ref.toLocaleString()} | ${v.missing.toLocaleString()} | ${v.extras.toLocaleString()} |`);
}
lines.push("");
fs.writeFileSync(`${OUT}.md`, lines.join("\n"));
console.log(`OVERALL: ${parity.toFixed(2)}% (${matched}/${total})`);
console.log(`Wrote ${OUT}.{json,md}`);
