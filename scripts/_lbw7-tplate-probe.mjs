// Probe: for given frames, list all sticks with x ranges that intersect each T-plate,
// to figure out what triggers our LipNotch extras vs Detailer's silence.
import { XMLParser } from "fast-xml-parser";
import fs from "node:fs";
const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_", parseAttributeValue:true, parseTagValue:false, isArray:n=>["plan","frame","stick","vertex","tool_action"].includes(n) });
const xml = parser.parse(fs.readFileSync(process.argv[2], "utf8")).framecad_import;
const wantFrames = process.argv[3].split(",");

function parseTriple(t) { const n = String(t).trim().split(/[ ,\t]+/).map(Number); return {x:n[0]||0,y:n[1]||0,z:n[2]||0}; }

for (const p of xml.plan ?? []) {
  for (const f of p.frame ?? []) {
    if (!wantFrames.includes(f["@_name"])) continue;
    console.log(`\n========= Frame ${f["@_name"]} elev=${f.elevation} =========`);
    const sticks = (f.stick ?? []).map(s => {
      const start = parseTriple(String(s.start ?? "0,0,0"));
      const end = parseTriple(String(s.end ?? "0,0,0"));
      return { name: s["@_name"], usage: s["@_usage"]||"", start, end,
        xMin: Math.min(start.x, end.x), xMax: Math.max(start.x, end.x),
        yMin: Math.min(start.y, end.y), yMax: Math.max(start.y, end.y),
        zMin: Math.min(start.z, end.z), zMax: Math.max(start.z, end.z),
      };
    });
    // Detect frame axis: if all topplates have xMax-xMin~0 but yMax-yMin>10, it's Y-axis
    const topPlates = sticks.filter(s => s.usage === "TopPlate");
    const axisIsY = topPlates.some(s => (s.xMax - s.xMin) < 1 && (s.yMax - s.yMin) > 10);
    const getLo = s => axisIsY ? s.yMin : s.xMin;
    const getHi = s => axisIsY ? s.yMax : s.xMax;
    console.log(`  [axis=${axisIsY ? 'Y' : 'X'}]`);
    const ts = sticks.filter(s => s.name.startsWith("T"));
    for (const t of ts) {
      const tLo = getLo(t), tHi = getHi(t);
      console.log(`\n  ${t.name}  L=${(tHi - tLo).toFixed(1)}  long[${tLo.toFixed(1)}..${tHi.toFixed(1)}]  z[${t.zMin.toFixed(1)}..${t.zMax.toFixed(1)}]`);
      // Find all sticks that touch this T-plate's range AND extend up to or past it
      for (const s of sticks) {
        if (s === t) continue;
        const sLo = getLo(s), sHi = getHi(s);
        // long-axis overlap with the T-plate
        const overlap = sHi >= tLo + 1 && sLo <= tHi - 1;
        if (!overlap) continue;
        // Z: stick must reach the T-plate's z level
        const zReach = s.zMax >= t.zMin - 1;
        if (!zReach) continue;
        // Filter: only the verticals (studs/W) that cross — not other top plates
        if (s.usage === "TopPlate" || s.usage === "BottomPlate") continue;
        const localLo = (sLo - tLo);
        const localHi = (sHi - tLo);
        const center = (localLo + localHi) / 2;
        console.log(`    [${s.usage.padEnd(13)}] ${s.name.padEnd(5)} local[${localLo.toFixed(1)}..${localHi.toFixed(1)}] center=${center.toFixed(1)}  z[${s.zMin.toFixed(1)}..${s.zMax.toFixed(1)}]`);
      }
    }
  }
}
