import { computeTb2bWebPositions } from "../dist/simplify-tb2b-truss.js";

const sticks = [
  { name: 'B1', start3D: {x:0, y:16628.158, z:3872.832}, end3D: {x:0, y:20636.275, z:2798.860}, usage: 'bottomchord', flipped: false },
  // Add B2 to make peer-pair detection work? Actually computeTb2bWebPositions doesn't care about peer-pair (that's only in trim block)
  { name: 'B2', start3D: {x:0, y:16646.275, z:3872.832}, end3D: {x:0, y:13778.158, z:3104.322}, usage: 'bottomchord', flipped: true },
  // W9..W22 from TN11-1 (full set)
  { name: 'W9',  start3D:{x:0, y:19847.016,z:2990.871}, end3D:{x:0, y:19847.016,z:3185.898}, usage: 'web', flipped: true },
  { name: 'W10', start3D:{x:0, y:19428.658,z:3121.442}, end3D:{x:0, y:19792.415,z:3199.673}, usage: 'web', flipped: true },
  { name: 'W11', start3D:{x:0, y:19368.215,z:3119.165}, end3D:{x:0, y:19368.215,z:3409.166}, usage: 'web', flipped: true },
  { name: 'W12', start3D:{x:0, y:18437.185,z:3393.335}, end3D:{x:0, y:19314.384,z:3416.507}, usage: 'web', flipped: true },
  { name: 'W13', start3D:{x:0, y:18377.512,z:3384.623}, end3D:{x:0, y:18377.512,z:3871.139}, usage: 'web', flipped: true },
  { name: 'W14', start3D:{x:0, y:17585.829,z:3610.558}, end3D:{x:0, y:18321.412,z:3889.984}, usage: 'web', flipped: true },
  { name: 'W15', start3D:{x:0, y:17523.887,z:3613.351}, end3D:{x:0, y:17523.887,z:4269.190}, usage: 'web', flipped: true },
];

const positions = computeTb2bWebPositions(sticks);
console.log('Positions:');
for (const [k, ps] of positions) {
  console.log(`  ${k}: [${ps.map(p => p.toFixed(2)).join(', ')}]`);
}

// Replay manually
const B1 = sticks[0];
const Bdy = B1.end3D.y - B1.start3D.y;
const Bdz = B1.end3D.z - B1.start3D.z;
const BLen = Math.hypot(Bdy, Bdz);
console.log('\nB1 length:', BLen.toFixed(3));
console.log('Reversed positions B1#0:', positions.get('B1#0').map(p => (BLen-p).toFixed(2)).join(', '));
