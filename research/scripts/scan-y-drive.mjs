// Walk Y:\(17) 2026 HYTEK PROJECTS\ (and older years), find every .rfy
// file Detailer has produced, decode it, and feed the per-stick op data
// into the rules-draft pipeline.
//
// Yields a much larger corpus than copying pairs by hand — we get every job
// HYTEK has ever processed.

import { readdirSync, statSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "../../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, "..", "output");
if (!existsSync(OUTPUT)) mkdirSync(OUTPUT, { recursive: true });

const Y_ROOTS = [
  "Y:\\(17) 2026 HYTEK PROJECTS",
  "Y:\\(14) 2025 HYTEK PROJECTS",
  "Y:\\(13) 2024 HYTEK PROJECTS",
];

const TOOL_TO_CSV = {
  Bolt: "BOLT HOLES",
  Chamfer: "FULL CHAMFER",
  InnerDimple: "INNER DIMPLE",
  InnerNotch: "WEB NOTCH",
  InnerService: "SERVICE HOLE",
  LeftFlange: "LIP NOTCH",
  LeftPartialFlange: "LIP NOTCH",
  LipNotch: "LIP NOTCH",
  RightFlange: "LIP NOTCH",
  RightPartialFlange: "LIP NOTCH",
  ScrewHoles: "ANCHOR",
  Swage: "SWAGE",
  TrussChamfer: "FULL CHAMFER",
  Web: "WEB NOTCH",
};

function lengthBucket(mm) {
  if (mm <= 500) return "<=500";
  if (mm <= 1500) return "500-1500";
  if (mm <= 3000) return "1500-3000";
  if (mm <= 6000) return "3000-6000";
  return ">6000";
}

function profileFamily(profile) {
  return profile.replace(/_[0-9.]+$/, "");
}

function* walkRfys(root, depth = 0, maxDepth = 8) {
  if (depth > maxDepth) return;
  let entries;
  try { entries = readdirSync(root); } catch { return; }
  for (const name of entries) {
    const path = join(root, name);
    let st;
    try { st = statSync(path); } catch { continue; }
    if (st.isDirectory()) {
      // Skip OneDrive metadata, .git, etc.
      if (name.startsWith(".") || name.startsWith("$") || name.toLowerCase() === "node_modules") continue;
      yield* walkRfys(path, depth + 1, maxDepth);
    } else if (st.isFile() && name.toLowerCase().endsWith(".rfy")) {
      yield { path, size: st.size };
    }
  }
}

function jobNameFromPath(p) {
  // Find the project folder — usually the third level under the year root
  const parts = p.split(/[\\/]/);
  // Heuristic: take the segment that looks like a job folder (contains a number prefix or job name)
  // Path: Y:\(17) 2026 HYTEK PROJECTS\<CLIENT>\<JOB>\...
  // We want <JOB>
  for (let i = 0; i < parts.length; i++) {
    if (/HYTEK PROJECTS$/i.test(parts[i]) && i + 2 < parts.length) {
      return `${parts[i + 1]}/${parts[i + 2]}`;
    }
  }
  return parts.slice(-3).join("/");
}

async function main() {
  console.log("=== Y: drive scanner ===\n");
  const limit = Number(process.env.LIMIT ?? 1000);
  console.log(`Limit: ${limit} RFY files (set env LIMIT to change)\n`);

  // Step 1: enumerate
  const all = [];
  for (const root of Y_ROOTS) {
    if (!existsSync(root)) {
      console.log(`Skipping ${root} (not present)`);
      continue;
    }
    console.log(`Scanning ${root}…`);
    let count = 0;
    for (const entry of walkRfys(root)) {
      all.push(entry);
      count++;
      if (all.length >= limit) break;
    }
    console.log(`  found ${count} .rfy files`);
    if (all.length >= limit) break;
  }
  console.log(`\nTotal: ${all.length} RFY files to analyse\n`);

  if (all.length === 0) return;

  // Step 2: decode and collect per-stick data
  const rows = [];
  let ok = 0, fail = 0;
  for (let i = 0; i < all.length; i++) {
    const { path } = all[i];
    if (i % 50 === 0) console.log(`[${i}/${all.length}] ${ok} ok / ${fail} fail`);
    try {
      const buf = readFileSync(path);
      const doc = decode(buf);
      const job = jobNameFromPath(path);
      const sourceRfy = basename(path);
      for (const plan of doc.plans ?? []) {
        for (const frame of plan.frames ?? []) {
          for (const stick of frame.sticks ?? []) {
            const profile = stick.profile?.metricLabel
              ? `${stick.profile.metricLabel.replace(/\s/g, "")}_${stick.profile.gauge}`
              : "unknown";
            const ops = (stick.tooling ?? []).filter(o => TOOL_TO_CSV[o.type]);
            const total = ops.length;
            const base = {
              jobName: job, sourceRfy,
              planName: plan.name, frameName: frame.name, stickName: stick.name,
              type: stick.type, profile, profileFamily: profileFamily(profile),
              length: stick.length, lengthBucket: lengthBucket(stick.length),
              flipped: stick.flipped ?? false, totalOps: total,
            };
            if (total === 0) {
              rows.push({ ...base, opIndex: 0, opType: "(none)", opPosition: 0, opPositionFromEnd: 0 });
            } else {
              ops.forEach((op, idx) => {
                rows.push({
                  ...base,
                  opIndex: idx,
                  opType: TOOL_TO_CSV[op.type],
                  opRawType: op.type,
                  opPosition: op.pos,
                  opPositionFromEnd: stick.length - op.pos,
                });
              });
            }
          }
        }
      }
      ok++;
    } catch (e) {
      fail++;
    }
  }
  console.log(`\nDecoded ${ok}/${all.length} RFYs (${fail} failures)`);
  console.log(`Op observations: ${rows.length}\n`);

  // Step 3: write the flat database
  const cols = ["jobName", "sourceRfy", "planName", "frameName", "stickName",
                "type", "profile", "profileFamily", "length", "lengthBucket",
                "flipped", "totalOps", "opIndex", "opType", "opRawType",
                "opPosition", "opPositionFromEnd"];
  const dbCsv = [cols.join(",")];
  for (const row of rows) dbCsv.push(cols.map(c => JSON.stringify(row[c] ?? "")).join(","));
  writeFileSync(join(OUTPUT, "stick-database.csv"), dbCsv.join("\n"));
  console.log(`✓ stick-database.csv: ${rows.length} rows`);

  // Step 4: aggregate into rules draft
  const groups = new Map();
  for (const row of rows) {
    if (row.opType === "(none)") continue;
    const key = `${row.type}|${row.profileFamily}|${row.lengthBucket}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const stickKeys = new Set(rows.map(r => `${r.jobName}|${r.sourceRfy}|${r.planName}|${r.frameName}|${r.stickName}`));
  console.log(`Unique sticks: ${stickKeys.size}`);

  const rulesDraft = {};
  for (const [key, groupRows] of groups) {
    const [type, profileFamily, lengthBucket] = key.split("|");
    const groupSticks = new Set(groupRows.map(r => `${r.jobName}|${r.sourceRfy}|${r.planName}|${r.frameName}|${r.stickName}`)).size;
    const opTally = {};
    for (const r of groupRows) {
      if (!opTally[r.opType]) opTally[r.opType] = [];
      opTally[r.opType].push(r);
    }
    const opPatterns = {};
    for (const [opType, opRows] of Object.entries(opTally)) {
      const positions = opRows.map(r => r.opPosition).sort((a, b) => a - b);
      const fromEnd = opRows.map(r => r.opPositionFromEnd).sort((a, b) => a - b);
      const sticksWithOp = new Set(opRows.map(r => `${r.jobName}|${r.sourceRfy}|${r.planName}|${r.frameName}|${r.stickName}`)).size;
      const frequency = sticksWithOp / groupSticks;
      let confidence = "noise";
      if (frequency >= 0.9) confidence = "high";
      else if (frequency >= 0.5) confidence = "medium";
      else if (frequency >= 0.1) confidence = "low";
      opPatterns[opType] = {
        sticksWithOp, groupSticks,
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

  // Step 5: human-readable summary
  const summary = [];
  summary.push(`# Detailer rules coverage — derived from ${ok} jobs / ${stickKeys.size} sticks`);
  summary.push("");
  const sortedGroups = Object.entries(rulesDraft).sort((a, b) => b[1].sticksObserved - a[1].sticksObserved);
  for (const [, group] of sortedGroups) {
    summary.push(`## ${group.type} on ${group.profileFamily} — length ${group.lengthBucket} (${group.sticksObserved} sticks)`);
    const sortedOps = Object.entries(group.opPatterns).sort((a, b) => b[1].frequency - a[1].frequency);
    for (const [opType, p] of sortedOps) {
      summary.push(`  ${p.confidence.padEnd(6)} ${opType.padEnd(15)} ${(p.frequency * 100).toFixed(0).padStart(3)}% (${p.sticksWithOp}/${p.groupSticks}), avg ${p.avgCountPerStick}/stick`);
      if (p.positionStats) {
        summary.push(`         pos median ${p.positionStats.median.toFixed(0)}mm, from-end median ${p.positionFromEndStats.median.toFixed(0)}mm`);
      }
    }
    summary.push("");
  }
  writeFileSync(join(OUTPUT, "coverage-summary.txt"), summary.join("\n"));
  console.log(`✓ coverage-summary.txt`);
  console.log(`\nNext: open coverage-summary.txt — that's the rules engine starting point.`);
}

main().catch(e => { console.error(e); process.exit(1); });
