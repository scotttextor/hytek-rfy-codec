import fs from 'fs';
import path from 'path';
import { decode } from '../dist/decode.js';

const CORPUS = 'C:/Users/Scott/CLAUDE CODE/hytek-rfy-codec/test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES';

const f = process.argv[2];
const fullPath = path.isAbsolute(f) ? f : path.join(CORPUS, f);
const buf = fs.readFileSync(fullPath);
const r = await decode(buf);

const plans = r.project?.plans || [];
for (const plan of plans) {
  for (const frame of (plan.frames || [])) {
    const hSticks = (frame.sticks || []).filter(s => (s.name||'').startsWith('H'));
    if (hSticks.length === 0) continue;
    console.log(`\n=== Frame ${frame.name} ===`);
    for (const stick of hSticks) {
      console.log(`\n--- ${stick.name} type=${stick.type} length=${stick.length} flipped=${stick.flipped} ---`);
      console.log(`profile: ${stick.profile?.metricLabel} (web=${stick.profile?.web})`);
      const ops = (stick.tooling || []).slice().sort((a,b) => {
        const pa = a.kind === 'point' ? a.pos : a.startPos;
        const pb = b.kind === 'point' ? b.pos : b.startPos;
        return pa - pb;
      });
      for (const op of ops) {
        if (op.kind === 'point') {
          console.log(`  POINT  ${op.type.padEnd(15)} pos=${op.pos?.toFixed(2)}`);
        } else {
          console.log(`  SPAN   ${op.type.padEnd(15)} ${op.startPos?.toFixed(2).padStart(9)} -> ${op.endPos?.toFixed(2).padStart(9)}  width=${(op.endPos-op.startPos).toFixed(2)}`);
        }
      }
    }
  }
}
