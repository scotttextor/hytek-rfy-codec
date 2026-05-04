#!/usr/bin/env node
/**
 * Run diff-vs-detailer.mjs against a SUBSET of HG260001 plans (filter by name).
 * Faster iteration than the full 14-plan baseline.
 *
 * Usage:
 *   node scripts/diff-scope.mjs TB2B            # all 7 TB2B plans
 *   node scripts/diff-scope.mjs LBW             # all LBW plans
 *   node scripts/diff-scope.mjs NLBW            # all NLBW plans
 *   node scripts/diff-scope.mjs TIN             # both TIN plans
 *   node scripts/diff-scope.mjs PK1-GF-NLBW     # one specific plan
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PROJ_ROOT = "Y:/(17) 2026 HYTEK PROJECTS/CORAL HOMES/HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI";
const XML_DIR = `${PROJ_ROOT}/03 DETAILING/03 FRAMECAD DETAILER/01 XML OUTPUT`;
const RFY_DIR = `${PROJ_ROOT}/06 MANUFACTURING/04 ROLLFORMER FILES/Split_HG260001`;

const filter = process.argv[2];
if (!filter) { console.error("usage: diff-scope.mjs <substring>"); process.exit(1); }

const RFY_FILES = fs.readdirSync(RFY_DIR).filter(f => f.endsWith(".rfy") && f.toLowerCase().includes(filter.toLowerCase()));
const XML_FILES = fs.readdirSync(XML_DIR).filter(f => f.endsWith(".xml"));

function findXmlFor(rfy) {
  const m = rfy.match(/(GF-[A-Za-z0-9]+-\d+\.\d+)\.rfy$/i);
  if (!m) return null;
  return XML_FILES.find(x => x.endsWith(`${m[1]}.xml`));
}

const OUT_DIR = "scripts/baselines/scope";
fs.mkdirSync(OUT_DIR, { recursive: true });

let totalRef = 0, totalMatched = 0;
const aggMissing = {}, aggExtras = {};

for (const rfy of RFY_FILES) {
  const xmlName = findXmlFor(rfy);
  if (!xmlName) { console.log(`[SKIP] ${rfy}`); continue; }
  const xmlPath = `${XML_DIR}/${xmlName}`;
  const rfyPath = `${RFY_DIR}/${rfy}`;
  const outPrefix = path.resolve(`${OUT_DIR}/${rfy.replace(/\.rfy$/, "")}`);
  const r = spawnSync("node", ["scripts/diff-vs-detailer.mjs", xmlPath, rfyPath, outPrefix], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) { console.log(`[FAIL] ${rfy}`); continue; }
  const j = JSON.parse(fs.readFileSync(`${outPrefix}.json`, "utf8"));
  const t = j.totals;
  totalRef += t.ref; totalMatched += t.matched;
  const tool = s => s.split(/[\s@]/)[0];
  for (const f of j.byFrame || []) for (const s of f.sticks || []) {
    for (const m of s.missing || []) aggMissing[tool(m)] = (aggMissing[tool(m)] || 0) + 1;
    for (const e of s.extras || []) aggExtras[tool(e)] = (aggExtras[tool(e)] || 0) + 1;
  }
  console.log(`  ${(t.matched/t.ref*100).toFixed(1)}%  ${rfy}  matched=${t.matched}/${t.ref}  M=${t.missing}  X=${t.extras}`);
}

const pct = totalRef ? (totalMatched/totalRef*100) : 0;
console.log(`\nSCOPE PARITY: ${pct.toFixed(2)}%  (${totalMatched}/${totalRef})`);
console.log(`\nDivergence by tool:`);
const tools = new Set([...Object.keys(aggMissing), ...Object.keys(aggExtras)]);
for (const t of [...tools].sort((a,b)=>(aggMissing[b]||0)+(aggExtras[b]||0)-(aggMissing[a]||0)-(aggExtras[a]||0))) {
  console.log(`  ${t.padEnd(15)}  miss=${(aggMissing[t]||0).toString().padStart(4)}  extra=${(aggExtras[t]||0).toString().padStart(4)}`);
}
