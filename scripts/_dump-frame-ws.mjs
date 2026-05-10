import { XMLParser } from "fast-xml-parser";
import fs from "node:fs";
const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_", parseAttributeValue:true, parseTagValue:false, isArray:n=>["plan","frame","stick","vertex","tool_action"].includes(n) });
const root = parser.parse(fs.readFileSync(process.argv[2], "utf8")).framecad_import;
const targetFrame = process.argv[3];
function parseTriple(t) { const n = String(t).trim().split(/[ ,\t]+/).map(Number); return {x:n[0]||0,y:n[1]||0,z:n[2]||0}; }
function dist(a,b) { const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z; return Math.sqrt(dx*dx+dy*dy+dz*dz); }
for (const p of root.plan ?? []) {
  for (const f of p.frame ?? []) {
    if (f["@_name"] !== targetFrame) continue;
    console.log(`Frame ${f["@_name"]} elev=${f.elevation}`);
    for (const s of f.stick ?? []) {
      const start = parseTriple(String(s.start ?? "0,0,0"));
      const end = parseTriple(String(s.end ?? "0,0,0"));
      const length = dist(start, end);
      const dz = end.z - start.z;
      const angle = Math.acos(Math.min(Math.abs(dz) / length, 1)) * 180 / Math.PI;
      console.log(`  ${s["@_name"].padEnd(5)} ${(s["@_usage"]||"").padEnd(13)} L=${length.toFixed(0).padStart(5)} z[${start.z.toFixed(1)}..${end.z.toFixed(1)}] flipped=${s.flipped} angle=${angle.toFixed(1)}°`);
    }
  }
}
