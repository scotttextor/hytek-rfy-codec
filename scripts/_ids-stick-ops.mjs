// Show all ops on a particular stick from a reference RFY file (decoded).
// Usage: node scripts/_ids-stick-ops.mjs <rfy> <frameName> <stickName>
import fs from "node:fs";
import { decode } from "../dist/index.js";

const rfyPath = process.argv[2];
const targetFrame = process.argv[3];
const targetStick = process.argv[4];

const buf = fs.readFileSync(rfyPath);
const decoded = decode(buf);
for (const p of decoded.project?.plans || []) {
  for (const f of p.frames || []) {
    if (f.name !== targetFrame) continue;
    for (const s of f.sticks || []) {
      if (s.name !== targetStick) continue;
      console.log(`Frame: ${f.name} | Stick: ${s.name} | length=${s.length} | usage=${s.usage}`);
      const ops = (s.tooling || s.ops || []).slice().sort((a, b) => {
        const ap = a.pos ?? a.startPos ?? 0;
        const bp = b.pos ?? b.startPos ?? 0;
        return ap - bp;
      });
      for (const op of ops) {
        if (op.type === "Chamfer") {
          console.log(`  ${op.type} @${op.placement || op.position || ""}`);
        } else if (op.kind === "spanned" || op.startPos !== undefined) {
          console.log(`  ${op.type} ${op.startPos}..${op.endPos}`);
        } else {
          console.log(`  ${op.type} @${op.pos}`);
        }
      }
    }
  }
}
