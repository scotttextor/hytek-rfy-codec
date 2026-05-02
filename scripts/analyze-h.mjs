import fs from 'fs';
import path from 'path';
import { decode } from '../dist/decode.js';

const CORPUS = 'C:/Users/Scott/CLAUDE CODE/hytek-rfy-codec/test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES';

const f = process.argv[2];
const wantFrame = process.argv[3];
const fullPath = path.isAbsolute(f) ? f : path.join(CORPUS, f);
const buf = fs.readFileSync(fullPath);
const r = await decode(buf);

const xmlPath = fullPath.replace(/\.rfy$/, '.xml');
const xml = fs.readFileSync(xmlPath, 'utf8');

// Parse XML by frame
function parseFrameXml(name) {
  const idx = xml.indexOf(`<frame name="${name}"`);
  if (idx < 0) return null;
  const endIdx = xml.indexOf('</frame>', idx);
  const fxml = xml.slice(idx, endIdx);
  const sticks = [];
  const stickRe = /<stick name="([^"]+)" type="([^"]+)"[^>]*usage="([^"]+)"[\s\S]*?<start>([^<]+)<\/start>\s*<end>([^<]+)<\/end>[\s\S]*?<flipped>([^<]+)<\/flipped>[\s\S]*?<\/stick>/g;
  let m;
  while ((m = stickRe.exec(fxml)) !== null) {
    const [_, n, t, u, s, e, fl] = m;
    const sp = s.trim().split(',').map(Number);
    const ep = e.trim().split(',').map(Number);
    sticks.push({name: n, type: t, usage: u, start: sp, end: ep, flipped: fl.trim() === 'true'});
  }
  return sticks;
}

const plans = r.project?.plans || [];
for (const plan of plans) {
  for (const frame of (plan.frames || [])) {
    if (wantFrame && frame.name !== wantFrame) continue;
    const hSticks = (frame.sticks || []).filter(s => (s.name||'').startsWith('H'));
    if (hSticks.length === 0) continue;

    const xmlSticks = parseFrameXml(frame.name) || [];
    const headXml = xmlSticks.find(s => s.usage === 'HeadPlate');
    const studs = xmlSticks.filter(s => s.usage === 'Stud' || s.usage === 'Web');

    if (!headXml) {
      console.log(`Frame ${frame.name}: no head plate in XML, skipping`);
      continue;
    }

    // Head plate runs along X (since y/z are constant for plates).
    // It runs from headXml.start[0] to headXml.end[0]
    const hXmin = Math.min(headXml.start[0], headXml.end[0]);
    const hXmax = Math.max(headXml.start[0], headXml.end[0]);
    const hLen = hXmax - hXmin;
    const flipped = headXml.flipped;

    // Stick origin: which end is pos=0 ?
    // For flipped=true, pos=0 is the end nearer hXmax (or hXmin?)
    // Let's compute for each stud crossing relative to both
    // We'll output stud x positions and compare with both interpretations

    console.log(`\n========== Frame ${frame.name} ==========`);
    console.log(`HeadPlate H1 in XML: x=[${hXmin}..${hXmax}] len=${hLen} flipped=${flipped}`);
    console.log(`Studs (and Webs) in frame:`);
    const studXs = [];
    for (const s of studs) {
      const sx = (s.start[0] + s.end[0]) / 2;
      // Only include studs that pass under the head plate (x within range)
      if (sx >= hXmin - 1 && sx <= hXmax + 1) {
        studXs.push({name: s.name, x: sx, usage: s.usage});
      }
    }
    studXs.sort((a,b) => a.x - b.x);

    // Translate to stick coords: pos = x - hXmin (or hXmax - x if flipped)
    // We don't yet know the convention. Compute both.
    for (const stick of hSticks) {
      console.log(`\n--- ${stick.name} length=${stick.length} flipped=${stick.flipped} ---`);
      const ops = (stick.tooling || []).slice().sort((a,b) => {
        const pa = a.kind === 'point' ? a.pos : a.startPos;
        const pb = b.kind === 'point' ? b.pos : b.startPos;
        return pa - pb;
      });
      // Print stud expected positions both ways
      console.log('Studs in frame (XML):');
      for (const s of studXs) {
        const fwd = s.x - hXmin;
        const rev = hXmax - s.x;
        console.log(`  ${s.name.padEnd(4)} usage=${s.usage.padEnd(5)} x=${s.x.toFixed(2)}  pos_fwd=${fwd.toFixed(2)}  pos_rev=${rev.toFixed(2)}`);
      }
      console.log('Tooling ops:');
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
