import fs from 'fs';

const mod = await import('./dist/decode.js');

const file = process.argv[2] || 'test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES/TH01-2F-FJ-89.075.rfy';
const data = fs.readFileSync(file);
const r = await mod.decode(data);

const targetFrame = process.argv[3] || 'JB1210-1';

for (const plan of r.project.plans) {
  for (const f of plan.frames) {
    if (!f.name) continue;
    if (targetFrame !== 'all' && f.name !== targetFrame) continue;
    console.log('=== Frame:', f.name);
    let i = 0;
    for (const s of f.sticks) {
      if (s.type !== 'stud' || !s.name?.startsWith('W')) { i++; continue; }
      const oc = s.outlineCorners;
      console.log(`  [${i++}] ${s.name} L=${s.length.toFixed(2)} corners=${oc.length}`);
      for (const c of oc) console.log(`     (${c.x.toFixed(3)}, ${c.y.toFixed(3)})`);
    }
  }
}
