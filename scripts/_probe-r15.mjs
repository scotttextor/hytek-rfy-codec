import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";
const xml = fs.readFileSync("C:/Users/Scott/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data/HG260044/HG260044 LOT 1810 (14) ELDERBERRY ST UPPER CABOOLTURE-GF-RP-70.075.xml", "utf8");
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const doc = parser.parse(xml);
const getArr = (x) => Array.isArray(x) ? x : x == null ? [] : [x];
const parseTriple = (s) => { const [x, y, z] = String(s).split(",").map(v => parseFloat(v.trim())); return { x, y, z }; };
for (const plan of getArr(doc.framecad_import.plan)) {
  for (const frame of getArr(plan.frame)) {
    const fname = String(frame["@_name"]);
    if (!["R15", "R18"].includes(fname)) continue;
    console.log(`=== ${fname} ===`);
    let maxStud = 0;
    let tLen = 0;
    for (const s of getArr(frame.stick)) {
      const sname = String(s["@_name"]);
      const usage = String(s["@_usage"]);
      const start = parseTriple(String(s.start ?? "0,0,0"));
      const end = parseTriple(String(s.end ?? "0,0,0"));
      const len = Math.sqrt((end.x-start.x)**2 + (end.y-start.y)**2 + (end.z-start.z)**2);
      const dz = Math.abs(end.z - start.z);
      console.log(`  ${sname.padEnd(4)} ${usage.padEnd(12)} len=${len.toFixed(1).padStart(8)} dz=${dz.toFixed(1)}`);
      if (sname.startsWith("S")) maxStud = Math.max(maxStud, len);
      if (sname.startsWith("T")) tLen = len;
    }
    console.log(`  ratio maxStud/tLen = ${(maxStud/tLen).toFixed(2)}`);
  }
}
