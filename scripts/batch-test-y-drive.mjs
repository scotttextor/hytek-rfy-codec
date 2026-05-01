// Batch test 15 random jobs from Y: drive against our codec.
// For each XML on Y:, find the matching Detailer RFY and verify our output
// matches it 100%.
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { decode } from "../dist/decode.js";

// Step 1: discover paired XML + RFY files
console.log("Discovering XML + RFY pairs on Y: drive...");
const ps = `
$pairs = @()
$xmls = Get-ChildItem 'Y:\\(17) 2026 HYTEK PROJECTS' -Recurse -Filter '*.xml' -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match 'XML OUTPUT' -and $_.Name -match '\\.075\\.xml$|\\.095\\.xml$' }
foreach ($x in $xmls) {
  # Plan name is the suffix after the project bracket — extract last 30 chars.
  if ($x.Name -match '([\\w]+-(GF|1F|2F|TH\\d+)-\\w+-(70|75|78|89|90|104)\\.\\d+)\\.xml$') {
    $plan = $matches[1]
    $project = (Split-Path (Split-Path (Split-Path (Split-Path $x.FullName -Parent) -Parent) -Parent) -Parent)
    $rfy = Get-ChildItem $project -Recurse -Filter '*.rfy' -ErrorAction SilentlyContinue | Where-Object { $_.Name -match [regex]::Escape($plan) } | Select-Object -First 1
    if ($rfy) {
      $pairs += [pscustomobject]@{ xml = $x.FullName; rfy = $rfy.FullName; plan = $plan }
    }
  }
}
$pairs | ConvertTo-Json -Depth 3 -Compress
`;
const psOut = execSync(`powershell -c "${ps.replace(/"/g, "'").replace(/\n/g, " ")}"`, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });
let pairs = [];
try {
  pairs = JSON.parse(psOut.trim() || "[]");
  if (!Array.isArray(pairs)) pairs = [pairs];
} catch (e) {
  console.error("Failed to parse pair list:", psOut.slice(0, 500));
  process.exit(1);
}

console.log(`Found ${pairs.length} XML+RFY pairs.`);

// Step 2: pick 15 random pairs
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const sample = shuffle(pairs).slice(0, 15);
console.log(`\nTesting ${sample.length} random pairs:\n`);

// Step 3: run codec, diff each
function fingerprint(stick) {
  return (stick.tooling ?? []).map(op => {
    switch (op.kind) {
      case "point":   return `${op.type}@${op.pos.toFixed(4)}`;
      case "spanned": return `${op.type}[${op.startPos.toFixed(4)}..${op.endPos.toFixed(4)}]`;
      case "start":   return `${op.type}@start`;
      case "end":     return `${op.type}@end`;
    }
  }).sort().join("|");
}

async function generateOurs(xmlPath) {
  const xml = readFileSync(xmlPath);
  const filename = xmlPath.split(/[\\/]/).pop();
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
  let totalOur = 0, totalRef = 0, exactMatches = 0;
  const diffs = [];
  for (const key of allKeys) {
    const o = oursByKey.get(key), r = refByKey.get(key);
    const oOps = o ? (o.tooling ?? []).length : 0;
    const rOps = r ? (r.tooling ?? []).length : 0;
    totalOur += oOps; totalRef += rOps;
    const oFp = o ? fingerprint(o) : "";
    const rFp = r ? fingerprint(r) : "";
    const lenMatch = (o?.length ?? -1) === (r?.length ?? -1);
    if (oFp === rFp && lenMatch) {
      exactMatches += oOps;
    } else {
      diffs.push({ key, oOps, rOps, oLen: o?.length, rLen: r?.length });
    }
  }
  return { totalOur, totalRef, exactMatches, diffs, totalSticks: allKeys.size };
}

console.log("Plan".padEnd(40), "Match%".padEnd(10), "Ops O/R".padEnd(20), "Sticks ok/total");
console.log("-".repeat(100));

const results = [];
for (const p of sample) {
  const planName = p.plan.padEnd(40).slice(0, 40);
  try {
    const oursBytes = await generateOurs(p.xml);
    const refBytes = readFileSync(p.rfy);
    const ourDoc = decode(oursBytes);
    const refDoc = decode(refBytes);
    const r = diffDocs(ourDoc, refDoc);
    const pct = r.totalRef > 0 ? (r.exactMatches / r.totalRef * 100) : 0;
    const sticksOk = r.totalSticks - r.diffs.length;
    const status = pct === 100 ? "✅ 100%   " : `${pct.toFixed(1)}%`.padEnd(10);
    console.log(planName, status, `${r.totalOur}/${r.totalRef}`.padEnd(20), `${sticksOk}/${r.totalSticks}`);
    results.push({ label: p.plan, pct, ...r });
  } catch (e) {
    console.log(planName, "ERR        ", e.message.slice(0, 50));
    results.push({ label: p.plan, pct: 0, error: e.message });
  }
}

console.log("\n=== SUMMARY ===");
const passed = results.filter(r => r.pct === 100).length;
console.log(`${passed} of ${results.length} jobs hit 100% match`);
if (passed < results.length) {
  console.log("\nNot-100%:");
  for (const r of results.filter(r => r.pct !== 100 && !r.error)) {
    console.log(`  ${r.label}: ${r.pct.toFixed(1)}% — ${r.diffs.length} sticks differ`);
    for (const d of r.diffs.slice(0, 3)) {
      console.log(`    ${d.key}: ours ${d.oOps} ops len=${d.oLen}, ref ${d.rOps} ops len=${d.rLen}`);
    }
  }
}
