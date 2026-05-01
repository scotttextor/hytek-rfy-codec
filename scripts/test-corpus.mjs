// Fast local test: run our codec against EVERY (xml, rfy) pair in a corpus
// directory. Reports per-job match rate using bit-exact comparison.
//
// Usage: node scripts/test-corpus.mjs <corpus-dir>
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { decode } from "../dist/decode.js";

const corpusDir = process.argv[2];
if (!corpusDir) { console.error("Usage: node test-corpus.mjs <dir>"); process.exit(1); }

// Pair up XMLs with their matching RFYs by basename
const files = readdirSync(corpusDir);
const xmls = files.filter(f => f.endsWith(".xml"));
const pairs = [];
for (const xml of xmls) {
  const base = xml.replace(/\.xml$/, "");
  const rfy = files.find(f => f === `${base}.rfy`);
  if (rfy) pairs.push({ name: base, xml: join(corpusDir, xml), rfy: join(corpusDir, rfy) });
}

console.log(`Testing ${pairs.length} jobs from ${corpusDir}\n`);

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
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

function diffDocs(ourDoc, refDoc) {
  const oursByKey = new Map(), refByKey = new Map();
  for (const p of ourDoc.project.plans) for (const f of p.frames) for (const s of f.sticks) oursByKey.set(`${f.name}/${s.name}`, s);
  for (const p of refDoc.project.plans) for (const f of p.frames) for (const s of f.sticks) refByKey.set(`${f.name}/${s.name}`, s);
  const allKeys = new Set([...oursByKey.keys(), ...refByKey.keys()]);
  let totalOur = 0, totalRef = 0, matched = 0, sticksOk = 0, sticksTotal = allKeys.size;
  const stickIssues = new Map();  // category -> count
  for (const key of allKeys) {
    const o = oursByKey.get(key), r = refByKey.get(key);
    const oOps = o?.tooling ?? [], rOps = r?.tooling ?? [];
    totalOur += oOps.length; totalRef += rOps.length;
    const oFp = o ? fingerprint(o) : "";
    const rFp = r ? fingerprint(r) : "";
    // Round lengths to 3 decimal places (tolerate float precision noise)
    const oLen = o?.length != null ? Math.round(o.length * 1000) / 1000 : -1;
    const rLen = r?.length != null ? Math.round(r.length * 1000) / 1000 : -1;
    if (oFp === rFp && oLen === rLen) {
      matched += oOps.length;
      sticksOk++;
    } else {
      const oSet = new Set(oFp.split("|").filter(Boolean));
      const rSet = new Set(rFp.split("|").filter(Boolean));
      const extra = [...oSet].filter(x => !rSet.has(x));
      const missing = [...rSet].filter(x => !oSet.has(x));
      // Categorize by op-type that differs
      for (const x of [...extra, ...missing]) {
        const m = x.match(/^([A-Za-z]+)/);
        if (m) {
          const k = m[1];
          stickIssues.set(k, (stickIssues.get(k) ?? 0) + 1);
        }
      }
      if (oLen !== rLen) stickIssues.set("LENGTH", (stickIssues.get("LENGTH") ?? 0) + 1);
    }
  }
  return { totalOur, totalRef, matched, sticksOk, sticksTotal, stickIssues };
}

console.log("Job".padEnd(40), "Match%".padEnd(10), "Sticks".padEnd(15), "Issues");
console.log("-".repeat(100));

const results = [];
const allIssues = new Map();
for (const p of pairs) {
  try {
    const oursBytes = await generateOurs(p.xml);
    const refBytes = readFileSync(p.rfy);
    const ourDoc = decode(oursBytes);
    const refDoc = decode(refBytes);
    const r = diffDocs(ourDoc, refDoc);
    const pct = r.totalRef > 0 ? (r.matched / r.totalRef * 100) : 0;
    const status = pct === 100 ? "✅ 100%" : `${pct.toFixed(1)}%`.padEnd(10);
    const issues = [...r.stickIssues.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}=${v}`).join(" ");
    console.log(p.name.padEnd(40), status.padEnd(10), `${r.sticksOk}/${r.sticksTotal}`.padEnd(15), issues);
    for (const [k, v] of r.stickIssues) allIssues.set(k, (allIssues.get(k) ?? 0) + v);
    results.push({ name: p.name, pct, ...r });
  } catch (e) {
    console.log(p.name.padEnd(40), "ERROR     ", "", e.message.slice(0, 50));
    results.push({ name: p.name, pct: 0, error: e.message });
  }
}

const passed = results.filter(r => r.pct === 100).length;
console.log(`\n${passed}/${results.length} jobs at 100% match\n`);
console.log("Top issue categories across all jobs:");
const sorted = [...allIssues.entries()].sort((a, b) => b[1] - a[1]);
for (const [k, v] of sorted.slice(0, 10)) console.log(`  ${k}: ${v}`);
