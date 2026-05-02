// V4 — Test hypothesis: notch range is INSIDE the W edge by lip_depth/sin(theta), then merge with stud edges.
const T1_LOCAL_START = 23728.786;
const T1Z = 57309.5;
const localPos = wx => T1_LOCAL_START - wx;

const studs = [
  { name:"S1", x:23712.286 }, { name:"S2", x:23475.286 }, { name:"S3", x:23170.286 },
  { name:"S4", x:22880.786 }, { name:"S5", x:22838.786 }, { name:"S6", x:22796.786 },
  { name:"S7", x:22525.280 }, { name:"S8", x:22180.281 }, { name:"S9", x:22090.282 },
  { name:"S10", x:21765.784 }, { name:"S11", x:21723.784 }, { name:"S12", x:21640.283 },
  { name:"S14", x:21190.283 }, { name:"S17", x:20740.284 }, { name:"S21", x:20290.284 },
  { name:"S22", x:20133.786 }, { name:"S23", x:20091.786 }, { name:"S24", x:20049.786 },
  { name:"S26", x:19840.286 }, { name:"S27", x:19635.786 },
];
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

const STUD_HALF = 20.5; // 41/2
const STUD_OFFSET = 2.0;
const LIP_DEPTH = 11; // profile l_lip / r_lip

// For each W: range = [edge_lo + LIP/sin, edge_hi - LIP/sin]  (notch is INSIDE the web by lip)
function webRange(w, lipInset = LIP_DEPTH) {
  const dz = w.e.z - w.s.z, dx = w.e.x - w.s.x;
  const len = Math.sqrt(dx*dx+dz*dz);
  const perpX = -dz/len, perpZ = dx/len;
  const halfW = 89/2;
  function intersect(p1,p2,atZ){const d=p2.z-p1.z;if(Math.abs(d)<1e-9)return null;const t=(atZ-p1.z)/d;return p1.x+t*(p2.x-p1.x);}
  const e1s={x:w.s.x+halfW*perpX,z:w.s.z+halfW*perpZ}, e1e={x:w.e.x+halfW*perpX,z:w.e.z+halfW*perpZ};
  const e2s={x:w.s.x-halfW*perpX,z:w.s.z-halfW*perpZ}, e2e={x:w.e.x-halfW*perpX,z:w.e.z-halfW*perpZ};
  const x1=intersect(e1s,e1e,T1Z), x2=intersect(e2s,e2e,T1Z);
  if (x1===null||x2===null) return null;
  const xLo=Math.min(x1,x2),xHi=Math.max(x1,x2);
  const sin_theta=Math.abs(dz)/len;
  const inset = lipInset / sin_theta;
  return { name:w.name, start: localPos(xHi)+inset, end: localPos(xLo)-inset, sin:sin_theta };
}

const studRanges = studs.map(s => ({
  name: s.name, kind: "stud",
  start: localPos(s.x) - STUD_HALF - STUD_OFFSET,
  end:   localPos(s.x) + STUD_HALF + STUD_OFFSET,
}));
const webRanges = [...webs, ...kbs].map(w => {
  const r = webRange(w);
  return { name: r.name, kind: "web", start: r.start, end: r.end };
});

const all = [...studRanges, ...webRanges].sort((a,b)=>a.start-b.start);
const merged = [];
for (const r of all) {
  if (merged.length===0 || r.start > merged[merged.length-1].end) {
    merged.push({ start: r.start, end: r.end, members: [r.name] });
  } else {
    merged[merged.length-1].end = Math.max(merged[merged.length-1].end, r.end);
    merged[merged.length-1].members.push(r.name);
  }
}

const ref = [[470,515.9],[1120.7,1291.2],[1876.7,2027.5],[2893.3,3080.1]];

console.log("With LIP_INSET=11mm in web edges:");
console.log("Merged ranges:");
for (const m of merged) console.log(`  [${m.start.toFixed(2)}..${m.end.toFixed(2)}] (${(m.end-m.start).toFixed(1)}mm) members: ${m.members.join(",")}`);

console.log("\nMatch to ref:");
for (const [rs,re] of ref) {
  const m = merged.find(x => Math.abs((x.start+x.end)/2 - (rs+re)/2) < 100);
  if (m) {
    console.log(`  ref[${rs}..${re}] (w=${(re-rs).toFixed(1)}) ↔ pred[${m.start.toFixed(2)}..${m.end.toFixed(2)}] (w=${(m.end-m.start).toFixed(1)})  diff start=${(rs-m.start).toFixed(2)} end=${(re-m.end).toFixed(2)}  members=${m.members.join(",")}`);
  }
}

// Try a sweep of lip_inset values to find the best fit
console.log("\n--- Sweep of LIP_INSET values ---");
for (const lip of [9, 10, 10.5, 11, 11.5, 12, 13, 14]) {
  const wr = [...webs, ...kbs].map(w => {
    const r = webRange(w, lip); return { name: r.name, kind:"web", start:r.start, end:r.end };
  });
  const all2 = [...studRanges, ...wr].sort((a,b)=>a.start-b.start);
  const m2 = [];
  for (const r of all2) {
    if (m2.length===0 || r.start > m2[m2.length-1].end) m2.push({start:r.start,end:r.end,members:[r.name]});
    else { m2[m2.length-1].end = Math.max(m2[m2.length-1].end, r.end); m2[m2.length-1].members.push(r.name); }
  }
  let totalAbsDiff = 0, n = 0;
  for (const [rs,re] of ref) {
    const m = m2.find(x => Math.abs((x.start+x.end)/2 - (rs+re)/2) < 200);
    if (m) { totalAbsDiff += Math.abs(rs-m.start) + Math.abs(re-m.end); n+=2; }
  }
  console.log(`  LIP_INSET=${lip}: avg|diff|=${(totalAbsDiff/n).toFixed(2)}mm`);
}
