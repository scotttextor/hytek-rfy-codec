import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const mod = await import(pathToFileURL(path.join(root, 'dist', 'index.js')).href);

const rfyPath = 'C:/Users/Scott/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data/HG260001/HG260001_PK1-GF-LBW-70.075-current.rfy';
const buf = fs.readFileSync(rfyPath);
const r = await mod.decode(buf);

let n = 0;
for (const plan of r.project.plans) {
  for (const f of plan.frames) {
    const t1 = f.sticks.find(s => s.name === 'T1');
    if (!t1) continue;
    const isv = (t1.tooling || []).filter(t => t.type === 'InnerService').map(t => t.pos);
    if (isv.length === 0) continue;
    n++;
    if (n > 12) break;
    const gaps = [];
    for (let i = 1; i < isv.length; i++) gaps.push((isv[i]-isv[i-1]).toFixed(2));
    console.log(`  ${f.name}: T1 len=${t1.length.toFixed(2)} IS=[${isv.map(x=>x.toFixed(2)).join(', ')}] gaps=[${gaps.join(', ')}]`);
  }
}
