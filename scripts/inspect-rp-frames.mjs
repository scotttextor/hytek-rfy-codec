#!/usr/bin/env node
// Inspect RP frames to find Pattern A discriminator (single T-plate, eave-side start).
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";

function parseTriple(s) {
  const parts = String(s).split(",").map(Number);
  return { x: parts[0], y: parts[1], z: parts[2] };
}

const xmlPath = process.argv[2];
const targetRaw = process.argv[3] ?? "";
const targets = targetRaw.split(",").filter(Boolean);

const xml = fs.readFileSync(xmlPath, "utf8");
const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_", parseAttributeValue:true, parseTagValue:false, isArray:n=>["plan","frame","stick","vertex","tool_action"].includes(n) });
const root = parser.parse(xml).framecad_import;

for (const p of root.plan ?? []) {
  for (const f of p.frame ?? []) {
    const name = String(f["@_name"]);
    if (targets.length && !targets.includes(name)) continue;
    const sticks = f.stick ?? [];
    const tplates = sticks.filter(s => /^T\d/.test(s["@_name"]));
    const bplates = sticks.filter(s => /^B\d/.test(s["@_name"]));

    // Frame envelope
    const env = (f.envelope?.vertex ?? []).map(v => parseTriple(typeof v==="string" ? v : v["#text"]));
    const fzMin = env.length ? Math.min(...env.map(v=>v.z)) : null;
    const fzMax = env.length ? Math.max(...env.map(v=>v.z)) : null;

    console.log(`\n=== ${name}  (env z: ${fzMin?.toFixed(1)}..${fzMax?.toFixed(1)})  T:${tplates.length} B:${bplates.length} ===`);
    for (const t of tplates) {
      const st = parseTriple(String(t.start ?? "0,0,0"));
      const en = parseTriple(String(t.end ?? "0,0,0"));
      const dz = en.z - st.z;
      console.log(`    ${t["@_name"]}: start=(${st.x.toFixed(1)},${st.y.toFixed(1)},${st.z.toFixed(1)}) end=(${en.x.toFixed(1)},${en.y.toFixed(1)},${en.z.toFixed(1)}) dz=${dz.toFixed(1)} startLow=${st.z < en.z}`);
    }
    for (const b of bplates) {
      const st = parseTriple(String(b.start ?? "0,0,0"));
      const en = parseTriple(String(b.end ?? "0,0,0"));
      const dz = en.z - st.z;
      console.log(`    ${b["@_name"]}: start=(${st.x.toFixed(1)},${st.y.toFixed(1)},${st.z.toFixed(1)}) end=(${en.x.toFixed(1)},${en.y.toFixed(1)},${en.z.toFixed(1)}) dz=${dz.toFixed(1)}`);
    }
  }
}
