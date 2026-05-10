#!/usr/bin/env node
/**
 * Categorize InnerDimple drift signatures across an entire corpus baseline.
 *
 * Reads scripts/baselines/<corpus>/raw/*.json, walks every (frame, stick) and
 * pairs missing+extras InnerDimple ops within ±5mm to identify "drift-pairs"
 * vs "true missing" / "true extras". Then groups by:
 *   - stick role + profile family
 *   - drift magnitude (rounded to 0.5mm)
 *   - drift sign
 *   - position context (near-end / near-start / mid-stick)
 *
 * Usage:
 *   node scripts/analyze-innerdimple-drift.mjs scripts/baselines/hg260044/raw
 *   node scripts/analyze-innerdimple-drift.mjs scripts/baselines/hg260001/raw
 */
import fs from "node:fs";
import path from "node:path";

const inDir = process.argv[2];
if (!inDir) {
  console.error("Usage: node analyze-innerdimple-drift.mjs <baseline-raw-dir>");
  process.exit(1);
}

// Parse "InnerDimple @123.4" → 123.4
function parseDimplePos(s) {
  const m = String(s).match(/^InnerDimple @(-?\d+(?:\.\d+)?)$/);
  return m ? parseFloat(m[1]) : null;
}

// Determine stick role from name: "S1" → "S", "Kb2" → "Kb", "T1" → "T", etc.
function roleFromName(name) {
  const m = String(name).match(/^([A-Za-z]+)/);
  return m ? m[1] : "?";
}

const PAIR_TOL = 5.0; // mm — pair missing↔extra within this magnitude

const driftPairs = []; // {plan,frame,stick,role,oursLen,refLen,missingPos,extrasPos,delta,context}
const trueMissing = []; // {plan,frame,stick,role,oursLen,refLen,missingPos}
const trueExtras = [];  // {plan,frame,stick,role,oursLen,refLen,extrasPos}

const files = fs.readdirSync(inDir).filter(f => f.endsWith(".json"));
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(`${inDir}/${file}`, "utf8"));
  const planName = file.replace(/\.json$/, "");
  for (const f of data.byFrame ?? []) {
    for (const s of f.sticks ?? []) {
      const role = roleFromName(s.name);
      const oursLen = s.oursLength;
      const refLen = s.refLength;
      const missingDimples = (s.missing ?? []).map(parseDimplePos).filter(p => p !== null);
      const extrasDimples = (s.extras ?? []).map(parseDimplePos).filter(p => p !== null);
      // Pair greedily: each missing finds nearest extra within tolerance
      const usedExtras = new Set();
      for (const mp of missingDimples) {
        let bestIdx = -1, bestDelta = Infinity;
        for (let i = 0; i < extrasDimples.length; i++) {
          if (usedExtras.has(i)) continue;
          const d = extrasDimples[i] - mp;
          if (Math.abs(d) <= PAIR_TOL && Math.abs(d) < Math.abs(bestDelta)) {
            bestDelta = d;
            bestIdx = i;
          }
        }
        const useLen = refLen ?? oursLen ?? 1;
        const ctx = mp < 50 ? "near-start"
                  : mp > useLen - 50 ? "near-end"
                  : mp < 200 ? "start-cluster"
                  : mp > useLen - 200 ? "end-cluster"
                  : "mid";
        if (bestIdx >= 0) {
          usedExtras.add(bestIdx);
          driftPairs.push({
            plan: planName, frame: f.name, stick: s.name, role,
            oursLen, refLen,
            missingPos: mp, extrasPos: extrasDimples[bestIdx],
            delta: extrasDimples[bestIdx] - mp,
            context: ctx,
          });
        } else {
          trueMissing.push({
            plan: planName, frame: f.name, stick: s.name, role,
            oursLen, refLen, missingPos: mp, context: ctx,
          });
        }
      }
      for (let i = 0; i < extrasDimples.length; i++) {
        if (usedExtras.has(i)) continue;
        const ep = extrasDimples[i];
        const useLen = oursLen ?? refLen ?? 1;
        const ctx = ep < 50 ? "near-start"
                  : ep > useLen - 50 ? "near-end"
                  : ep < 200 ? "start-cluster"
                  : ep > useLen - 200 ? "end-cluster"
                  : "mid";
        trueExtras.push({
          plan: planName, frame: f.name, stick: s.name, role,
          oursLen, refLen, extrasPos: ep, context: ctx,
        });
      }
    }
  }
}

const totalMissing = driftPairs.length + trueMissing.length;
const totalExtras = driftPairs.length + trueExtras.length;
console.log(`InnerDimple drift analysis — ${path.basename(inDir)}`);
console.log(`  Total missing : ${totalMissing}`);
console.log(`  Total extras  : ${totalExtras}`);
console.log(`  Drift pairs   : ${driftPairs.length} (matched within ±${PAIR_TOL}mm)`);
console.log(`  True missing  : ${trueMissing.length} (no nearby extra)`);
console.log(`  True extras   : ${trueExtras.length} (no nearby missing)`);
console.log("");

// 1. Drift magnitude histogram (round to 0.5mm)
console.log("=== Drift-pair magnitude histogram (rounded to 0.5mm) ===");
const magHist = new Map();
for (const dp of driftPairs) {
  const bucket = Math.round(dp.delta * 2) / 2;
  magHist.set(bucket, (magHist.get(bucket) ?? 0) + 1);
}
const magsSorted = [...magHist.entries()].sort((a, b) => b[1] - a[1]);
for (const [delta, count] of magsSorted.slice(0, 15)) {
  const sign = delta > 0 ? "+" : "";
  console.log(`  ${sign}${delta}mm: ${count}`);
}
console.log("");

// 2. By role + dominant magnitude
console.log("=== Drift pairs by stick role × magnitude bucket (top 25) ===");
const roleMagHist = new Map();
for (const dp of driftPairs) {
  const bucket = Math.round(dp.delta * 2) / 2;
  const key = `${dp.role}|${bucket}`;
  roleMagHist.set(key, (roleMagHist.get(key) ?? 0) + 1);
}
const rmSorted = [...roleMagHist.entries()].sort((a, b) => b[1] - a[1]);
for (const [key, count] of rmSorted.slice(0, 25)) {
  const [role, delta] = key.split("|");
  const sign = parseFloat(delta) > 0 ? "+" : "";
  console.log(`  ${role.padEnd(6)} ${sign}${delta}mm  ×${count}`);
}
console.log("");

// 3. Same with context
console.log("=== Drift pairs by role × magnitude × context (top 30) ===");
const fullHist = new Map();
for (const dp of driftPairs) {
  const bucket = Math.round(dp.delta * 2) / 2;
  const key = `${dp.role}|${bucket}|${dp.context}`;
  fullHist.set(key, (fullHist.get(key) ?? 0) + 1);
}
const fhSorted = [...fullHist.entries()].sort((a, b) => b[1] - a[1]);
for (const [key, count] of fhSorted.slice(0, 30)) {
  const [role, delta, ctx] = key.split("|");
  const sign = parseFloat(delta) > 0 ? "+" : "";
  console.log(`  ${role.padEnd(6)} ${sign}${delta.padEnd(5)}mm  ${ctx.padEnd(14)}  ×${count}`);
}
console.log("");

// 4. By plan-pattern
console.log("=== Drift pairs by plan-class (LBW vs NLBW vs LIN vs TB2B vs RP vs other) ===");
function planClass(plan) {
  const p = plan.toUpperCase();
  if (/-LIN-/.test(p)) return "LIN";
  if (/-TB2B-/.test(p)) return "TB2B";
  if (/-TIN-/.test(p)) return "TIN";
  if (/-RP-/.test(p)) return "RP";
  if (/-NLBW-/.test(p)) return "NLBW";
  if (/-LBW-/.test(p)) return "LBW";
  if (/-MH-/.test(p)) return "MH";
  if (/-CP-/.test(p)) return "CP";
  return "OTHER";
}
const planHist = new Map();
for (const dp of driftPairs) {
  const c = planClass(dp.plan);
  planHist.set(c, (planHist.get(c) ?? 0) + 1);
}
for (const [c, n] of [...planHist.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${c.padEnd(6)} ${n}`);
}
console.log("");

// 5. True missing by role + context
console.log("=== True MISSING (no nearby extra) by role × context (top 20) ===");
const tmHist = new Map();
for (const tm of trueMissing) {
  const key = `${tm.role}|${tm.context}`;
  tmHist.set(key, (tmHist.get(key) ?? 0) + 1);
}
for (const [key, n] of [...tmHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  const [role, ctx] = key.split("|");
  console.log(`  ${role.padEnd(6)} ${ctx.padEnd(14)}  ${n}`);
}
console.log("");

// 6. True extras by role + context
console.log("=== True EXTRAS (no nearby missing) by role × context (top 20) ===");
const teHist = new Map();
for (const te of trueExtras) {
  const key = `${te.role}|${te.context}`;
  teHist.set(key, (teHist.get(key) ?? 0) + 1);
}
for (const [key, n] of [...teHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  const [role, ctx] = key.split("|");
  console.log(`  ${role.padEnd(6)} ${ctx.padEnd(14)}  ${n}`);
}
console.log("");

// 7. Sample of dominant-cluster details (for actionable inspection)
const TOP_CLUSTER = fhSorted[0];
if (TOP_CLUSTER) {
  const [topRole, topDelta, topCtx] = TOP_CLUSTER[0].split("|");
  const topDeltaN = parseFloat(topDelta);
  console.log(`=== Sample of TOP cluster: ${topRole} ${topDelta}mm ${topCtx} (showing 20) ===`);
  let n = 0;
  for (const dp of driftPairs) {
    const bucket = Math.round(dp.delta * 2) / 2;
    if (dp.role === topRole && bucket === topDeltaN && dp.context === topCtx) {
      console.log(`  ${dp.plan} ${dp.frame} ${dp.stick}  oursLen=${dp.oursLen} refLen=${dp.refLen}  missing@${dp.missingPos}  extra@${dp.extrasPos}  Δ=${dp.delta.toFixed(2)}`);
      if (++n >= 20) break;
    }
  }
}

// Dump full breakdown to JSON for follow-up
const out = path.resolve(`/tmp/dimple-analysis-${path.basename(inDir)}.json`);
fs.writeFileSync(out, JSON.stringify({ driftPairs, trueMissing, trueExtras }, null, 2));
console.log(`\nFull JSON: ${out}`);
