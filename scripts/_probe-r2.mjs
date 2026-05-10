import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";
const xml = fs.readFileSync("C:/Users/Scott/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data/HG260044/HG260044 LOT 1810 (14) ELDERBERRY ST UPPER CABOOLTURE-GF-RP-70.075.xml", "utf8");
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const doc = parser.parse(xml);
const getArr = (x) => Array.isArray(x) ? x : x == null ? [] : [x];
const parseTriple = (s) => { const [x, y, z] = String(s).split(",").map(v => parseFloat(v.trim())); return { x, y, z }; };
const root = doc.framecad_import;
for (const plan of getArr(root.plan)) {
  for (const frame of getArr(plan.frame)) {
    if (frame["@_name"] !== "R2") continue;
    console.log("R2 sticks:");
    for (const s of getArr(frame.stick)) {
      const name = s["@_name"];
      const start = parseTriple(s.start);
      const end = parseTriple(s.end);
      const len = Math.sqrt((end.x-start.x)**2 + (end.y-start.y)**2 + (end.z-start.z)**2);
      console.log(`  ${name.padEnd(5)} ${s["@_usage"]?.padEnd(12)}  start=(${start.x.toFixed(1)},${start.y.toFixed(1)},${start.z.toFixed(1)})  end=(${end.x.toFixed(1)},${end.y.toFixed(1)},${end.z.toFixed(1)})  len=${len.toFixed(2)}`);
    }
  }
}
