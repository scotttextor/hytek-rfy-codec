import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";

const XML_PATH = "C:/Users/Scott/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data/HG260044/HG260044 LOT 1810 (14) ELDERBERRY ST UPPER CABOOLTURE-GF-RP-70.075.xml";
const xml = fs.readFileSync(XML_PATH, "utf8");
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const doc = parser.parse(xml);
const getArr = (x) => Array.isArray(x) ? x : x == null ? [] : [x];
const parseTriple = (s) => { const [x, y, z] = String(s).split(",").map(v => parseFloat(v.trim())); return { x, y, z }; };

const diff = JSON.parse(fs.readFileSync('C:/Users/Scott/AppData/Local/Temp/rp8-final.json', "utf8"));
const refLenByFS = new Map();
for (const f of diff.byFrame) for (const s of f.sticks) refLenByFS.set(`${f.name}/${s.name}`, s.refLength);

for (const plan of getArr(doc.framecad_import.plan)) {
  for (const frame of getArr(plan.frame)) {
    const fname = String(frame["@_name"]);
    for (const s of getArr(frame.stick)) {
      const sname = String(s["@_name"]);
      if (!/^N\d/.test(sname)) continue;
      const start = parseTriple(String(s.start ?? "0,0,0"));
      const end = parseTriple(String(s.end ?? "0,0,0"));
      const rawLen = Math.sqrt((end.x-start.x)**2 + (end.y-start.y)**2 + (end.z-start.z)**2);
      const refLen = refLenByFS.get(`${fname}/${sname}`);
      const refMinusRaw = refLen != null ? refLen - rawLen : null;
      console.log(`${fname.padEnd(5)}${sname.padEnd(4)} rawL=${rawLen.toFixed(2).padStart(8)}  refL=${refLen!=null?refLen.toFixed(2).padStart(8):"  ?    "}  ref-raw=${refMinusRaw!=null?refMinusRaw.toFixed(2).padStart(7):"  ?  "}`);
    }
  }
}
