// For each W stick: angle, length, frame info, ref chamfer presence
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { decode } from "../dist/index.js";

const xmlPath = process.argv[2];
const rfyPath = process.argv[3];

const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_", parseAttributeValue:true, parseTagValue:false, isArray:n=>["plan","frame","stick","vertex","tool_action"].includes(n) });
const root = parser.parse(fs.readFileSync(xmlPath, "utf8")).framecad_import;

function parseTriple(t) { const n = String(t).trim().split(/[ ,\t]+/).map(Number); return {x:n[0]||0,y:n[1]||0,z:n[2]||0}; }
function distance3D(a,b) { const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z; return Math.sqrt(dx*dx+dy*dy+dz*dz); }

// frame info: whether frame contains H-headers, Kb-cripples, etc.
const meta = new Map();
for (const p of root.plan ?? []) {
  for (const f of p.frame ?? []) {
    const sticks = f.stick ?? [];
    const stickNames = sticks.map(s => String(s["@_name"]));
    const hasH = stickNames.some(n => /^H\d/.test(n));
    const hasKb = stickNames.some(n => /^Kb\d/.test(n));
    const hasW = stickNames.some(n => /^W\d/.test(n));
    const hasS = stickNames.some(n => /^S\d/.test(n));
    const wAngles = [];
    const wLengths = [];
    for (const s of sticks) {
      const start = parseTriple(String(s.start ?? "0,0,0"));
      const end = parseTriple(String(s.end ?? "0,0,0"));
      const length = distance3D(start, end);
      if (length < 0.1) continue;
      const dz = Math.abs(end.z - start.z);
      const angle = Math.acos(Math.min(dz / length, 1)) * 180 / Math.PI;
      const profile = `${s.profile?.["@_web"]}S${Math.max(s.profile?.["@_l_flange"]||0, s.profile?.["@_r_flange"]||0)}`;
      meta.set(`${f["@_name"]}/${s["@_name"]}`, { angle, length, profile, frameHasH: hasH, frameHasKb: hasKb });
      if (/^W\d/.test(String(s["@_name"]))) {
        wAngles.push(angle);
        wLengths.push(length);
      }
    }
  }
}

const buf = fs.readFileSync(rfyPath);
const decoded = decode(buf);

console.log("frame  stick  angle  length  hasH  hasKb  refChamfer");
for (const plan of decoded.project?.plans || []) {
  for (const frame of plan.frames || []) {
    for (const stick of frame.sticks || []) {
      if (!/^W\d/.test(stick.name)) continue;
      const m = meta.get(`${frame.name}/${stick.name}`);
      if (!m) continue;
      const tooling = stick.tooling || [];
      const chamferOps = tooling.filter(t => t.type === "Chamfer" || t.type === "TrussChamfer");
      console.log(`${frame.name.padEnd(5)} ${stick.name.padEnd(4)} ${m.angle.toFixed(1).padStart(5)}° ${m.length.toFixed(0).padStart(5)} hasH=${m.frameHasH?'Y':'-'} hasKb=${m.frameHasKb?'Y':'-'} chamfer=${chamferOps.length}`);
    }
  }
}
