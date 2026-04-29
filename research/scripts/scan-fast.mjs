// Faster Y: drive scan — targets the known RFY path pattern
//   <year-root>/<customer>/<job>/06 MANUFACTURING/04 ROLLFORMER FILES/Split_*/*.rfy
// instead of recursing into every subdirectory of every customer.
//
// On a slow network drive, this avoids walking the dozens of unrelated
// folders (DESIGN, DRAWINGS, etc.) inside every job.

import { readdirSync, statSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { decode } from "../../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, "..", "output");
if (!existsSync(OUTPUT)) mkdirSync(OUTPUT, { recursive: true });

const log = (msg) => process.stdout.write(msg + "\n");

const YEAR_ROOTS = [
  "Y:\\(17) 2026 HYTEK PROJECTS",
  "Y:\\(14) 2025 HYTEK PROJECTS",
  "Y:\\(13) 2024 HYTEK PROJECTS",
];

const TOOL_TO_CSV = {
  Bolt: "BOLT HOLES", Chamfer: "FULL CHAMFER", InnerDimple: "INNER DIMPLE",
  InnerNotch: "WEB NOTCH", InnerService: "SERVICE HOLE", LeftFlange: "LIP NOTCH",
  LeftPartialFlange: "LIP NOTCH", LipNotch: "LIP NOTCH", RightFlange: "LIP NOTCH",
  RightPartialFlange: "LIP NOTCH", ScrewHoles: "ANCHOR", Swage: "SWAGE",
  TrussChamfer: "FULL CHAMFER", Web: "WEB NOTCH",
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

// Best-effort listing — silently skip access-denied / missing folders
function lsSafe(p) {
  try { return readdirSync(p); } catch { return []; }
}
function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}
function isFile(p) {
  try { return statSync(p).isFile(); } catch { return false; }
}

// Find all RFYs in a single job folder using the well-known pattern.
function* rfyInJob(jobPath) {
  // Look for 06 MANUFACTURING/04 ROLLFORMER FILES/Split_*/*.rfy
  // But also fall back to any *.rfy under the job (max depth 6)
  const knownPath = join(jobPath, "06 MANUFACTURING", "04 ROLLFORMER FILES");
  if (isDir(knownPath)) {
    for (const split of lsSafe(knownPath)) {
      const splitPath = join(knownPath, split);
      if (!isDir(splitPath)) continue;
      for (const f of lsSafe(splitPath)) {
        if (f.toLowerCase().endsWith(".rfy")) yield join(splitPath, f);
      }
    }
    return; // skip generic walk if we used the known path
  }
  // Fallback — generic walk capped at depth 6
  yield* walkRfys(jobPath, 0, 6);
}

function* walkRfys(root, depth = 0, maxDepth = 6) {
  if (depth > maxDepth) return;
  for (const name of lsSafe(root)) {
    if (name.startsWith(".") || name.startsWith("$")) continue;
    const p = join(root, name);
    if (isFile(p) && name.toLowerCase().endsWith(".rfy")) yield p;
    else if (isDir(p)) yield* walkRfys(p, depth + 1, maxDepth);
  }
}

// year-root → customer folders → job folders → known RFY path
function* enumerateRfys(yearRoot, log) {
  for (const customer of lsSafe(yearRoot)) {
    if (customer.startsWith(".") || customer.startsWith("$")) continue;
    const customerPath = join(yearRoot, customer);
    if (!isDir(customerPath)) continue;
    log(`    customer: ${customer}`);
    for (const job of lsSafe(customerPath)) {
      if (job.startsWith(".") || job.startsWith("$")) continue;
      const jobPath = join(customerPath, job);
      if (!isDir(jobPath)) continue;
      let jobCount = 0;
      for (const rfy of rfyInJob(jobPath)) {
        yield { path: rfy, customer, job };
        jobCount++;
      }
    }
  }
}

function jobNameFromPath(p) {
  const parts = p.split(/[\\/]/);
  for (let i = 0; i < parts.length; i++) {
    if (/HYTEK PROJECTS$/i.test(parts[i]) && i + 2 < parts.length) {
      return `${parts[i + 1]}/${parts[i + 2]}`;
    }
  }
  return parts.slice(-3).join("/");
}

async function main() {
  log("=== Fast Y: drive scanner (targets known RFY pattern) ===");
  const limit = Number(process.env.LIMIT ?? 5000);
  const minOps = Number(process.env.MIN_OPS ?? 0);
  log(`Limit: ${limit} RFY files; will stop early when reached`);
  log(`Started at ${new Date().toISOString()}\n`);

  // SIGINT/SIGTERM handler — flush partial state so Ctrl-C is safe
  let shouldStop = false;
  const stopHandler = (sig) => {
    log(`\n!! ${sig} received — finishing current decode, then writing partial output.`);
    shouldStop = true;
  };
  process.on("SIGINT", () => stopHandler("SIGINT"));
  process.on("SIGTERM", () => stopHandler("SIGTERM"));

  // Step 1: enumerate (with progress)
  const all = [];
  let lastLog = Date.now();
  for (const root of YEAR_ROOTS) {
    if (!existsSync(root)) {
      log(`  Skipping ${root} (not present)`);
      continue;
    }
    log(`Scanning ${root}…`);
    for (const entry of enumerateRfys(root, log)) {
      all.push(entry);
      if (Date.now() - lastLog > 5000) {
        log(`    [${all.length}] latest: ${entry.customer}/${entry.job}/${basename(entry.path)}`);
        lastLog = Date.now();
      }
      if (all.length >= limit) break;
      if (shouldStop) break;
    }
    log(`  total so far: ${all.length}`);
    if (all.length >= limit) break;
    if (shouldStop) break;
  }
  log(`\nTotal: ${all.length} RFY files to analyse\n`);
  if (all.length === 0) { log("No RFYs found — aborting."); return; }

  // Step 2: decode + collect rows (with incremental output every 25 RFYs)
  const rows = [];
  let ok = 0, fail = 0;
  const failReasons = {};
  const writeIncremental = () => {
    const cols = ["jobName", "sourceRfy", "planName", "frameName", "stickName",
                  "type", "role", "profile", "profileFamily", "length", "lengthBucket",
                  "flipped", "totalOps", "opIndex", "opType", "opRawType", "opKind",
                  "opPosition", "opPositionFromEnd", "opEndPosition", "frameLength", "frameHeight"];
    const dbCsv = [cols.join(",")];
    for (const row of rows) dbCsv.push(cols.map(c => JSON.stringify(row[c] ?? "")).join(","));
    writeFileSync(join(OUTPUT, "stick-database.csv"), dbCsv.join("\n"));
  };

  for (let i = 0; i < all.length; i++) {
    if (shouldStop) { log(`!! Stopping at ${i}/${all.length} — preparing partial output.`); break; }
    const { path } = all[i];
    if (i % 25 === 0 && i > 0) {
      log(`[${i}/${all.length}] ${ok} ok / ${fail} fail / ${rows.length} ops so far  (writing incremental DB...)`);
      writeIncremental();
    } else if (i % 5 === 0) {
      log(`[${i}/${all.length}] ${ok} ok / ${fail} fail / ${rows.length} ops`);
    }
    try {
      const buf = readFileSync(path);
      const doc = decode(buf);
      const job = jobNameFromPath(path);
      const sourceRfy = basename(path);
      for (const plan of doc.project?.plans ?? []) {
        for (const frame of plan.frames ?? []) {
          for (const stick of frame.sticks ?? []) {
            const profile = stick.profile?.metricLabel
              ? `${stick.profile.metricLabel.replace(/\s/g, "")}_${stick.profile.gauge}`
              : "unknown";
            const role = (stick.name ?? "").replace(/[0-9_].*$/, "") || stick.type;
            const ops = (stick.tooling ?? []).filter(o => TOOL_TO_CSV[o.type]);
            const total = ops.length;
            if (total < minOps) continue;
            const base = {
              jobName: job, sourceRfy,
              planName: plan.name, frameName: frame.name, stickName: stick.name,
              type: stick.type, role,
              profile, profileFamily: profileFamily(profile),
              length: stick.length, lengthBucket: lengthBucket(stick.length),
              flipped: stick.flipped ?? false, totalOps: total,
              frameLength: frame.length, frameHeight: frame.height,
            };
            if (total === 0) {
              rows.push({ ...base, opIndex: 0, opType: "(none)", opRawType: "", opKind: "", opPosition: 0, opPositionFromEnd: 0, opEndPosition: 0 });
            } else {
              ops.forEach((op, idx) => {
                let pos = 0, endPos = 0;
                if (op.kind === "point") { pos = op.pos; endPos = op.pos; }
                else if (op.kind === "spanned") { pos = op.startPos; endPos = op.endPos; }
                else if (op.kind === "start") { pos = 0; endPos = 0; }
                else if (op.kind === "end") { pos = stick.length; endPos = stick.length; }
                rows.push({
                  ...base,
                  opIndex: idx,
                  opType: TOOL_TO_CSV[op.type],
                  opRawType: op.type,
                  opKind: op.kind,
                  opPosition: pos,
                  opPositionFromEnd: stick.length - pos,
                  opEndPosition: endPos,
                });
              });
            }
          }
        }
      }
      ok++;
    } catch (e) {
      fail++;
      const k = (e?.message ?? "unknown").slice(0, 60);
      failReasons[k] = (failReasons[k] || 0) + 1;
    }
  }
  log(`\nDecoded ${ok}/${all.length} RFYs (${fail} failures)`);
  if (Object.keys(failReasons).length) {
    log("Top failure reasons:");
    for (const [r, c] of Object.entries(failReasons).sort((a,b)=>b[1]-a[1]).slice(0,5)) {
      log(`  [${c}] ${r}`);
    }
  }
  log(`Op observations: ${rows.length}\n`);

  // Step 3: write the flat database
  const cols = ["jobName", "sourceRfy", "planName", "frameName", "stickName",
                "type", "role", "profile", "profileFamily", "length", "lengthBucket",
                "flipped", "totalOps", "opIndex", "opType", "opRawType", "opKind",
                "opPosition", "opPositionFromEnd", "opEndPosition", "frameLength", "frameHeight"];
  const dbCsv = [cols.join(",")];
  for (const row of rows) dbCsv.push(cols.map(c => JSON.stringify(row[c] ?? "")).join(","));
  writeFileSync(join(OUTPUT, "stick-database.csv"), dbCsv.join("\n"));
  log(`✓ stick-database.csv: ${rows.length} rows`);

  // Step 4: aggregate into rules draft
  const groups = new Map();
  for (const row of rows) {
    if (row.opType === "(none)") continue;
    const key = `${row.role}|${row.profileFamily}|${row.lengthBucket}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const stickKeys = new Set(rows.map(r => `${r.jobName}|${r.sourceRfy}|${r.planName}|${r.frameName}|${r.stickName}`));
  log(`Unique sticks: ${stickKeys.size}`);

  const rulesDraft = {};
  for (const [key, groupRows] of groups) {
    const [role, profileFamily, lengthBucket] = key.split("|");
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
      const rawTypes = {};
      for (const r of opRows) rawTypes[r.opRawType] = (rawTypes[r.opRawType] || 0) + 1;
      const kindTally = {};
      for (const r of opRows) kindTally[r.opKind] = (kindTally[r.opKind] || 0) + 1;
      // Per-stick op counts (how many of this op type per stick)
      const perStickCounts = {};
      for (const r of opRows) {
        const k = `${r.jobName}|${r.sourceRfy}|${r.planName}|${r.frameName}|${r.stickName}`;
        perStickCounts[k] = (perStickCounts[k] || 0) + 1;
      }
      const counts = Object.values(perStickCounts).sort((a,b)=>a-b);
      opPatterns[opType] = {
        sticksWithOp, groupSticks,
        frequency: Math.round(frequency * 100) / 100,
        confidence,
        rawTypes, kindTally,
        avgCountPerStick: Math.round((opRows.length / sticksWithOp) * 10) / 10,
        countDistribution: { min: counts[0] ?? 0, median: counts[Math.floor(counts.length/2)] ?? 0, max: counts[counts.length-1] ?? 0 },
        positionStats: positions.length > 0 ? {
          min: positions[0], max: positions[positions.length - 1],
          median: positions[Math.floor(positions.length / 2)],
          p25: positions[Math.floor(positions.length / 4)],
          p75: positions[Math.floor(positions.length * 3 / 4)],
        } : null,
        positionFromEndStats: fromEnd.length > 0 ? {
          min: fromEnd[0], max: fromEnd[fromEnd.length - 1],
          median: fromEnd[Math.floor(fromEnd.length / 2)],
          p25: fromEnd[Math.floor(fromEnd.length / 4)],
          p75: fromEnd[Math.floor(fromEnd.length * 3 / 4)],
        } : null,
      };
    }
    rulesDraft[key] = { role, profileFamily, lengthBucket, sticksObserved: groupSticks, opPatterns };
  }

  writeFileSync(join(OUTPUT, "rules-draft.json"), JSON.stringify(rulesDraft, null, 2));
  log(`✓ rules-draft.json: ${Object.keys(rulesDraft).length} stick groups`);

  // Step 5: human-readable summary
  const summary = [];
  summary.push(`# Detailer rules coverage — derived from ${ok} jobs / ${stickKeys.size} sticks / ${rows.length} ops`);
  summary.push(`# Generated: ${new Date().toISOString()}`);
  summary.push("");
  const sortedGroups = Object.entries(rulesDraft).sort((a, b) => b[1].sticksObserved - a[1].sticksObserved);
  for (const [, group] of sortedGroups) {
    summary.push(`## ${group.role} on ${group.profileFamily} — length ${group.lengthBucket} (${group.sticksObserved} sticks)`);
    const sortedOps = Object.entries(group.opPatterns).sort((a, b) => b[1].frequency - a[1].frequency);
    for (const [opType, p] of sortedOps) {
      const rawList = Object.entries(p.rawTypes).map(([k,v]) => `${k}:${v}`).join(",");
      summary.push(`  ${p.confidence.padEnd(6)} ${opType.padEnd(15)} ${(p.frequency * 100).toFixed(0).padStart(3)}% (${p.sticksWithOp}/${p.groupSticks}), avg ${p.avgCountPerStick}/stick  [${rawList}]`);
      if (p.positionStats) {
        summary.push(`         pos median ${p.positionStats.median.toFixed(0)}mm, p25 ${p.positionStats.p25.toFixed(0)}mm, p75 ${p.positionStats.p75.toFixed(0)}mm`);
        summary.push(`         from-end median ${p.positionFromEndStats.median.toFixed(0)}mm, p25 ${p.positionFromEndStats.p25.toFixed(0)}mm, p75 ${p.positionFromEndStats.p75.toFixed(0)}mm`);
      }
    }
    summary.push("");
  }
  writeFileSync(join(OUTPUT, "coverage-summary.txt"), summary.join("\n"));
  log(`✓ coverage-summary.txt`);
  log(`\nNext: open coverage-summary.txt — that's the rules engine starting point.`);
}

main().catch(e => { console.error(e); process.exit(1); });
