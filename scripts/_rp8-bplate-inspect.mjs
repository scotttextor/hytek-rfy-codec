#!/usr/bin/env node
// Inspect B-plate length and op drifts on HG260044 GF-RP.
import fs from "node:fs";

const inFile = process.argv[2];
const diff = JSON.parse(fs.readFileSync(inFile, "utf8"));

const parseOp = (s) => {
  let m = s.match(/^([A-Za-z]+) ([-\d.]+)\.\.([-\d.]+)$/);
  if (m) return { type: m[1], kind: "spanned", startPos: +m[2], endPos: +m[3] };
  m = s.match(/^([A-Za-z]+) @([-\d.]+)$/);
  if (m) return { type: m[1], kind: "point", pos: +m[2] };
  m = s.match(/^([A-Za-z]+) @(start|end)$/);
  if (m) return { type: m[1], kind: "side", side: m[2] };
  return { type: "?", raw: s };
};

const opPos = (op) => op.kind === "point" ? op.pos : op.kind === "spanned" ? (op.startPos + op.endPos) / 2 : null;

console.log("=== B-PLATE DRIFT ANALYSIS HG260044 GF-RP ===");
console.log();

for (const f of diff.byFrame) {
  for (const stk of f.sticks) {
    if (!/^B\d/.test(stk.name)) continue;
    if (!(stk.missing && stk.missing.length) && !(stk.extras && stk.extras.length)) continue;
    const lenDelta = stk.refLength - stk.oursLength;
    console.log(`${f.name}/${stk.name} ours=${stk.oursLength.toFixed(2)} ref=${stk.refLength.toFixed(2)} dlen=${lenDelta.toFixed(2)}`);
    const miss = (stk.missing || []).map(parseOp);
    const extr = (stk.extras || []).map(parseOp);
    // Pair them up by type+kind, find drift in op positions
    const byTk = new Map();
    for (const op of miss) {
      const k = `${op.type}/${op.kind}`;
      if (!byTk.has(k)) byTk.set(k, { miss: [], extr: [] });
      byTk.get(k).miss.push(op);
    }
    for (const op of extr) {
      const k = `${op.type}/${op.kind}`;
      if (!byTk.has(k)) byTk.set(k, { miss: [], extr: [] });
      byTk.get(k).extr.push(op);
    }
    for (const [k, g] of byTk) {
      g.miss.sort((a, b) => opPos(a) - opPos(b));
      g.extr.sort((a, b) => opPos(a) - opPos(b));
      // For each miss, find nearest extr by position
      const claimed = new Set();
      const drifts = [];
      for (const m of g.miss) {
        let bestI = -1, bestD = Infinity;
        for (let i = 0; i < g.extr.length; i++) {
          if (claimed.has(i)) continue;
          const d = opPos(m) - opPos(g.extr[i]);
          if (Math.abs(d) < Math.abs(bestD)) { bestD = d; bestI = i; }
        }
        if (bestI >= 0 && Math.abs(bestD) < 60) {
          claimed.add(bestI);
          drifts.push({ d: bestD, miss: m, extr: g.extr[bestI] });
        } else {
          drifts.push({ d: null, miss: m, extr: null });
        }
      }
      const unpaired = [];
      for (let i = 0; i < g.extr.length; i++) if (!claimed.has(i)) unpaired.push(g.extr[i]);
      for (const dr of drifts) {
        if (dr.d != null) {
          const mPos = opPos(dr.miss);
          const ePos = opPos(dr.extr);
          const ms = mPos == null ? "?" : mPos.toFixed(1);
          const es = ePos == null ? "?" : ePos.toFixed(1);
          console.log(`    ${k.padEnd(20)} drift=${dr.d > 0 ? '+' : ''}${dr.d.toFixed(2).padStart(7)}  miss@${ms} extr@${es}`);
        } else {
          const mPos = opPos(dr.miss);
          console.log(`    ${k.padEnd(20)} drift=UNPAIRED MISSING  miss@${mPos != null ? mPos.toFixed(1) : '?'}`);
        }
      }
      for (const e of unpaired) {
        const ePos = opPos(e);
        console.log(`    ${k.padEnd(20)} drift=UNPAIRED EXTRA  extr@${ePos != null ? ePos.toFixed(1) : '?'}`);
      }
    }
    console.log();
  }
}
