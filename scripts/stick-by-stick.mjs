// Side-by-side stick comparison: two RFY files (ours vs reference).
// Aligns ops by type+position and HIGHLIGHTS differences:
//   ✓ MATCH         - both files have this op at this position (within 1mm)
//   - MISSING       - ref has it, we don't
//   + EXTRA         - we have it, ref doesn't
//   ~ POSITION      - same op type but position drifts > 1mm
//
// Usage: node scripts/stick-by-stick.mjs <ours.rfy> <reference.rfy> [frameName]
import { readFileSync } from "node:fs";
import { decode } from "../dist/decode.js";

const oursRfyPath = process.argv[2];
const refRfyPath = process.argv[3];
const filterFrame = process.argv[4] ?? null;

if (!oursRfyPath || !refRfyPath) {
  console.error("Usage: node stick-by-stick.mjs <ours.rfy> <reference.rfy> [frameName]");
  process.exit(1);
}

const oursDoc = decode(readFileSync(oursRfyPath));
const refDoc = decode(readFileSync(refRfyPath));

function fmtOp(op) {
  switch (op.kind) {
    case "point":   return { key: `${op.type}@pt`, pos: op.pos, label: `${op.type} @${op.pos.toFixed(1)}` };
    case "spanned": return { key: `${op.type}@span`, pos: op.startPos, label: `${op.type} [${op.startPos.toFixed(1)}..${op.endPos.toFixed(1)}]`, end: op.endPos };
    case "start":   return { key: `${op.type}@start`, pos: 0, label: `${op.type} @start` };
    case "end":     return { key: `${op.type}@end`, pos: 999999, label: `${op.type} @end` };
    default:        return { key: "?", pos: 0, label: JSON.stringify(op) };
  }
}

function indexSticks(doc) {
  const map = new Map();
  for (const plan of doc.project.plans) {
    for (const frame of plan.frames) {
      for (const stick of frame.sticks) {
        const key = `${frame.name}/${stick.name}`;
        const ops = (stick.tooling ?? []).map(fmtOp);
        ops.sort((a, b) => a.pos - b.pos || a.key.localeCompare(b.key));
        map.set(key, { plan: plan.name, frame: frame.name, name: stick.name, length: stick.length, ops });
      }
    }
  }
  return map;
}

const oursIdx = indexSticks(oursDoc);
const refIdx = indexSticks(refDoc);

// Align two op lists by greedy nearest-position matching within same key.
function alignOps(oOps, rOps, posTol = 2.0) {
  const rUsed = new Set();
  const rows = [];
  // Pass 1: exact-key matches with position tolerance
  for (let i = 0; i < oOps.length; i++) {
    const o = oOps[i];
    let bestJ = -1, bestDist = Infinity;
    for (let j = 0; j < rOps.length; j++) {
      if (rUsed.has(j)) continue;
      if (rOps[j].key !== o.key) continue;
      const dist = Math.abs(o.pos - rOps[j].pos);
      if (dist < bestDist) { bestDist = dist; bestJ = j; }
    }
    if (bestJ >= 0 && bestDist <= 50) {
      rUsed.add(bestJ);
      const status = bestDist <= posTol ? "MATCH" : "POSDRIFT";
      rows.push({ status, ours: o, ref: rOps[bestJ], drift: bestDist });
    } else {
      rows.push({ status: "EXTRA", ours: o, ref: null });
    }
  }
  // Pass 2: leftover ref ops are missing
  for (let j = 0; j < rOps.length; j++) {
    if (!rUsed.has(j)) rows.push({ status: "MISSING", ours: null, ref: rOps[j] });
  }
  // Sort by position (use whichever side has it)
  rows.sort((a, b) => {
    const aPos = a.ours?.pos ?? a.ref.pos;
    const bPos = b.ours?.pos ?? b.ref.pos;
    return aPos - bPos;
  });
  return rows;
}

function pad(s, n) { return (s ?? "").padEnd(n); }

const allKeys = new Set([...oursIdx.keys(), ...refIdx.keys()]);
const sortedKeys = [...allKeys].sort();

let totalMatch = 0, totalDrift = 0, totalMissing = 0, totalExtra = 0, sticksWithDiff = 0;

for (const key of sortedKeys) {
  if (filterFrame && !key.startsWith(filterFrame + "/")) continue;
  const o = oursIdx.get(key);
  const r = refIdx.get(key);
  if (!o && !r) continue;

  const oLen = o?.length ?? 0;
  const rLen = r?.length ?? 0;
  const lenDiff = oLen - rLen;
  const lenFlag = Math.abs(lenDiff) > 0.5 ? `  ⚠ Δ${lenDiff > 0 ? "+" : ""}${lenDiff.toFixed(1)}mm` : "";

  const rows = alignOps(o?.ops ?? [], r?.ops ?? []);
  const stickHasDiff = rows.some(row => row.status !== "MATCH");
  if (stickHasDiff) sticksWithDiff++;

  console.log(`\n${"=".repeat(96)}`);
  console.log(`  ${key}    ours=${oLen}mm    ref=${rLen}mm${lenFlag}`);
  console.log(`${"=".repeat(96)}`);
  console.log(`  ${pad("OURS (" + (o?.ops.length ?? 0) + ")", 42)}    ${pad("REF (" + (r?.ops.length ?? 0) + ")", 42)}    DIFF`);
  console.log(`  ${"-".repeat(42)}    ${"-".repeat(42)}    ${"-".repeat(20)}`);

  for (const row of rows) {
    const oCol = pad(row.ours?.label ?? "", 42);
    const rCol = pad(row.ref?.label ?? "", 42);
    let mark;
    switch (row.status) {
      case "MATCH":     mark = "✓ MATCH";          totalMatch++;   break;
      case "POSDRIFT":  mark = `~ DRIFT ${row.drift.toFixed(1)}mm`; totalDrift++; break;
      case "MISSING":   mark = "− MISSING";        totalMissing++; break;
      case "EXTRA":     mark = "+ EXTRA";          totalExtra++;   break;
    }
    console.log(`  ${oCol}    ${rCol}    ${mark}`);
  }
}

console.log(`\n${"=".repeat(96)}`);
console.log(`  SUMMARY${filterFrame ? ` (frame: ${filterFrame})` : ""}`);
console.log(`${"=".repeat(96)}`);
console.log(`  ✓ Exact match:    ${totalMatch}`);
console.log(`  ~ Position drift: ${totalDrift}`);
console.log(`  − Missing ops:    ${totalMissing}`);
console.log(`  + Extra ops:      ${totalExtra}`);
console.log(`  Sticks with diffs: ${sticksWithDiff}`);
const denom = totalMatch + totalMissing + totalDrift;
const matchRate = denom > 0 ? (totalMatch / denom * 100).toFixed(1) : "0.0";
console.log(`  Op-level match rate: ${matchRate}%`);
