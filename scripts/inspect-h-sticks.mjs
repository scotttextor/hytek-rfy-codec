import fs from 'fs';
import path from 'path';
import { decode } from '../dist/decode.js';

const CORPUS = 'C:/Users/Scott/CLAUDE CODE/hytek-rfy-codec/test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node inspect-h-sticks.mjs <file1.rfy> [file2.rfy]...');
  process.exit(1);
}

for (const f of files) {
  const fullPath = path.isAbsolute(f) ? f : path.join(CORPUS, f);
  const buf = fs.readFileSync(fullPath);
  const r = await decode(buf);

  console.log(`\n========== ${path.basename(fullPath)} ==========`);
  const plans = r.project?.plans || [];
  for (const plan of plans) {
    for (const frame of (plan.frames || [])) {
      const hSticks = (frame.sticks || []).filter(s => s.role === 'H' || s.role === 'Header' || (s.label && s.label.startsWith('H')));
      if (hSticks.length === 0) continue;
      console.log(`\nFrame: ${frame.label || frame.name || '?'} (${(frame.sticks||[]).length} sticks, ${hSticks.length} H sticks)`);
      for (const stick of hSticks) {
        console.log(`\n  Stick label=${stick.label} role=${stick.role} length=${stick.length}`);
        const ops = stick.tooling || [];
        console.log(`  Total ops: ${ops.length}`);
        for (const op of ops) {
          if (op.kind === 'point') {
            console.log(`    POINT  ${op.type.padEnd(15)} pos=${op.pos?.toFixed(2)}`);
          } else if (op.kind === 'spanned') {
            console.log(`    SPAN   ${op.type.padEnd(15)} start=${op.startPos?.toFixed(2)} end=${op.endPos?.toFixed(2)} width=${(op.endPos-op.startPos).toFixed(2)}`);
          } else {
            console.log(`    ?      ${JSON.stringify(op)}`);
          }
        }
      }
    }
  }
}
