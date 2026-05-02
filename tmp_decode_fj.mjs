import fs from 'fs';

const mod = await import('./dist/decode.js');

const file = 'test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES/TH01-2F-FJ-89.075.rfy';
const data = fs.readFileSync(file);
const r = await mod.decode(data);

const target = process.argv[2] || 'JB1210-1';

for (const plan of r.project.plans) {
  for (const f of plan.frames) {
    if (!f.name) continue;
    if (target !== 'all' && f.name !== target) continue;
    console.log('\n=== Frame:', f.name, 'sticks:', f.sticks.length);
    for (const s of f.sticks) {
      console.log(`\n  Stick name=${s.name} type=${s.type} length=${s.length} tooling=${s.tooling?.length || 0}`);
      if (s.tooling) {
        for (const op of s.tooling) {
          const keys = Object.keys(op).filter(k => k !== 'type');
          const props = keys.map(k => `${k}=${JSON.stringify(op[k])}`).join(' ');
          console.log(`    ${op.type} ${props}`);
        }
      }
    }
  }
}
