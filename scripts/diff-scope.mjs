#!/usr/bin/env node
/**
 * Run the diff harness across HG260001 RFYs whose filename contains a given
 * scope substring (e.g. TB2B, TIN, LBW). Source XML lives in 03 DETAILING/...,
 * reference RFYs in 06 MANUFACTURING/... split by PK.
 *
 * Usage:
 *   node scripts/diff-scope.mjs <scope-substring>
 *
 * Examples:
 *   node scripts/diff-scope.mjs TB2B   # all 7 TB2B trusses
 *   node scripts/diff-scope.mjs TIN    # linear truss
 *   node scripts/diff-scope.mjs LBW    # external walls
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SCOPE = process.argv[2];
if (!SCOPE) {
  console.error("Usage: node scripts/diff-scope.mjs <scope>");
  process.exit(1);
}

const RFY_DIR = "Y:/(17) 2026 HYTEK PROJECTS/CORAL HOMES/HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI/06 MANUFACTURING/04 ROLLFORMER FILES/Split_HG260001";
const XML_DIR = "Y:/(17) 2026 HYTEK PROJECTS/CORAL HOMES/HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI/03 DETAILING/03 FRAMECAD DETAILER/01 XML OUTPUT";

if (!fs.existsSync(RFY_DIR)) {
  console.error("RFY directory not found:", RFY_DIR);
  process.exit(1);
}

// Pull out the profile-walltype suffix (e.g. "GF-TB2B-70.075") from RFY filename
function suffix(name) {
  const m = name.match(/(GF-[A-Z0-9]+(?:-[A-Z0-9]+)?-\d+\.\d+)\.(?:xml|rfy)$/i);
  return m ? m[1] : null;
}

const rfys = fs.readdirSync(RFY_DIR)
  .filter(f => f.endsWith(".rfy"))
  .filter(f => f.toLowerCase().includes(SCOPE.toLowerCase()))
  .sort();

if (rfys.length === 0) {
  console.error(`No RFYs match scope "${SCOPE}" in ${RFY_DIR}`);
  process.exit(1);
}

console.log(`Scope: ${SCOPE}`);
console.log(`RFYs:  ${rfys.length}`);
console.log("");

// Find the matching XML for each suffix. Source XML uses one file per suffix.
const xmlFiles = fs.readdirSync(XML_DIR).filter(f => f.endsWith(".xml"));
const xmlBySuffix = new Map();
for (const xml of xmlFiles) {
  const s = suffix(xml);
  if (s) xmlBySuffix.set(s, xml);
}

const baselineDir = path.join(process.cwd(), "scripts", "baselines", "scope");
fs.mkdirSync(baselineDir, { recursive: true });

const results = [];
const aggregateByOp = {}; // {opKey: {matched, missing, extras}}
function bumpOp(k, kind) {
  if (!aggregateByOp[k]) aggregateByOp[k] = { matched: 0, missing: 0, extras: 0 };
  aggregateByOp[k][kind]++;
}

for (const rfyName of rfys) {
  const suf = suffix(rfyName);
  if (!suf) {
    console.log(`SKIP ${rfyName} — couldn't parse suffix`);
    continue;
  }
  const xmlName = xmlBySuffix.get(suf);
  if (!xmlName) {
    console.log(`SKIP ${rfyName} — no matching XML for suffix ${suf}`);
    continue;
  }
  const xmlPath = path.join(XML_DIR, xmlName);
  const rfyPath = path.join(RFY_DIR, rfyName);
  const outName = rfyName.replace(/\.rfy$/i, "");
  const outPrefix = path.join(baselineDir, outName);

  process.stdout.write(`Diffing ${rfyName}... `);
  const result = spawnSync("node", ["scripts/diff-vs-detailer.mjs", xmlPath, rfyPath, outPrefix], {
    encoding: "utf8", cwd: process.cwd(),
  });
  if (result.status !== 0) {
    console.log("FAILED");
    console.error(result.stderr.slice(0, 500));
    continue;
  }
  const report = JSON.parse(fs.readFileSync(`${outPrefix}.json`, "utf8"));
  // Re-aggregate per-op-type counts. The diff-vs-detailer JSON only has
  // top-level totals + byFrame stick-level extras/missing arrays. We re-read
  // them to surface the by-tool divergence at scope level.
  for (const fr of report.byFrame) {
    for (const st of fr.sticks) {
      for (const m of st.missing) {
        const k = m.split(/\s/)[0]; // first token is the op type (e.g. "Web")
        bumpOp(k, "missing");
      }
      for (const e of st.extras) {
        const k = e.split(/\s/)[0];
        bumpOp(k, "extras");
      }
    }
  }
  // Matched aggregation requires re-deriving from totals.matched against
  // missing/extras tracked above. For per-tool matched, we use byOpType from
  // the raw text report (not in JSON). Skip — matched is shown only in totals.
  const r = {
    name: rfyName,
    setup: report.setup?.name ?? "?",
    ours: report.totals.ours,
    ref: report.totals.ref,
    matched: report.totals.matched,
    missing: report.totals.missing,
    extras: report.totals.extras,
    coverage: report.totals.ref > 0 ? (report.totals.matched / report.totals.ref * 100).toFixed(1) + "%" : "-",
  };
  results.push(r);
  console.log(`${r.coverage}  (matched ${r.matched}/${r.ref}, ${r.missing} miss, ${r.extras} extra)`);
}

console.log("");
console.log("=".repeat(110));
console.log("PER-FILE PARITY");
console.log("=".repeat(110));
console.log("File                                              Setup           Ours   Ref   Match    Miss   Extra  Cov");
console.log("-".repeat(110));
for (const r of results) {
  console.log(
    `${r.name.padEnd(50)} ${String(r.setup).padEnd(15)} ${String(r.ours).padStart(5)} ${String(r.ref).padStart(5)} ${String(r.matched).padStart(7)} ${String(r.missing).padStart(6)} ${String(r.extras).padStart(6)}  ${r.coverage.padStart(6)}`
  );
}
console.log("-".repeat(110));
const tot = results.reduce(
  (s, r) => ({ ours: s.ours + r.ours, ref: s.ref + r.ref, matched: s.matched + r.matched, missing: s.missing + r.missing, extras: s.extras + r.extras }),
  { ours: 0, ref: 0, matched: 0, missing: 0, extras: 0 }
);
const aggCov = tot.ref > 0 ? (tot.matched / tot.ref * 100).toFixed(2) + "%" : "-";
console.log(
  `${"AGGREGATE".padEnd(50)} ${"".padEnd(15)} ${String(tot.ours).padStart(5)} ${String(tot.ref).padStart(5)} ${String(tot.matched).padStart(7)} ${String(tot.missing).padStart(6)} ${String(tot.extras).padStart(6)}  ${aggCov.padStart(6)}`
);

console.log("");
console.log("=".repeat(60));
console.log("BY OP TYPE (across scope)");
console.log("=".repeat(60));
const sorted = Object.entries(aggregateByOp).sort(([, a], [, b]) => (b.missing + b.extras) - (a.missing + a.extras));
for (const [k, v] of sorted) {
  console.log(`${k.padEnd(20)} missing ${String(v.missing).padStart(5)}   extras ${String(v.extras).padStart(5)}`);
}

console.log("");
console.log(`Per-file detail: ${baselineDir}`);
