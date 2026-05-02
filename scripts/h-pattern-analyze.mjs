import fs from 'fs';
import path from 'path';
import { decode } from '../dist/decode.js';

const CORPUS = 'C:/Users/Scott/CLAUDE CODE/hytek-rfy-codec/test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES';
const files = fs.readdirSync(CORPUS).filter(f => /89\.075\.rfy$/.test(f));

// Stats: notches relative properties
let totalNotches = 0;
const notchWidths = [];
const sub45 = [];   // <45mm
const w45 = [];     // exactly ~45
const wide = [];    // >45

const lipOnly = [];
const innerOnly = [];
const both = [];

const dimplesPerNotch = [];

const lipsBySize = new Map();

for (const f of files) {
  const buf = fs.readFileSync(path.join(CORPUS, f));
  const r = await decode(buf);
  const plans = r.project?.plans || [];
  for (const plan of plans) {
    for (const frame of (plan.frames || [])) {
      for (const stick of (frame.sticks || [])) {
        if (!(stick.name||'').startsWith('H')) continue;
        if (stick.profile?.web !== 89) continue;

        const ops = (stick.tooling || []);
        // Find spanned ops
        const spanned = ops.filter(o => o.kind === 'spanned');
        // Group spanned ops by overlapping span (start within 5 of each other, end within 5)
        const groups = [];
        for (const sp of spanned) {
          let g = groups.find(grp => Math.abs(grp.start - sp.startPos) < 5 && Math.abs(grp.end - sp.endPos) < 5);
          if (!g) {
            g = {start: sp.startPos, end: sp.endPos, types: new Set()};
            groups.push(g);
          }
          g.types.add(sp.type);
        }

        for (const g of groups) {
          const w = g.end - g.start;
          if (g.types.has('LipNotch') && g.types.has('InnerNotch')) {
            both.push({w, file: f, frame: frame.name, stick: stick.name, span: g});
          } else if (g.types.has('LipNotch')) {
            lipOnly.push({w, file: f, frame: frame.name, stick: stick.name, span: g});
          } else if (g.types.has('InnerNotch')) {
            innerOnly.push({w, file: f, frame: frame.name, stick: stick.name, span: g});
          }
          notchWidths.push(w);
          totalNotches++;
        }
      }
    }
  }
}

console.log(`Total grouped notches across 89mm H sticks: ${totalNotches}`);
console.log(`  LipNotch only: ${lipOnly.length}`);
console.log(`  InnerNotch only: ${innerOnly.length}`);
console.log(`  Both LipNotch+InnerNotch: ${both.length}`);

// Width histogram of LipNotch-only
const lipWidthBuckets = new Map();
for (const x of lipOnly) {
  const k = Math.round(x.w);
  lipWidthBuckets.set(k, (lipWidthBuckets.get(k)||0) + 1);
}
console.log('\n=== LipNotch-only width distribution (rounded mm) ===');
[...lipWidthBuckets.entries()].sort((a,b) => a[0]-b[0]).forEach(([k,v]) => console.log(`  ${k}mm: ${v}`));

// Width hist of Both
const bothWidthBuckets = new Map();
for (const x of both) {
  const k = Math.round(x.w);
  bothWidthBuckets.set(k, (bothWidthBuckets.get(k)||0) + 1);
}
console.log('\n=== Both-LipNotch+InnerNotch width distribution (rounded mm) ===');
[...bothWidthBuckets.entries()].sort((a,b) => a[0]-b[0]).forEach(([k,v]) => console.log(`  ${k}mm: ${v}`));

// Width hist of InnerNotch-only
const innerWidthBuckets = new Map();
for (const x of innerOnly) {
  const k = Math.round(x.w);
  innerWidthBuckets.set(k, (innerWidthBuckets.get(k)||0) + 1);
}
console.log('\n=== InnerNotch-only width distribution (rounded mm) ===');
[...innerWidthBuckets.entries()].sort((a,b) => a[0]-b[0]).forEach(([k,v]) => console.log(`  ${k}mm: ${v}`));

// Note: 89 web means InnerNotch is across the full 89 web. Show some examples of "both" notches at start/end:
console.log('\n=== Examples of "both" (LipNotch+InnerNotch) ===');
for (const x of both.slice(0, 12)) {
  console.log(`  ${x.file}/${x.frame}/${x.stick} span=${x.span.start.toFixed(2)}..${x.span.end.toFixed(2)} w=${(x.span.end-x.span.start).toFixed(2)}`);
}

// Also gap-between-notches distribution
console.log('\n=== Gap between adjacent notches (LipNotch only, on same stick) ===');
const gaps = [];
for (const f of files) {
  const buf = fs.readFileSync(path.join(CORPUS, f));
  const r = await decode(buf);
  for (const plan of (r.project?.plans||[])) {
    for (const frame of (plan.frames||[])) {
      for (const stick of (frame.sticks||[])) {
        if (!(stick.name||'').startsWith('H')) continue;
        if (stick.profile?.web !== 89) continue;
        const ops = (stick.tooling || []);
        const spanned = ops.filter(o => o.kind === 'spanned' && o.type === 'LipNotch')
          .slice().sort((a,b) => a.startPos - b.startPos);
        for (let i = 1; i < spanned.length; i++) {
          const gap = spanned[i].startPos - spanned[i-1].endPos;
          if (gap >= 0) gaps.push(gap);
        }
      }
    }
  }
}
gaps.sort((a,b) => a-b);
console.log('  Min gap:', gaps[0]);
console.log('  Max gap:', gaps[gaps.length-1]);
console.log('  Smallest 30 gaps:', gaps.slice(0, 30).map(g => g.toFixed(2)).join(' '));
