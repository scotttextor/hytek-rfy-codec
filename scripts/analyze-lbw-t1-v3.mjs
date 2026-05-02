// V3 — combine W truss-web edges and STUD edges, then merge.
const T1_LOCAL_START = 23728.786;
const T1Z = 57309.5;

function localPos(worldX) { return T1_LOCAL_START - worldX; }

// Studs touching T1 - assume stud width = 41mm along chord axis (largest flange)
// Or maybe 38mm? Or 89 (web)?
// In LBW, studs run vertical with WEB facing +y (perpendicular to wall).
// So x-footprint = the LIP-FLANGE side. Profile l_flange=38, r_flange=41.
// "flipped" determines whether l or r is on +x or -x side.
// Stud's x-extent = max(l_flange, r_flange) = 41mm wide? Or sum 38+41=79? No!
// C-section: web is one face, flanges go off web 38 and 41 mm respectively.
// Width of the section perpendicular to web = max(l_flange, r_flange) = let's say 41mm.
// (l_flange and r_flange are the 2 flanges of the same C-section.)
// For studs running in z, with web in y: section in xz extends:
//    along z (height) = web 89... no wait that's the long dimension along the stud.
// Actually FrameCAD profile: web 89 = the LONG dimension of the C-section (the web face).
// Flanges 38, 41 = SHORT dimensions perpendicular to web.
// So the C cross-section is approximately 89 (web) by max(38,41)=41 (flange depth).
//
// For a STUD running in z (vertical):
//   The 89mm web sits along x or y. With web facing +y (out of wall plane), web extends 89mm along x (along the wall).
//   Wait that doesn't make sense either. Web facing +y means the FLAT BACK faces +y, and the C opens to -y.
//   The 89mm dimension is the WIDTH of that flat back, which is along... whichever axis the C is oriented.
//
// For a stud in a LBW wall: typically the stud's web=89 sits along x (the chord axis) so it nogs in 89mm wide.
// Then x-footprint = 89mm (the web width). NO! That makes studs 89mm wide along the wall — too much.
//
// Real-world: studs are 89mm DEEP (perpendicular to wall, the y direction = web=89)
//             and 41mm WIDE (along wall, the x direction = flange=41)
// Yes — that's the standard. So stud's x-footprint = 41mm centered on stud center.
// Half-width = 20.5mm.

// B2B pairs: two studs side-by-side, each 41mm wide. Centers 42mm apart.
// Combined footprint: from (S1.center - 20.5) to (S2.center + 20.5) = ~83mm.

const studs = [
  { name:"S1", x:23712.286 },
  { name:"S2", x:23475.286 },
  { name:"S3", x:23170.286 },
  { name:"S4", x:22880.786, b2b:"S5" },
  { name:"S5", x:22838.786, b2b:"S4" },
  { name:"S6", x:22796.786 },
  { name:"S7", x:22525.280 },
  { name:"S8", x:22180.281 },
  { name:"S9", x:22090.282 },
  { name:"S10", x:21765.784, b2b:"S11" },
  { name:"S11", x:21723.784, b2b:"S10" },
  { name:"S12", x:21640.283 },
  { name:"S14", x:21190.283 },
  { name:"S17", x:20740.284 },
  { name:"S21", x:20290.284 },
  { name:"S22", x:20133.786, b2b:"S23" },
  { name:"S23", x:20091.786, b2b:"S22" },
  { name:"S24", x:20049.786 },
  { name:"S26", x:19840.286 },
  { name:"S27", x:19635.786 },
];

const STUD_HALF = 20.5; // 41/2
const STUD_OFFSET = 2.0; // edge offset like FJ formula (sin(90°)=1)

// Compute each stud's notch range (treat each stud as an "edge crossing" with offset 2.0)
console.log("Stud crossings (edge formula with stud half-width=20.5, offset=2.0):");
const studRanges = studs.map(s => ({
  name: s.name,
  center: localPos(s.x),
  start: localPos(s.x) - STUD_HALF - STUD_OFFSET,
  end:   localPos(s.x) + STUD_HALF + STUD_OFFSET,
  b2b: s.b2b,
}));
studRanges.sort((a,b)=>a.center-b.center);
for (const s of studRanges) console.log(`  ${s.name.padEnd(4)} center=${s.center.toFixed(1).padStart(7)} → [${s.start.toFixed(2)}..${s.end.toFixed(2)}]`);

// Add W truss-web ranges
const webs = [
  { name:"W1", s:{x:22749.772,z:56849.772}, e:{x:22572.294,z:57320.228} },
  { name:"W2", s:{x:22225.819,z:56850.447}, e:{x:22479.742,z:57319.553} },
  { name:"W3", s:{x:22044.360,z:56850.248}, e:{x:21811.706,z:57319.752} },
  { name:"W4", s:{x:21234.178,z:56851.518}, e:{x:21596.387,z:57318.482} },
  { name:"W5", s:{x:21146.388,z:56851.518}, e:{x:20784.179,z:57318.482} },
  { name:"W6", s:{x:20340.916,z:56851.484}, e:{x:20699.697,z:57318.516} },
  { name:"W7", s:{x:20181.467,z:56849.087}, e:{x:20238.751,z:57320.913} },
];
const kbs = [
  { name:"Kb1", s:{x:23477.415,z:55949.190}, e:{x:23230.157,z:57320.810} },
];

console.log("\nW/Kb truss-web crossings (web 89mm wide, edge offset 2.0/sin(theta)):");
const webRanges = [];
for (const w of [...webs, ...kbs]) {
  const dz = w.e.z - w.s.z;
  const dx = w.e.x - w.s.x;
  const len = Math.sqrt(dx*dx + dz*dz);
  const perpX = -dz/len, perpZ = dx/len;
  const halfW = 89/2;
  function intersect(p1,p2,atZ){const d=p2.z-p1.z;if(Math.abs(d)<1e-9)return null;const t=(atZ-p1.z)/d;return p1.x+t*(p2.x-p1.x);}
  const e1s={x:w.s.x+halfW*perpX,z:w.s.z+halfW*perpZ}, e1e={x:w.e.x+halfW*perpX,z:w.e.z+halfW*perpZ};
  const e2s={x:w.s.x-halfW*perpX,z:w.s.z-halfW*perpZ}, e2e={x:w.e.x-halfW*perpX,z:w.e.z-halfW*perpZ};
  const x1=intersect(e1s,e1e,T1Z), x2=intersect(e2s,e2e,T1Z);
  if (x1===null||x2===null) continue;
  const xLo=Math.min(x1,x2),xHi=Math.max(x1,x2);
  const sin_theta=Math.abs(dz)/len;
  const offset=2.0/sin_theta;
  const lLo=localPos(xHi)-offset, lHi=localPos(xLo)+offset;
  webRanges.push({ name:w.name, start:lLo, end:lHi, sin:sin_theta, offset });
  console.log(`  ${w.name.padEnd(4)} → [${lLo.toFixed(2)}..${lHi.toFixed(2)}] sin=${sin_theta.toFixed(3)} offset=${offset.toFixed(2)}`);
}

// Combine and MERGE overlapping ranges
const allRanges = [...studRanges.map(s=>({name:s.name,start:s.start,end:s.end,kind:"stud"})),
                   ...webRanges.map(w=>({name:w.name,start:w.start,end:w.end,kind:"web"}))];
allRanges.sort((a,b)=>a.start-b.start);

const merged = [];
for (const r of allRanges) {
  if (merged.length===0 || r.start > merged[merged.length-1].end) {
    merged.push({ start:r.start, end:r.end, members:[r.name] });
  } else {
    merged[merged.length-1].end = Math.max(merged[merged.length-1].end, r.end);
    merged[merged.length-1].members.push(r.name);
  }
}
console.log("\nMerged ranges (all stud + W edges):");
for (const m of merged) console.log(`  [${m.start.toFixed(2)}..${m.end.toFixed(2)}] (${(m.end-m.start).toFixed(1)}mm) members: ${m.members.join(", ")}`);

console.log("\n\nReference for comparison:");
const ref = [[470,515.9],[1120.7,1291.2],[1876.7,2027.5],[2893.3,3080.1]];
for (const [s,e] of ref) console.log(`  ref [${s}..${e}] width=${(e-s).toFixed(1)}`);

// Now check our merged groups against ref:
console.log("\nMatching merged → ref:");
for (const [rs,re] of ref) {
  const m = merged.find(x => x.start <= re+50 && x.end >= rs-50 && Math.abs((x.start+x.end)/2 - (rs+re)/2) < 200);
  if (m) {
    console.log(`  ref[${rs}..${re}] ↔ merged[${m.start.toFixed(2)}..${m.end.toFixed(2)}]  startDiff=${(rs-m.start).toFixed(2)}  endDiff=${(re-m.end).toFixed(2)}  members=${m.members.join(",")}`);
  } else {
    console.log(`  ref[${rs}..${re}] - NO MATCH`);
  }
}
