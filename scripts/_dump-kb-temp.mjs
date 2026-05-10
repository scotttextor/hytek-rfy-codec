import { decode } from "../dist/index.js";
import fs from "node:fs";
const buf = fs.readFileSync(process.argv[2]);
const decoded = decode(buf);
const plan = decoded.project.plans?.[0];
console.log('Plan:', plan?.name);
const sticks = [];
for (const f of plan.frames || []) {
  for (const stick of f.sticks || []) {
    if (!stick.name.startsWith('Kb')) continue;
    const swages = (stick.tooling || []).filter(t => t.type === 'Swage');
    const startSwage = swages.find(s => s.startPos < 5);
    const endSwage = swages.find(s => Math.abs(s.endPos - stick.length) < 5);
    sticks.push({
      frame: f.name, stick: stick.name, length: stick.length, flipped: stick.flipped,
      startCap: startSwage ? +(startSwage.endPos - startSwage.startPos).toFixed(1) : null,
      endCap: endSwage ? +(endSwage.endPos - endSwage.startPos).toFixed(1) : null,
    });
  }
}
console.log(`Found ${sticks.length} Kb sticks`);
const sigs = new Map();
for (const s of sticks) {
  const sig = `${s.stick} length~${Math.round(s.length)} startCap=${s.startCap} endCap=${s.endCap} flipped=${s.flipped}`;
  sigs.set(sig, (sigs.get(sig) || 0) + 1);
}
const sorted = [...sigs.entries()].sort((a,b) => b[1] - a[1]);
for (const [k, c] of sorted.slice(0, 20)) console.log(`  ${c}\t${k}`);
