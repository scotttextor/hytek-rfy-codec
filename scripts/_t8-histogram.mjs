#!/usr/bin/env node
/**
 * Build a histogram of Web@pt missing/extras pairs per stick.
 *
 * For each stick that has both `missing` and `extras` Web@pt ops, attempt to
 * pair each missing with its closest extra (greedy by absolute Δ), to expose
 * the underlying arithmetic-precision drifts.
 */
import fs from "node:fs";

const path = process.argv[2] ?? "C:/Users/Scott/AppData/Local/Temp/t8-pk12.json";
const json = JSON.parse(fs.readFileSync(path, "utf8"));

const buckets = { same:0, ltOne:0, ltFive:0, ltTen:0, ltFifty:0, ltHundred:0, big:0 };
const all = [];

const parseWebs = arr => (arr || [])
  .filter(s => s.startsWith("Web @"))
  .map(s => parseFloat(s.replace(/^Web @/, "")))
  .sort((a, b) => a - b);

for (const f of json.byFrame || []) {
  for (const s of f.sticks || []) {
    const miss = parseWebs(s.missing);
    const ext = parseWebs(s.extras);
    if (!miss.length && !ext.length) continue;
    // Greedy pair: for each miss, find closest ext within 500mm
    const used = new Set();
    const pairs = [];
    for (const m of miss) {
      let best = -1, bestD = Infinity;
      for (let i = 0; i < ext.length; i++) {
        if (used.has(i)) continue;
        const d = Math.abs(ext[i] - m);
        if (d < bestD) { best = i; bestD = d; }
      }
      if (best >= 0 && bestD < 500) {
        used.add(best);
        pairs.push({ miss: m, ext: ext[best], delta: ext[best] - m });
      } else {
        pairs.push({ miss: m, ext: null, delta: null });
      }
    }
    for (let i = 0; i < ext.length; i++) {
      if (used.has(i)) continue;
      pairs.push({ miss: null, ext: ext[i], delta: null });
    }
    for (const p of pairs) {
      all.push({ frame: f.name, stick: s.name, ...p, stickLen: s.refLength });
      if (p.delta == null) continue;
      const d = Math.abs(p.delta);
      if (d < 0.01) buckets.same++;
      else if (d < 1) buckets.ltOne++;
      else if (d < 5) buckets.ltFive++;
      else if (d < 10) buckets.ltTen++;
      else if (d < 50) buckets.ltFifty++;
      else if (d < 100) buckets.ltHundred++;
      else buckets.big++;
    }
  }
}

console.log("DELTA HISTOGRAM (Web@pt missing-vs-nearest-extra)");
console.log("-".repeat(60));
console.log(`  Δ <0.01     : ${buckets.same}`);
console.log(`  Δ <1mm      : ${buckets.ltOne}`);
console.log(`  Δ <5mm      : ${buckets.ltFive}`);
console.log(`  Δ <10mm     : ${buckets.ltTen}`);
console.log(`  Δ <50mm     : ${buckets.ltFifty}`);
console.log(`  Δ <100mm    : ${buckets.ltHundred}`);
console.log(`  Δ ≥100mm    : ${buckets.big}`);
console.log(`  unmatched   : ${all.filter(p => p.delta == null).length}`);
console.log("");
console.log("ALL PAIRED DRIFTS (sorted by |Δ|)");
console.log("-".repeat(80));
const paired = all.filter(p => p.delta != null).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
for (const p of paired) {
  console.log(
    `  ${p.frame.padEnd(8)} ${p.stick.padEnd(5)}  miss@${p.miss.toFixed(1).padStart(8)}  ext@${p.ext.toFixed(1).padStart(8)}  Δ=${p.delta >= 0 ? "+" : ""}${p.delta.toFixed(2).padStart(7)}   len=${p.stickLen?.toFixed(1)}`
  );
}
console.log("");
console.log("UNPAIRED MISSING (Detailer has, no nearby extra)");
console.log("-".repeat(80));
for (const p of all.filter(p => p.miss && !p.ext)) {
  console.log(`  ${p.frame.padEnd(8)} ${p.stick.padEnd(5)}  miss@${p.miss.toFixed(1).padStart(8)}   len=${p.stickLen?.toFixed(1)}`);
}
console.log("");
console.log("UNPAIRED EXTRAS (we emit, no nearby missing)");
console.log("-".repeat(80));
for (const p of all.filter(p => !p.miss && p.ext)) {
  console.log(`  ${p.frame.padEnd(8)} ${p.stick.padEnd(5)}  ext@ ${p.ext.toFixed(1).padStart(8)}   len=${p.stickLen?.toFixed(1)}`);
}
