#!/usr/bin/env node
// RP8 histogram — analyze remaining gap patterns vs Detailer reference.
//
// Usage: node scripts/_rp8-histogram.mjs <diff.json>
//
// Buckets remaining ops by:
//   - role: T (top plate), B (bottom plate), N (nog), S (stud), Kb, H, R, other
//   - drift signature: length delta, start anchor drift, end anchor drift,
//     point ID position drift
//   - op type
// Outputs top clusters in descending order.

import fs from "node:fs";

const inFile = process.argv[2];
if (!inFile) {
  console.error("Usage: node scripts/_rp8-histogram.mjs <diff.json>");
  process.exit(1);
}

const diff = JSON.parse(fs.readFileSync(inFile, "utf8"));

const ROLE_OF = (name) => {
  const m = name.match(/^([A-Z]+)(\d+)/);
  if (!m) return "?";
  const r = m[1];
  if (r === "Kb") return "Kb";
  if (r === "T" || r === "B" || r === "N" || r === "S" || r === "H" || r === "R") return r;
  return r;
};

// Parse an op string into structured form. Returns {type, kind, pos?, startPos?, endPos?, side?}
const parseOp = (s) => {
  // Spanned: "LipNotch 1285.2..1346.6"
  let m = s.match(/^([A-Za-z]+) ([-\d.]+)\.\.([-\d.]+)$/);
  if (m) return { type: m[1], kind: "spanned", startPos: +m[2], endPos: +m[3] };
  // Point: "InnerDimple @1297.7"
  m = s.match(/^([A-Za-z]+) @([-\d.]+)$/);
  if (m) return { type: m[1], kind: "point", pos: +m[2] };
  // Side: "Chamfer @start" or "Chamfer @end"
  m = s.match(/^([A-Za-z]+) @(start|end)$/);
  if (m) return { type: m[1], kind: "side", side: m[2] };
  return { type: "?", kind: "?", raw: s };
};

// Match missing→extra pairs by nearest position (only same type+kind),
// for each stick, to compute drift signature.
const pairOps = (missing, extras) => {
  // group by (type, kind)
  const groups = new Map();
  const key = (op) => `${op.type}/${op.kind}`;
  for (const op of missing) {
    const k = key(op);
    if (!groups.has(k)) groups.set(k, { miss: [], extr: [] });
    groups.get(k).miss.push(op);
  }
  for (const op of extras) {
    const k = key(op);
    if (!groups.has(k)) groups.set(k, { miss: [], extr: [] });
    groups.get(k).extr.push(op);
  }
  const pairs = [];
  for (const [k, g] of groups) {
    // greedy match: for each miss, find nearest extr within 50mm
    const claimed = new Set();
    for (const m of g.miss) {
      let bestIdx = -1, bestD = 51;
      for (let i = 0; i < g.extr.length; i++) {
        if (claimed.has(i)) continue;
        const e = g.extr[i];
        let d;
        if (m.kind === "spanned") {
          d = Math.abs((m.startPos + m.endPos) / 2 - (e.startPos + e.endPos) / 2);
        } else if (m.kind === "point") {
          d = Math.abs(m.pos - e.pos);
        } else {
          d = m.side === e.side ? 0 : 99;
        }
        if (d < bestD) { bestD = d; bestIdx = i; }
      }
      if (bestIdx >= 0) {
        claimed.add(bestIdx);
        pairs.push({ miss: m, extr: g.extr[bestIdx], d: bestD });
      } else {
        pairs.push({ miss: m, extr: null, d: null });
      }
    }
    for (let i = 0; i < g.extr.length; i++) {
      if (!claimed.has(i)) pairs.push({ miss: null, extr: g.extr[i], d: null });
    }
  }
  return pairs;
};

// Cohort buckets
const byRole = new Map();
const byRoleAndDrift = new Map();
const byRoleAndOpType = new Map();
const driftByRole = new Map(); // role -> [{d, kind, type, frame, stick}]
const lengthDeltaByRole = new Map(); // role -> array of lengthDelta
const sticksWithLenDelta = []; // {frame, stick, role, lenDelta, missCount, extraCount}

for (const f of diff.byFrame) {
  for (const stk of f.sticks) {
    const role = ROLE_OF(stk.name);
    const lenDelta = stk.refLength - stk.oursLength;
    if (lenDelta != null) {
      if (!lengthDeltaByRole.has(role)) lengthDeltaByRole.set(role, []);
      lengthDeltaByRole.get(role).push({ frame: f.name, stick: stk.name, lenDelta });
    }
    if ((stk.missing && stk.missing.length) || (stk.extras && stk.extras.length)) {
      sticksWithLenDelta.push({
        frame: f.name, stick: stk.name, role, lenDelta,
        oursLen: stk.oursLength, refLen: stk.refLength,
        missCount: (stk.missing || []).length,
        extraCount: (stk.extras || []).length,
      });
    }
    const miss = (stk.missing || []).map(parseOp);
    const extr = (stk.extras || []).map(parseOp);
    for (const op of miss) {
      byRole.set(role, (byRole.get(role) || 0) + 1);
      const k = role + "::missing::" + op.type + "/" + op.kind;
      byRoleAndOpType.set(k, (byRoleAndOpType.get(k) || 0) + 1);
    }
    for (const op of extr) {
      byRole.set(role + "_extra", (byRole.get(role + "_extra") || 0) + 1);
      const k = role + "::extra::" + op.type + "/" + op.kind;
      byRoleAndOpType.set(k, (byRoleAndOpType.get(k) || 0) + 1);
    }
    const pairs = pairOps(miss, extr);
    for (const p of pairs) {
      if (p.miss && p.extr) {
        // Compute signed drift: missing.pos - extras.pos (positive = ref is further along)
        let d;
        if (p.miss.kind === "spanned") {
          d = (p.miss.startPos + p.miss.endPos) / 2 - (p.extr.startPos + p.extr.endPos) / 2;
        } else if (p.miss.kind === "point") {
          d = p.miss.pos - p.extr.pos;
        } else d = 0;
        const sig = d < -25 ? "<-25" : d < -10 ? "-25..-10" : d < -5 ? "-10..-5" : d < -2 ? "-5..-2" : d < -0.5 ? "-2..-0.5" : d < 0.5 ? "~0" : d < 2 ? "0.5..2" : d < 5 ? "2..5" : d < 10 ? "5..10" : d < 25 ? "10..25" : ">25";
        const k = role + "::" + p.miss.type + "/" + p.miss.kind + "::drift " + sig;
        byRoleAndDrift.set(k, (byRoleAndDrift.get(k) || 0) + 1);
        if (!driftByRole.has(role)) driftByRole.set(role, []);
        driftByRole.get(role).push({
          d, type: p.miss.type, kind: p.miss.kind,
          frame: f.name, stick: stk.name,
          miss: p.miss, extr: p.extr,
          lenDelta,
        });
      } else if (p.miss) {
        const k = role + "::" + p.miss.type + "/" + p.miss.kind + "::UNPAIRED-MISS";
        byRoleAndDrift.set(k, (byRoleAndDrift.get(k) || 0) + 1);
      } else if (p.extr) {
        const k = role + "::" + p.extr.type + "/" + p.extr.kind + "::UNPAIRED-EXTRA";
        byRoleAndDrift.set(k, (byRoleAndDrift.get(k) || 0) + 1);
      }
    }
  }
}

console.log("=== HG260044 GF-RP REMAINING GAPS ===");
console.log();
console.log("Totals: ours=" + diff.totals.ours + " ref=" + diff.totals.ref + " matched=" + diff.totals.matched);
console.log("Missing=" + diff.totals.missing + " Extras=" + diff.totals.extras);
console.log();

console.log("--- TOP MISSING+EXTRA BY ROLE ---");
const roleAgg = new Map();
for (const [k, v] of byRole) {
  const isExtra = k.endsWith("_extra");
  const role = isExtra ? k.slice(0, -6) : k;
  if (!roleAgg.has(role)) roleAgg.set(role, { miss: 0, extr: 0 });
  if (isExtra) roleAgg.get(role).extr += v;
  else roleAgg.get(role).miss += v;
}
for (const [role, c] of [...roleAgg.entries()].sort((a, b) => (b[1].miss + b[1].extr) - (a[1].miss + a[1].extr))) {
  console.log("  " + role.padEnd(6) + " miss=" + String(c.miss).padStart(4) + " extr=" + String(c.extr).padStart(4) + " total=" + (c.miss + c.extr));
}

console.log();
console.log("--- TOP 30 (role::type/kind::drift) ---");
const sorted = [...byRoleAndDrift.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
for (const [k, v] of sorted) {
  console.log("  " + String(v).padStart(4) + "  " + k);
}

console.log();
console.log("--- TOP 25 sticks by miss+extra count ---");
const sortedStk = sticksWithLenDelta.sort((a, b) => (b.missCount + b.extraCount) - (a.missCount + a.extraCount)).slice(0, 25);
for (const s of sortedStk) {
  const ld = s.lenDelta == null ? "?" : s.lenDelta.toFixed(2);
  console.log(`  ${s.frame.padEnd(4)} ${s.stick.padEnd(5)} role=${s.role.padEnd(3)} miss=${String(s.missCount).padStart(2)} extr=${String(s.extraCount).padStart(2)}  lenDelta=${ld.padStart(7)}  ours=${(s.oursLen ?? 0).toFixed(1).padStart(7)}  ref=${(s.refLen ?? 0).toFixed(1).padStart(7)}`);
}

console.log();
console.log("--- LENGTH DELTA HISTOGRAM by role (ref - ours) ---");
for (const [role, arr] of lengthDeltaByRole) {
  const buckets = { "<-5": 0, "-5..-2": 0, "-2..-0.5": 0, "~0": 0, "0.5..2": 0, "2..5": 0, "5..10": 0, ">10": 0 };
  for (const r of arr) {
    const d = r.lenDelta;
    if (d < -5) buckets["<-5"]++;
    else if (d < -2) buckets["-5..-2"]++;
    else if (d < -0.5) buckets["-2..-0.5"]++;
    else if (d < 0.5) buckets["~0"]++;
    else if (d < 2) buckets["0.5..2"]++;
    else if (d < 5) buckets["2..5"]++;
    else if (d < 10) buckets["5..10"]++;
    else buckets[">10"]++;
  }
  const total = arr.length;
  console.log(`  ${role.padEnd(4)} n=${total}  ` + Object.entries(buckets).map(([b, c]) => `${b}:${c}`).join("  "));
}

console.log();
console.log("--- DRIFT VALUE HISTOGRAM by role (sub-mm precision, paired miss-extr) ---");
for (const [role, arr] of driftByRole) {
  const buckets = new Map();
  for (const r of arr) {
    const b = Math.round(r.d * 2) / 2;  // 0.5mm bucket
    buckets.set(b, (buckets.get(b) || 0) + 1);
  }
  const sortedBuckets = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`  ${role.padEnd(4)} n=${arr.length}  top: ` + sortedBuckets.map(([b, c]) => `${b > 0 ? "+" : ""}${b}:${c}`).join("  "));
}

console.log();
console.log("--- ROLE × LENGTH-DELTA SIGNATURES ---");
// For each (role, lenDeltaBucket), count occurrences in sticks with gaps.
const sigCount = new Map();
for (const s of sticksWithLenDelta) {
  const d = s.lenDelta;
  let bucket;
  if (d == null) bucket = "?";
  else if (d < -2) bucket = "<-2";
  else if (d < -0.5) bucket = "-2..-0.5";
  else if (d < 0.5) bucket = "~0";
  else if (d < 2) bucket = "0.5..2";
  else if (d < 5) bucket = "2..5";
  else if (d < 10) bucket = "5..10";
  else bucket = ">10";
  const k = s.role + "::" + bucket;
  if (!sigCount.has(k)) sigCount.set(k, { n: 0, miss: 0, extr: 0 });
  const e = sigCount.get(k);
  e.n++;
  e.miss += s.missCount;
  e.extr += s.extraCount;
}
const sorted2 = [...sigCount.entries()].sort((a, b) => (b[1].miss + b[1].extr) - (a[1].miss + a[1].extr));
for (const [k, v] of sorted2.slice(0, 20)) {
  console.log(`  ${k.padEnd(22)} sticks=${String(v.n).padStart(3)}  miss=${String(v.miss).padStart(4)}  extr=${String(v.extr).padStart(4)}  total=${v.miss + v.extr}`);
}
