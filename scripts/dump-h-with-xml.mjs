import fs from 'fs';
import path from 'path';
import { decode } from '../dist/decode.js';

const CORPUS = 'C:/Users/Scott/CLAUDE CODE/hytek-rfy-codec/test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES';

const f = process.argv[2];
const frameFilter = process.argv[3]; // optional frame name
const fullPath = path.isAbsolute(f) ? f : path.join(CORPUS, f);
const buf = fs.readFileSync(fullPath);
const r = await decode(buf);

const xmlPath = fullPath.replace(/\.rfy$/, '.xml');
const xml = fs.readFileSync(xmlPath, 'utf8');

const plans = r.project?.plans || [];
for (const plan of plans) {
  for (const frame of (plan.frames || [])) {
    if (frameFilter && frame.name !== frameFilter) continue;
    const hSticks = (frame.sticks || []).filter(s => (s.name||'').startsWith('H'));
    if (hSticks.length === 0) continue;

    console.log(`\n=== Frame ${frame.name} length=${frame.length} ===`);

    // Find frame in XML and its stud positions
    const frameRe = new RegExp(`<Frame[^>]*Name="${frame.name}"[\\s\\S]*?</Frame>`, 'g');
    const m = frameRe.exec(xml);
    if (m) {
      const fxml = m[0];
      // Find sticks - look for member tags with positions
      const memberRe = /<Member[^>]*Name="([^"]+)"[^>]*X1="([^"]+)"[^>]*Y1="([^"]+)"[^>]*X2="([^"]+)"[^>]*Y2="([^"]+)"[^>]*Type="([^"]*)"[^>]*\/>/g;
      let mm;
      const studs = [];
      const all = [];
      while ((mm = memberRe.exec(fxml)) !== null) {
        const [_, name, x1, y1, x2, y2, type] = mm;
        all.push({name, x1: +x1, y1: +y1, x2: +x2, y2: +y2, type});
        if (name.startsWith('S') || type === 'stud' || type === 'CommonStud') {
          studs.push({name, x: +x1, type});
        }
      }
      console.log(`XML members: ${all.length}, studs (S* or type=stud): ${studs.length}`);
      console.log('All XML member types/names:', all.map(a => `${a.name}(${a.type})`).join(' '));
      if (studs.length > 0) {
        console.log('Stud x positions:', studs.map(s => `${s.name}@${s.x}`).join(' '));
      }
    } else {
      console.log('Frame not found in XML, trying loose search...');
      // Just look for tags with "Stud"
      const studRe = /<(?:Member|Stud|Element)[^>]*\/>/g;
      // skip
    }

    for (const stick of hSticks) {
      console.log(`\n--- ${stick.name} type=${stick.type} length=${stick.length} flipped=${stick.flipped} ---`);
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
