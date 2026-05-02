// Look more deeply at cap structures, broken out by stick category
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

// Examine each stick start cap (first 40mm) and end cap (last 40mm)
function startInner(ops) {
  return ops.find(o => o.kind === 'spanned' && o.type === 'InnerNotch' && o.startPos < 1);
}
function startLip(ops) {
  return ops.find(o => o.kind === 'spanned' && o.type === 'LipNotch' && o.startPos < 1);
}
function endInner(ops, len) {
  return ops.find(o => o.kind === 'spanned' && o.type === 'InnerNotch' && Math.abs(o.endPos - len) < 1);
}
function endLip(ops, len) {
  return ops.find(o => o.kind === 'spanned' && o.type === 'LipNotch' && Math.abs(o.endPos - len) < 1);
}

let bothEndsCapped = 0, oneEndCapped = 0, noCapped = 0;
let startInnerCount = 0, startLipCount = 0, endInnerCount = 0, endLipCount = 0;
const startInnerWidths = [];
const endInnerWidths = [];
const startLipWidths = [];
const endLipWidths = [];

let startBoxFlipFalse = 0; // Box (flipped=false) sticks have different cap?

for (const s of sticks) {
  const si = startInner(s.ops);
  const sl = startLip(s.ops);
  const ei = endInner(s.ops, s.length);
  const el = endLip(s.ops, s.length);
  if (si) { startInnerCount++; startInnerWidths.push(si.endPos - si.startPos); }
  if (sl) { startLipCount++; startLipWidths.push(sl.endPos - sl.startPos); }
  if (ei) { endInnerCount++; endInnerWidths.push(ei.endPos - ei.startPos); }
  if (el) { endLipCount++; endLipWidths.push(el.endPos - el.startPos); }
}

console.log(`Total 89mm H sticks: ${sticks.length}`);
console.log(`Start cap: InnerNotch in ${startInnerCount}, LipNotch in ${startLipCount}`);
console.log(`End cap: InnerNotch in ${endInnerCount}, LipNotch in ${endLipCount}`);

// How many have BOTH start InnerNotch AND start LipNotch?
let bothStart = 0, lipOnlyStart = 0, innerOnlyStart = 0, neitherStart = 0;
let bothEnd = 0, lipOnlyEnd = 0, innerOnlyEnd = 0, neitherEnd = 0;
const noStartCapDetails = [];
const innerOnlyEndDetails = [];

for (const s of sticks) {
  const si = startInner(s.ops);
  const sl = startLip(s.ops);
  const ei = endInner(s.ops, s.length);
  const el = endLip(s.ops, s.length);
  if (si && sl) bothStart++;
  else if (sl) lipOnlyStart++;
  else if (si) innerOnlyStart++;
  else { neitherStart++; noStartCapDetails.push(s); }
  if (ei && el) bothEnd++;
  else if (el) lipOnlyEnd++;
  else if (ei) { innerOnlyEnd++; innerOnlyEndDetails.push(s); }
  else neitherEnd++;
}

console.log(`\nStart: both ${bothStart}, lip-only ${lipOnlyStart}, inner-only ${innerOnlyStart}, neither ${neitherStart}`);
console.log(`End:   both ${bothEnd}, lip-only ${lipOnlyEnd}, inner-only ${innerOnlyEnd}, neither ${neitherEnd}`);

console.log('\nNeither-start examples:');
for (const s of noStartCapDetails.slice(0, 10)) {
  console.log(`  ${s.file}/${s.frame}/${s.name} len=${s.length.toFixed(0)} flipped=${s.flipped}`);
  // Show first 3 ops
  const ops = s.ops.slice(0, 4);
  for (const op of ops) {
    if (op.kind === 'point') console.log(`    ${op.type}@${op.pos.toFixed(2)}`);
    else console.log(`    ${op.type} ${op.startPos.toFixed(2)}..${op.endPos.toFixed(2)}`);
  }
}

// Check: is 'neither-start' always Box1/flipped=false?
console.log(`\nOf ${neitherStart} neither-start, flipped=false: ${noStartCapDetails.filter(s => !s.flipped).length}`);
