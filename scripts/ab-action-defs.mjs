#!/usr/bin/env node
/**
 * A/B test the CODEC_USE_ACTION_DEFS flag against the local HG260044 corpus.
 * For each cohort listed below, run the diff harness twice — once with the
 * flag OFF, once with it ON — and tabulate parity deltas per cohort.
 *
 * Output: scripts/baselines/ab-action-defs/<cohort>-<flag>.json + a summary.
 *
 * Usage:
 *   node scripts/ab-action-defs.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ONEDRIVE = "C:/Users/Scott/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data";

// Cohort fixtures: pick one pair from HG260044 per cohort. Using the
// locally cached XML/RFY pair (Y: drive not available on this machine).
const COHORTS = [
  {
    id: "LBW-70.075",
    cohort: "LBW",
    xml: `${ONEDRIVE}/HG260044/HG260044 LOT 1810 (14) ELDERBERRY ST UPPER CABOOLTURE-GF-LBW-70.075.xml`,
    rfy: `${ONEDRIVE}/HG260044/HG260044#1-1_GF-LBW-70.075.rfy`,
  },
  {
    id: "NLBW-70.075",
    cohort: "NLBW",
    xml: `${ONEDRIVE}/HG260044/HG260044 LOT 1810 (14) ELDERBERRY ST UPPER CABOOLTURE-GF-NLBW-70.075.xml`,
    rfy: `${ONEDRIVE}/HG260044/HG260044#1-1_GF-NLBW-70.075.rfy`,
  },
  {
    id: "NLBW-89.075",
    cohort: "NLBW",
    xml: `${ONEDRIVE}/HG260044/HG260044 LOT 1810 (14) ELDERBERRY ST UPPER CABOOLTURE-GF-NLBW-89.075.xml`,
    rfy: `${ONEDRIVE}/HG260044/HG260044#1-1_GF-NLBW-89.075.rfy`,
  },
  {
    id: "CP-70.075",
    cohort: "CP",
    xml: `${ONEDRIVE}/HG260044/HG260044 LOT 1810 (14) ELDERBERRY ST UPPER CABOOLTURE-GF-CP-70.075.xml`,
    rfy: `${ONEDRIVE}/HG260044/HG260044#1-1_GF-CP-70.075.rfy`,
  },
  {
    id: "TIN-70.075",
    cohort: "TIN",
    xml: `${ONEDRIVE}/HG260044/HG260044 LOT 1810 (14) ELDERBERRY ST UPPER CABOOLTURE-GF-TIN-70.075.xml`,
    rfy: `${ONEDRIVE}/HG260044/HG260044#1-1_GF-TIN-70.075.rfy`,
  },
  {
    id: "TIN-70.095",
    cohort: "TIN",
    xml: `${ONEDRIVE}/HG260044/HG260044 LOT 1810 (14) ELDERBERRY ST UPPER CABOOLTURE-GF-TIN-70.095.xml`,
    rfy: `${ONEDRIVE}/HG260044/HG260044#1-1_GF-TIN-70.095.rfy`,
  },
  {
    id: "TB2B-70.075",
    cohort: "TB2B",
    xml: `${ONEDRIVE}/HG260044/HG260044 LOT 1810 (14) ELDERBERRY ST UPPER CABOOLTURE-GF-TB2B-70.075.xml`,
    rfy: `${ONEDRIVE}/HG260044/HG260044#1-1_PK1-GF-TB2B-70.075.rfy`,
  },
  {
    id: "RP-70.075",
    cohort: "RP",
    xml: `${ONEDRIVE}/HG260044/HG260044 LOT 1810 (14) ELDERBERRY ST UPPER CABOOLTURE-GF-RP-70.075.xml`,
    rfy: `${ONEDRIVE}/HG260044/HG260044#1-1_GF-RP-70.075.rfy`,
  },
];

const OUT_DIR = "scripts/baselines/ab-action-defs";
fs.mkdirSync(OUT_DIR, { recursive: true });

function runDiff(c, flagValue, label) {
  const outPrefix = path.join(OUT_DIR, `${c.id}-${label}`);
  const env = { ...process.env, CODEC_USE_ACTION_DEFS: flagValue };
  const result = spawnSync(
    "node",
    ["scripts/diff-vs-detailer.mjs", c.xml, c.rfy, outPrefix],
    { encoding: "utf8", timeout: 120_000, env }
  );
  if (result.status !== 0) {
    console.error(`  FAILED [${label}] ${c.id} — exit ${result.status}`);
    if (result.stderr) console.error(result.stderr.slice(-500));
    return null;
  }
  const json = JSON.parse(fs.readFileSync(`${outPrefix}.json`, "utf8"));
  return json.totals;
}

const results = [];
for (const c of COHORTS) {
  if (!fs.existsSync(c.xml) || !fs.existsSync(c.rfy)) {
    console.log(`SKIP ${c.id} — missing fixture`);
    continue;
  }
  process.stdout.write(`${c.id.padEnd(16)} OFF... `);
  const offT = runDiff(c, "0", "off");
  if (!offT) { results.push({ ...c, error: "OFF failed" }); continue; }
  const offCov = offT.ref ? (offT.matched / offT.ref) * 100 : 0;
  process.stdout.write(`${offCov.toFixed(1)}%   ON... `);
  const onT = runDiff(c, "1", "on");
  if (!onT) { results.push({ ...c, error: "ON failed", off: offT }); continue; }
  const onCov = onT.ref ? (onT.matched / onT.ref) * 100 : 0;
  const delta = onCov - offCov;
  const sign = delta >= 0 ? "+" : "";
  console.log(`${onCov.toFixed(1)}%   Δ=${sign}${delta.toFixed(2)}pp   miss ${offT.missing}→${onT.missing}  extras ${offT.extras}→${onT.extras}`);
  results.push({
    id: c.id,
    cohort: c.cohort,
    off: offT,
    on: onT,
    offCov,
    onCov,
    delta,
  });
}

// Aggregate by cohort
const byCohort = {};
for (const r of results) {
  if (!r.off || !r.on) continue;
  byCohort[r.cohort] ??= { ref: 0, matchedOff: 0, matchedOn: 0, count: 0 };
  byCohort[r.cohort].ref += r.off.ref;
  byCohort[r.cohort].matchedOff += r.off.matched;
  byCohort[r.cohort].matchedOn += r.on.matched;
  byCohort[r.cohort].count += 1;
}

console.log("");
console.log("=".repeat(80));
console.log("AGGREGATE BY COHORT");
console.log("=".repeat(80));
console.log("Cohort   pairs   ref     OFF        ON         Delta");
console.log("-".repeat(80));
for (const [k, v] of Object.entries(byCohort)) {
  const offPct = v.ref ? (v.matchedOff / v.ref) * 100 : 0;
  const onPct = v.ref ? (v.matchedOn / v.ref) * 100 : 0;
  const delta = onPct - offPct;
  const sign = delta >= 0 ? "+" : "";
  console.log(
    `${k.padEnd(8)} ${String(v.count).padStart(5)}   ${String(v.ref).padStart(5)}   ${offPct.toFixed(2).padStart(7)}%   ${onPct.toFixed(2).padStart(7)}%   ${sign}${delta.toFixed(2)}pp`
  );
}

// Total delta
let totalRef = 0, totalOff = 0, totalOn = 0;
for (const r of results) {
  if (!r.off || !r.on) continue;
  totalRef += r.off.ref;
  totalOff += r.off.matched;
  totalOn += r.on.matched;
}
const totalOffPct = totalRef ? (totalOff / totalRef) * 100 : 0;
const totalOnPct = totalRef ? (totalOn / totalRef) * 100 : 0;
const totalDelta = totalOnPct - totalOffPct;
const sign = totalDelta >= 0 ? "+" : "";
console.log("-".repeat(80));
console.log(
  `TOTAL    ${String(results.length).padStart(5)}   ${String(totalRef).padStart(5)}   ${totalOffPct.toFixed(2).padStart(7)}%   ${totalOnPct.toFixed(2).padStart(7)}%   ${sign}${totalDelta.toFixed(2)}pp`
);

fs.writeFileSync(
  path.join(OUT_DIR, "summary.json"),
  JSON.stringify({ results, byCohort, totals: { ref: totalRef, off: totalOff, on: totalOn, offPct: totalOffPct, onPct: totalOnPct, delta: totalDelta } }, null, 2)
);
console.log(`\nSummary: ${OUT_DIR}/summary.json`);
