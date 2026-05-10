import fs from 'fs';
import { decode } from '../dist/decode.js';

const REF = process.env.HOME + '/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data/HG260044/HG260044#1-1_GF-MH-70.075.rfy';
const OURS = '/tmp/mh-diff.ours.rfy';

for (const [label, p] of [['REF', REF], ['OURS', OURS]]) {
  console.log(`\n========== ${label} ==========`);
  const buf = fs.readFileSync(p);
  const r = await decode(buf);
  const plans = r.project?.plans || [];
  for (const plan of plans) {
    for (const frame of plan.frames) {
      console.log(`Frame ${frame.name} (${frame.sticks.length} sticks)`);
      for (const stick of frame.sticks) {
        const ops = stick.ops || [];
        const profileStr = stick.profile?.metricLabel || '?';
        console.log(`  ${stick.name.padEnd(4)}  L=${String(stick.length).padStart(8)}  ${profileStr.padEnd(15)} ops=${ops.length}`);
        for (const op of ops) {
          const detail = op.kind==='spanned' ? `${op.startPos.toFixed(1)}..${op.endPos.toFixed(1)}` : op.kind==='point' ? `@${op.pos.toFixed(1)}` : op.kind;
          console.log(`    ${op.type.padEnd(14)} ${detail}`);
        }
      }
    }
  }
}
