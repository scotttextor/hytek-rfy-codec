import fs from 'fs';
import path from 'path';
import { decode } from '../dist/decode.js';

const CORPUS = 'C:/Users/Scott/CLAUDE CODE/hytek-rfy-codec/test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES';

const files = fs.readdirSync(CORPUS).filter(f => /LBW-89\.075\.rfy$/.test(f));

for (const f of files) {
  const buf = fs.readFileSync(path.join(CORPUS, f));
  const r = await decode(buf);
  const plans = r.project?.plans || [];
  let headerCount = 0;
  const types = new Set();
  for (const plan of plans) {
    for (const frame of (plan.frames||[])) {
      for (const stick of (frame.sticks||[])) {
        types.add(stick.type);
        if (stick.type === 'header' || (stick.name||'').startsWith('H')) {
          headerCount++;
        }
      }
    }
  }
  console.log(`${f}: types=${[...types].join(',')} h_count=${headerCount}`);
}
