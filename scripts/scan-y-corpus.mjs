// Scan Y: drive for every (XML, RFY) pair across HYTEK projects.
// Walks top-level project folders one at a time (resumable, faster than recursive
// scan from root). Outputs pairs.json and copies to test-corpus/<project>/.
import { readdirSync, statSync, copyFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const Y_PROJECTS = [
  "Y:/(17) 2026 HYTEK PROJECTS",
  "Y:/(14) 2025 HYTEK PROJECTS",
];
const OUT_DIR = "test-corpus";
mkdirSync(OUT_DIR, { recursive: true });

// Plan name regex: e.g. "TH01-1F-CP-89.075", "PK1-GF-LBW-70.075"
const PLAN_RE = /([A-Z][\w]*-(GF|1F|2F|3F|TH\d+|R\d+|PK\d+)-\w+-(70|75|78|89|90|104|150)\.\d+)\.(?:xml|rfy)/i;

function safeReaddir(dir) {
  try { return readdirSync(dir); } catch { return []; }
}
function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

// Find all XML+RFY pairs in a single project directory
function scanProject(projectDir) {
  const xmlDir = join(projectDir, "03 DETAILING", "03 FRAMECAD DETAILER", "01 XML OUTPUT");
  const mfgDir = join(projectDir, "06 MANUFACTURING");
  if (!isDir(xmlDir) || !isDir(mfgDir)) return [];

  // Recursively gather all .rfy files in 06 MANUFACTURING (some are in subfolders like SPLIT_2026-04-16)
  const allRfys = [];
  function walkRfy(d) {
    for (const f of safeReaddir(d)) {
      const p = join(d, f);
      if (isDir(p)) walkRfy(p);
      else if (f.toLowerCase().endsWith(".rfy")) allRfys.push(p);
    }
  }
  walkRfy(mfgDir);

  const pairs = [];
  for (const f of safeReaddir(xmlDir)) {
    if (!f.toLowerCase().endsWith(".xml")) continue;
    const m = f.match(PLAN_RE);
    if (!m) continue;
    const plan = m[1];
    const xml = join(xmlDir, f);
    // Find matching RFY (filename contains the plan)
    const rfy = allRfys.find(r => basename(r).includes(plan) && !basename(r).toUpperCase().includes("TEKLA"));
    if (rfy) pairs.push({ xml, rfy, plan, project: basename(projectDir) });
  }
  return pairs;
}

// Walk all 2-level deep folders under each year root
const allPairs = [];
for (const root of Y_PROJECTS) {
  if (!isDir(root)) {
    console.log(`[skip] ${root} not accessible`);
    continue;
  }
  console.log(`Scanning ${root}...`);
  for (const customer of safeReaddir(root)) {
    const customerDir = join(root, customer);
    if (!isDir(customerDir)) continue;
    for (const project of safeReaddir(customerDir)) {
      const projectDir = join(customerDir, project);
      if (!isDir(projectDir)) continue;
      const pairs = scanProject(projectDir);
      if (pairs.length > 0) {
        console.log(`  ${customer}/${project}: ${pairs.length} pairs`);
        allPairs.push(...pairs);
      }
    }
  }
}

console.log(`\nTotal pairs found: ${allPairs.length}`);

// Categorize by job type
const categories = new Map();
for (const p of allPairs) {
  const m = p.plan.match(/-([A-Z]+)-(\d+\.\d+)$/);
  if (m) {
    const cat = `${m[1]}-${m[2]}`;
    categories.set(cat, (categories.get(cat) ?? 0) + 1);
  } else {
    categories.set("OTHER", (categories.get("OTHER") ?? 0) + 1);
  }
}
console.log("\nPairs by category (FrameType-Profile.Gauge):");
const sorted = [...categories.entries()].sort((a, b) => b[1] - a[1]);
for (const [cat, n] of sorted) console.log(`  ${cat}: ${n}`);

writeFileSync(join(OUT_DIR, "all-pairs.json"), JSON.stringify(allPairs, null, 2));
console.log(`\nWrote ${OUT_DIR}/all-pairs.json`);
