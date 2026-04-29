// Print raw op positions for a sampling of sticks in each (role, profile, length) group.
// Reading actual stick patterns directly is the fastest way to spot formulas.
//
// Usage:
//   node sample-sticks.mjs [csv-path]      # default: research/output/fixture-ops.csv
//   node sample-sticks.mjs --role S
//   node sample-sticks.mjs --role T --bucket 1500-3000

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, "..", "output");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dbPath = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : join(OUTPUT, "fixture-ops.csv");
const filterRole = arg("role");
const filterBucket = arg("bucket");
const filterProfile = arg("profile") ?? "70S41";
const samplesPerGroup = Number(arg("n") ?? 5);

if (!existsSync(dbPath)) {
  console.error(`Missing: ${dbPath}`);
  process.exit(1);
}

function parseCsvLine(line) {
  const out = [];
  let i = 0, buf = "", inQ = false;
  while (i < line.length) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { buf += '"'; i += 2; continue; }
      if (ch === '"') { inQ = false; i++; continue; }
      buf += ch; i++;
    } else {
      if (ch === '"') { inQ = true; i++; continue; }
      if (ch === ",") { out.push(buf); buf = ""; i++; continue; }
      buf += ch; i++;
    }
  }
  out.push(buf);
  return out;
}

const text = readFileSync(dbPath, "utf8");
const lines = text.split(/\r?\n/).filter(Boolean);
const cols = parseCsvLine(lines[0]);
const idx = (n) => cols.indexOf(n);
// support both fixture and full-scan column names
const COL = {
  planName: idx("planName"),
  frameName: idx("frameName"),
  stickName: idx("stickName"),
  role: idx("role"),
  length: idx("length"),
  lengthBucket: idx("lengthBucket"),
  profileFamily: idx("profileFamily"),
  flipped: idx("flipped"),
  totalOps: idx("totalOps"),
  opIndex: idx("opIndex"),
  opType: idx("opType"),
  opRawType: idx("opRawType"),
  opKind: idx("opKind"),
  opPos: idx("opPos") >= 0 ? idx("opPos") : idx("opPosition"),
  opEndPos: idx("opEndPos") >= 0 ? idx("opEndPos") : idx("opEndPosition"),
};

const sticks = new Map();
for (let i = 1; i < lines.length; i++) {
  const cells = parseCsvLine(lines[i]);
  const role = cells[COL.role];
  const bucket = cells[COL.lengthBucket];
  const profile = cells[COL.profileFamily];
  if (filterRole && role !== filterRole) continue;
  if (filterBucket && bucket !== filterBucket) continue;
  if (filterProfile && profile !== filterProfile) continue;

  const key = `${cells[COL.planName]}|${cells[COL.frameName]}|${cells[COL.stickName]}`;
  if (!sticks.has(key)) {
    sticks.set(key, {
      planName: cells[COL.planName],
      frameName: cells[COL.frameName],
      stickName: cells[COL.stickName],
      role, lengthBucket: bucket, profileFamily: profile,
      length: parseFloat(cells[COL.length]),
      flipped: cells[COL.flipped],
      ops: [],
    });
  }
  const opType = cells[COL.opType];
  if (opType === "(none)") continue;
  sticks.get(key).ops.push({
    type: opType, raw: cells[COL.opRawType], kind: cells[COL.opKind],
    pos: parseFloat(cells[COL.opPos]),
    end: parseFloat(cells[COL.opEndPos]),
  });
}

// Group by (role, profileFamily, lengthBucket) and sample
const groups = new Map();
for (const s of sticks.values()) {
  const k = `${s.role}|${s.profileFamily}|${s.lengthBucket}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(s);
}

const out = [];
const sortedGroups = [...groups.entries()].sort((a,b)=>b[1].length - a[1].length);
for (const [key, sticksInGroup] of sortedGroups) {
  if (sticksInGroup.length < 5) continue;
  out.push(`\n========== ${key} (${sticksInGroup.length} sticks) ==========`);
  // Sort ops within each stick by position, then sample
  const sample = sticksInGroup.slice(0, samplesPerGroup);
  for (const s of sample) {
    const ops = [...s.ops].sort((a,b) => a.pos - b.pos);
    out.push(`\n  ${s.planName}/${s.frameName}/${s.stickName}  length=${s.length.toFixed(0)}mm  flipped=${s.flipped}  ${ops.length} ops`);
    for (const op of ops) {
      const fromEnd = (s.length - op.pos).toFixed(0);
      const fracPct = (op.pos / s.length * 100).toFixed(0);
      let posDesc = `${op.pos.toFixed(1).padStart(8)}mm  (end-${fromEnd.padStart(5)}, ${fracPct.padStart(3)}%)`;
      if (op.kind === "spanned" && op.end !== op.pos) {
        const spanLen = (op.end - op.pos).toFixed(1);
        posDesc += `  span→${op.end.toFixed(1)}  (len=${spanLen})`;
      }
      out.push(`    ${op.type.padEnd(15)} ${op.raw.padEnd(18)} ${op.kind.padEnd(8)} ${posDesc}`);
    }
  }
}

const sanitize = (s) => s.replace(/[<>:"/\\|?*]/g, "").replace(/=+/g, "");
const outPath = join(OUTPUT, `sample-sticks${filterRole ? "-"+sanitize(filterRole) : ""}${filterBucket ? "-"+sanitize(filterBucket) : ""}.txt`);
writeFileSync(outPath, out.join("\n"));
console.log(`Wrote: ${outPath} (${out.length} lines)`);
