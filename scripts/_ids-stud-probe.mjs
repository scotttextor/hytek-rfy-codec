// Probe S-stud frame context: list all sticks in a frame with their bbox geometry.
// Usage: node scripts/_ids-stud-probe.mjs <xml> <frameName> [stickName]
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";

const xmlPath = process.argv[2];
const targetFrame = process.argv[3];
const stickFilter = process.argv[4]; // optional

const xmlText = fs.readFileSync(xmlPath, "utf-8");
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const xml = parser.parse(xmlText);

function arr(x) { return x == null ? [] : Array.isArray(x) ? x : [x]; }
function parseTriple(t) { const n = String(t).trim().split(/[, \t]+/).map(s=>parseFloat(s)).filter(n=>!isNaN(n)); return {x:n[0]||0,y:n[1]||0,z:n[2]||0}; }

const proj = xml.framecad_import || xml;
const plans = arr(proj.plan);
for (const plan of plans) {
  const planName = plan["@_name"];
  for (const f of arr(plan.frame)) {
    const fName = f["@_name"];
    if (fName !== targetFrame) continue;
    console.log(`=== Plan: ${planName} | Frame: ${fName} ===`);
    const sticks = arr(f.stick);
    const stickInfo = sticks.map(s => {
      const start = parseTriple(s.start);
      const end = parseTriple(s.end);
      const len = Math.sqrt((end.x-start.x)**2 + (end.y-start.y)**2 + (end.z-start.z)**2);
      return { name: s["@_name"], usage: s["@_usage"], start, end, len };
    });
    console.log(`\nAll sticks (${stickInfo.length}):`);
    for (const si of stickInfo) {
      const role = (si.name || "").replace(/[0-9_].*$/, "");
      const dx = si.end.x - si.start.x, dy = si.end.y - si.start.y, dz = si.end.z - si.start.z;
      console.log(`  ${si.name.padEnd(8)} usage=${si.usage.padEnd(15)} len=${si.len.toFixed(0).padEnd(8)} role=${role.padEnd(4)} d=(${dx.toFixed(0)},${dy.toFixed(0)},${dz.toFixed(0)}) start=(${si.start.x.toFixed(0)}, ${si.start.y.toFixed(0)}, ${si.start.z.toFixed(0)}) end=(${si.end.x.toFixed(0)}, ${si.end.y.toFixed(0)}, ${si.end.z.toFixed(0)})`);
    }
  }
}
