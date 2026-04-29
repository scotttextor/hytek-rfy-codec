// Walk research/corpus/, run analyze-pair on each job folder, aggregate the
// per-stick op data into:
//   output/stick-database.csv     (every op row, for spreadsheet exploration)
//   output/rules-draft.json       (derived rules, grouped by type×profile×length)
//   output/coverage-summary.txt   (human-readable view of the rules)

import { readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeJob } from "./analyze-pair.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORPUS = join(__dirname, "..", "corpus");
const OUTPUT = join(__dirname, "..", "output");
if (!existsSync(OUTPUT)) mkdirSync(OUTPUT, { recursive: true });

console.log("=== Corpus analyser ===");
console.log(`Corpus root: ${CORPUS}`);

const jobFolders = !existsSync(CORPUS) ? [] :
  readdirSync(CORPUS)
    .map(f => join(CORPUS, f))
    .filter(p => statSync(p).isDirectory());

if (jobFolders.length === 0) {
  console.log("\nNo job folders found in corpus/.");
  console.log("Drop pairs in like:");
  console.log("  research/corpus/HG260004-LOT328/");
  console.log("    framecad_import.xml");
  console.log("    HG260004_GF-RP-70.075.rfy");
  console.log("  research/corpus/<another-job>/");
  console.log("    ...");
  process.exit(0);
}

console.log(`Found ${jobFolders.length} job folders.\n`);

const allRows = [];
for (const folder of jobFolders) {
  console.log(`Analysing ${folder.split(/[\\/]/).pop()}…`);
  const rows = analyzeJob(folder);
  console.log(`  → ${rows.length} op rows`);
  allRows.push(...rows);
}

// 1. Write the flat database (every op row)
const cols = ["jobName", "sourceRfy", "planName", "frameName", "stickName",
              "type", "profile", "profileFamily", "length", "lengthBucket",
              "flipped", "totalOps", "opIndex", "opType", "opRawType",
              "opPosition", "opPositionFromEnd"];
const csv = [cols.join(",")];
for (const row of allRows) {
  csv.push(cols.map(c => JSON.stringify(row[c] ?? "")).join(","));
}
writeFileSync(join(OUTPUT, "stick-database.csv"), csv.join("\n"));
console.log(`\n✓ stick-database.csv: ${allRows.length} rows`);

// 2. Aggregate into a rules draft
//    Group by (type, profileFamily, lengthBucket); for each group, list
//    the most common ops and their typical positions (start-relative & end-relative).
const groups = new Map();
for (const row of allRows) {
  if (row.opType === "(none)") continue;
  const key = `${row.type}|${row.profileFamily}|${row.lengthBucket}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}

const stickKeys = new Set(allRows.map(r => `${r.jobName}|${r.sourceRfy}|${r.planName}|${r.frameName}|${r.stickName}`));
const stickCount = stickKeys.size;
console.log(`Total unique sticks: ${stickCount}`);

const rulesDraft = {};
for (const [key, rows] of groups) {
  const [type, profileFamily, lengthBucket] = key.split("|");
  // Count this group's stick count (unique sticks contributing to the group)
  const groupSticks = new Set(rows.map(r => `${r.jobName}|${r.sourceRfy}|${r.planName}|${r.frameName}|${r.stickName}`)).size;

  // Tally op types
  const opTally = {};
  for (const row of rows) {
    if (!opTally[row.opType]) opTally[row.opType] = [];
    opTally[row.opType].push(row);
  }

  const opPatterns = {};
  for (const [opType, opRows] of Object.entries(opTally)) {
    const positions = opRows.map(r => r.opPosition).sort((a, b) => a - b);
    const fromEnd = opRows.map(r => r.opPositionFromEnd).sort((a, b) => a - b);
    // Count how many distinct sticks have this op
    const sticksWithOp = new Set(opRows.map(r => `${r.jobName}|${r.sourceRfy}|${r.planName}|${r.frameName}|${r.stickName}`)).size;
    const frequency = sticksWithOp / groupSticks;
    let confidence = "noise";
    if (frequency >= 0.9) confidence = "high";
    else if (frequency >= 0.5) confidence = "medium";
    else if (frequency >= 0.1) confidence = "low";

    opPatterns[opType] = {
      sticksWithOp,
      groupSticks,
      frequency: Math.round(frequency * 100) / 100,
      confidence,
      avgCountPerStick: Math.round((opRows.length / sticksWithOp) * 10) / 10,
      positionStats: positions.length > 0 ? {
        min: positions[0], max: positions[positions.length - 1],
        median: positions[Math.floor(positions.length / 2)],
      } : null,
      positionFromEndStats: fromEnd.length > 0 ? {
        min: fromEnd[0], max: fromEnd[fromEnd.length - 1],
        median: fromEnd[Math.floor(fromEnd.length / 2)],
      } : null,
    };
  }
  rulesDraft[key] = { type, profileFamily, lengthBucket, sticksObserved: groupSticks, opPatterns };
}

writeFileSync(join(OUTPUT, "rules-draft.json"), JSON.stringify(rulesDraft, null, 2));
console.log(`✓ rules-draft.json: ${Object.keys(rulesDraft).length} stick groups`);

// 3. Human-readable summary
const summary = [];
summary.push(`# Detailer rules — coverage summary`);
summary.push(`# Corpus: ${jobFolders.length} jobs, ${stickCount} unique sticks, ${allRows.length} op observations`);
summary.push("");
const sortedGroups = Object.entries(rulesDraft)
  .sort((a, b) => b[1].sticksObserved - a[1].sticksObserved);
for (const [, group] of sortedGroups) {
  summary.push(`## ${group.type} on ${group.profileFamily} — ${group.lengthBucket} (${group.sticksObserved} sticks)`);
  const sortedOps = Object.entries(group.opPatterns)
    .sort((a, b) => b[1].frequency - a[1].frequency);
  for (const [opType, p] of sortedOps) {
    summary.push(`  ${p.confidence.toUpperCase()} ${opType}: ${(p.frequency * 100).toFixed(0)}% of sticks (${p.sticksWithOp}/${p.groupSticks}), avg ${p.avgCountPerStick}/stick`);
    if (p.positionStats) {
      summary.push(`    pos median ${p.positionStats.median.toFixed(1)}mm, range ${p.positionStats.min.toFixed(1)}–${p.positionStats.max.toFixed(1)}`);
      summary.push(`    from-end median ${p.positionFromEndStats.median.toFixed(1)}mm`);
    }
  }
  summary.push("");
}
writeFileSync(join(OUTPUT, "coverage-summary.txt"), summary.join("\n"));
console.log(`✓ coverage-summary.txt: human-readable rules view`);

console.log("\n=== Done ===");
console.log(`Open  research/output/coverage-summary.txt  to see what Detailer is doing.`);
console.log(`Open  research/output/stick-database.csv    in Excel for hands-on exploration.`);
