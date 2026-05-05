#!/usr/bin/env node
/**
 * FULL variant of diff-all-hg260023.mjs — passes --include-clean to
 * diff-vs-detailer.mjs so byFrame[].sticks[] contains EVERY paired stick,
 * including ones with zero missing/extras (with a `matchedOps` array).
 *
 * See diff-all-hg260001-full.mjs for the rationale. Diagnostic-only.
 *
 * Output: scripts/baselines/full/hg260023/raw/<rfy>.json + baseline.json + .md
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PROJ_ROOT = "Y:/(17) 2026 HYTEK PROJECTS/CORAL HOMES/HG260023 LOT 1165 (69) ATTENBOROUGH DRIVE BANYA";
const XML_DIR = `${PROJ_ROOT}/03 DETAILING/03 FRAMECAD DETAILER/01 XML OUTPUT`;
const RFY_DIR = `${PROJ_ROOT}/06 MANUFACTURING/04 ROLLFORMER FILES/Split_HG260023`;
const OUT_DIR = "scripts/baselines/full/hg260023";

function ensureDir(p, label) {
  try {
    if (!fs.statSync(p).isDirectory()) throw new Error("not a directory");
  } catch (e) {
    console.error(`ERROR: ${label} not reachable: ${p}`);
    console.error(`  (${e.message})`);
    console.error(`  Y: drive may be disconnected. Reconnect and retry.`);
    process.exit(2);
  }
}
ensureDir(XML_DIR, "XML_DIR");
ensureDir(RFY_DIR, "RFY_DIR");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(`${OUT_DIR}/raw`, { recursive: true });

const RFY_FILES = fs.readdirSync(RFY_DIR).filter(f => f.endsWith(".rfy"));
const XML_FILES = fs.readdirSync(XML_DIR).filter(f => f.endsWith(".xml"));

function findXmlFor(rfy) {
  const m = rfy.match(/(GF-[A-Za-z0-9]+-\d+\.\d+)\.rfy$/i);
  if (!m) return null;
  const suffix = m[1];
  const xml = XML_FILES.find(x => x.endsWith(`${suffix}.xml`));
  return xml ? `${XML_DIR}/${xml}` : null;
}

const results = [];
for (const rfy of RFY_FILES) {
  const rfyPath = `${RFY_DIR}/${rfy}`;
  const xmlPath = findXmlFor(rfy);
  if (!xmlPath) {
    console.log(`[SKIP] ${rfy} — no matching XML`);
    results.push({ rfy, skipped: true, reason: "no XML" });
    continue;
  }
  const outPrefix = path.resolve(`${OUT_DIR}/raw/${rfy.replace(/\.rfy$/, "")}`);
  console.log(`[RUN] ${rfy}`);
  const r = spawnSync("node", ["scripts/diff-vs-detailer.mjs", xmlPath, rfyPath, outPrefix, "--include-clean"], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    const err = r.stderr.split("\n").slice(-5).join("\n").trim();
    console.log(`  FAIL: ${err}`);
    results.push({ rfy, error: err });
    continue;
  }
  const json = JSON.parse(fs.readFileSync(`${outPrefix}.json`, "utf8"));
  const t = json.totals;
  const pct = t.ref ? (t.matched / t.ref) * 100 : 0;
  const missing = {}, extras = {};
  const toolOf = s => s.split(/[\s@]/)[0];
  for (const f of json.byFrame || []) {
    for (const s of f.sticks || []) {
      for (const m of s.missing || []) missing[toolOf(m)] = (missing[toolOf(m)] || 0) + 1;
      for (const e of s.extras || []) extras[toolOf(e)] = (extras[toolOf(e)] || 0) + 1;
    }
  }
  results.push({ rfy, xml: path.basename(xmlPath), totals: t, parity: pct, missing, extras });
  console.log(`  ${pct.toFixed(1)}%  matched=${t.matched}/${t.ref}  missing=${t.missing}  extras=${t.extras}`);
}

function frameTypeOf(rfy) {
  const m = rfy.match(/GF-([A-Za-z0-9]+)-\d+\.\d+\.rfy$/i);
  return m ? m[1].toUpperCase() : "?";
}
const aggMissing = {}, aggExtras = {};
const byFrameType = {};
let totalRef = 0, totalMatched = 0, totalMissing = 0, totalExtras = 0;
for (const r of results) {
  if (!r.totals) continue;
  totalRef += r.totals.ref;
  totalMatched += r.totals.matched;
  totalMissing += r.totals.missing;
  totalExtras += r.totals.extras;
  for (const [k, v] of Object.entries(r.missing || {})) aggMissing[k] = (aggMissing[k] || 0) + v;
  for (const [k, v] of Object.entries(r.extras || {})) aggExtras[k] = (aggExtras[k] || 0) + v;
  const ft = frameTypeOf(r.rfy);
  if (!byFrameType[ft]) byFrameType[ft] = { ref: 0, matched: 0, missing: 0, extras: 0, plans: 0 };
  byFrameType[ft].ref += r.totals.ref;
  byFrameType[ft].matched += r.totals.matched;
  byFrameType[ft].missing += r.totals.missing;
  byFrameType[ft].extras += r.totals.extras;
  byFrameType[ft].plans += 1;
}
const overallPct = totalRef ? (totalMatched / totalRef) * 100 : 0;

const summary = {
  variant: "full",
  totals: { ref: totalRef, matched: totalMatched, missing: totalMissing, extras: totalExtras, parity: overallPct },
  byFrameType: Object.fromEntries(
    Object.entries(byFrameType).map(([ft, t]) => [ft, { ...t, parity: t.ref ? (t.matched / t.ref) * 100 : 0 }])
  ),
  aggMissing, aggExtras,
  perPlan: results,
};
fs.writeFileSync(`${OUT_DIR}/baseline.json`, JSON.stringify(summary, null, 2));

const lines = [];
lines.push("# HG260023 FULL Baseline — Per-Plan Op-Level Diff vs Detailer (incl. clean sticks)");
lines.push("");
lines.push(`**Overall: ${overallPct.toFixed(2)}% matched** (${totalMatched}/${totalRef} ops)`);
lines.push(`Missing: ${totalMissing} | Extras: ${totalExtras}`);
lines.push("");
lines.push("> Per-plan `raw/*.json` files include ALL paired sticks (matched + gappy). Diff against");
lines.push("> these when evaluating rule changes; the gap-only `scripts/baselines/hg260023/raw/`");
lines.push("> baseline hides the cleanly-matched cohort that a rule change might break.");
lines.push("");
lines.push(`## Per-frame-type parity (${results.filter(r => r.totals).length} plans grouped)`);
lines.push("| Frame type | Plans | Parity | Matched | Ref | Missing | Extras |");
lines.push("|---|---:|---:|---:|---:|---:|---:|");
for (const [ft, t] of Object.entries(summary.byFrameType).sort((a, b) => b[1].parity - a[1].parity)) {
  lines.push(`| ${ft} | ${t.plans} | ${t.parity.toFixed(1)}% | ${t.matched} | ${t.ref} | ${t.missing} | ${t.extras} |`);
}
lines.push("");
lines.push("## Per-plan parity");
lines.push("| RFY | Parity | Matched | Ref | Missing | Extras |");
lines.push("|---|---:|---:|---:|---:|---:|");
for (const r of results) {
  if (!r.totals) { lines.push(`| ${r.rfy} | — | — | — | — | — |`); continue; }
  lines.push(`| ${r.rfy} | ${r.parity.toFixed(1)}% | ${r.totals.matched} | ${r.totals.ref} | ${r.totals.missing} | ${r.totals.extras} |`);
}
lines.push("");
lines.push("## Aggregate divergence by tool");
lines.push("| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |");
lines.push("|---|---:|---:|---:|");
const allTools = new Set([...Object.keys(aggMissing), ...Object.keys(aggExtras)]);
const rows = [...allTools].map(t => ({ t, m: aggMissing[t] || 0, e: aggExtras[t] || 0 }));
rows.sort((a, b) => Math.abs(b.m - b.e) + b.m + b.e - (Math.abs(a.m - a.e) + a.m + a.e));
for (const r of rows) lines.push(`| ${r.t} | ${r.m} | ${r.e} | ${r.m - r.e} |`);

fs.writeFileSync(`${OUT_DIR}/baseline.md`, lines.join("\n"));
console.log(`\nwrote ${OUT_DIR}/baseline.{json,md}`);
console.log(`\nOVERALL: ${overallPct.toFixed(2)}% matched (${totalMatched}/${totalRef})`);
