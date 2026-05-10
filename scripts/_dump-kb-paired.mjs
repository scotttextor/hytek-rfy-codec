import { decode } from "../dist/index.js";
import fs from "node:fs";
const buf = fs.readFileSync(process.argv[2]);
const decoded = decode(buf);
const plan = decoded.project.plans?.[0];
console.log('Plan:', plan?.name);
for (const f of plan.frames || []) {
  const kbs = (f.sticks || []).filter(s => s.name.startsWith('Kb'));
  if (kbs.length === 0) continue;
  if (!['L2', 'L3', 'L43', 'L1'].includes(f.name)) continue;
  kbs.sort((a,b) => a.name.localeCompare(b.name));
  console.log(`\n=== Frame ${f.name} ===`);
  for (const stick of kbs) {
    console.log(`  ${stick.name}: L=${stick.length.toFixed(1)} flipped=${stick.flipped}`);
    for (const op of stick.tooling || []) {
      const pos = op.kind === 'point' ? `@${op.pos}` : `${op.startPos}..${op.endPos}`;
      console.log(`    ${op.type}: ${pos}`);
    }
  }
}
