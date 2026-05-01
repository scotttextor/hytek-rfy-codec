// Decode a frame's sticks from RFY and print all ops.
import { readFileSync } from "node:fs";
import { decode } from "../dist/decode.js";

const rfyPath = process.argv[2];
const frameName = process.argv[3];
const stickName = process.argv[4];

const doc = decode(readFileSync(rfyPath));
for (const plan of doc.project.plans) {
  for (const frame of plan.frames) {
    if (frameName && frame.name !== frameName) continue;
    for (const stick of frame.sticks) {
      if (stickName && stick.name !== stickName) continue;
      console.log(`=== ${frame.name}/${stick.name} length=${stick.length}mm ===`);
      for (const op of stick.tooling) {
        switch (op.kind) {
          case "point":   console.log(`  ${op.type} @${op.pos.toFixed(2)}`); break;
          case "spanned": console.log(`  ${op.type} [${op.startPos.toFixed(2)}..${op.endPos.toFixed(2)}]`); break;
          case "start":   console.log(`  ${op.type} @start`); break;
          case "end":     console.log(`  ${op.type} @end`); break;
        }
      }
    }
  }
}
