// For each W stick, show whether the REFERENCE has Chamfer @start/@end
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { decode } from "../dist/index.js";

const xmlPath = process.argv[2];
const rfyPath = process.argv[3];

const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_", parseAttributeValue:true, parseTagValue:false, isArray:n=>["plan","frame","stick","vertex","tool_action"].includes(n) });
const root = parser.parse(fs.readFileSync(xmlPath, "utf8")).framecad_import;

function parseTriple(t) { const n = String(t).trim().split(/[ ,\t]+/).map(Number); return {x:n[0]||0,y:n[1]||0,z:n[2]||0}; }
function distance3D(a,b) { const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z; return Math.sqrt(dx*dx+dy*dy+dz*dz); }

const meta = new Map();
for (const p of root.plan ?? []) {
  for (const f of p.frame ?? []) {
    for (const s of f.stick ?? []) {
      const start = parseTriple(String(s.start ?? "0,0,0"));
      const end = parseTriple(String(s.end ?? "0,0,0"));
      const length = distance3D(start, end);
      if (length < 0.1) continue;
      const dz = Math.abs(end.z - start.z);
      const angle = Math.acos(Math.min(dz / length, 1)) * 180 / Math.PI;
      const profile = `${s.profile?.["@_web"]}S${Math.max(s.profile?.["@_l_flange"]||0, s.profile?.["@_r_flange"]||0)}`;
      meta.set(`${f["@_name"]}/${s["@_name"]}`, { angle, length, profile });
    }
  }
}

const buf = fs.readFileSync(rfyPath);
const decoded = decode(buf);

let count = 0;
for (const plan of decoded.project?.plans || []) {
  for (const frame of plan.frames || []) {
    for (const stick of frame.sticks || []) {
      if (!/^W\d/.test(stick.name)) continue;
      const m = meta.get(`${frame.name}/${stick.name}`);
      if (!m) continue;
      const tooling = stick.tooling || [];
      const chamferOps = tooling.filter(t => t.type === "Chamfer" || t.type === "TrussChamfer");
      console.log(`${frame.name}/${stick.name} angle=${m.angle.toFixed(1)}° L=${m.length.toFixed(0)} chamferOps=${chamferOps.length} kinds=[${chamferOps.map(c => `${c.type}:${c.kind}@${(c.pos??0).toFixed(0)}`).join(',')}]`);
      count += 1;
    }
  }
}
