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

    function dump(label, chord, isTop) {
      // FORCE flipped=false to test
      const offsetX = chord.b.minX, flipped = false;
      const toFx = pos => offsetX + (flipped ? (chord.s.length - pos) : pos);
      const toLocal = fx => flipped ? (offsetX + chord.s.length - fx) : (fx - offsetX);

      console.log(`\n========= ${label} ${chord.s.name} length=${chord.s.length} flipped=${flipped} (cl=0 → fx=${toFx(0)}, cl=L → fx=${toFx(chord.s.length)}) =========`);

      // Build list of contacts in chord-local order
      const contacts = [];
      for (const v of verticals) {
        if (isTop ? v.b.maxY >= chord.b.minY - 1 : v.b.minY <= chord.b.maxY + 1) {
          contacts.push({kind:'V', name:v.s.name, fx:v.b.cx, edgeLo: v.b.minX, edgeHi: v.b.maxX});
        }
      }
      for (const w of webs) {
        const corners = [...w.s.outlineCorners].sort((a,b)=>a.y-b.y);
        const set = isTop ? corners.slice(2,4) : corners.slice(0,2);
        const cx = (set[0].x+set[1].x)/2;
        contacts.push({kind:'W', name:w.s.name, fx: cx, edgeLo: Math.min(set[0].x,set[1].x), edgeHi: Math.max(set[0].x,set[1].x)});
      }
      // Add chord-local for each contact
      for (const c of contacts) {
        c.cl = toLocal(c.fx);
        c.clEdgeLo = toLocal(flipped ? c.edgeHi : c.edgeLo);
        c.clEdgeHi = toLocal(flipped ? c.edgeLo : c.edgeHi);
      }
      contacts.sort((a,b)=>a.cl - b.cl);
      console.log('Contacts in CHORD-LOCAL order:');
      for (const c of contacts) console.log(`  cl=${c.cl.toFixed(3)} (edge ${c.clEdgeLo.toFixed(2)}..${c.clEdgeHi.toFixed(2)}) fx=${c.fx.toFixed(2)}  ${c.kind}${c.name}`);

      // Group dimples in chord-local order, look at offsets from each contact
      console.log('\nDimples (chord-local):');
      const dimples = chord.s.tooling.filter(o => o.type === 'InnerDimple').map(o => o.pos).sort((a,b)=>a-b);
      for (const p of dimples) {
        let nearest = null, d = Infinity;
        for (const c of contacts) { const dd = Math.abs(c.cl - p); if (dd < d) { d = dd; nearest = c; } }
        const sign = (nearest && p > nearest.cl) ? '+' : '-';
        console.log(`  cl=${p.toFixed(3)}   nearest ${nearest?.kind}${nearest?.name}@cl=${nearest?.cl.toFixed(2)}  Δ=${sign}${d.toFixed(3)}`);
      }

      console.log('\nLipNotches (chord-local):');
      const notches = chord.s.tooling.filter(o => o.type === 'LipNotch').map(o => ({s:o.startPos,e:o.endPos})).sort((a,b)=>a.s-b.s);
      for (const n of notches) {
        const inside = contacts.filter(c => c.clEdgeHi > n.s - 1 && c.clEdgeLo < n.e + 1);
        const insideStr = inside.map(c => `${c.kind}${c.name}@${c.cl.toFixed(1)}[${c.clEdgeLo.toFixed(1)}..${c.clEdgeHi.toFixed(1)}]`).join(' + ');
        console.log(`  [${n.s.toFixed(3)}..${n.e.toFixed(3)}] w=${(n.e-n.s).toFixed(2)}  contains: ${insideStr || '(none)'}`);
      }
    }

    dump('TOP CHORD', top, true);
    dump('BOT CHORD', bot, false);
  }
}
