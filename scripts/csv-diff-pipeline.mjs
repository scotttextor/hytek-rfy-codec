#!/usr/bin/env node
/**
 * One-shot CSV diff: input.xml + ref.rfy + ref.csv → 3-way comparison.
 *
 * Runs diff-vs-detailer.mjs to synthesize the codec's RFY, then runs
 * csv-diff-vs-detailer.mjs to produce the line-level CSV gap report.
 *
 * Outputs:
 *   <outPrefix>.txt           op-level RFY diff (from diff-vs-detailer.mjs)
 *   <outPrefix>.json          op-level diff JSON
 *   <outPrefix>.ours.rfy      synthesized RFY bytes
 *   <outPrefix>.csv.json      CSV-level 3-way diff
 *
 * Usage:
 *   node scripts/csv-diff-pipeline.mjs <input.xml> <ref.rfy> <ref.csv> [out-prefix]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const [, , inputXml, refRfy, refCsv, outPrefix = "/tmp/csv-pipeline"] = process.argv;
if (!inputXml || !refRfy || !refCsv) {
  console.error("Usage: node scripts/csv-diff-pipeline.mjs <input.xml> <ref.rfy> <ref.csv> [out-prefix]");
  process.exit(1);
}

console.log("--- Step 1/2: synthesize ours.rfy + op-level diff ---");
const r1 = spawnSync("node", [
  path.join(__dirname, "diff-vs-detailer.mjs"),
  inputXml, refRfy, outPrefix,
], { stdio: ["ignore", "inherit", "inherit"] });
if (r1.status !== 0) process.exit(r1.status ?? 1);

console.log("\n--- Step 2/2: CSV diff (3-way) ---");
const r2 = spawnSync("node", [
  path.join(__dirname, "csv-diff-vs-detailer.mjs"),
  `${outPrefix}.ours.rfy`, refRfy, refCsv, `${outPrefix}.csv`,
], { stdio: ["ignore", "inherit", "inherit"] });
process.exit(r2.status ?? 0);
