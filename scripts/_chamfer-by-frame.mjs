// For each W stick missing/has chamfer, show angle from XML and missing/extras
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";

const xmlPath = process.argv[2];
const jsonPath = process.argv[3];

const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_", parseAttributeValue:true, parseTagValue:false, isArray:n=>["plan","frame","stick","vertex","tool_action"].includes(n) });
const root = parser.parse(fs.readFileSync(xmlPath, "utf8")).framecad_import;

function parseTriple(t) { const n = String(t).trim().split(/[ ,\t]+/).map(Number); return {x:n[0]||0,y:n[1]||0,z:n[2]||0}; }
function distance3D(a,b) { const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z; return Math.sqrt(dx*dx+dy*dy+dz*dz); }

// Build a map of frame/stick → angle
const angleMap = new Map();
for (const p of root.plan ?? []) {
  for (const f of p.frame ?? []) {
    for (const s of f.stick ?? []) {
      const start = parseTriple(String(s.start ?? "0,0,0"));
      const end = parseTriple(String(s.end ?? "0,0,0"));
      const length = distance3D(start, end);
      if (length < 0.1) continue;
      const dz = Math.abs(end.z - start.z);
      const angleFromVertical = Math.acos(Math.min(dz / length, 1)) * 180 / Math.PI;
      const profile = `${s.profile?.["@_web"]}S${Math.max(s.profile?.["@_l_flange"]||0, s.profile?.["@_r_flange"]||0)}`;
      const flipped = String(s.flipped ?? "false").toLowerCase() === "true";
      angleMap.set(`${f["@_name"]}/${s["@_name"]}`, { angle: angleFromVertical, length, profile, flipped });
    }
  }
}

// Now read the diff JSON and tag each W stick
const diff = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const rows = [];
for (const fr of diff.byFrame || []) {
  for (const st of fr.sticks || []) {
    if (!/^W\d/.test(st.name)) continue;
    const meta = angleMap.get(`${fr.name}/${st.name}`);
    if (!meta) continue;
    const missChamferStart = (st.missing || []).some(m => m.startsWith("Chamfer @start"));
    const missChamferEnd = (st.missing || []).some(m => m.startsWith("Chamfer @end"));
    const extraChamferStart = (st.extras || []).some(m => m.startsWith("Chamfer @start"));
    const extraChamferEnd = (st.extras || []).some(m => m.startsWith("Chamfer @end"));
    rows.push({ frame: fr.name, stick: st.name, ...meta, missChamferStart, missChamferEnd, extraChamferStart, extraChamferEnd });
  }
}
// Print only sticks with any chamfer issue
console.log("frame  stick  angle  length  profile  flipped  missStart  missEnd  extraStart  extraEnd");
for (const r of rows) {
  if (!r.missChamferStart && !r.missChamferEnd && !r.extraChamferStart && !r.extraChamferEnd) continue;
  console.log(`${r.frame.padEnd(5)} ${r.stick.padEnd(5)} ${r.angle.toFixed(1).padStart(5)}° ${r.length.toFixed(0).padStart(5)} ${r.profile} ${String(r.flipped).padEnd(5)} ${r.missChamferStart?'Y':'-'} ${r.missChamferEnd?'Y':'-'} ${r.extraChamferStart?'Y':'-'} ${r.extraChamferEnd?'Y':'-'}`);
}
