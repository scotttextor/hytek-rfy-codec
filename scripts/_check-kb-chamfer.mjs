// Check Kb sticks for chamfer issues
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { decode } from "../dist/index.js";

const xmlPath = process.argv[2];
const rfyPath = process.argv[3];

const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_", parseAttributeValue:true, parseTagValue:false, isArray:n=>["plan","frame","stick","vertex","tool_action"].includes(n) });
const root = parser.parse(fs.readFileSync(xmlPath, "utf8")).framecad_import;

function parseTriple(t) { const n = String(t).trim().split(/[ ,\t]+/).map(Number); return {x:n[0]||0,y:n[1]||0,z:n[2]||0}; }
function dist(a,b) { const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z; return Math.sqrt(dx*dx+dy*dy+dz*dz); }

const meta = new Map();
for (const p of root.plan ?? []) {
  for (const f of p.frame ?? []) {
    const sticks = f.stick ?? [];
    const _h1 = sticks.find(s => s["@_name"] === "H1");
    let kbTopAttached = null;
    for (const s of sticks) {
      const start = parseTriple(String(s.start ?? "0,0,0"));
      const end = parseTriple(String(s.end ?? "0,0,0"));
      const length = dist(start, end);
      if (length < 0.1) continue;
      const dz = Math.abs(end.z - start.z);
      const angle = Math.acos(Math.min(dz / length, 1)) * 180 / Math.PI;
      const profile = `${s.profile?.["@_web"]}S${Math.max(s.profile?.["@_l_flange"]||0, s.profile?.["@_r_flange"]||0)}`;
      const flipped = String(s.flipped ?? "false").toLowerCase() === "true";
      // For Kb, kbTopAttached is true if higher endpoint is at z near top of frame
      const maxZ = Math.max(start.z, end.z);
      const minZ = Math.min(start.z, end.z);
      meta.set(`${f["@_name"]}/${s["@_name"]}`, { angle, length, profile, flipped, startZ: start.z, endZ: end.z, maxZ, minZ });
    }
  }
}

const buf = fs.readFileSync(rfyPath);
const decoded = decode(buf);
console.log("frame stick angle length flipped maxZ minZ chamferStart chamferEnd");
for (const plan of decoded.project?.plans || []) {
  for (const frame of plan.frames || []) {
    for (const stick of frame.sticks || []) {
      if (!/^Kb\d/.test(stick.name)) continue;
      const m = meta.get(`${frame.name}/${stick.name}`);
      if (!m) continue;
      const tooling = stick.tooling || [];
      const chamferStart = tooling.some(t => t.kind === "start" && (t.type === "Chamfer" || t.type === "TrussChamfer"));
      const chamferEnd = tooling.some(t => t.kind === "end" && (t.type === "Chamfer" || t.type === "TrussChamfer"));
      console.log(`${frame.name.padEnd(5)} ${stick.name.padEnd(5)} ${m.angle.toFixed(1).padStart(5)}° ${m.length.toFixed(0).padStart(4)} flipped=${m.flipped} maxZ=${m.maxZ.toFixed(0)} minZ=${m.minZ.toFixed(0)} startCh=${chamferStart?'Y':'-'} endCh=${chamferEnd?'Y':'-'}`);
    }
  }
}
