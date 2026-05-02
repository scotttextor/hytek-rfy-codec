// Run our codec LOCALLY (in-memory, no API call) against every cached pair.
// Uses diff-vs-detailer.mjs's logic via dynamic import.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";

const corpusRoot = "test-corpus";
const projects = readdirSync(corpusRoot).filter(d => {
  const p = join(corpusRoot, d);
  try { return statSync(p).isDirectory(); } catch { return false; }
});

const pairs = [];
for (const proj of projects) {
  const dir = join(corpusRoot, proj);
  const files = readdirSync(dir);
  const xmls = files.filter(f => f.endsWith(".xml"));
  for (const xml of xmls) {
    const base = xml.replace(/\.xml$/, "");
    const rfy = files.find(f => f === `${base}.rfy`);
    if (rfy) pairs.push({ project: proj, plan: base, xml: join(dir, xml), rfy: join(dir, rfy) });
  }
}

console.log(`Testing ${pairs.length} jobs (local in-memory)\n`);
console.log("Project / Plan".padEnd(60), "Match%".padEnd(10), "Match/Ref");
console.log("-".repeat(95));

const categoryStats = new Map();
const results = [];
let totalMatched = 0, totalRef = 0;

for (const p of pairs) {
  try {
    const out = execSync(`node scripts/diff-vs-detailer.mjs "${p.xml}" "${p.rfy}"`, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });
    const m = out.match(/MATCHED:\s+(\d+)\s+\(([0-9.]+)% of ref\)/);
    const refM = out.match(/our (\d+) \| ref (\d+)/);
    if (m && refM) {
      const matched = parseInt(m[1], 10);
      const pct = parseFloat(m[2]);
      const refOps = parseInt(refM[2], 10);
      const status = pct === 100 ? "✅ 100%" : `${pct.toFixed(1)}%`.padEnd(10);
      console.log(`${p.project.slice(0, 40)} / ${p.plan}`.padEnd(60), status.padEnd(10), `${matched}/${refOps}`);
      results.push({ ...p, pct, matched, refOps });
      totalMatched += matched;
      totalRef += refOps;
      const planM = p.plan.match(/-([A-Z]+)-(\d+\.\d+)$/);
      const cat = planM ? `${planM[1]}-${planM[2]}` : "OTHER";
      const s = categoryStats.get(cat) ?? { count: 0, matched: 0, ref: 0 };
      s.count++; s.matched += matched; s.ref += refOps;
      categoryStats.set(cat, s);
    } else {
      console.log(`${p.project.slice(0, 40)} / ${p.plan}`.padEnd(60), "ERR-PARSE  ", "(couldn't parse output)");
    }
  } catch (e) {
    const msg = String(e.message || e).slice(0, 80);
    console.log(`${p.project.slice(0, 40)} / ${p.plan}`.padEnd(60), "ERROR     ", msg);
  }
}

const passed = results.filter(r => r.pct === 100).length;
const overallPct = totalRef > 0 ? (totalMatched / totalRef * 100).toFixed(2) : "0";
console.log(`\n=== ${passed}/${results.length} jobs at 100%, overall ${overallPct}% (${totalMatched}/${totalRef} ops) ===\n`);

console.log("By category:");
const sorted = [...categoryStats.entries()].sort((a, b) => b[1].ref - a[1].ref);
for (const [cat, s] of sorted) {
  const pct = s.ref > 0 ? (s.matched / s.ref * 100).toFixed(1) : "0";
  console.log(`  ${cat.padEnd(20)} ${String(s.count).padStart(3)} jobs   ${pct.padStart(6)}%   ${s.matched}/${s.ref}`);
}
