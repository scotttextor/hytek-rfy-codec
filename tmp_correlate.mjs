import fs from 'fs';

const mod = await import('./dist/decode.js');

const file = process.argv[2] || 'test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES/TH01-2F-FJ-89.075.rfy';
const data = fs.readFileSync(file);
const r = await mod.decode(data);

const targetFrame = process.argv[3] || 'JB1210-1';

function bbox(corners) {
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  for (const c of corners) { minX=Math.min(minX,c.x); maxX=Math.max(maxX,c.x); minY=Math.min(minY,c.y); maxY=Math.max(maxY,c.y); }
  return {minX,maxX,minY,maxY,cx:(minX+maxX)/2,cy:(minY+maxY)/2,dx:maxX-minX,dy:maxY-minY};
}

for (const plan of r.project.plans) {
  for (const f of plan.frames) {
    if (!f.name) continue;
    if (targetFrame !== 'all' && f.name !== targetFrame) continue;

    const sticks = f.sticks.map(s => ({ s, b: bbox(s.outlineCorners) }));
    const verticals = sticks.filter(x => x.s.type==='stud' && x.s.name?.startsWith('V'));
    const webs = sticks.filter(x => x.s.type==='stud' && x.s.name?.startsWith('W'));
    const plates = sticks.filter(x => x.s.type==='plate').sort((a,b)=>b.s.length - a.s.length).slice(0,2).sort((a,b)=>a.b.cy - b.b.cy);
    const bot = plates[0], top = plates[1];

    function chordPoints(chord) {
      const offsetX = chord.b.minX, flipped = chord.s.flipped;
      const points = [];
      const spans = [];
      for (const op of chord.s.tooling) {
        if (op.kind === 'point') {
          const fx = offsetX + (flipped ? (chord.s.length - op.pos) : op.pos);
          points.push({type: op.type, fx, pos: op.pos});
        } else {
          const a = offsetX + (flipped ? (chord.s.length - op.endPos) : op.startPos);
          const b = offsetX + (flipped ? (chord.s.length - op.startPos) : op.endPos);
          spans.push({type: op.type, fxStart: Math.min(a,b), fxEnd: Math.max(a,b), startPos: op.startPos, endPos: op.endPos});
        }
      }
      return {points, spans};
    }

    function classifyContacts(chord, isTop) {
      const contacts = [];
      // verticals that touch this chord
      for (const v of verticals) {
        if (isTop) {
          if (v.b.maxY >= chord.b.minY - 1) contacts.push({kind:'V', name:v.s.name, fx:v.b.cx, edgeMin:v.b.minX, edgeMax:v.b.maxX});
        } else {
          if (v.b.minY <= chord.b.maxY + 1) contacts.push({kind:'V', name:v.s.name, fx:v.b.cx, edgeMin:v.b.minX, edgeMax:v.b.maxX});
        }
      }
      // webs
      for (const w of webs) {
        const corners = [...w.s.outlineCorners].sort((a,b)=>a.y-b.y);
        const lo2 = corners.slice(0,2), hi2 = corners.slice(2,4);
        if (isTop) {
          const cx = (hi2[0].x + hi2[1].x)/2;
          contacts.push({kind:'W', name:w.s.name, fx:cx, edgeMin:Math.min(hi2[0].x,hi2[1].x), edgeMax:Math.max(hi2[0].x,hi2[1].x)});
        } else {
          const cx = (lo2[0].x + lo2[1].x)/2;
          contacts.push({kind:'W', name:w.s.name, fx:cx, edgeMin:Math.min(lo2[0].x,lo2[1].x), edgeMax:Math.max(lo2[0].x,lo2[1].x)});
        }
      }
      contacts.sort((a,b)=>a.fx - b.fx);
      return contacts;
    }

    function dump(label, chord, isTop) {
      console.log(`\n========= ${label} ${chord.s.name} length=${chord.s.length} flipped=${chord.s.flipped} =========`);
      const cp = chordPoints(chord);
      const contacts = classifyContacts(chord, isTop);
      console.log('Contacts (frame-X sorted):');
      for (const c of contacts) console.log(`  ${c.kind} ${c.name}  fx=${c.fx.toFixed(3)} edge=[${c.edgeMin.toFixed(3)}..${c.edgeMax.toFixed(3)}]`);
      console.log('\nDimples (in chord-local order, with frame-X and nearest contact):');
      cp.points.filter(p=>p.type==='InnerDimple').forEach(p => {
        let nearest = null, d = Infinity;
        for (const c of contacts) { const dd = Math.abs(c.fx - p.fx); if (dd < d) { d = dd; nearest = c; } }
        console.log(`  pos=${p.pos.toFixed(3)} fx=${p.fx.toFixed(3)}  nearest=${nearest?.kind}${nearest?.name}@${nearest?.fx.toFixed(2)} dist=${d.toFixed(3)}`);
      });
      console.log('\nLipNotches (frame-X order, with overlapping contacts):');
      const sortedSpans = [...cp.spans].sort((a,b)=>a.fxStart - b.fxStart);
      for (const sp of sortedSpans.filter(x=>x.type==='LipNotch')) {
        const inside = contacts.filter(c => c.edgeMax > sp.fxStart - 1 && c.edgeMin < sp.fxEnd + 1);
        const insideStr = inside.map(c => `${c.kind}${c.name}@${c.fx.toFixed(1)}[${c.edgeMin.toFixed(1)}..${c.edgeMax.toFixed(1)}]`).join(' + ');
        console.log(`  [${sp.startPos.toFixed(3)}..${sp.endPos.toFixed(3)}] fx=[${sp.fxStart.toFixed(3)}..${sp.fxEnd.toFixed(3)}] width=${(sp.fxEnd-sp.fxStart).toFixed(2)}  contains: ${insideStr || '(none)'}`);
      }
    }

    dump('TOP CHORD', top, true);
    dump('BOT CHORD', bot, false);
  }
}
