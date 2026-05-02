import fs from 'fs';
import path from 'path';
import { decode } from '../dist/decode.js';

const CORPUS = 'C:/Users/Scott/CLAUDE CODE/hytek-rfy-codec/test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES';

const files = fs.readdirSync(CORPUS).filter(f => /89\.075\.rfy$/.test(f));

const startCapPatterns = new Map();
const endCapPatterns = new Map();

function classifyCap(ops, isStart, len) {
  // Take ops near start (pos<200) or near end (pos>len-200)
  const result = [];
  for (const op of ops) {
    const pos = op.kind === 'point' ? op.pos : op.startPos;
    const endP = op.kind === 'point' ? op.pos : op.endPos;
    if (isStart) {
      if (pos < 200) result.push(op);
    } else {
      if (endP > len - 200) result.push(op);
    }
  }
  return result;
}

function fmtCap(ops, isStart, len) {
  const out = [];
  for (const op of ops) {
    if (op.kind === 'point') {
      const p = isStart ? op.pos : (len - op.pos);
      out.push(`${op.type}@${p.toFixed(1)}`);
    } else {
      const s = isStart ? op.startPos : (len - op.endPos);
      const w = op.endPos - op.startPos;
      out.push(`${op.type}[${s.toFixed(1)}+${w.toFixed(1)}]`);
    }
  }
  return out.join(' ');
}

let totalH = 0;
const lenCounts = {};

for (const f of files) {
  const buf = fs.readFileSync(path.join(CORPUS, f));
  const r = await decode(buf);
  const plans = r.project?.plans || [];
  for (const plan of plans) {
    for (const frame of (plan.frames || [])) {
      for (const stick of (frame.sticks || [])) {
        if (!(stick.name||'').startsWith('H')) continue;
        if (stick.profile?.web !== 89) continue;
        totalH++;
        const ops = (stick.tooling || []).slice().sort((a,b) => {
          const pa = a.kind === 'point' ? a.pos : a.startPos;
          const pb = b.kind === 'point' ? b.pos : b.startPos;
          return pa - pb;
        });
        const startOps = classifyCap(ops, true, stick.length);
        const endOps = classifyCap(ops, false, stick.length);
        const sk = fmtCap(startOps, true, stick.length);
        const ek = fmtCap(endOps, false, stick.length);
        startCapPatterns.set(sk, (startCapPatterns.get(sk)||0) + 1);
        endCapPatterns.set(ek, (endCapPatterns.get(ek)||0) + 1);
      }
    }
  }
}

console.log(`Total 89mm H sticks: ${totalH}`);
console.log('\n=== START CAP patterns (first 200mm) ===');
[...startCapPatterns.entries()].sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
  console.log(`  ${v.toString().padStart(3)}× ${k}`);
});
console.log('\n=== END CAP patterns (last 200mm, mirrored) ===');
[...endCapPatterns.entries()].sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
  console.log(`  ${v.toString().padStart(3)}× ${k}`);
});
