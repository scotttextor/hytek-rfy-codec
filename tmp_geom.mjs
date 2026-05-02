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
    console.log('=== Frame:', f.name, 'length=', f.length, 'height=', f.height);

    let i = 0;
    for (const s of f.sticks) {
      const oc = s.outlineCorners;
      // Compute centroid of outline = stick centerline endpoints would need per-stick logic.
      // We approximate: avg of all corners gives midpoint; use min/max along longest axis.
      let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
      for (const c of oc || []) {
        minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
        minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
      }
      const dx = maxX - minX, dy = maxY - minY;
      console.log(`  [${i++}] ${s.name} type=${s.type} L=${s.length.toFixed(2)} bbox x:[${minX.toFixed(2)}..${maxX.toFixed(2)}] y:[${minY.toFixed(2)}..${maxY.toFixed(2)}] dx=${dx.toFixed(2)} dy=${dy.toFixed(2)}`);
    }
  }
}
