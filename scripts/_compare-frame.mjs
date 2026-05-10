import { XMLParser } from "fast-xml-parser";
import fs from "node:fs";
const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_", parseAttributeValue:true, parseTagValue:false, isArray:n=>["plan","frame","stick","vertex","tool_action"].includes(n) });

const xml1 = process.argv[2];
const f1 = process.argv[3];
const root = parser.parse(fs.readFileSync(xml1, "utf8")).framecad_import;
for (const p of root.plan ?? []) {
  for (const f of p.frame ?? []) {
    if (f["@_name"] !== f1) continue;
    console.log(`Frame: ${f["@_name"]}`);
    console.log(`  envelope: ${JSON.stringify(f.envelope?.vertex)}`);
    console.log(`  elevation: ${f.elevation}`);
    console.log(`  Sticks (n=${(f.stick||[]).length}):`);
    for (const s of f.stick || []) {
      console.log(`    ${s["@_name"]} usage=${s["@_usage"]} profile=${s.profile?.["@_web"]}S${Math.max(s.profile?.["@_l_flange"]||0, s.profile?.["@_r_flange"]||0)} flipped=${s.flipped}`);
    }
  }
}
