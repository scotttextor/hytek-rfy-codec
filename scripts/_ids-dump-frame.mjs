// Dump a frame's full structure from the FrameCAD XML to understand crossings.
// Usage: node scripts/_ids-dump-frame.mjs <xml> <frameName>
import fs from "node:fs";
import { parseDetailerXml } from "../dist/parsers/detailer-xml.js";

const xmlPath = process.argv[2];
const frameName = process.argv[3];
const stickFilter = process.argv[4]; // optional

const text = fs.readFileSync(xmlPath, "utf-8");
const proj = parseDetailerXml(text);

for (const plan of proj.plans || []) {
  for (const f of plan.frames || []) {
    if (f.name !== frameName) continue;
    console.log(`=== Frame: ${f.name} (plan: ${plan.name}) ===`);
    console.log("Frame keys:", Object.keys(f));
    for (const s of f.sticks || []) {
      if (stickFilter && s.name !== stickFilter) continue;
      const start = s.worldStart || s.start;
      const end = s.worldEnd || s.end;
      console.log(`  ${s.name} usage=${s.usage} role=${s.name?.[0]} length=${s.length} flipped=${s.flipped ?? false}`);
      console.log(`    worldStart=(${start?.x?.toFixed(1)}, ${start?.y?.toFixed(1)}, ${start?.z?.toFixed(1)})`);
      console.log(`    worldEnd  =(${end?.x?.toFixed(1)}, ${end?.y?.toFixed(1)}, ${end?.z?.toFixed(1)})`);
    }
  }
}
