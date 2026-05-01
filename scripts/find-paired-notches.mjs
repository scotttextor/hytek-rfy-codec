// Scan reference RFY for "paired LipNotch" pattern: two LipNotches at the same plate
// with centers 1-5mm apart. Lists all such pairs across all frames.
import { readFileSync } from "node:fs";
import { decode } from "../dist/decode.js";

const doc = decode(readFileSync(process.argv[2]));

for (const plan of doc.project.plans) {
  for (const frame of plan.frames) {
    for (const stick of frame.sticks) {
      if (stick.type !== "plate") continue;
      const lipNotches = stick.tooling.filter(op => op.kind === "spanned" && op.type === "LipNotch");
      if (lipNotches.length < 2) continue;
      const sorted = [...lipNotches].sort((a, b) => a.startPos - b.startPos);
      for (let i = 0; i + 1 < sorted.length; i++) {
        const a = sorted[i], b = sorted[i+1];
        const aCenter = (a.startPos + a.endPos) / 2;
        const bCenter = (b.startPos + b.endPos) / 2;
        const gap = bCenter - aCenter;
        if (gap > 0.5 && gap < 8) {
          console.log(`${frame.name}/${stick.name}  ${aCenter.toFixed(2)} + ${bCenter.toFixed(2)}  gap=${gap.toFixed(2)}mm`);
        }
      }
    }
  }
}
