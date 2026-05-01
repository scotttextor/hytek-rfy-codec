// Run our codec against every cached corpus directory and report per-job +
// per-category match rates. Identifies the highest-volume issue categories
// for prioritized rule fixing.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { decode } from "../dist/decode.js";

const corpusRoot = "test-corpus";
const projects = readdirSync(corpusRoot).filter(d => {
  const p = join(corpusRoot, d);
  try { return statSync(p).isDirectory(); } catch { return false; }
});

// Gather all (xml, rfy) pairs
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
console.log(`Testing ${pairs.length} jobs across ${projects.length} projects\n`);

function fingerprint(stick) {
  return (stick.tooling ?? []).map(op => {
    switch (op.kind) {
      case "point":   return `${op.type}@${op.pos.toFixed(3)}`;
      case "spanned": return `${op.type}[${op.startPos.toFixed(3)}..${op.endPos.toFixed(3)}]`;
      case "start":   return `${op.type}@start`;
      case "end":     return `${op.type}@end`;
    }
  }).sort().join("|");
}

async function generateOurs(xmlPath) {
  const xml = readFileSync(xmlPath);
  const filename = basename(xmlPath);
  const res = await fetch("https://hytek-rfy-tools.vercel.app/api/encode-auto", {
    method: "POST",
    headers: { "x-filename": encodeURIComponent(filename) },
    body: xml,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 100)}`);
  return Buffer.from(await res.arrayBuffer());
}

function diffDocs(ourDoc, refDoc) {
  const oursByKey = new Map(), refByKey = new Map();
  for (const p of ourDoc.project.plans) for (const f of p.frames) for (const s of f.sticks) oursByKey.set(`${f.name}/${s.name}`, s);
  for (const p of refDoc.project.plans) for (const f of p.frames) for (const s of f.sticks) refByKey.set(`${f.name}/${s.name}`, s);
  const allKeys = new Set([...oursByKey.keys(), ...refByKey.keys()]);
  let totalOur = 0, totalRef = 0, matched = 0, sticksOk = 0;
  const issuesByCategory = new Map();  // (stickPrefix-frameType) -> issueCount
  for (const key of allKeys) {
    const o = oursByKey.get(key), r = refByKey.get(key);
    const oOps = o?.tooling ?? [], rOps = r?.tooling ?? [];
    totalOur += oOps.length; totalRef += rOps.length;
    const oFp = o ? fingerprint(o) : "";
    const rFp = r ? fingerprint(r) : "";
    const oLen = o?.length != null ? Math.round(o.length * 1000) / 1000 : -1;
    const rLen = r?.length != null ? Math.round(r.length * 1000) / 1000 : -1;
    if (oFp === rFp && oLen === rLen) {
      matched += oOps.length;
      sticksOk++;
    } else {
      // Categorize by stick prefix
      const stickName = key.split("/")[1] ?? "";
      const m = stickName.match(/^([A-Za-z]+)/);
      const prefix = m ? m[1] : "?";
      const k = prefix;
      issuesByCategory.set(k, (issuesByCategory.get(k) ?? 0) + 1);
    }
  }
  return { totalOur, totalRef, matched, sticksOk, sticksTotal: allKeys.size, issuesByCategory };
}

console.log("Project / Plan".padEnd(60), "Match%".padEnd(10), "Sticks ok/total");
console.log("-".repeat(100));

const results = [];
const aggregateIssues = new Map();
const categoryStats = new Map();  // category(plan-suffix) -> { total, ok, count }

for (const p of pairs) {
  try {
    const oursBytes = await generateOurs(p.xml);
    const refBytes = readFileSync(p.rfy);
    const ourDoc = decode(oursBytes);
    const refDoc = decode(refBytes);
    const r = diffDocs(ourDoc, refDoc);
    const pct = r.totalRef > 0 ? (r.matched / r.totalRef * 100) : 0;
    const status = pct === 100 ? "✅ 100%" : `${pct.toFixed(1)}%`.padEnd(10);
    console.log(`${p.project.slice(0, 40)} / ${p.plan}`.padEnd(60), status.padEnd(10), `${r.sticksOk}/${r.sticksTotal}`);
    for (const [k, v] of r.issuesByCategory) aggregateIssues.set(k, (aggregateIssues.get(k) ?? 0) + v);
    // Categorize by plan suffix (e.g. "FJ-89.075", "TIN-70.075")
    const planM = p.plan.match(/-([A-Z]+)-(\d+\.\d+)$/);
    const cat = planM ? `${planM[1]}-${planM[2]}` : "OTHER";
    const s = categoryStats.get(cat) ?? { count: 0, totalOps: 0, matchedOps: 0, sticksOk: 0, sticksTotal: 0 };
    s.count++;
    s.totalOps += r.totalRef;
    s.matchedOps += r.matched;
    s.sticksOk += r.sticksOk;
    s.sticksTotal += r.sticksTotal;
    categoryStats.set(cat, s);
    results.push({ ...p, pct, ...r });
  } catch (e) {
    console.log(`${p.project.slice(0, 40)} / ${p.plan}`.padEnd(60), "ERROR     ", e.message.slice(0, 50));
    results.push({ ...p, pct: 0, error: e.message });
  }
}

const passed = results.filter(r => r.pct === 100).length;
console.log(`\n=== RESULT: ${passed}/${results.length} jobs at 100% ===\n`);

console.log("Match rate by job category (frame-type × profile.gauge):");
const sortedCats = [...categoryStats.entries()].sort((a, b) => b[1].totalOps - a[1].totalOps);
console.log("Category".padEnd(20), "Jobs", "  Sticks ok/total", "      Op match");
for (const [cat, s] of sortedCats) {
  const pct = s.totalOps > 0 ? (s.matchedOps / s.totalOps * 100) : 0;
  console.log(cat.padEnd(20), String(s.count).padEnd(5), `  ${s.sticksOk}/${s.sticksTotal}`.padEnd(20), `${pct.toFixed(1)}%`);
}

console.log("\nTop stick-prefix issues across corpus:");
const sortedIssues = [...aggregateIssues.entries()].sort((a, b) => b[1] - a[1]);
for (const [k, v] of sortedIssues.slice(0, 15)) console.log(`  ${k}: ${v}`);
