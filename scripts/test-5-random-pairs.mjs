#!/usr/bin/env node
/**
 * Pick 5 random (XML, ref-RFY) pairs and run the codec to generate a fresh RFY
 * from each XML, then compare to the original Detailer-emitted reference RFY.
 *
 * Reports:
 *   - Byte-exact match? (almost never true — Detailer adds timestamps etc.)
 *   - Op-level match: matched/missing/extras per stick + aggregate parity %
 *   - Sticks with full match (no missing, no extras)
 *
 * Usage:  node scripts/test-5-random-pairs.mjs [--seed N]
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";

const SEED = parseInt(process.argv[process.argv.indexOf("--seed") + 1], 10) || Date.now();
console.log(`Seed: ${SEED}\n`);

const PAIRS_FILE = "scripts/y-drive-pairs.json";
const bundle = JSON.parse(fs.readFileSync(PAIRS_FILE, "utf-8"));
const all = bundle.pairs;

// Convert Y: drive paths to UNC if Y: not mounted (\\TEXDC01\Hytek\)
function toUnc(p) {
  return p.replace(/^Y:[\\/]/i, "\\\\TEXDC01\\Hytek\\");
}

// Seeded RNG so the run is reproducible if Scott wants to repeat
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
const rng = mulberry32(SEED);

// Pick 5 distinct random pairs
const indices = new Set();
while (indices.size < 5 && indices.size < all.length) {
  indices.add(Math.floor(rng() * all.length));
}
const picks = [...indices].map(i => all[i]);

const OUT_DIR = "scripts/baselines/test-5-random";
fs.mkdirSync(OUT_DIR, { recursive: true });

const results = [];
console.log("=".repeat(80));
console.log("5 RANDOM (XML → CODEC RFY → COMPARE TO REF RFY) TESTS");
console.log("=".repeat(80));

for (let i = 0; i < picks.length; i++) {
  const p = picks[i];
  const id = `${p.jobnum}__${p.plan_name}`;
  console.log(`\n[${i + 1}/${picks.length}] ${id}`);
  console.log(`  builder: ${p.builder} | year: ${p.year}`);

  const xmlPath = toUnc(p.xml);
  const refRfy = toUnc(p.rfy);

  const xmlExists = fs.existsSync(xmlPath);
  const refExists = fs.existsSync(refRfy);
  console.log(`  XML  : ${xmlExists ? "FOUND" : "MISSING"}  ${xmlPath}`);
  console.log(`  ref  : ${refExists ? "FOUND" : "MISSING"}  ${refRfy}`);
  if (!xmlExists || !refExists) {
    results.push({ id, ok: false, reason: !xmlExists ? "xml missing" : "ref missing" });
    continue;
  }

  const outPrefix = path.join(OUT_DIR, id);
  console.log(`  Running codec + diff...`);
  const t0 = Date.now();
  const r = spawnSync(
    "node",
    ["scripts/diff-vs-detailer.mjs", xmlPath, refRfy, outPrefix],
    { encoding: "utf-8", timeout: 180_000 }
  );
  const dt = Date.now() - t0;
  if (r.status !== 0) {
    console.log(`  FAIL exit=${r.status} (${dt}ms)`);
    console.log(`  stderr: ${(r.stderr || "").slice(-400)}`);
    results.push({ id, ok: false, reason: `exit ${r.status}` });
    continue;
  }

  const summary = JSON.parse(fs.readFileSync(`${outPrefix}.json`, "utf-8"));
  const oursRfy = `${outPrefix}.ours.rfy`;
  const oursBytes = fs.existsSync(oursRfy) ? fs.readFileSync(oursRfy) : null;
  const refBytes = fs.readFileSync(refRfy);

  // Byte-exact check (almost never matches because of timestamps, but worth noting)
  const sameSize = oursBytes && oursBytes.length === refBytes.length;
  const sameBytes = sameSize && oursBytes.equals(refBytes);
  const sha = (b) => crypto.createHash("sha256").update(b).digest("hex").slice(0, 16);

  // Aggregate stats
  const t = summary.totals;
  const parity = t.ref ? (t.matched / t.ref) * 100 : 0;

  // Count fully-matched sticks (zero missing, zero extras)
  let perfectSticks = 0, imperfectSticks = 0, totalSticks = 0;
  for (const fr of summary.byFrame || []) {
    for (const s of fr.sticks || []) {
      totalSticks++;
      const miss = (s.missing || []).length;
      const ext = (s.extras || []).length;
      if (miss === 0 && ext === 0) perfectSticks++;
      else imperfectSticks++;
    }
  }

  console.log(`  done in ${dt}ms`);
  console.log(`  ours bytes: ${oursBytes?.length ?? "?"}  ref bytes: ${refBytes.length}`);
  console.log(`  byte-exact match: ${sameBytes ? "YES" : "NO"}${sameSize ? "" : ` (size differs by ${Math.abs(oursBytes.length - refBytes.length)})`}`);
  console.log(`  ops: matched=${t.matched}  missing=${t.missing}  extras=${t.extras}  ref=${t.ref}  ours=${t.ours}`);
  console.log(`  op-level parity: ${parity.toFixed(2)}%`);
  console.log(`  sticks with gappy diff: ${imperfectSticks} (${totalSticks - imperfectSticks} stick(s) NOT in diff = perfectly matched OR not in both files)`);

  results.push({
    id,
    ok: true,
    builder: p.builder,
    year: p.year,
    plan_name: p.plan_name,
    sameBytes,
    sameSize,
    oursBytes: oursBytes?.length,
    refBytes: refBytes.length,
    oursSha: oursBytes ? sha(oursBytes) : null,
    refSha: sha(refBytes),
    matched: t.matched,
    missing: t.missing,
    extras: t.extras,
    ref: t.ref,
    ours: t.ours,
    parity,
    imperfectSticks,
  });
}

// Summary table
console.log("\n" + "=".repeat(80));
console.log("SUMMARY");
console.log("=".repeat(80));
console.log(`${"id".padEnd(40)} ${"bytes".padStart(8)} ${"parity".padStart(8)} ${"matched/ref".padStart(14)} ${"miss".padStart(5)} ${"extra".padStart(5)}`);
let totRef = 0, totMatched = 0, totMissing = 0, totExtras = 0;
for (const r of results) {
  if (!r.ok) {
    console.log(`${r.id.padEnd(40)}  FAIL: ${r.reason}`);
    continue;
  }
  totRef += r.ref;
  totMatched += r.matched;
  totMissing += r.missing;
  totExtras += r.extras;
  console.log(`${r.id.padEnd(40)} ${(r.sameBytes ? "EQ" : "≠").padStart(8)} ${r.parity.toFixed(2).padStart(7)}% ${(r.matched + "/" + r.ref).padStart(14)} ${String(r.missing).padStart(5)} ${String(r.extras).padStart(5)}`);
}
const aggParity = totRef ? (totMatched / totRef) * 100 : 0;
console.log("-".repeat(80));
console.log(`${"AGGREGATE".padEnd(40)} ${"".padStart(8)} ${aggParity.toFixed(2).padStart(7)}% ${(totMatched + "/" + totRef).padStart(14)} ${String(totMissing).padStart(5)} ${String(totExtras).padStart(5)}`);

const okCount = results.filter(r => r.ok).length;
const byteMatchCount = results.filter(r => r.sameBytes).length;
console.log("\n" + "=".repeat(80));
console.log(`RESULT: ${okCount}/${picks.length} pairs ran successfully`);
console.log(`        ${byteMatchCount}/${okCount} are BYTE-EXACT to Detailer's RFY`);
console.log(`        ${aggParity.toFixed(2)}% op-level match across all 5 pairs`);
console.log("=".repeat(80));

fs.writeFileSync(
  path.join(OUT_DIR, `_summary.json`),
  JSON.stringify({ seed: SEED, generated: new Date().toISOString(), results, aggregate: { totRef, totMatched, totMissing, totExtras, parity: aggParity } }, null, 2)
);
console.log(`\nWrote ${OUT_DIR}/_summary.json`);
