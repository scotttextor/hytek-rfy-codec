#!/usr/bin/env node
/**
 * Round-trip CSV diff: decode reference .rfy with our codec, emit CSV via
 * documentToCsvs, then compare against Detailer's reference .csv line-by-line.
 *
 * Isolates CSV-emission bugs (column ordering, DETAILS headers, formatting,
 * profile codes, role labels) from rule-generation bugs.
 *
 * If round-trip is 100%, then any gap in `csv-diff-vs-detailer.mjs`
 * (full pipeline) is in the rule generation, not the CSV layer.
 *
 * Usage:
 *   node scripts/csv-diff-roundtrip.mjs <reference.rfy> <reference.csv>
 */
import fs from "node:fs";
import path from "node:path";
import { decode } from "../dist/decode.js";
import { documentToCsvs } from "../dist/csv.js";

const [, , refRfyPath, refCsvPath] = process.argv;
if (!refRfyPath || !refCsvPath) {
  console.error("Usage: node scripts/csv-diff-roundtrip.mjs <reference.rfy> <reference.csv>");
  process.exit(1);
}

const rfyBytes = fs.readFileSync(refRfyPath);
const refDoc = decode(rfyBytes);
const ourCsvs = documentToCsvs(refDoc);

// Detailer emits one CSV per .rfy file. Pick the first plan's CSV.
const planNames = Object.keys(ourCsvs);
if (planNames.length === 0) {
  console.error("No plans decoded from RFY!");
  process.exit(1);
}
const ourCsv = ourCsvs[planNames[0]];

const refCsvText = fs.readFileSync(refCsvPath, "utf8").replace(/\r\n/g, "\n");
const ourCsvText = ourCsv.replace(/\r\n/g, "\n");

const refLines = refCsvText.split("\n").filter(l => l.length > 0);
const ourLines = ourCsvText.split("\n").filter(l => l.length > 0);

console.log(`Reference: ${path.basename(refCsvPath)}`);
console.log(`  ${refLines.length} non-empty lines`);
console.log(`Ours (round-trip from .rfy): ${planNames[0]}`);
console.log(`  ${ourLines.length} non-empty lines`);
console.log("");

// Count line-by-line equality
let exact = 0;
let differ = 0;
let onlyRef = 0;
let onlyOurs = 0;

// Index reference COMPONENT lines by frameId-stick (col 1 of COMPONENT,...)
function parseLine(line) {
  const cells = line.split(",");
  return { kind: cells[0], cells, raw: line };
}

const refByKey = new Map();
const refDetailsCount = refLines.filter(l => l.startsWith("DETAILS")).length;
const ourDetailsCount = ourLines.filter(l => l.startsWith("DETAILS")).length;

for (const l of refLines) {
  const p = parseLine(l);
  if (p.kind === "COMPONENT") {
    const key = p.cells[1]; // frameId-stickName
    if (!refByKey.has(key)) refByKey.set(key, []);
    refByKey.get(key).push(p);
  }
}

const ourByKey = new Map();
for (const l of ourLines) {
  const p = parseLine(l);
  if (p.kind === "COMPONENT") {
    const key = p.cells[1];
    if (!ourByKey.has(key)) ourByKey.set(key, []);
    ourByKey.get(key).push(p);
  }
}

// Compare each key
const allKeys = new Set([...refByKey.keys(), ...ourByKey.keys()]);
const diffs = [];
let totalRefRows = 0;
let totalOurRows = 0;
let exactRows = 0;
let differRows = 0;
let missingRows = 0;
let extraRows = 0;

for (const key of allKeys) {
  const refRows = refByKey.get(key) ?? [];
  const ourRows = ourByKey.get(key) ?? [];
  totalRefRows += refRows.length;
  totalOurRows += ourRows.length;
  const n = Math.max(refRows.length, ourRows.length);
  for (let i = 0; i < n; i++) {
    const refRow = refRows[i];
    const ourRow = ourRows[i];
    if (!refRow) { extraRows++; diffs.push({ key, kind: "EXTRA", ours: ourRow.raw }); continue; }
    if (!ourRow) { missingRows++; diffs.push({ key, kind: "MISSING", ref: refRow.raw }); continue; }
    if (refRow.raw === ourRow.raw) { exactRows++; continue; }
    differRows++;
    // Per-column diff
    const colDiffs = [];
    const max = Math.max(refRow.cells.length, ourRow.cells.length);
    for (let c = 0; c < max; c++) {
      const a = ourRow.cells[c] ?? "";
      const b = refRow.cells[c] ?? "";
      if (a !== b) colDiffs.push({ col: c, ours: a, ref: b });
    }
    diffs.push({ key, kind: "DIFFER", colDiffs, ref: refRow.raw, ours: ourRow.raw });
  }
}

console.log(`COMPONENT rows: ours ${totalOurRows} | ref ${totalRefRows}`);
console.log(`  EXACT:   ${exactRows}  (${(exactRows / Math.max(1, totalRefRows) * 100).toFixed(1)}% of ref)`);
console.log(`  DIFFER:  ${differRows}`);
console.log(`  MISSING: ${missingRows}  (rows ref has, we don't)`);
console.log(`  EXTRA:   ${extraRows}    (rows we have, ref doesn't)`);
console.log("");
console.log(`DETAILS headers: ours ${ourDetailsCount} | ref ${refDetailsCount}`);
console.log("");

// Categorise differing rows by which column they differ in
const colHistogram = new Map();
for (const d of diffs) {
  if (d.kind !== "DIFFER") continue;
  for (const cd of d.colDiffs) {
    if (!colHistogram.has(cd.col)) colHistogram.set(cd.col, 0);
    colHistogram.set(cd.col, colHistogram.get(cd.col) + 1);
  }
}
const COL_NAMES = [
  "0:rowtype", "1:frameId", "2:profile", "3:role", "4:orient", "5:qty", "6:(empty)",
  "7:length", "8:startX", "9:startY", "10:endX", "11:endY", "12:flange",
];
console.log("DIFF-COL HISTOGRAM (which columns differ most):");
const sortedCols = [...colHistogram.entries()].sort((a, b) => b[1] - a[1]);
for (const [col, count] of sortedCols.slice(0, 15)) {
  const name = COL_NAMES[col] ?? `col-${col}`;
  console.log(`  ${name.padEnd(14)} ${count} rows`);
}
console.log("");

// Show first few DIFFER samples
console.log("FIRST 5 DIFFER ROWS:");
let shown = 0;
for (const d of diffs) {
  if (d.kind !== "DIFFER" || shown >= 5) continue;
  console.log(`  ${d.key}:`);
  console.log(`    REF:  ${d.ref.slice(0, 200)}`);
  console.log(`    OURS: ${d.ours.slice(0, 200)}`);
  for (const cd of d.colDiffs.slice(0, 6)) {
    const name = COL_NAMES[cd.col] ?? `col-${cd.col}`;
    console.log(`      ${name}: ours="${cd.ours}" ref="${cd.ref}"`);
  }
  shown++;
}
console.log("");

if (missingRows > 0) {
  console.log(`FIRST 5 MISSING ROWS:`);
  shown = 0;
  for (const d of diffs) {
    if (d.kind !== "MISSING" || shown >= 5) continue;
    console.log(`  ${d.key}: ${d.ref.slice(0, 180)}`);
    shown++;
  }
  console.log("");
}

if (extraRows > 0) {
  console.log(`FIRST 5 EXTRA ROWS:`);
  shown = 0;
  for (const d of diffs) {
    if (d.kind !== "EXTRA" || shown >= 5) continue;
    console.log(`  ${d.key}: ${d.ours.slice(0, 180)}`);
    shown++;
  }
}
