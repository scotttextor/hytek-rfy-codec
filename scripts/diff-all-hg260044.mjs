#!/usr/bin/env node
/**
 * Run diff-vs-detailer.mjs against every HG260044 plan and produce a unified
 * baseline report. Reference data lives in OneDrive (not Y: drive).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REF_DIR = "C:/Users/ScottTextor/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data/HG260044";
const OUT_DIR = "scripts/baselines/hg260044";
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(`${OUT_DIR}/raw`, { recursive: true });

const files = fs.readdirSync(REF_DIR);
const RFY_FILES = files.filter(f => f.endsWith(".rfy"));
const XML_FILES = files.filter(f => f.endsWith(".xml"));

// Map: each RFY filename like "HG260044#1-1_GF-NLBW-70.075.rfy"
// matches an XML by trailing suffix "GF-NLBW-70.075"
function suffix(name) {
  const m = name.match(/(GF-[A-Za-z0-9]+-\d+\.\d+)\.(?:rfy|xml)$/i);
  return m ? m[1] : null;
}
const xmlBySuffix = new Map();
for (const xml of XML_FILES) {
  const s = suffix(xml);
  if (s) xmlBySuffix.set(s, `${REF_DIR}/${xml}`);
}

const results = [];
for (const rfy of RFY_FILES) {
  const suf = suffix(rfy);
  const xmlPath = xmlBySuffix.get(suf);
  if (!xmlPath) {
    console.log(`[SKIP] ${rfy} — no matching XML for ${suf}`);
    results.push({ rfy, skipped: true });
    continue;
  }
  const rfyPath = `${REF_DIR}/${rfy}`;
  const outPrefix = path.resolve(`${OUT_DIR}/raw/${rfy.replace(/\.rfy$/, "")}`);
  console.log(`[RUN] ${rfy}`);
  const r = spawnSync("node", ["scripts/diff-vs-detailer.mjs", xmlPath, rfyPath, outPrefix], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    const err = r.stderr.split("\n").slice(-3).join("\n").trim();
    console.log(`  FAIL: ${err}`);
    results.push({ rfy, error: err });
    continue;
  }
  const json = JSON.parse(fs.readFileSync(`${outPrefix}.json`, "utf8"));
  const t = json.totals;
  const pct = t.ref ? (t.matched / t.ref) * 100 : 0;
  const missing = {}, extras = {};
  const toolOf = s => s.split(/[\s@]/)[0];
  for (const f of json.byFrame || []) for (const s of f.sticks || []) {
    for (const m of s.missing || []) missing[toolOf(m)] = (missing[toolOf(m)] || 0) + 1;
    for (const e of s.extras || []) extras[toolOf(e)] = (extras[toolOf(e)] || 0) + 1;
  }
  results.push({ rfy, totals: t, parity: pct, missing, extras });
  console.log(`  ${pct.toFixed(1)}%  matched=${t.matched}/${t.ref}  missing=${t.missing}  extras=${t.extras}`);
}

const aggMissing = {}, aggExtras = {};
let totalRef = 0, totalMatched = 0, totalMissing = 0, totalExtras = 0;
for (const r of results) {
  if (!r.totals) continue;
  totalRef += r.totals.ref; totalMatched += r.totals.matched;
  totalMissing += r.totals.missing; totalExtras += r.totals.extras;
  for (const [k, v] of Object.entries(r.missing || {})) aggMissing[k] = (aggMissing[k] || 0) + v;
  for (const [k, v] of Object.entries(r.extras || {})) aggExtras[k] = (aggExtras[k] || 0) + v;
}
const pct = totalRef ? (totalMatched / totalRef) * 100 : 0;
const summary = { totals: { ref: totalRef, matched: totalMatched, missing: totalMissing, extras: totalExtras, parity: pct }, aggMissing, aggExtras, perPlan: results };
fs.writeFileSync(`${OUT_DIR}/baseline.json`, JSON.stringify(summary, null, 2));
console.log(`\nOVERALL: ${pct.toFixed(2)}% matched (${totalMatched}/${totalRef})`);
