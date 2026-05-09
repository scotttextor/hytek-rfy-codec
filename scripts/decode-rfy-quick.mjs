import fs from "node:fs";
import { decode } from "../dist/index.js";

const path = process.argv[2];
const fb = fs.readFileSync(path);
const decoded = decode(fb);
const proj = decoded.project ?? decoded;

const frame = process.argv[3];
const stick = process.argv[4];
for (const plan of proj.plans) {
  for (const fr of plan.frames) {
    if (frame && fr.name !== frame) continue;
    for (const st of fr.sticks) {
      if (stick && st.name !== stick) continue;
      console.log(`Frame ${fr.name} Stick ${st.name} L=${st.length} ops:`);
      for (const op of st.tooling) {
        console.log(' ', op.kind, op.type, op.kind === "point" ? `@${op.pos}` : `${op.startPos}..${op.endPos}`);
      }
    }
  }
}
