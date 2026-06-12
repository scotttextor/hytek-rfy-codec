#!/usr/bin/env node
/**
 * Score one RFY against another, op-by-op, with the span-aware tiered metric.
 *
 * Usage:
 *   node scripts/score-rfy-pair.mjs <ours.rfy> <ref.rfy> [out.json]
 *
 * Pairs frames by name, then sticks by name (order within a name). Reports
 * parity at T1a (1.5mm) and T1b (0.01mm) and the 4 gap-bucket counts.
 * Build first: npm run build
 */
import fs from "node:fs";
import { decode, scoreOps } from "../dist/index.js";

const [, , oursPath, refPath, outJson] = process.argv;
if (!oursPath || !refPath) {
  console.error("Usage: node scripts/score-rfy-pair.mjs <ours.rfy> <ref.rfy> [out.json]");
  process.exit(2);
}

const oursDoc = decode(fs.readFileSync(oursPath));
const refDoc = decode(fs.readFileSync(refPath));

// Flatten ref frames by name (ref may span multiple plans).
const refFrames = new Map();
for (const p of refDoc.project.plans) for (const f of p.frames) refFrames.set(f.name, f);

// Group a frame's sticks by name, preserving order.
function sticksByName(frame) {
  const m = new Map();
  for (const s of frame.sticks) {
    if (!m.has(s.name)) m.set(s.name, []);
    m.get(s.name).push(s);
  }
  return m;
}

const TIERS = { T1a: 1.5, T1b: 0.01 };
const totals = {
  T1a: { matched: 0, ref: 0, ours: 0 },
  T1b: { matched: 0, ref: 0, ours: 0 },
  buckets: { "missing-rule": 0, "over-emission": 0, "wrong-gate": 0, "position-drift": 0 },
  byOpType: {}, // opType -> {missing, extra}
};

for (const ourFrame of oursDoc.project.plans[0].frames) {
  const refFrame = refFrames.get(ourFrame.name);
  if (!refFrame) continue;
  const ourByName = sticksByName(ourFrame);
  const refByName = sticksByName(refFrame);
  const names = new Set([...ourByName.keys(), ...refByName.keys()]);

  for (const name of names) {
    const ourList = ourByName.get(name) ?? [];
    const refList = refByName.get(name) ?? [];
    const n = Math.max(ourList.length, refList.length);
    for (let i = 0; i < n; i++) {
      const ourOps = ourList[i]?.tooling ?? [];
      const refOps = refList[i]?.tooling ?? [];

      for (const [tier, tol] of Object.entries(TIERS)) {
        const r = scoreOps(ourOps, refOps, { toleranceMm: tol });
        totals[tier].matched += r.matched.length;
        totals[tier].ref += r.refTotal;
        totals[tier].ours += r.oursTotal;
      }

      // Buckets + per-op-type from the functional tier (T1a).
      const fr = scoreOps(ourOps, refOps, { toleranceMm: TIERS.T1a });
      for (const g of fr.gaps) {
        totals.buckets[g.kind]++;
        const t = g.op.type;
        totals.byOpType[t] ??= { missing: 0, extra: 0 };
        if (g.side === "ref") totals.byOpType[t].missing++;
        else totals.byOpType[t].extra++;
      }
    }
  }
}

const pct = (m, r) => (r === 0 ? 100 : (100 * m) / r);
const report = {
  ours: oursPath,
  ref: refPath,
  parity: {
    T1a_1p5mm: { pct: pct(totals.T1a.matched, totals.T1a.ref), matched: totals.T1a.matched, ref: totals.T1a.ref, ours: totals.T1a.ours },
    T1b_0p01mm: { pct: pct(totals.T1b.matched, totals.T1b.ref), matched: totals.T1b.matched, ref: totals.T1b.ref, ours: totals.T1b.ours },
  },
  gapBuckets: totals.buckets,
  byOpType: totals.byOpType,
};

console.log(`\nT1a (1.5mm, machine-functional): ${report.parity.T1a_1p5mm.pct.toFixed(2)}%  (${totals.T1a.matched}/${totals.T1a.ref})`);
console.log(`T1b (0.01mm, geometry-faithful): ${report.parity.T1b_0p01mm.pct.toFixed(2)}%  (${totals.T1b.matched}/${totals.T1b.ref})`);
console.log(`\nGap buckets (at 1.5mm):`);
for (const [k, v] of Object.entries(totals.buckets)) console.log(`  ${k.padEnd(16)} ${v}`);
console.log(`\nTop divergent op types (missing | extra):`);
Object.entries(totals.byOpType)
  .sort((a, b) => (b[1].missing + b[1].extra) - (a[1].missing + a[1].extra))
  .slice(0, 10)
  .forEach(([t, v]) => console.log(`  ${t.padEnd(14)} ${String(v.missing).padStart(5)} | ${v.extra}`));

if (outJson) {
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outJson}`);
}
