// Cross-reference 45mm LipNotches with stud positions on H sticks
import fs from 'fs';
import path from 'path';
import { decode } from '../dist/decode.js';

const CORPUS = 'C:/Users/Scott/CLAUDE CODE/hytek-rfy-codec/test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES';
const files = fs.readdirSync(CORPUS).filter(f => /89\.075\.rfy$/.test(f));

const file = process.argv[2] || 'TH01-1F-LBW-89.075.rfy';
const wantFrame = process.argv[3] || 'L1101';

const buf = fs.readFileSync(path.join(CORPUS, file));
const r = await decode(buf);

// Collect ALL info
const plans = r.project?.plans || [];
for (const plan of plans) {
  for (const frame of (plan.frames || [])) {
    if (frame.name !== wantFrame) continue;

    const hSticks = (frame.sticks || []).filter(s => (s.name||'').startsWith('H'));

    for (const stick of hSticks) {
      console.log(`\n=== ${frame.name} / ${stick.name} length=${stick.length} flipped=${stick.flipped} ===`);

      const ops = (stick.tooling || []).slice().sort((a,b) => {
        const pa = a.kind === 'point' ? a.pos : a.startPos;
        const pb = b.kind === 'point' ? b.pos : b.startPos;
        return pa - pb;
      });

      // Detect 45-wide LipNotches and their centers
      console.log('45mm LipNotches centers:');
      for (const op of ops) {
        if (op.kind === 'spanned' && op.type === 'LipNotch') {
          const w = op.endPos - op.startPos;
          if (Math.abs(w - 45) < 0.5) {
            console.log(`  pos=${((op.startPos+op.endPos)/2).toFixed(2)}  span=${op.startPos.toFixed(2)}..${op.endPos.toFixed(2)}`);
          }
        }
      }
      console.log('Wider LipNotches (>45mm):');
      for (const op of ops) {
        if (op.kind === 'spanned' && op.type === 'LipNotch') {
          const w = op.endPos - op.startPos;
          if (w >= 50) {
            console.log(`  span=${op.startPos.toFixed(2)}..${op.endPos.toFixed(2)} w=${w.toFixed(2)}`);
          }
        }
      }
      // Detect dimples
      console.log('All InnerDimples:');
      for (const op of ops) {
        if (op.kind === 'point' && op.type === 'InnerDimple') {
          console.log(`  pos=${op.pos.toFixed(2)}`);
        }
      }
    }
  }
}
