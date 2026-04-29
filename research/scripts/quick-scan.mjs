// Quick scan — 3 customers, max 100 RFYs each — to verify the pipeline.
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "../../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, "..", "output");
if (!existsSync(OUTPUT)) mkdirSync(OUTPUT, { recursive: true });

const TOOL_TO_CSV = {
  Bolt: "BOLT HOLES", Chamfer: "FULL CHAMFER", InnerDimple: "INNER DIMPLE",
  InnerNotch: "WEB NOTCH", InnerService: "SERVICE HOLE", LeftFlange: "LIP NOTCH",
  LeftPartialFlange: "LIP NOTCH", LipNotch: "LIP NOTCH", RightFlange: "LIP NOTCH",
  RightPartialFlange: "LIP NOTCH", ScrewHoles: "ANCHOR", Swage: "SWAGE",
  TrussChamfer: "FULL CHAMFER", Web: "WEB NOTCH",
};

function* walk(root, depth = 0, maxDepth = 8) {
  if (depth > maxDepth) return;
  let entries;
  try { entries = readdirSync(root); } catch { return; }
  for (const name of entries) {
    const path = join(root, name);
    let s;
    try { s = statSync(path); } catch { continue; }
    if (s.isDirectory()) {
      if (name.startsWith(".") || name.startsWith("$")) continue;
      yield* walk(path, depth + 1, maxDepth);
    } else if (s.isFile() && name.toLowerCase().endsWith(".rfy")) {
      yield path;
    }
  }
}

const roots = [
  "Y:\\(17) 2026 HYTEK PROJECTS\\ATCO BRISBANE",
  "Y:\\(17) 2026 HYTEK PROJECTS\\CORAL HOMES",
  "Y:\\(17) 2026 HYTEK PROJECTS\\ADAM SMITH HOMES",
];
const PER_CUSTOMER = 100;

console.log("Quick scan of customer folders:");
roots.forEach(r => console.log("  " + r));
console.log("");

const all = [];
for (const r of roots) {
  if (!existsSync(r)) { console.log(`SKIP (missing): ${r}`); continue; }
  console.log(`Walking ${r}…`);
  let n = 0;
  const start = Date.now();
  for (const p of walk(r)) {
    all.push(p);
    n++;
    if (n >= PER_CUSTOMER) break;
  }
  console.log(`  ${n} RFYs in ${Math.round((Date.now() - start) / 1000)}s`);
}
console.log(`\nTotal: ${all.length} RFY files\n`);

if (all.length === 0) {
  console.log("No files found — aborting.");
  process.exit(0);
}

const rows = [];
let ok = 0, fail = 0;
for (let i = 0; i < all.length; i++) {
  if (i % 25 === 0) console.log(`[${i}/${all.length}] ${ok} ok / ${fail} fail`);
  try {
    const buf = readFileSync(all[i]);
    const doc = decode(buf);
    for (const plan of doc.plans ?? []) {
      for (const frame of plan.frames ?? []) {
        for (const stick of frame.sticks ?? []) {
          const profile = stick.profile?.metricLabel
            ? `${stick.profile.metricLabel.replace(/\s/g, "")}_${stick.profile.gauge}`
            : "?";
          const family = profile.replace(/_[0-9.]+$/, "");
          const ops = (stick.tooling ?? []).filter(o => TOOL_TO_CSV[o.type]);
          for (const op of ops) {
            rows.push({
              type: stick.type, profile: family, length: stick.length,
              opType: TOOL_TO_CSV[op.type],
              pos: op.pos, fromEnd: stick.length - op.pos,
            });
          }
        }
      }
    }
    ok++;
  } catch (e) { fail++; }
}
console.log(`\nDecoded ${ok}/${all.length} RFYs, ${rows.length} ops total\n`);

if (rows.length === 0) {
  console.log("No ops collected.");
  process.exit(0);
}

// Group by (stick type × profile family)
const groups = new Map();
for (const r of rows) {
  const key = `${r.type}|${r.profile}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}

const summary = [`# Quick scan — ${ok} jobs, ${rows.length} ops observed`, ""];
const sortedGroups = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [key, opRows] of sortedGroups.slice(0, 40)) {
  const [type, profile] = key.split("|");
  const opTally = {};
  for (const r of opRows) {
    if (!opTally[r.opType]) opTally[r.opType] = [];
    opTally[r.opType].push(r);
  }
  summary.push(`## ${type} on ${profile} (${opRows.length} ops)`);
  const opSorted = Object.entries(opTally).sort((a, b) => b[1].length - a[1].length);
  for (const [opType, ops] of opSorted) {
    const positions = ops.map(o => o.pos).sort((a, b) => a - b);
    const fromEnds = ops.map(o => o.fromEnd).sort((a, b) => a - b);
    const median = positions[Math.floor(positions.length / 2)];
    const medianEnd = fromEnds[Math.floor(fromEnds.length / 2)];
    summary.push(`  ${opType.padEnd(15)} ${String(ops.length).padStart(5)} occurrences, pos median ${median.toFixed(0)}mm, from-end median ${medianEnd.toFixed(0)}mm`);
  }
  summary.push("");
}

writeFileSync(join(OUTPUT, "quick-scan.txt"), summary.join("\n"));
console.log(`✓ Written: research/output/quick-scan.txt`);
console.log(`Top 5 stick groups:`);
for (const [key, opRows] of sortedGroups.slice(0, 5)) {
  console.log(`  ${key.padEnd(40)} ${opRows.length} ops`);
}
