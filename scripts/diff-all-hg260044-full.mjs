#!/usr/bin/env node
/**
 * FULL variant of diff-all-hg260044.mjs — passes --include-clean to
 * diff-vs-detailer.mjs so byFrame[].sticks[] contains EVERY paired stick,
 * including ones with zero missing/extras (with a `matchedOps` array).
 *
 * See diff-all-hg260001-full.mjs for the rationale. Diagnostic-only.
 *
 * Output: scripts/baselines/full/hg260044/raw/<rfy>.json + baseline.json
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const HOME = os.homedir();
const CANDIDATE_REF_DIRS = [
  `${HOME}/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data/HG260044`,
  "C:/Users/ScottTextor/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data/HG260044",
  "C:/Users/Scott/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data/HG260044",
];
const REF_DIR = CANDIDATE_REF_DIRS.find(p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } });
if (!REF_DIR) {
  console.error("Could not locate HG260044 ref dir. Tried:\n" + CANDIDATE_REF_DIRS.join("\n"));
  process.exit(2);
}
const OUT_DIR = "scripts/baselines/full/hg260044";
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(`${OUT_DIR}/raw`, { recursive: true });

const files = fs.readdirSync(REF_DIR);
const RFY_FILES = files.filter(f => f.endsWith(".rfy"));
const XML_FILES = files.filter(f => f.endsWith(".xml"));

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
  const r = spawnSync("node", ["scripts/diff-vs-detailer.mjs", xmlPath, rfyPath, outPrefix, "--include-clean"], {
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
const summary = { variant: "full", totals: { ref: totalRef, matched: totalMatched, missing: totalMissing, extras: totalExtras, parity: pct }, aggMissing, aggExtras, perPlan: results };
fs.writeFileSync(`${OUT_DIR}/baseline.json`, JSON.stringify(summary, null, 2));
console.log(`\nOVERALL: ${pct.toFixed(2)}% matched (${totalMatched}/${totalRef})`);
