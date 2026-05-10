// Extract angle/length data for W sticks, focused on LBW
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";
import os from "node:os";

const xmlPath = process.argv[2];
const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_", parseAttributeValue:true, parseTagValue:false, isArray:n=>["plan","frame","stick","vertex","tool_action"].includes(n) });
const root = parser.parse(fs.readFileSync(xmlPath, "utf8")).framecad_import;

function parseTriple(t) { const n = String(t).trim().split(/[ ,\t]+/).map(Number); return {x:n[0]||0,y:n[1]||0,z:n[2]||0}; }
function distance3D(a,b) { const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z; return Math.sqrt(dx*dx+dy*dy+dz*dz); }

for (const p of root.plan ?? []) {
  for (const f of p.frame ?? []) {
    for (const s of f.stick ?? []) {
      const stickName = String(s["@_name"]);
      if (!/^W\d/.test(stickName)) continue;
      const start = parseTriple(String(s.start ?? "0,0,0"));
      const end = parseTriple(String(s.end ?? "0,0,0"));
      const length = distance3D(start, end);
      const flipped = String(s.flipped ?? "false");
      // Angle from vertical: dz/length * acos
      const dz = Math.abs(end.z - start.z);
      const angleFromVertical = Math.acos(Math.min(dz / length, 1)) * 180 / Math.PI;
      const profile = `${s.profile?.["@_web"]}S${Math.max(s.profile?.["@_l_flange"]||0, s.profile?.["@_r_flange"]||0)}`;
      console.log(`${p["@_name"]}/${f["@_name"]}/${stickName} L=${length.toFixed(1)} angle=${angleFromVertical.toFixed(1)}° profile=${profile} flipped=${flipped}`);
    }
  }
}
