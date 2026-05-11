// Dump outline corners of W braces using our codec's runtime processing
import { decodeXmlToProject } from "../dist/decode-xml.js";
import fs from "node:fs";

const xml = fs.readFileSync(process.argv[2], "utf8");
const targetFrame = process.argv[3];
const project = decodeXmlToProject(xml);

for (const plan of project.plans) {
  for (const frame of plan.frames) {
    if (frame.name !== targetFrame) continue;
    console.log(`Frame ${frame.name}`);
    for (const stick of frame.sticks) {
      if (!stick.name.startsWith("W")) continue;
      console.log(`  ${stick.name} usage=${stick.usage} length=${stick.length}`);
      if (stick.outlineCorners) {
        for (let i = 0; i < stick.outlineCorners.length; i++) {
          const c = stick.outlineCorners[i];
          console.log(`    corner[${i}] = (${c.x.toFixed(2)}, ${c.y.toFixed(2)})`);
        }
      }
    }
  }
}
