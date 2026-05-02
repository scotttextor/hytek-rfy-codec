// V2 - Add W trusses, Kb braces. Compute their crossing on T1.
const T1_START_X = 23732.786;
const T1_LOCAL_START = T1_START_X - 4; // 23728.786
const T1_Z = 57309.500;
const T1_INNER_Y_NORM = 19631.433; // perpendicular axis, all at y=19631.433
// T1 is at top of frame. With "flipped=false" (l-flange 38, r-flange 41),
// T1 inner face faces DOWN (lower z). T1 occupies z roughly [57309.5-89, 57309.5] = [57220.5, 57309.5]
// Actually plate's web=89 sits along z (vertical) since plate is horizontal.
// T1 inner face = bottom of T1 = z=57220.5 (T1 web bottom), or top of T1 = z=57309.5 (face touching lintel)
// Wait, plate's web=89 means the 89mm dimension is the web. For a TopPlate, the web sits
// PERPENDICULAR to the wall plane (horizontal) and the lips face DOWN.
// Actually: TopPlate is C-section laid flat. Web 89 is the BOTTOM face. l_flange/r_flange go UP.
// Wait no: stick start.z=57309.5 end.z=57309.5 → z is the WEB position.
// flipped=false means lips on +y side. But stud goes vertically in z, so flange direction differs.

// Easier: trust the existing code's logic. Look at what it does.
// In frame-context.ts line 316: innerY = isBottom ? plate.box.yMax : plate.box.yMin
// For a TopPlate (top chord), innerY = yMin (the lower edge in y direction).
// But here the wall is in the XZ plane, y is the perpendicular axis (constant ~19631.433).
// So plate.box.yMin/yMax must be in plate-local coords, not world.

// I'll skip the geometry derivation. Just look at W truss-web crossings.
// W1: start 22749.772,Y,56849.772 → end 22572.294,Y,57320.228 (slope from below to above T1's z=57309.5)
// W1 crosses z=57309.5 somewhere along its length.

const T1Z = 57309.5;
const webs = [
  { name:"W1", s:{x:22749.772,z:56849.772}, e:{x:22572.294,z:57320.228}, flip:false },
  { name:"W2", s:{x:22225.819,z:56850.447}, e:{x:22479.742,z:57319.553}, flip:true },
  { name:"W3", s:{x:22044.360,z:56850.248}, e:{x:21811.706,z:57319.752}, flip:false },
  { name:"W4", s:{x:21234.178,z:56851.518}, e:{x:21596.387,z:57318.482}, flip:true },
  { name:"W5", s:{x:21146.388,z:56851.518}, e:{x:20784.179,z:57318.482}, flip:false },
  { name:"W6", s:{x:20340.916,z:56851.484}, e:{x:20699.697,z:57318.516}, flip:true },
  { name:"W7", s:{x:20181.467,z:56849.087}, e:{x:20238.751,z:57320.913}, flip:false },
];
// Kb1, Kb2 are diagonal braces — don't touch T1 (z range 55949..57320 / 54719..55848 — Kb1 ends near T1, Kb2 doesn't)
const kbs = [
  { name:"Kb1", s:{x:23477.415,z:55949.190}, e:{x:23230.157,z:57320.810} },
  { name:"Kb2", s:{x:23229.711,z:54719.280}, e:{x:23477.861,z:55848.720} }, // doesn't reach T1
];

function localPos(worldX) { return T1_LOCAL_START - worldX; }

// Stud profile l_lip=11, r_lip=11, web=89, l_flange=38, r_flange=41
// Stud's footprint along chord axis (x for T1) = the web (89mm) — wait, that depends on stud orientation.
// In an LBW wall, studs run vertical (z). Their web faces in/out of wall (y direction).
// So stud's x-footprint = LIP DIRECTION = l_lip+l_flange or r_lip+r_flange? No:
// Stud cross-section: web (89mm in y) + 2 flanges (38, 41 in x or z) + 2 lips (11mm).
// For a stud running in z (vertical), the cross-section is in xy plane.
// Web 89 along Y (perpendicular to wall), flanges along X (extending the section).
// Wait, profile string says shape="C". A C-section's web is the back, flanges go forward, lips return.
// In FrameCAD convention for studs: web faces +y or -y (in/out of wall), flanges in z direction (up/down), lips back.
// Then stud's x-footprint = thickness ~ 1.15mm (just the metal thickness). That can't be right either.
//
// Real-world: an LBW stud's flange is what bolts to the plate. Stud lays with flanges horizontal (in xz),
// web vertical (in xy plane perpendicular to wall axis).
// So stud's x-footprint = flange depth = 38 or 41mm. Yes — depending on which side faces the chord axis.

// W truss-webs: long axis is from stud-bottom to plate-top (diagonal).
// Their CROSS-SECTION at chord intersection: web 89, flanges 38/41.
// W is laid such that its web is along the FRAME PLANE (xz) and flanges face IN/OUT (y).
// Then W's footprint along chord axis (x) = projected width of web edges along x.

// For our purposes, what matters is: where does the W's outline intersect T1's inner face?
// T1's inner face = z = 57309.5 - profile_thickness... or = 57220.5 (web bottom)?

// Let me just compute web crossings at z=57309.5 for each W (assuming web=89, flanges 41, lips 11):
// W is a C-section with web 89, run direction along the diagonal.
// W's xml gives stick centerline (start, end).
// W's outline corners would be 4 corners of a rectangle with width 89 (web) + 2*(flange) but since
// flanges go perpendicular to plane, the IN-PLANE outline is just the web rectangle (89 wide along the
// perpendicular-to-stick direction).
// OK this is getting murky. Let me see what each W's range projects to on T1's local axis.

// At z=T1Z, what's the x-position of each W's centerline?
console.log("W truss-web centerline crossings at z=T1's inner face (57309.5):");
for (const w of webs) {
  const dz = w.e.z - w.s.z;
  const t = (T1Z - w.s.z) / dz;
  const x_at = w.s.x + t * (w.e.x - w.s.x);
  console.log(`  ${w.name}: cross at worldX=${x_at.toFixed(2)} local=${localPos(x_at).toFixed(2)} (slope angle = ${(Math.atan2(dz, w.e.x-w.s.x)*180/Math.PI).toFixed(1)}°)`);
}

// Also compute crossings at z=57309.5 - 89 = 57220.5 (T1's lower web face if T1 is "above" it)
// But T1's centerline z is 57309.5 — its plate spans z roughly [57220.5, 57309.5] OR [57309.5, 57398.5]
// Lintel below at z=57085-57131 (from line geom). Studs go up to z=57328.
// T1 at 57309.5 with lips going UP (web on bottom): T1 spans [57309.5, 57309.5+89]? No, profile web=89 is the
// BACK of the C — the FACE. The flanges go OFF the web 38mm, lips back 11.
// 89 is the web height. So T1 web sits at z=57309.5 (centerline of web? or one edge?).
// Stick "z" is typically the centerline of the stick's cross-section.

// W's lower end z=56849-56851 (just below sill plates 56860). W's upper end z~57320 (near T1).
// W enters T1 from below.

// Compute INTERSECTION of W's web outline with T1's INNER FACE.
// For a flat plate at top, the inner face = LOWER face of plate (where studs/webs meet it).
// T1 web at z=57309.5, with flanges going UP +z (since flipped=false and TopPlate has flanges up by convention).
// Wait actually for HYTEK TopPlate flipped=false means flanges DOWN (catches the studs).
// In any case, the inner face is at z=57309.5 (T1 web sits there).

// Each W intersects this z=57309.5 line at one centerline point.
// W's web has WIDTH 89mm perpendicular to its run direction.
// So W footprint at T1 inner face = a SEGMENT in T1's x axis, of width = 89 / sin(angle).
// "edge_lo, edge_hi" in the existing FJ code uses this exact formula.

// Compute edges:
console.log("\nW truss-web EDGE crossings (web 89mm wide perpendicular to W axis):");
for (const w of webs) {
  const dz = w.e.z - w.s.z;
  const dx = w.e.x - w.s.x;
  const len = Math.sqrt(dx*dx + dz*dz);
  const angle = Math.atan2(dz, dx);
  // Two long edges of W rectangle: parallel to W axis, separated by 89mm perpendicular.
  // Perpendicular direction (unit): (-dz/len, dx/len)
  const perpX = -dz/len;
  const perpZ = dx/len;
  const halfW = 89/2;
  // Two long edges:
  const e1s = { x:w.s.x + halfW*perpX, z:w.s.z + halfW*perpZ };
  const e1e = { x:w.e.x + halfW*perpX, z:w.e.z + halfW*perpZ };
  const e2s = { x:w.s.x - halfW*perpX, z:w.s.z - halfW*perpZ };
  const e2e = { x:w.e.x - halfW*perpX, z:w.e.z - halfW*perpZ };
  function intersect(p1,p2,atZ) {
    const d = p2.z - p1.z;
    if (Math.abs(d)<1e-9) return null;
    const t = (atZ - p1.z)/d;
    return p1.x + t*(p2.x - p1.x);
  }
  const x1 = intersect(e1s,e1e,T1Z);
  const x2 = intersect(e2s,e2e,T1Z);
  if (x1===null||x2===null) continue;
  const xLo = Math.min(x1,x2), xHi = Math.max(x1,x2);
  const lLo = localPos(xHi), lHi = localPos(xLo); // local axis flips since T1 runs decreasing-x
  // Edge formula offset = 2.0/sin(theta)
  const sin_theta = Math.abs(dz)/len;
  const offset = 2.0 / sin_theta;
  const notchStart = lLo - offset;
  const notchEnd = lHi + offset;
  console.log(`  ${w.name}: edges local=[${lLo.toFixed(2)}..${lHi.toFixed(2)}]  ang=${(angle*180/Math.PI).toFixed(1)}°  sin=${sin_theta.toFixed(3)}  offset=${offset.toFixed(2)}  notch=[${notchStart.toFixed(2)}..${notchEnd.toFixed(2)}]`);
}

// Also check Kb1
console.log("\nKb1 brace crossing (if any):");
for (const k of kbs) {
  if (Math.min(k.s.z,k.e.z) > T1Z || Math.max(k.s.z,k.e.z) < T1Z) {
    console.log(`  ${k.name}: doesn't cross T1`);
    continue;
  }
  const dz = k.e.z - k.s.z;
  const dx = k.e.x - k.s.x;
  const len = Math.sqrt(dx*dx + dz*dz);
  const sin_theta = Math.abs(dz)/len;
  const perpX = -dz/len, perpZ = dx/len;
  const halfW = 89/2;
  function intersect(p1,p2,atZ){const d=p2.z-p1.z;if(Math.abs(d)<1e-9)return null;const t=(atZ-p1.z)/d;return p1.x+t*(p2.x-p1.x);}
  const e1s={x:k.s.x+halfW*perpX,z:k.s.z+halfW*perpZ}, e1e={x:k.e.x+halfW*perpX,z:k.e.z+halfW*perpZ};
  const e2s={x:k.s.x-halfW*perpX,z:k.s.z-halfW*perpZ}, e2e={x:k.e.x-halfW*perpX,z:k.e.z-halfW*perpZ};
  const x1=intersect(e1s,e1e,T1Z), x2=intersect(e2s,e2e,T1Z);
  if (x1===null||x2===null){ console.log(`  ${k.name}: no edge intersect`); continue; }
  const xLo=Math.min(x1,x2),xHi=Math.max(x1,x2);
  const lLo=localPos(xHi),lHi=localPos(xLo);
  const offset = 2.0/sin_theta;
  console.log(`  ${k.name}: edges local=[${lLo.toFixed(2)}..${lHi.toFixed(2)}]  notch=[${(lLo-offset).toFixed(2)}..${(lHi+offset).toFixed(2)}]`);
}

console.log("\n\nReference notches for comparison:");
const refLipNotches = [
  [470.0, 515.9],
  [1120.7, 1291.2],
  [1876.7, 2027.5],
  [2893.3, 3080.1],
];
for (const [s,e] of refLipNotches) {
  console.log(`  ref [${s.toFixed(1)}..${e.toFixed(1)}] width=${(e-s).toFixed(2)}`);
}
