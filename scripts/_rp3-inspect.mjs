import * as fs from "node:fs";
import { decode } from "../dist/decode.js";

const rfyPath = process.argv[2];
const wantedFrame = process.argv[3];
const wantedStick = process.argv[4];

const refRfy = decode(Buffer.from(fs.readFileSync(rfyPath)));
for (const plan of refRfy.project.plans) {
  for (const f of plan.frames) {
    if (f.name !== wantedFrame) continue;
    for (const s of f.sticks) {
      if (s.name !== wantedStick) continue;
      console.log(`${f.name}/${s.name} ref length: ${s.length}`);
      console.log("ops:");
      for (const op of s.tooling) {
        console.log(JSON.stringify(op));
      }
    }
  }
}
