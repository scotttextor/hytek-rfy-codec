import { XMLParser } from "fast-xml-parser";
import fs from "node:fs";
const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_", parseAttributeValue:true, parseTagValue:false, isArray:n=>["plan","frame","stick","vertex","tool_action"].includes(n) });

const xml1 = process.argv[2];
const f1 = process.argv[3];
const w1 = process.argv[4];
const root = parser.parse(fs.readFileSync(xml1, "utf8")).framecad_import;
for (const p of root.plan ?? []) {
  for (const f of p.frame ?? []) {
    if (f["@_name"] !== f1) continue;
    for (const s of f.stick ?? []) {
      if (s["@_name"] !== w1) continue;
      console.log(JSON.stringify(s, null, 2));
    }
  }
}
