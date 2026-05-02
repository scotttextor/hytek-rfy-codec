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
    console.log(`\n=== Frame: ${frame.label || frame.name || '?'} (${(frame.sticks||[]).length} sticks) ===`);
    for (const stick of (frame.sticks || [])) {
      const opsCount = (stick.tooling || []).length;
      console.log(`  ${(stick.label||'?').padEnd(8)} role=${(stick.role||'?').padEnd(8)} len=${stick.length} ops=${opsCount}`);
    }
  }
}
