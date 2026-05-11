import { decode } from "../dist/index.js";
import fs from "node:fs";
const buf = fs.readFileSync(process.argv[2]);
const decoded = decode(buf);
const targetFrame = process.argv[3];
const targetStick = process.argv[4];

for (const p of decoded.project.plans) {
  for (const f of p.frames) {
    if (f.name !== targetFrame) continue;
    console.log(`Frame ${f.name}`);
    for (const s of f.sticks) {
      if (targetStick && s.name !== targetStick) continue;
      console.log(`  ${s.name} L=${s.length} usage=${s.usage}`);
      const ops = (s.tooling || []).slice().sort((a,b) => {
        const pa = a.kind === "spanned" ? a.startPos : a.kind === "point" ? a.pos : 0;
        const pb = b.kind === "spanned" ? b.startPos : b.kind === "point" ? b.pos : 0;
        return pa - pb;
      });
      for (const op of ops) {
        if (op.type === "LipNotch" || op.type === "InnerDimple") {
          if (op.kind === "spanned") console.log(`    ${op.type} ${op.startPos.toFixed(2)}..${op.endPos.toFixed(2)}`);
          else if (op.kind === "point") console.log(`    ${op.type} @${op.pos.toFixed(2)}`);
        }
      }
    }
  }
}
