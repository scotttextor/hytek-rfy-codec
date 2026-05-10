import { decode } from "../dist/index.js";
import fs from "node:fs";
const buf = fs.readFileSync(process.argv[2]);
const decoded = decode(buf);
const plan = decoded.project.plans?.[0];
console.log('Plan:', plan?.name);
const records = [];
for (const f of plan.frames || []) {
  for (const stick of f.sticks || []) {
    if (!stick.name.startsWith('Kb')) continue;
    const services = (stick.tooling || []).filter(t => t.type === 'InnerService');
    if (!services.length) continue;
    records.push({
      frame: f.name, stick: stick.name, length: stick.length, flipped: stick.flipped,
      services: services.map(s => +s.pos.toFixed(2))
    });
  }
}
for (const r of records.slice(0, 50)) {
  console.log(`${r.frame}/${r.stick} L=${r.length.toFixed(1)} flipped=${r.flipped}: services=${JSON.stringify(r.services)}`);
}
