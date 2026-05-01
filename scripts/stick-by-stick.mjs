// Side-by-side stick comparison: two RFY files (ours vs reference).
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
    case "point":   return `${op.type}@${op.pos.toFixed(1)}`;
    case "spanned": return `${op.type}[${op.startPos.toFixed(1)}..${op.endPos.toFixed(1)}]`;
    case "start":   return `${op.type}@start`;
    case "end":     return `${op.type}@end`;
    default:        return JSON.stringify(op);
  }
}

function stickLine(stick) {
  const ops = (stick.tooling ?? []).map(fmtOp);
  return { name: stick.name, length: stick.length, ops };
}

function indexSticks(doc) {
  const map = new Map();
  for (const plan of doc.project.plans) {
    for (const frame of plan.frames) {
      for (const stick of frame.sticks) {
        const key = `${frame.name}/${stick.name}`;
        map.set(key, { plan: plan.name, frame: frame.name, ...stickLine(stick) });
      }
    }
  }
  return map;
}

const oursIdx = indexSticks(oursDoc);
const refIdx = indexSticks(refDoc);

const allKeys = new Set([...oursIdx.keys(), ...refIdx.keys()]);
const sortedKeys = [...allKeys].sort();

let printed = 0;
for (const key of sortedKeys) {
  const o = oursIdx.get(key);
  const r = refIdx.get(key);
  if (filterFrame && !key.startsWith(filterFrame + "/")) continue;
  if (!o && !r) continue;
  const oLen = o?.length ?? "?";
  const rLen = r?.length ?? "?";
  const lenDiff = (typeof oLen === "number" && typeof rLen === "number") ? (oLen - rLen) : 0;
  const lenFlag = Math.abs(lenDiff) > 0.5 ? `  !!! Δ${lenDiff.toFixed(1)}mm` : "";
  console.log(`\n=== ${key}    ours=${oLen}mm    ref=${rLen}mm${lenFlag} ===`);

  const oOps = [...(o?.ops ?? [])];
  const rOps = [...(r?.ops ?? [])];

  const sortKey = (s) => {
    const m = s.match(/[\d.]+/);
    return m ? parseFloat(m[0]) : 0;
  };
  oOps.sort((a, b) => sortKey(a) - sortKey(b));
  rOps.sort((a, b) => sortKey(a) - sortKey(b));

  console.log(`    OURS (${oOps.length})                                  REF (${rOps.length})`);
  for (let i = 0; i < Math.max(oOps.length, rOps.length); i++) {
    const oCol = (oOps[i] ?? "").padEnd(42);
    const rCol = rOps[i] ?? "";
    console.log(`    ${oCol}    ${rCol}`);
  }

  printed++;
  if (printed >= 25) {
    console.log(`\n... limit 25 sticks; pass frameName to narrow`);
    break;
  }
}
