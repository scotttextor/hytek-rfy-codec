#!/usr/bin/env node
/**
 * Compare two baseline reports and print a delta table.
 *
 * Usage:
 *   node scripts/compare-baselines.mjs scripts/baselines/before.json scripts/baselines/after.json
 */
import fs from "node:fs";

const [, , beforePath, afterPath] = process.argv;
if (!beforePath || !afterPath) { console.error("usage: compare-baselines.mjs <before.json> <after.json>"); process.exit(1); }
const before = JSON.parse(fs.readFileSync(beforePath, "utf8"));
const after  = JSON.parse(fs.readFileSync(afterPath, "utf8"));

const bp = before.totals.parity, ap = after.totals.parity;
const bm = before.totals.matched, am = after.totals.matched;
const br = before.totals.ref,     ar = after.totals.ref;
console.log(`\nOVERALL  ${bp.toFixed(2)}%  →  ${ap.toFixed(2)}%   (Δ ${(ap-bp).toFixed(2)}pp)   matched ${bm}/${br} → ${am}/${ar}`);
console.log("");

// Per-plan
const idx = (arr) => Object.fromEntries((arr.perPlan||[]).map(r => [r.rfy, r]));
const B = idx(before), A = idx(after);
const allRfys = [...new Set([...Object.keys(B), ...Object.keys(A)])].sort();
console.log("Per-plan parity (after vs before):");
console.log("RFY".padEnd(50) + "before  → after    Δ pp     matched delta");
console.log("─".repeat(108));
for (const rfy of allRfys) {
  const b = B[rfy], a = A[rfy];
  const bP = (b && b.parity != null) ? b.parity : null;
  const aP = (a && a.parity != null) ? a.parity : null;
  const dP = (bP != null && aP != null) ? aP - bP : null;
  const mb = b?.totals?.matched ?? "—", ma = a?.totals?.matched ?? "—";
  const ref = (b?.totals?.ref ?? a?.totals?.ref) ?? "—";
  const dm = (typeof mb === "number" && typeof ma === "number") ? (ma - mb) : "—";
  const arrow = dP == null ? "    " : (dP >= 0.5 ? "🟢  " : (dP <= -0.5 ? "🔴  " : "·   "));
  const bStr = bP == null ? "  —  " : `${bP.toFixed(1).padStart(5)}%`;
  const aStr = aP == null ? "  —  " : `${aP.toFixed(1).padStart(5)}%`;
  const dStr = dP == null ? "   —  " : `${(dP >= 0 ? "+" : "")}${dP.toFixed(1).padStart(5)}pp`;
  const mStr = `${mb}/${ref} → ${ma}/${ref}  (Δ ${dm})`;
  console.log(`${arrow}${rfy.padEnd(48)} ${bStr}  → ${aStr}    ${dStr}     ${mStr}`);
}
console.log("");

// Aggregate divergence delta
const tools = new Set([...Object.keys(before.aggMissing||{}), ...Object.keys(after.aggMissing||{}), ...Object.keys(before.aggExtras||{}), ...Object.keys(after.aggExtras||{})]);
console.log("Tool divergence (missing/extras):");
console.log("Tool".padEnd(20) + "missing  before→after   extras  before→after");
console.log("─".repeat(85));
for (const t of [...tools].sort()) {
  const bm = before.aggMissing?.[t] ?? 0, am = after.aggMissing?.[t] ?? 0;
  const be = before.aggExtras?.[t]  ?? 0, ae = after.aggExtras?.[t]  ?? 0;
  console.log(`${t.padEnd(20)} ${bm.toString().padStart(5)} → ${am.toString().padStart(5)}    ${be.toString().padStart(5)} → ${ae.toString().padStart(5)}`);
}
