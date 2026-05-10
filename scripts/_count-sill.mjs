import { XMLParser } from "fast-xml-parser";
import fs from "node:fs";
const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_", parseAttributeValue:true, parseTagValue:false, isArray:n=>["plan","frame","stick","vertex","tool_action"].includes(n) });
const root = parser.parse(fs.readFileSync(process.argv[2], "utf8")).framecad_import;
for (const p of root.plan ?? []) {
  for (const f of p.frame ?? []) {
    let sillCount = 0;
    let hasH = false;
    let wCount = 0;
    let hasKb = false;
    for (const s of f.stick ?? []) {
      const u = String(s["@_usage"] ?? "").toLowerCase();
      if (u === "sill") sillCount++;
      if (u === "headplate") hasH = true;
      const n = String(s["@_name"] ?? "");
      if (/^W\d/.test(n)) wCount++;
      if (/^Kb\d/.test(n)) hasKb = true;
    }
    if (wCount > 0) {
      console.log(`${f["@_name"]} hasSill=${sillCount} hasH=${hasH?'Y':'N'} hasKb=${hasKb?'Y':'N'} W#=${wCount}`);
    }
  }
}
