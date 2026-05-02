import fs from 'fs';
import path from 'path';
import { decode } from '../dist/index.js';

const refPath = process.argv[2];
const filterFrame = process.argv[3]; // optional
const ref = decode(fs.readFileSync(refPath));
const frames = ref.project.plans[0].frames;

console.log(`File: ${path.basename(refPath)}`);
console.log(`Frames: ${frames.length}\n`);

for (const f of frames) {
  if (filterFrame && f.name !== filterFrame) continue;
  console.log(`=== Frame ${f.name} (${f.sticks.length} sticks) ===`);
  for (const s of f.sticks) {
    const len = s.length || s.totalLength || '?';
    console.log(`  STICK ${s.name} len=${len} tooling=${(s.tooling||[]).length} ops`);
    for (const t of (s.tooling || [])) {
      const fields = Object.keys(t).filter(k => k !== 'op').map(k => `${k}=${JSON.stringify(t[k])}`).join(' ');
      console.log(`    ${t.op} ${fields}`);
    }
  }
}
