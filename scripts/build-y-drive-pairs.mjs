#!/usr/bin/env node
/**
 * Walk the WHOLE Y: drive and build a JSON index of XML ↔ reference-RFY pairs.
 *
 * Each HG* job dir typically has:
 *   {jobRoot}/03 DETAILING/03 FRAMECAD DETAILER/01 XML OUTPUT/<files.xml> + Packed/<files.xml>
 *   {jobRoot}/06 MANUFACTURING/04 ROLLFORMER FILES/<files.rfy> + Split_<jobnum>/<files.rfy>
 *
 * Pairing rules (heuristic):
 *   - For "GF-LBW-70.075.xml" → look for any RFY whose plan-name segment matches
 *     "GF-LBW-70.075" (with optional pack prefix PK1- and Detailer #N-N suffix)
 *   - For Packed/<plan>.xml → match the same way
 *
 * Output: scripts/y-drive-pairs.json — a list of
 *   { xml: "...", rfy: "...", jobnum, plan_name, builder, year }
 */
import fs from "node:fs";
import path from "node:path";

const ROOTS = [
  "Y:/(14) 2025 HYTEK PROJECTS",
  "Y:/(17) 2026 HYTEK PROJECTS",
];

const OUT = "scripts/y-drive-pairs.json";

// Plan-name extraction from XML filename:
//   "HG260017 LOT 925 ... -GF-LBW-70.075.xml"  →  GF-LBW-70.075
//   "GF-LBW-70.075.xml"                        →  GF-LBW-70.075
function planNameFromXml(name) {
  const stem = name.replace(/\.xml$/i, "");
  // Look for the standard "(GF|FF|RF|TH\d+)-<TYPE>-<PROFILE>" pattern
  const m = stem.match(/(?:^|-)((?:TH\d+-)?(?:GF|FF|RF|UF|MF)-[A-Z0-9]+-[\d.]+)$/i);
  if (m) return m[1];
  return null;
}

// Plan-name extraction from RFY filename:
//   "HG260017_PK4-GF-LBW-70.075.rfy"      →  GF-LBW-70.075
//   "HG260017_GF-RP-70.075.rfy"           →  GF-RP-70.075
//   "HG260044#1-1_GF-LBW-70.075.rfy"      →  GF-LBW-70.075
//   "HG260044#1-1_PK1-GF-TB2B-70.075.rfy" →  GF-TB2B-70.075
function planNameFromRfy(name) {
  const stem = name.replace(/\.rfy$/i, "");
  const idx = stem.indexOf("_");
  if (idx <= 0) return null;
  let plan = stem.slice(idx + 1);
  // Strip leading PKn- prefix
  plan = plan.replace(/^PK\d+-/, "");
  return plan;
}

function jobnumFromRfy(name) {
  const stem = name.replace(/\.rfy$/i, "");
  const idx = stem.indexOf("_");
  if (idx <= 0) return null;
  // Strip Detailer's #N-N stamp
  return stem.slice(0, idx).replace(/#\d+-\d+$/, "");
}

function readDirSafe(p) {
  try {
    return fs.readdirSync(p);
  } catch {
    return [];
  }
}

function statSafe(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

const pairs = [];
let xmlScanned = 0;
let rfyScanned = 0;
let pairedJobs = 0;

const t0 = Date.now();

for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  const year = root.match(/\(\d+\) (\d{4})/)?.[1] ?? "?";
  console.log(`Scanning ${root} (year=${year})...`);

  for (const builder of readDirSafe(root)) {
    const builderPath = path.join(root, builder);
    if (!statSafe(builderPath)?.isDirectory()) continue;

    for (const job of readDirSafe(builderPath)) {
      const jobPath = path.join(builderPath, job);
      if (!statSafe(jobPath)?.isDirectory()) continue;

      // Collect all XMLs (flat + Packed/ subdir)
      const xmlDir = path.join(jobPath, "03 DETAILING", "03 FRAMECAD DETAILER", "01 XML OUTPUT");
      const xmlPaths = [];
      for (const xmlSubdir of [xmlDir, path.join(xmlDir, "Packed")]) {
        for (const f of readDirSafe(xmlSubdir)) {
          if (f.toLowerCase().endsWith(".xml")) {
            xmlPaths.push(path.join(xmlSubdir, f));
          }
        }
      }
      if (xmlPaths.length === 0) continue;
      xmlScanned += xmlPaths.length;

      // Collect all RFYs (flat + any Split_*/ subdir)
      const rfyRoot = path.join(jobPath, "06 MANUFACTURING", "04 ROLLFORMER FILES");
      const rfyPaths = [];
      for (const f of readDirSafe(rfyRoot)) {
        const fp = path.join(rfyRoot, f);
        const st = statSafe(fp);
        if (!st) continue;
        if (st.isFile() && f.toLowerCase().endsWith(".rfy")) {
          rfyPaths.push(fp);
        } else if (st.isDirectory()) {
          for (const g of readDirSafe(fp)) {
            if (g.toLowerCase().endsWith(".rfy")) rfyPaths.push(path.join(fp, g));
          }
        }
      }
      rfyScanned += rfyPaths.length;
      if (rfyPaths.length === 0) continue;

      // Build a plan-name → RFY map. Multiple RFYs with the same plan are kept
      // (PK-split files), prefer the non-PK one for the pairing.
      const rfyByPlan = new Map();
      for (const rfy of rfyPaths) {
        const name = path.basename(rfy);
        const plan = planNameFromRfy(name);
        if (!plan) continue;
        // Prefer non-pack-split files; if multiple, keep first
        const existing = rfyByPlan.get(plan);
        const isPacked = /^PK\d+-/.test(name.split("_").slice(-1)[0] ?? "");
        if (!existing || (existing._isPacked && !isPacked)) {
          rfyByPlan.set(plan, { path: rfy, _isPacked: isPacked });
        }
      }

      let jobPairs = 0;
      for (const xmlPath of xmlPaths) {
        const xmlName = path.basename(xmlPath);
        const plan = planNameFromXml(xmlName);
        if (!plan) continue;
        const rfyEntry = rfyByPlan.get(plan);
        if (!rfyEntry) continue;
        pairs.push({
          xml: xmlPath,
          rfy: rfyEntry.path,
          jobnum: jobnumFromRfy(path.basename(rfyEntry.path)) ?? job.split(/\s+/)[0],
          plan_name: plan,
          builder,
          year,
          xml_name: xmlName,
          rfy_name: path.basename(rfyEntry.path),
        });
        jobPairs++;
      }
      if (jobPairs > 0) pairedJobs++;
    }
  }
}

const t1 = Date.now();
fs.writeFileSync(OUT, JSON.stringify({
  generated_at: new Date().toISOString(),
  roots: ROOTS,
  totals: {
    xml_scanned: xmlScanned,
    rfy_scanned: rfyScanned,
    pairs: pairs.length,
    jobs_with_pairs: pairedJobs,
  },
  pairs,
}, null, 2));

console.log(`\nXMLs scanned:          ${xmlScanned.toLocaleString()}`);
console.log(`RFYs scanned:          ${rfyScanned.toLocaleString()}`);
console.log(`Pairs built:           ${pairs.length.toLocaleString()}`);
console.log(`Jobs with pairs:       ${pairedJobs}`);
console.log(`Elapsed:               ${((t1 - t0) / 1000).toFixed(1)}s`);
console.log(`Wrote:                 ${OUT}`);

// Distribution
const byPlanType = {};
const byProfile = {};
const byBuilder = {};
const byYear = {};
for (const p of pairs) {
  const planType = p.plan_name.match(/-([A-Z0-9]+)-\d/)?.[1] ?? "?";
  const profile = p.plan_name.match(/-(\d+\.\d+)$/)?.[1] ?? "?";
  byPlanType[planType] = (byPlanType[planType] || 0) + 1;
  byProfile[profile] = (byProfile[profile] || 0) + 1;
  byBuilder[p.builder] = (byBuilder[p.builder] || 0) + 1;
  byYear[p.year] = (byYear[p.year] || 0) + 1;
}
console.log("\nBy plan-type:");
for (const [k, v] of Object.entries(byPlanType).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(10)} ${v}`);
}
console.log("\nBy profile:");
for (const [k, v] of Object.entries(byProfile).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(10)} ${v}`);
}
console.log("\nBy year:");
for (const [k, v] of Object.entries(byYear)) {
  console.log(`  ${k}  ${v}`);
}
console.log("\nTop builders:");
for (const [k, v] of Object.entries(byBuilder).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${k.padEnd(40)} ${v}`);
}
