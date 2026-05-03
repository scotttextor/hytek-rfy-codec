#!/usr/bin/env node
/**
 * Full-pipeline CSV diff: input.xml → synthesized RFY → CSV
 * compared against Detailer's reference CSV.
 *
 * This is the CSV equivalent of diff-vs-detailer.mjs:
 *   - diff-vs-detailer.mjs    measures op-level RFY parity
 *   - csv-diff-vs-detailer.mjs measures line-level CSV parity
 *
 * The two diffs are complementary:
 *   • RFY diff catches missing/extra/drifted ops
 *   • CSV diff catches missing/extra rows AND wrong column values
 *     (Detailer's CSV has FILLER rows, length precision, dim ordering,
 *     and same-position emission rules that aren't visible in the RFY.)
 *
 * Usage:
 *   1) Run diff-vs-detailer.mjs first to produce <outPrefix>.ours.rfy
 *   2) node scripts/csv-diff-vs-detailer.mjs <ours.rfy> <ref.rfy> <ref.csv> [out-prefix]
 *
 * Or shortcut — run both at once:
 *   node scripts/csv-diff-pipeline.mjs <input.xml> <ref.rfy> <ref.csv>
 */
import fs from "node:fs";
import path from "node:path";
import { decode } from "../dist/decode.js";
import { documentToCsvs } from "../dist/csv.js";

const [, , oursRfyPath, refRfyPath, refCsvPath, outPrefix = "/tmp/csv-diff"] = process.argv;
if (!oursRfyPath || !refRfyPath || !refCsvPath) {
  console.error("Usage: node scripts/csv-diff-vs-detailer.mjs <ours.rfy> <ref.rfy> <ref.csv> [out-prefix]");
  process.exit(1);
}

console.log("Ours RFY :", oursRfyPath);
console.log("Ref RFY  :", refRfyPath);
console.log("Ref CSV  :", refCsvPath);
console.log("");

// ---------------------------------------------------------------------------
// 1. Generate CSVs from both pipelines using the SAME emitter, so the diff
//    isolates rule-generation gaps from CSV-emission gaps.
// ---------------------------------------------------------------------------

const oursDoc = decode(fs.readFileSync(oursRfyPath));
const refDoc = decode(fs.readFileSync(refRfyPath));
const oursCsvs = documentToCsvs(oursDoc);
const refCsvs = documentToCsvs(refDoc);

const planNames = Object.keys(refCsvs);
if (planNames.length === 0) {
  console.error("No plans decoded from reference RFY!");
  process.exit(1);
}
const planName = planNames[0];
const oursCsv = oursCsvs[planName] ?? Object.values(oursCsvs)[0];

// Read the actual Detailer-emitted CSV (ground truth, includes FILLER rows
// and any other CSV-emission quirks the round-trip can't capture).
const actualCsvText = fs.readFileSync(refCsvPath, "utf8").replace(/\r\n/g, "\n");

// ---------------------------------------------------------------------------
// 2. Three-way comparison:
//    A) ours-csv         vs Detailer-emitted  (full-pipeline gap)
//    B) ref-from-rfy-csv vs Detailer-emitted  (CSV-emission gap)
//    C) ours-csv         vs ref-from-rfy-csv  (rule-generation gap)
//    All three use the same documentToCsvs() emitter for ours/ref-from-rfy.
// ---------------------------------------------------------------------------

function parseRows(text) {
  const lines = text.split("\n").filter(l => l.length > 0);
  const components = new Map(); // key=frameId-stickName → array of cells[]
  let detailsCount = 0;
  for (const l of lines) {
    if (l.startsWith("DETAILS")) { detailsCount++; continue; }
    if (!l.startsWith("COMPONENT,")) continue;
    const cells = l.split(",");
    const key = cells[1];
    if (!components.has(key)) components.set(key, []);
    components.get(key).push({ raw: l, cells });
  }
  return { components, detailsCount, totalLines: lines.length };
}

function compareRows(a, b) {
  const allKeys = new Set([...a.components.keys(), ...b.components.keys()]);
  let exact = 0, differ = 0, missing = 0, extra = 0;
  let totalA = 0, totalB = 0;
  const colHist = new Map();
  const samples = { differ: [], missing: [], extra: [] };
  for (const key of allKeys) {
    const aRows = a.components.get(key) ?? [];
    const bRows = b.components.get(key) ?? [];
    totalA += aRows.length;
    totalB += bRows.length;
    const n = Math.max(aRows.length, bRows.length);
    for (let i = 0; i < n; i++) {
      const aRow = aRows[i];
      const bRow = bRows[i];
      if (!aRow) { extra++; if (samples.extra.length < 3) samples.extra.push({ key, raw: bRow.raw }); continue; }
      if (!bRow) { missing++; if (samples.missing.length < 3) samples.missing.push({ key, raw: aRow.raw }); continue; }
      if (aRow.raw === bRow.raw) { exact++; continue; }
      differ++;
      const cd = [];
      const max = Math.max(aRow.cells.length, bRow.cells.length);
      for (let c = 0; c < max; c++) {
        if ((aRow.cells[c] ?? "") !== (bRow.cells[c] ?? "")) {
          cd.push({ col: c, a: aRow.cells[c] ?? "", b: bRow.cells[c] ?? "" });
          colHist.set(c, (colHist.get(c) ?? 0) + 1);
        }
      }
      if (samples.differ.length < 3) samples.differ.push({ key, a: aRow.raw, b: bRow.raw, cd });
    }
  }
  return { exact, differ, missing, extra, totalA, totalB, colHist, samples };
}

const ours = parseRows(oursCsv);
const refFromRfy = parseRows(refCsvs[planName]);
const actual = parseRows(actualCsvText);

function pct(num, den) { return den === 0 ? "n/a" : `${(num / den * 100).toFixed(1)}%`; }

function printResult(label, target, source) {
  const r = compareRows(source, target);
  // r.totalA = source rows, r.totalB = target rows (compareRows takes (a, b))
  const denom = Math.max(1, r.totalB);
  console.log(`${label}`);
  console.log(`  TARGET rows: ${r.totalB}    SOURCE rows: ${r.totalA}`);
  console.log(`  EXACT:   ${r.exact}  (${pct(r.exact, denom)} of target)`);
  console.log(`  DIFFER:  ${r.differ}`);
  console.log(`  MISSING: ${r.missing}  (target has, source doesn't)`);
  console.log(`  EXTRA:   ${r.extra}    (source has, target doesn't)`);
  if (r.colHist.size > 0) {
    const top = [...r.colHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log(`  Top diff cols: ${top.map(([c, n]) => `col-${c}:${n}`).join("  ")}`);
  }
  console.log("");
  return r;
}

console.log(`=== A) ours vs Detailer-emitted (full pipeline) ===`);
const fullA = printResult("", actual, ours);

console.log(`=== B) decoded-ref vs Detailer-emitted (CSV-emission accuracy) ===`);
const fullB = printResult("", actual, refFromRfy);

console.log(`=== C) ours vs decoded-ref (rule-generation accuracy) ===`);
const fullC = printResult("", refFromRfy, ours);

// ---------------------------------------------------------------------------
// 3. Write JSON report + sample-rows file
// ---------------------------------------------------------------------------

fs.writeFileSync(`${outPrefix}.json`, JSON.stringify({
  inputs: { oursRfy: oursRfyPath, refRfy: refRfyPath, refCsv: refCsvPath },
  generated: new Date().toISOString(),
  planName,
  fullPipeline: { exact: fullA.exact, differ: fullA.differ, missing: fullA.missing, extra: fullA.extra,
                  totalActual: actual.totalA, totalOurs: ours.totalA },
  csvEmission: { exact: fullB.exact, differ: fullB.differ, missing: fullB.missing, extra: fullB.extra,
                 totalActual: actual.totalA, totalRefFromRfy: refFromRfy.totalA },
  ruleGeneration: { exact: fullC.exact, differ: fullC.differ, missing: fullC.missing, extra: fullC.extra,
                    totalRefFromRfy: refFromRfy.totalA, totalOurs: ours.totalA },
  detailsHeaders: { ours: ours.detailsCount, actual: actual.detailsCount, refFromRfy: refFromRfy.detailsCount },
  samples: {
    fullPipeline: fullA.samples,
    ruleGeneration: fullC.samples,
  },
}, null, 2));

console.log(`Reports written:`);
console.log(`  ${outPrefix}.json`);
