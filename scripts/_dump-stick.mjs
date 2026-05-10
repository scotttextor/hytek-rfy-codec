import { decode } from "../dist/index.js";
import fs from "node:fs";
const buf = fs.readFileSync(process.argv[2]);
const decoded = decode(buf);
const targetFrame = process.argv[3];
const targetStick = process.argv[4];
for (const p of decoded.project?.plans || []) {
  for (const f of p.frames || []) {
    if (f.name !== targetFrame) continue;
    console.log(`Frame: ${f.name}`);
    console.log("Frame keys:", Object.keys(f));
    for (const s of f.sticks || []) {
      if (s.name !== targetStick) continue;
      console.log(JSON.stringify(s, null, 2));
    }
  }
}
