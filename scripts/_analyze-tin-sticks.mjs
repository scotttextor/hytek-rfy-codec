import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";

function parseTriple(t) { const n = String(t).trim().split(/[ ,\t]+/).map(Number); return {x:n[0]||0,y:n[1]||0,z:n[2]||0}; }

const xml = fs.readFileSync(process.argv[2], "utf8");
const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_", parseAttributeValue:true, parseTagValue:false, isArray:n=>["plan","frame","stick","vertex","tool_action"].includes(n) });
const root = parser.parse(xml).framecad_import;

const targetFrames = process.argv.slice(3);
const filter = (n) => targetFrames.length === 0 || targetFrames.includes(n);

for (const p of root.plan ?? []) {
  for (const f of p.frame ?? []) {
    if (!filter(String(f["@_name"]))) continue;
    console.log(`=== ${f["@_name"]} (type=${f["@_type"]}) ===`);
    for (const s of f.stick ?? []) {
      const start = parseTriple(String(s.start ?? "0,0,0"));
      const end = parseTriple(String(s.end ?? "0,0,0"));
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const dz = end.z - start.z;
      const horiz = Math.sqrt(dx*dx+dy*dy);
      const len = Math.sqrt(dx*dx+dy*dy+dz*dz);
      const angle = Math.abs(dz) < 1e-6 ? 90 : Math.atan2(horiz, Math.abs(dz)) * 180 / Math.PI;
      const usage = String(s["@_usage"] ?? "");
      const profile = `${s.profile?.["@_web"]}S${Math.max(s.profile?.["@_lip_l"]||0, s.profile?.["@_lip_r"]||0)}`;
      console.log(`  ${String(s["@_name"]).padEnd(6)} usage=${usage.padEnd(12)} profile=${profile.padEnd(8)} len=${len.toFixed(1).padStart(7)} angle=${angle.toFixed(1).padStart(6)}deg horiz=${horiz.toFixed(1)}`);
    }
  }
}
