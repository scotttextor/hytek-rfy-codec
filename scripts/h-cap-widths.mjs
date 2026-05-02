// LipNotch start widths and what they correlate with
import fs from 'fs';
import path from 'path';
import { decode } from '../dist/decode.js';

const CORPUS = 'C:/Users/Scott/CLAUDE CODE/hytek-rfy-codec/test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES';
const files = fs.readdirSync(CORPUS).filter(f => /89\.075\.rfy$/.test(f));

const sticks = [];
for (const f of files) {
  const buf = fs.readFileSync(path.join(CORPUS, f));
  const r = await decode(buf);
  for (const plan of (r.project?.plans||[])) {
    for (const frame of (plan.frames||[])) {
      for (const stick of (frame.sticks||[])) {
        if (!(stick.name||'').startsWith('H')) continue;
        if (stick.profile?.web !== 89) continue;
        sticks.push({file: f, frame: frame.name, name: stick.name, length: stick.length, flipped: stick.flipped, ops: stick.tooling || []});
      }
    }
  }
}

// For each stick, compute startLip width and find next dimple after start
console.log('Width of START LipNotch when not 39mm + position of dimples within:');
for (const s of sticks) {
  const startInner = s.ops.find(o => o.kind === 'spanned' && o.type === 'InnerNotch' && o.startPos < 1);
  const startLip = s.ops.find(o => o.kind === 'spanned' && o.type === 'LipNotch' && o.startPos < 1);
  if (!startLip) continue;
  const w = startLip.endPos - startLip.startPos;
  if (w < 50) continue; // skip 39 + 45 (no extension)
  const innerW = startInner ? (startInner.endPos - startInner.startPos) : null;
  const dimplesIn = s.ops.filter(o => o.kind === 'point' && o.type === 'InnerDimple' && o.pos < startLip.endPos + 1);
  console.log(`  ${s.file.replace('.rfy','')}/${s.frame}/${s.name} startLip=0..${startLip.endPos.toFixed(2)} w=${w.toFixed(2)} innerW=${innerW} dimples=[${dimplesIn.map(d=>d.pos.toFixed(2)).join(',')}]`);
}
