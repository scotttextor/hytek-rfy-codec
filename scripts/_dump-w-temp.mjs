import { decode } from "../dist/index.js";
import fs from "node:fs";
const buf = fs.readFileSync(process.argv[2]);
const decoded = decode(buf);
const plan = decoded.project.plans?.[0];
const planName = plan?.name || '';
console.log('Plan:', planName);

for (const f of plan.frames || []) {
  if (!['L6', 'L7', 'L12', 'L14', 'L27', 'L28'].includes(f.name)) continue;
  console.log('\n=== Frame', f.name, '===');
  for (const stick of f.sticks || []) {
    if (!stick.name.startsWith('W')) continue;
    console.log(`  ${stick.name}: length=${stick.length} flipped=${stick.flipped}`);
  }
}
