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
    console.log('\n=== Frame:', f.name);
    console.log('Frame keys:', Object.keys(f));
    // Look at connections / joins / web crossings
    if (f.connections) {
      console.log('Connections:', f.connections.length);
      for (const c of f.connections.slice(0, 20)) console.log('  conn:', JSON.stringify(c));
    }
    if (f.joins) {
      console.log('Joins:', f.joins.length);
      for (const j of f.joins.slice(0, 5)) console.log('  join:', JSON.stringify(j));
    }

    // Walk sticks and dump full props
    for (const s of f.sticks) {
      console.log(`\n  Stick name=${s.name} type=${s.type} length=${s.length} keys=[${Object.keys(s).join(',')}]`);
      // Show endpoint coords if present
      for (const k of ['startX','startY','endX','endY','x1','y1','x2','y2','start','end','origin','vector']) {
        if (s[k] !== undefined) console.log(`    ${k}=${JSON.stringify(s[k])}`);
      }
    }
  }
}
