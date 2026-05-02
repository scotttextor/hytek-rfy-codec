// Analyze N stick patterns on LBW-89 (and related 89mm) frames across corpus.
import fs from 'node:fs';
import path from 'node:path';
import * as mod from '../dist/index.js';

const ROOT = path.resolve('test-corpus');
const corporaDirs = fs.readdirSync(ROOT)
  .map(d => path.join(ROOT, d))
  .filter(p => fs.statSync(p).isDirectory());

const targets = [];
for (const d of corporaDirs) {
  for (const f of fs.readdirSync(d)) {
    if (!f.endsWith('.rfy')) continue;
    if (!/-89\./.test(f)) continue; // 89mm only
    targets.push(path.join(d, f));
  }
}

function fmt(n) { return Number(n).toFixed(2); }

const SHOW_FIRST_N_FRAMES = 4;
const showOps = (ops) => ops.map(o => `${o.type}@${fmt(o.position ?? o.start ?? 0)}${o.length!=null?`+${fmt(o.length)}`:''}`);

for (const file of targets.slice(0, 12)) {
  const buf = fs.readFileSync(file);
  let r;
  try { r = await mod.decode(buf); } catch (e) { console.log('FAIL', file, e.message); continue; }
  console.log('\n=== FILE', path.basename(file));
  const plan = r.project.plans?.[0];
  if (!plan) { console.log('no plan'); continue; }
  let frameCount = 0;
  for (const fr of plan.frames) {
    const nogs = (fr.sticks||[]).filter(s => /^N\d+/i.test(s.name) || s.role === 'Nog' || s.role === 'N');
    if (!nogs.length) continue;
    if (frameCount++ >= SHOW_FIRST_N_FRAMES) break;
    console.log(`-- frame ${fr.name} length${fr.length?`=${fmt(fr.length)}`:''}`);
    // Studs in this frame for x-positions
    const studs = (fr.sticks||[]).filter(s => /^(S|J|T|EJ|TJ)/i.test(s.name) || s.role === 'Stud' || s.role === 'Trimmer' || s.role === 'Jack');
    const studXs = studs.map(s => ({ name: s.name, x: s.x ?? s.position?.x ?? null })).filter(z=>z.x!=null);
    console.log('  studs:', studXs.map(s=>`${s.name}@${fmt(s.x)}`).join(' '));
    for (const n of nogs) {
      const ops = n.tooling || [];
      const byType = {};
      for (const o of ops) (byType[o.type] = byType[o.type] || []).push(o);
      console.log(`  ${n.name} len=${fmt(n.length)} y=${fmt(n.y ?? n.position?.y ?? 0)} totalOps=${ops.length}`);
      for (const t of Object.keys(byType).sort()) {
        const arr = byType[t];
        const summary = arr.map(o => {
          const start = o.position ?? o.start ?? 0;
          const len = o.length ?? 0;
          return len > 0 ? `${fmt(start)}..${fmt(start + len)}` : `${fmt(start)}`;
        }).join(', ');
        console.log(`    ${t} (${arr.length}): ${summary}`);
      }
    }
  }
}
