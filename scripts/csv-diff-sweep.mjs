#!/usr/bin/env node
/**
 * CSV-level diff sweep: runs csv-diff-pipeline.mjs across every paired
 * (xml, rfy, csv) triplet in a folder and produces a summary table.
 *
 * Tracks three coverage metrics per pair:
 *   • Full pipeline % — ours-csv vs Detailer-emitted-csv (what we ship)
 *   • CSV-emission % — ref-from-rfy-csv vs Detailer-emitted-csv (decoder→emit)
 *   • Rule-gen %     — ours-csv vs ref-from-rfy-csv (synthesize→encode→decode)
 *
 * Usage:
 *   node scripts/csv-diff-sweep.mjs [folder]
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FOLDER = process.argv[2] ?? "C:/Users/Scott/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data/HG260044";

const files = fs.readdirSync(FOLDER);

function suffix(name) {
  const m = name.match(/(GF-[A-Z0-9]+(?:-[A-Z0-9]+)?-\d+\.\d+)\.(?:xml|rfy|csv)$/i);
  return m ? m[1] : null;
}

const bySuffix = new Map();
for (const f of files) {
  const s = suffix(f);
  if (!s) continue;
  if (!bySuffix.has(s)) bySuffix.set(s, {});
  const ext = f.toLowerCase().endsWith(".xml") ? "xml" : f.toLowerCase().endsWith(".rfy") ? "rfy" : f.toLowerCase().endsWith(".csv") ? "csv" : null;
  if (ext === "rfy" && f.includes("PK")) continue;  // Skip pack-specific RFYs
  if (ext) bySuffix.get(s)[ext] = path.join(FOLDER, f);
}

const triples = [...bySuffix.entries()].filter(([, v]) => v.xml && v.rfy && v.csv);
console.log(`Folder: ${FOLDER}`);
console.log(`Triples (xml+rfy+csv): ${triples.length}`);
console.log("");

const results = [];
for (const [suf, paths] of triples) {
  process.stdout.write(`Diffing ${suf}... `);
  const outPrefix = `/tmp/csv-sweep-${suf.replace(/[^A-Za-z0-9-]/g, "_")}`;
  const r = spawnSync("node", [
    path.join(__dirname, "csv-diff-pipeline.mjs"),
    paths.xml, paths.rfy, paths.csv, outPrefix,
  ], { encoding: "utf8" });
  if (r.status !== 0) {
    console.log("FAILED");
    console.error(r.stderr?.slice(0, 500));
    continue;
  }
  // Read the csv.json file
  const csvJsonPath = `${outPrefix}.csv.json`;
  if (!fs.existsSync(csvJsonPath)) {
    console.log("MISSING JSON");
    continue;
  }
  const cj = JSON.parse(fs.readFileSync(csvJsonPath, "utf8"));
  const fp = cj.fullPipeline, ce = cj.csvEmission, rg = cj.ruleGeneration;
  const fullPct = fp.totalTarget ? (fp.exact / fp.totalTarget * 100) : 0;
  const emitPct = ce.totalTarget ? (ce.exact / ce.totalTarget * 100) : 0;
  const rulePct = rg.totalTarget ? (rg.exact / rg.totalTarget * 100) : 0;
  results.push({
    profile: suf,
    fpExact: fp.exact, fpTotal: fp.totalTarget, fullPct,
    ceExact: ce.exact, ceTotal: ce.totalTarget, emitPct,
    rgExact: rg.exact, rgTotal: rg.totalTarget, rulePct,
    fpMissing: fp.missing, fpExtra: fp.extra,
  });
  console.log(`full ${fullPct.toFixed(1)}%  emit ${emitPct.toFixed(1)}%  rule ${rulePct.toFixed(1)}%`);
}

console.log("");
console.log("=".repeat(95));
console.log("CSV DIFF SUMMARY");
console.log("=".repeat(95));
console.log("Profile                          FullPipe%  EmitOnly%   RuleGen%   Missing  Extra");
console.log("-".repeat(95));
for (const r of results) {
  console.log(
    `${r.profile.padEnd(33)}  ${(r.fullPct.toFixed(1) + "%").padStart(8)}   ${(r.emitPct.toFixed(1) + "%").padStart(8)}   ${(r.rulePct.toFixed(1) + "%").padStart(8)}   ${String(r.fpMissing).padStart(6)}  ${String(r.fpExtra).padStart(5)}`
  );
}
console.log("-".repeat(95));
const sum = (k) => results.reduce((s, r) => s + r[k], 0);
const totFp = sum("fpExact"), totFpDen = sum("fpTotal");
const totCe = sum("ceExact"), totCeDen = sum("ceTotal");
const totRg = sum("rgExact"), totRgDen = sum("rgTotal");
console.log(
  `${"TOTAL".padEnd(33)}  ${((totFp/Math.max(1,totFpDen)*100).toFixed(1) + "%").padStart(8)}   ${((totCe/Math.max(1,totCeDen)*100).toFixed(1) + "%").padStart(8)}   ${((totRg/Math.max(1,totRgDen)*100).toFixed(1) + "%").padStart(8)}   ${String(sum("fpMissing")).padStart(6)}  ${String(sum("fpExtra")).padStart(5)}`
);
