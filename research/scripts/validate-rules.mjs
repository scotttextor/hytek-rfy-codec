// Validate the rules engine against real Detailer outputs.
//
// For each stick in the corpus:
//   1. Read its actual ops (Detailer's output)
//   2. Generate ops from my rules engine using only stick metadata
//   3. Compare the two sets, classify each op as:
//        EXACT       — same kind, type, position (within tolerance)
//        OURS_ONLY   — my engine emitted but Detailer didn't
//        DETAILER_ONLY — Detailer emitted but my engine didn't
//
// Reports:
//   - Per-op-type match counts
//   - Per-stick-group accuracy %
//   - Sample mismatches for human review
//
// Usage:
//   node validate-rules.mjs                      # uses fixture
//   node validate-rules.mjs path/to/db.csv       # uses corpus DB

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeXml, generateTooling, generateFrameContextOps } from "../../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, "..", "output");

const POS_TOLERANCE = 1.0;  // mm — positions within this are considered matching

// Use either the decoded fixture XML directly OR a stick-database.csv
const fixturePath = join(__dirname, "..", "..", "test", "fixtures", "HG260001_LOT289_decrypted.xml");
const xml = readFileSync(fixturePath, "utf8");
const doc = decodeXml(xml);
console.log(`Loaded fixture: ${doc.project.jobNum}, ${doc.project.plans.length} plans`);

const log = (msg) => process.stdout.write(msg + "\n");

// ---------- Build flat list of (stick, actualOps) pairs ----------
const sticks = [];
for (const plan of doc.project.plans) {
  for (const frame of plan.frames) {
    // Compute frame-context ops once per frame
    const contextOps = generateFrameContextOps(frame);
    for (const stick of frame.sticks) {
      const role = (stick.name ?? "").replace(/[0-9_].*$/, "") || stick.type;
      const profileFamily = stick.profile?.metricLabel?.replace(/\s/g, "") ?? "unknown";
      sticks.push({
        planName: plan.name, frameName: frame.name, stickName: stick.name,
        role, profileFamily,
        gauge: stick.profile?.gauge ?? "0.75",
        flipped: !!stick.flipped,
        length: stick.length,
        actualOps: stick.tooling ?? [],
        contextOps: contextOps.get(stick.name) ?? [],
      });
    }
  }
}
log(`Extracted ${sticks.length} sticks`);

// ---------- Compare ops set-wise ----------
function opKey(op, stickLength) {
  // Quantize position to nearest mm and stable-stringify
  const pos = op.kind === "spanned" ? op.startPos : (op.kind === "point" ? op.pos : (op.kind === "start" ? 0 : stickLength));
  const endPos = op.kind === "spanned" ? op.endPos : pos;
  return `${op.kind}|${op.type}|${Math.round(pos)}|${Math.round(endPos)}`;
}

function compare(actualOps, generatedOps, stickLength) {
  const actualMap = new Map();
  for (const op of actualOps) actualMap.set(opKey(op, stickLength), op);
  const genMap = new Map();
  for (const op of generatedOps) genMap.set(opKey(op, stickLength), op);

  const exact = [], detailerOnly = [], oursOnly = [];
  // First pass: exact key matches
  for (const [k, v] of actualMap) {
    if (genMap.has(k)) {
      exact.push(v);
      genMap.delete(k);
      actualMap.delete(k);
    }
  }
  // Second pass: position-tolerant fuzzy match (same kind+type, position within tolerance)
  for (const [k, actual] of [...actualMap]) {
    let best = null;
    for (const [gk, gen] of genMap) {
      if (gen.kind !== actual.kind || gen.type !== actual.type) continue;
      const ap = actual.kind === "spanned" ? actual.startPos : (actual.kind === "point" ? actual.pos : 0);
      const gp = gen.kind === "spanned" ? gen.startPos : (gen.kind === "point" ? gen.pos : 0);
      const d = Math.abs(ap - gp);
      if (d <= POS_TOLERANCE && (!best || d < best.d)) best = { gk, gen, d };
    }
    if (best) {
      exact.push(actual);
      genMap.delete(best.gk);
      actualMap.delete(k);
    }
  }
  // Whatever's left: DETAILER_ONLY in actualMap, OURS_ONLY in genMap
  detailerOnly.push(...actualMap.values());
  oursOnly.push(...genMap.values());
  return { exact, detailerOnly, oursOnly };
}

// ---------- Run validation ----------
const stats = {
  totalSticks: 0,
  totalActual: 0,
  totalGenerated: 0,
  totalExact: 0,
  totalDetailerOnly: 0,
  totalOursOnly: 0,
};
const opTypeStats = {};   // opType → { exact, detailerOnly, oursOnly }
const groupStats = {};    // role|profile|bucket → { sticks, exact, det, ours }
const sampleMismatches = [];

function bucket(len) { if (len<=500) return "<=500"; if (len<=1500) return "500-1500"; if (len<=3000) return "1500-3000"; if (len<=6000) return "3000-6000"; return ">6000"; }

for (const s of sticks) {
  const baseOps = generateTooling({
    role: s.role,
    length: s.length,
    profileFamily: s.profileFamily,
    gauge: s.gauge,
    flipped: s.flipped,
    planName: s.planName,
    frameName: s.frameName,
  });
  const generated = [...baseOps, ...s.contextOps];
  const r = compare(s.actualOps, generated, s.length);
  stats.totalSticks++;
  stats.totalActual += s.actualOps.length;
  stats.totalGenerated += generated.length;
  stats.totalExact += r.exact.length;
  stats.totalDetailerOnly += r.detailerOnly.length;
  stats.totalOursOnly += r.oursOnly.length;

  const groupKey = `${s.role}|${s.profileFamily}|${bucket(s.length)}`;
  if (!groupStats[groupKey]) groupStats[groupKey] = { sticks: 0, exact: 0, det: 0, ours: 0, actual: 0, gen: 0 };
  const g = groupStats[groupKey];
  g.sticks++;
  g.exact += r.exact.length;
  g.det += r.detailerOnly.length;
  g.ours += r.oursOnly.length;
  g.actual += s.actualOps.length;
  g.gen += generated.length;

  for (const op of r.exact) {
    if (!opTypeStats[op.type]) opTypeStats[op.type] = { exact: 0, det: 0, ours: 0 };
    opTypeStats[op.type].exact++;
  }
  for (const op of r.detailerOnly) {
    if (!opTypeStats[op.type]) opTypeStats[op.type] = { exact: 0, det: 0, ours: 0 };
    opTypeStats[op.type].det++;
  }
  for (const op of r.oursOnly) {
    if (!opTypeStats[op.type]) opTypeStats[op.type] = { exact: 0, det: 0, ours: 0 };
    opTypeStats[op.type].ours++;
  }

  // Capture some sample mismatches
  if (sampleMismatches.length < 20 && (r.detailerOnly.length || r.oursOnly.length)) {
    sampleMismatches.push({ stick: `${s.planName}/${s.frameName}/${s.stickName}`, role: s.role, length: s.length, profile: s.profileFamily, det: r.detailerOnly, ours: r.oursOnly, exact: r.exact.length });
  }
}

// ---------- Report ----------
const out = [];
out.push("# Rules engine validation");
out.push(`# ${stats.totalSticks} sticks · ${stats.totalActual} actual ops · ${stats.totalGenerated} generated ops`);
out.push("");
out.push(`## Overall`);
out.push(`  Detailer ops:        ${stats.totalActual}`);
out.push(`  Generated ops:       ${stats.totalGenerated}`);
out.push(`  Exact matches:       ${stats.totalExact}  (${(stats.totalExact / stats.totalActual * 100).toFixed(1)}% of Detailer's)`);
out.push(`  Missed (D-only):     ${stats.totalDetailerOnly}`);
out.push(`  Extra (ours):        ${stats.totalOursOnly}`);
out.push(`  Recall:              ${(stats.totalExact / stats.totalActual * 100).toFixed(1)}%`);
out.push(`  Precision:           ${(stats.totalExact / Math.max(1, stats.totalGenerated) * 100).toFixed(1)}%`);
out.push("");

out.push(`## Per op type`);
const sortedOpTypes = Object.entries(opTypeStats).sort((a,b)=>(b[1].exact+b[1].det+b[1].ours)-(a[1].exact+a[1].det+a[1].ours));
for (const [t, s] of sortedOpTypes) {
  const total = s.exact + s.det + s.ours;
  const recall = s.exact / Math.max(1, s.exact + s.det) * 100;
  out.push(`  ${t.padEnd(15)} exact=${String(s.exact).padStart(5)}  missed=${String(s.det).padStart(5)}  extra=${String(s.ours).padStart(5)}   recall=${recall.toFixed(0).padStart(3)}%`);
}
out.push("");

out.push(`## Per stick group (top 20 by stick count)`);
const sortedGroups = Object.entries(groupStats).sort((a,b)=>b[1].sticks - a[1].sticks).slice(0, 20);
for (const [k, g] of sortedGroups) {
  const recall = g.exact / Math.max(1, g.actual) * 100;
  out.push(`  ${k.padEnd(28)} ${g.sticks.toString().padStart(4)} sticks  ${g.actual.toString().padStart(5)} actual / ${g.gen.toString().padStart(5)} gen  exact=${g.exact.toString().padStart(5)}  recall=${recall.toFixed(0).padStart(3)}%`);
}
out.push("");

out.push(`## Sample mismatches (first 20)`);
for (const m of sampleMismatches) {
  out.push(`  ${m.stick}  role=${m.role}  length=${m.length}  profile=${m.profile}  exact=${m.exact}`);
  for (const op of m.det.slice(0, 6)) {
    const pos = op.kind === "spanned" ? `${op.startPos}..${op.endPos}` : (op.kind === "point" ? op.pos : op.kind);
    out.push(`     [DETAILER had]   ${op.type}  ${op.kind}  ${pos}`);
  }
  for (const op of m.ours.slice(0, 6)) {
    const pos = op.kind === "spanned" ? `${op.startPos}..${op.endPos}` : (op.kind === "point" ? op.pos : op.kind);
    out.push(`     [we generated]   ${op.type}  ${op.kind}  ${pos}`);
  }
  out.push("");
}

const outPath = join(OUTPUT, "validation-fixture.txt");
writeFileSync(outPath, out.join("\n"));
log(`Wrote: ${outPath}`);
log(`\nSummary: ${stats.totalExact} / ${stats.totalActual} ops matched (${(stats.totalExact / stats.totalActual * 100).toFixed(1)}% recall)`);
log(`Generated ${stats.totalGenerated} ops (${(stats.totalExact / Math.max(1, stats.totalGenerated) * 100).toFixed(1)}% precision)`);
