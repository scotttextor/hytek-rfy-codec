import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";
const xml = fs.readFileSync("Y:/(17) 2026 HYTEK PROJECTS/CORAL HOMES/HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI/03 DETAILING/03 FRAMECAD DETAILER/01 XML OUTPUT/HG260001 LOT 289 COORA CRESCENT CURRIMUNDI 4551-GF-RP-70.075.xml", "utf8");
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const doc = parser.parse(xml);
const getArr = (x) => Array.isArray(x) ? x : x == null ? [] : [x];
const parseTriple = (s) => { const [x, y, z] = String(s).split(",").map(v => parseFloat(v.trim())); return { x, y, z }; };
for (const plan of getArr(doc.framecad_import.plan)) {
  for (const frame of getArr(plan.frame)) {
    const fname = String(frame["@_name"]);
    if (!["R8", "R9", "R14", "R15", "R2", "R3"].includes(fname)) continue;
    console.log(`=== ${fname} ===`);
    for (const s of getArr(frame.stick)) {
      const sname = String(s["@_name"]);
      const usage = String(s["@_usage"]);
      const start = parseTriple(String(s.start ?? "0,0,0"));
      const end = parseTriple(String(s.end ?? "0,0,0"));
      const len = Math.sqrt((end.x-start.x)**2 + (end.y-start.y)**2 + (end.z-start.z)**2);
      const dz = Math.abs(end.z - start.z);
      console.log(`  ${sname} ${usage} len=${len.toFixed(1)} dz=${dz.toFixed(1)}  start=(${start.x.toFixed(0)},${start.y.toFixed(0)},${start.z.toFixed(0)}) end=(${end.x.toFixed(0)},${end.y.toFixed(0)},${end.z.toFixed(0)})`);
    }
  }
}
