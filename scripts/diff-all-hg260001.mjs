#!/usr/bin/env node
/**
 * Run diff-vs-detailer.mjs against every HG260001 plan and produce a unified
 * baseline report:
 *   - per-plan parity %
 *   - per-rule divergence counts (missing/extras) aggregated across all plans
 *   - worst sticks list
 *
 * Output: scripts/baselines/hg260001-baseline.json + .md
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PROJ_ROOT = "Y:/(17) 2026 HYTEK PROJECTS/CORAL HOMES/HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI";
const XML_DIR = `${PROJ_ROOT}/03 DETAILING/03 FRAMECAD DETAILER/01 XML OUTPUT`;
const RFY_DIR = `${PROJ_ROOT}/06 MANUFACTURING/04 ROLLFORMER FILES/Split_HG260001`;
const OUT_DIR = "scripts/baselines";
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(`${OUT_DIR}/raw`, { recursive: true });

// Map each per-plan RFY to the per-frame-type XML it uses.
//   PK1-GF-NLBW-70.075.rfy  ←  GF-NLBW-70.075.xml
//   PK10-GF-TB2B-70.075.rfy ←  GF-TB2B-70.075.xml
const RFY_FILES = fs.readdirSync(RFY_DIR).filter(f => f.endsWith(".rfy"));

// Find the matching XML by frame-type-and-profile suffix
const XML_FILES = fs.readdirSync(XML_DIR).filter(f => f.endsWith(".xml"));

function findXmlFor(rfy) {
  // RFY: HG260001_PK1-GF-NLBW-70.075.rfy → suffix "GF-NLBW-70.075"
  // RFY: HG260001_GF-TIN-70.075.rfy     → suffix "GF-TIN-70.075"
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
  const r = spawnSync("node", ["scripts/diff-vs-detailer.mjs", xmlPath, rfyPath, outPrefix], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.log(`  FAIL: ${r.stderr.split("\n").slice(-5).join("\n")}`);
    results.push({ rfy, error: r.stderr.split("\n").slice(-5).join("\n") });
    continue;
  }
  const json = JSON.parse(fs.readFileSync(`${outPrefix}.json`, "utf8"));
  const t = json.totals;
  const pct = t.ref ? (t.matched / t.ref) * 100 : 0;
  // Per-tool divergence
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

// Summarize: per-rule aggregates
const aggMissing = {}, aggExtras = {};
let totalRef = 0, totalMatched = 0, totalMissing = 0, totalExtras = 0;
for (const r of results) {
  if (!r.totals) continue;
  totalRef += r.totals.ref;
  totalMatched += r.totals.matched;
  totalMissing += r.totals.missing;
  totalExtras += r.totals.extras;
  for (const [k, v] of Object.entries(r.missing || {})) aggMissing[k] = (aggMissing[k] || 0) + v;
  for (const [k, v] of Object.entries(r.extras || {})) aggExtras[k] = (aggExtras[k] || 0) + v;
}
const overallPct = totalRef ? (totalMatched / totalRef) * 100 : 0;

const summary = { totals: { ref: totalRef, matched: totalMatched, missing: totalMissing, extras: totalExtras, parity: overallPct }, aggMissing, aggExtras, perPlan: results };
fs.writeFileSync(`${OUT_DIR}/hg260001-baseline.json`, JSON.stringify(summary, null, 2));

const lines = [];
lines.push("# HG260001 Baseline — Per-Plan Op-Level Diff vs Detailer");
lines.push("");
lines.push(`**Overall: ${overallPct.toFixed(2)}% matched** (${totalMatched}/${totalRef} ops)`);
lines.push(`Missing: ${totalMissing} (Detailer has, we lack) | Extras: ${totalExtras} (we emit, Detailer doesn't)`);
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

fs.writeFileSync(`${OUT_DIR}/hg260001-baseline.md`, lines.join("\n"));
console.log(`\nwrote ${OUT_DIR}/hg260001-baseline.{json,md}`);
console.log(`\nOVERALL: ${overallPct.toFixed(2)}% matched (${totalMatched}/${totalRef})`);
