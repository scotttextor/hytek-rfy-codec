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

    // Index sticks
    const verticals = [];
    const webs = [];
    let topChord = null, bottomChord = null;
    for (const s of f.sticks) {
      const b = bbox(s.outlineCorners);
      s._bb = b;
      if (s.type === 'plate') {
        if (b.cy > f.height/2) topChord = s;  // top
        else if (s.length > 1000) bottomChord = bottomChord || s;
        // primary chord = longest plate near each side
      } else if (s.type === 'stud') {
        if (s.name?.startsWith('V')) verticals.push(s);
        if (s.name?.startsWith('W')) webs.push(s);
      }
    }

    // Better: bottom chord = plate with min cy and length similar to frame
    const plates = f.sticks.filter(s=>s.type==='plate');
    plates.sort((a,b)=>b.length - a.length);
    const longChords = plates.slice(0,2).sort((a,b)=>a._bb.cy - b._bb.cy);
    bottomChord = longChords[0];
    topChord = longChords[1];

    console.log(`Frame ${f.name}  L=${f.length} H=${f.height}`);
    console.log(`  TopChord: ${topChord.name} bbox y=[${topChord._bb.minY.toFixed(2)}..${topChord._bb.maxY.toFixed(2)}] x=[${topChord._bb.minX.toFixed(2)}..${topChord._bb.maxX.toFixed(2)}]`);
    console.log(`  BotChord: ${bottomChord.name} bbox y=[${bottomChord._bb.minY.toFixed(2)}..${bottomChord._bb.maxY.toFixed(2)}] x=[${bottomChord._bb.minX.toFixed(2)}..${bottomChord._bb.maxX.toFixed(2)}]`);

    // Map of vertical frame-X centers
    console.log(`  Verticals at frame-X centers:`);
    for (const v of verticals) console.log(`    ${v.name} cx=${v._bb.cx.toFixed(2)} x=[${v._bb.minX.toFixed(2)}..${v._bb.maxX.toFixed(2)}]`);

    console.log(`  Webs (foot-on-bot, head-on-top):`);
    for (const w of webs) {
      // Find top/bottom edges of web — corners with y near max vs near min
      const corners = [...w.outlineCorners];
      corners.sort((a,b)=>a.y - b.y);
      const bot2 = corners.slice(0,2);
      const top2 = corners.slice(2,4);
      const botCx = (bot2[0].x + bot2[1].x)/2;
      const topCx = (top2[0].x + top2[1].x)/2;
      console.log(`    ${w.name} bot.foot center frame-X=${botCx.toFixed(2)} (corners x:${bot2.map(c=>c.x.toFixed(2)).join(',')})  top.head center frame-X=${topCx.toFixed(2)} (corners x:${top2.map(c=>c.x.toFixed(2)).join(',')})`);
    }

    // Convert chord-local coords back to frame-X for clarity
    function showChord(label, c) {
      if (!c) return;
      const offsetX = c._bb.minX;  // chord local 0 = chord min frame-X (assuming no flip)
      console.log(`\n  --- ${label} ${c.name} (chord-local 0 = frame-X ${offsetX.toFixed(2)}, flipped=${c.flipped}) ---`);
      for (const op of c.tooling) {
        if (op.kind === 'point') {
          const fx = offsetX + (c.flipped ? (c.length - op.pos) : op.pos);
          console.log(`    ${op.type} pos=${op.pos.toFixed(3)} → frame-X=${fx.toFixed(3)}`);
        } else {
          const fxs = offsetX + (c.flipped ? (c.length - op.endPos) : op.startPos);
          const fxe = offsetX + (c.flipped ? (c.length - op.startPos) : op.endPos);
          console.log(`    ${op.type} [${op.startPos.toFixed(3)}..${op.endPos.toFixed(3)}] → frame-X [${Math.min(fxs,fxe).toFixed(3)}..${Math.max(fxs,fxe).toFixed(3)}]`);
        }
      }
    }
    showChord('TOP CHORD', topChord);
    showChord('BOT CHORD', bottomChord);
  }
}
