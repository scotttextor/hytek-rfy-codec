// Survey all S sticks in PK4 + PK5 + a couple HG260044 LBW: list each stick's
// ref-side InnerDimple positions vs ours, and identify which sticks have the
// "shoulder-fill" pattern (dimples at @98 and somewhere ~end-100).
import fs from "node:fs";
import { decode } from "../dist/index.js";

const refPaths = process.argv.slice(2);

function studDimples(rfyPath) {
  const buf = fs.readFileSync(rfyPath);
  const decoded = decode(buf);
  const records = [];
  for (const p of decoded.project?.plans || []) {
    for (const f of p.frames || []) {
      for (const s of f.sticks || []) {
        if (!/^S\d+$/.test(s.name)) continue;
        const ops = s.tooling || s.ops || [];
        const dimples = ops.filter(o => o.type === "InnerDimple").map(o => o.pos).sort((a,b)=>a-b);
        const swages = ops.filter(o => o.type === "Swage").map(o => [o.startPos, o.endPos]).sort((a,b)=>a[0]-b[0]);
        const lipnotches = ops.filter(o => o.type === "LipNotch").map(o => [o.startPos, o.endPos]).sort((a,b)=>a[0]-b[0]);
        records.push({ plan: p.name, frame: f.name, stick: s.name, length: s.length, usage: s.usage, dimples, swages, lipnotches });
      }
    }
  }
  return records;
}

for (const refPath of refPaths) {
  console.log(`\n=== ${refPath} ===`);
  const recs = studDimples(refPath);
  // Filter: sticks that have the shoulder pattern (a dimple at ~98 or a shoulder near end)
  for (const r of recs) {
    const has98 = r.dimples.some(d => d >= 95 && d <= 102);
    const hasShoulderEnd = r.dimples.some(d => Math.abs(d - (r.length - 98)) <= 4);
    if (has98 || hasShoulderEnd) {
      const dimplesStr = r.dimples.map(d => d.toFixed(1)).join(",");
      console.log(`  ${r.plan} ${r.frame.padEnd(5)} ${r.stick.padEnd(4)} len=${r.length.toString().padEnd(5)} usage=${(r.usage||'').padEnd(10)} dimples=[${dimplesStr}]`);
    }
  }
}
