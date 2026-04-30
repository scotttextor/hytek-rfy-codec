#!/usr/bin/env node
/**
 * Run the diff harness across all profile/walltype combinations in HG260044
 * (or any folder of paired *.xml + *.rfy files) and produce a summary table.
 *
 * Usage:
 *   node scripts/diff-sweep.mjs [folder-of-paired-files]
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const FOLDER = process.argv[2] ?? "C:/Users/Scott/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data/HG260044";

const files = fs.readdirSync(FOLDER);
const xmls = files.filter(f => f.endsWith(".xml"));

console.log("Folder:", FOLDER);
console.log("Found", xmls.length, "input XMLs");
console.log("");

// Pair each XML with its matching RFY by extracting the profile-walltype suffix.
// Example: "...4551-GF-LBW-70.075.xml" pairs with "HG260044#1-1_GF-LBW-70.075.rfy"
function suffix(name) {
  const m = name.match(/(GF-[A-Z0-9]+(?:-[A-Z0-9]+)?-\d+\.\d+)\.(?:xml|rfy)$/i);
  return m ? m[1] : null;
}

const xmlBySuffix = new Map();
for (const xml of xmls) {
  const s = suffix(xml);
  if (s) xmlBySuffix.set(s, xml);
}

const rfys = files.filter(f => f.endsWith(".rfy") && !f.includes("PK"));
const rfyBySuffix = new Map();
for (const rfy of rfys) {
  const s = suffix(rfy);
  if (s) rfyBySuffix.set(s, rfy);
}

console.log(`Pairs: ${[...xmlBySuffix.keys()].filter(s => rfyBySuffix.has(s)).length}`);
console.log("");

const results = [];
for (const [suf, xmlName] of xmlBySuffix) {
  const rfyName = rfyBySuffix.get(suf);
  if (!rfyName) {
    console.log(`SKIP ${suf} — no matching .rfy`);
    continue;
  }
  const xmlPath = path.join(FOLDER, xmlName);
  const rfyPath = path.join(FOLDER, rfyName);
  const outPrefix = `/tmp/sweep-${suf.replace(/[^A-Za-z0-9-]/g, "_")}`;

  process.stdout.write(`Diffing ${suf}... `);
  const result = spawnSync("node", ["scripts/diff-vs-detailer.mjs", xmlPath, rfyPath, outPrefix], {
    encoding: "utf8", cwd: process.cwd(),
  });
  if (result.status !== 0) {
    console.log("FAILED");
    console.error(result.stderr);
    continue;
  }
  // Parse the JSON
  const report = JSON.parse(fs.readFileSync(`${outPrefix}.json`, "utf8"));
  const r = {
    profile: suf,
    setup: report.setup?.name ?? "?",
    ours: report.totals.ours,
    ref: report.totals.ref,
    matched: report.totals.matched,
    missing: report.totals.missing,
    extras: report.totals.extras,
    coverage: report.totals.ref > 0 ? (report.totals.matched / report.totals.ref * 100).toFixed(1) + "%" : "-",
  };
  results.push(r);
  console.log(`coverage ${r.coverage}  (matched ${r.matched}/${r.ref}, ${r.missing} missing, ${r.extras} extras)`);
}

console.log("");
console.log("=".repeat(95));
console.log("SUMMARY");
console.log("=".repeat(95));
console.log("Profile                            Setup            Ours   Ref   Matched   Miss   Extra  Coverage");
console.log("-".repeat(95));
for (const r of results) {
  console.log(
    `${r.profile.padEnd(34)} ${r.setup.padEnd(16)} ${String(r.ours).padStart(5)}  ${String(r.ref).padStart(5)}  ${String(r.matched).padStart(7)}  ${String(r.missing).padStart(5)}  ${String(r.extras).padStart(5)}  ${r.coverage.padStart(7)}`
  );
}
console.log("-".repeat(95));
const totalOurs = results.reduce((s, r) => s + r.ours, 0);
const totalRef = results.reduce((s, r) => s + r.ref, 0);
const totalMatched = results.reduce((s, r) => s + r.matched, 0);
const totalMissing = results.reduce((s, r) => s + r.missing, 0);
const totalExtras = results.reduce((s, r) => s + r.extras, 0);
console.log(
  `${"TOTAL".padEnd(34)} ${"".padEnd(16)} ${String(totalOurs).padStart(5)}  ${String(totalRef).padStart(5)}  ${String(totalMatched).padStart(7)}  ${String(totalMissing).padStart(5)}  ${String(totalExtras).padStart(5)}  ${(totalRef > 0 ? (totalMatched / totalRef * 100).toFixed(1) + "%" : "-").padStart(7)}`
);
