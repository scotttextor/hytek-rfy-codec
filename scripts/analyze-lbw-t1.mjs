// Analyze T1 stud crossings on L1101 LBW frame
// T1 runs worldX 23732.786 → 19615.286 along x at z=57309.500
// Frame elevation 54710, T1 z=57309.5 so frame top
// 4mm endClearance trim → local 0 at worldX 23728.786, length = 4117.5 - 8 = 4109.5

const T1_START_X = 23732.786;
const T1_END_X = 19615.286;
const T1_LEN_RAW = T1_START_X - T1_END_X; // 4117.5
const TRIM = 4;
const T1_LOCAL_START = T1_START_X - TRIM; // 23728.786
const T1_LOCAL_LEN = T1_LEN_RAW - 2*TRIM; // 4109.5

// Studs touching T1 (those with end z near 57328 or whose XML start z<=57309 and end z>=57309)
// All S studs that pass through T1's z (57309.5) are full-height (z 54712 → 57328)
// The "S" with z 56843..57328 are the upper trimmer studs that ALSO touch T1
const studs = [
  // name, worldX, B2B?, b2b_partner_x
  { name:"S1", x:23712.286, b2b:false },          // endStud
  { name:"S2", x:23475.286, b2b:false },
  { name:"S3", x:23170.286, b2b:false },
  { name:"S4", x:22880.786, b2b:true, partnerX:22838.786 }, // S5 trimstud B2B
  { name:"S5", x:22838.786, b2b:true, partnerX:22880.786 },
  { name:"S6", x:22796.786, b2b:false }, // upper-only stud
  { name:"S7", x:22525.280, b2b:false }, // upper-only
  { name:"S8", x:22180.281, b2b:false }, // upper-only
  { name:"S9", x:22090.282, b2b:false }, // upper-only
  { name:"S10", x:21765.784, b2b:true, partnerX:21723.784 },
  { name:"S11", x:21723.784, b2b:true, partnerX:21765.784 },
  { name:"S12", x:21640.283, b2b:false }, // upper-only
  { name:"S14", x:21190.283, b2b:false }, // upper-only
  { name:"S17", x:20740.284, b2b:false }, // upper-only
  { name:"S21", x:20290.284, b2b:false }, // upper-only
  { name:"S22", x:20133.786, b2b:true, partnerX:20091.786 },
  { name:"S23", x:20091.786, b2b:true, partnerX:20133.786 },
  { name:"S24", x:20049.786, b2b:false },
  { name:"S26", x:19840.286, b2b:false },
  { name:"S27", x:19635.786, b2b:false }, // endStud
];

// Compute local positions (T1 origin at worldX 23728.786, decreasing-x direction)
function localPos(worldX) {
  return T1_LOCAL_START - worldX;
}

console.log("T1 local length:", T1_LOCAL_LEN);
console.log("");
console.log("Stud positions on T1 (sorted by local pos):");
const studsOnT1 = studs.map(s => ({ ...s, local: localPos(s.x) }));
studsOnT1.sort((a,b) => a.local - b.local);
for (const s of studsOnT1) {
  console.log(`  ${s.name.padEnd(4)} local=${s.local.toFixed(1).padStart(8)} worldX=${s.x}${s.b2b?" [B2B with "+studs.find(x=>x.x===s.partnerX).name+"]":""}`);
}

console.log("\nReference LipNotch ranges from ref RFY:");
const refLipNotches = [
  [470.0, 515.9],
  [1120.7, 1291.2],
  [1876.7, 2027.5],
  [2893.3, 3080.1],
];
console.log("Our (current) emitted ranges (from extras):");
const ourLipNotches = [
  [476.3, 521.3],
  [867.5, 912.5],
  [909.5, 954.5],   // (these look like 4 individual 45mm notches near studs)
  [1181.0, 1226.0],
  // truncated...
];

// For each ref notch, find studs inside [start-30, end+30]
console.log("\nRef notch -> studs covered:");
for (const [s,e] of refLipNotches) {
  const inside = studsOnT1.filter(st => st.local >= s-30 && st.local <= e+30);
  console.log(`  [${s.toFixed(1)}..${e.toFixed(1)}] (width=${(e-s).toFixed(1)}) studs:`, inside.map(x=>`${x.name}@${x.local.toFixed(1)}`).join(", "));
  if (inside.length) {
    const minLocal = Math.min(...inside.map(x=>x.local));
    const maxLocal = Math.max(...inside.map(x=>x.local));
    // For B2B pairs, get edges
    const minStud = inside.find(x=>x.local===minLocal);
    const maxStud = inside.find(x=>x.local===maxLocal);
    console.log(`     local range: ${minLocal.toFixed(1)}..${maxLocal.toFixed(1)}`);
    console.log(`     start_offset_from_left_stud = ${(minLocal-s).toFixed(2)}mm`);
    console.log(`     end_offset_from_right_stud  = ${(e-maxLocal).toFixed(2)}mm`);
    // If stud is B2B, the leftmost edge of B2B is at minLocal + half_thickness, but stud center is recorded.
    // Stud nominal width is 41mm (l_flange) but 41+38=79? Stud thickness across flanges is the smaller 41 (lip side).
    // Actually for stud crossing chord: the stud's EDGE in chord-axis is the stud's bbox in that axis.
    // Stud center recorded; flange (41 lip side) projects perpendicular.
    // Stud's footprint along chord axis is just the web (1.15mm thick) + maybe flanges if rotated.
  }
}

// Hypothesis 1: edge offset like FJ chord (offset = 2.0/sin(theta))
// For a vertical stud, theta=90deg, offset = 2.0/1 = 2.0
// So for vertical stud at local L: notch is [L-stud_half - 2, L+stud_half + 2]
// What is "stud_half" for an LBW stud? Stud is 41-wide on the right flange side.
// Stud's xMax-xMin in chord-axis: that depends on stud orientation. Need to know.

console.log("\nHypothesis 1: edge formula like FJ (offset = 22.5mm for 45mm wide):");
console.log("Hypothesis 2: stud xMin/xMax + 2mm:");
// Stud width along chord: I assume ~stud-width = 41mm (lip side) or similar
// Actually typical stud thickness shown in xml: stud center, but actual outline depends on flange orientation
// From profile: web=89, l_flange=38, r_flange=41. The "thicker" flange (41) is on one side.
// Stud's footprint along chord axis = stud's flange-lip thickness (~41mm) NOT the web.
// Wait - studs are rotated 90deg vs chord. If stud runs vertical, its 89mm web sits in the chord-axis direction or not?
// In FrameCAD, stud's web is typically oriented horizontally (perpendicular to wall) to maximize bending.
// So stud's footprint along chord axis = lip-flange depth = 41 or 38mm.

// Better: for each ref range, compute (rangeStart - studCenter) and (rangeEnd - studCenter) for the bounding studs.
console.log("\nDetailed: for each ref range, the offset from each stud center:");
for (const [s,e] of refLipNotches) {
  const inside = studsOnT1.filter(st => st.local >= s-50 && st.local <= e+50);
  if (!inside.length) continue;
  console.log(`  Notch [${s}..${e}]:`);
  for (const st of inside) {
    console.log(`     ${st.name} center=${st.local.toFixed(1)} : leftOff=${(st.local-s).toFixed(2)}  rightOff=${(e-st.local).toFixed(2)}`);
  }
}
