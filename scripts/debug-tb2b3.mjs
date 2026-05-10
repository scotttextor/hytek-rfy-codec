import { computeTb2bWebPositions } from "../dist/simplify-tb2b-truss.js";

const sticks = [
  { name: 'B1', start3D: {x:0, y:16628.158, z:3872.832}, end3D: {x:0, y:20636.275, z:2798.860}, usage: 'bottomchord', flipped: false },
  { name: 'W9',  start3D:{x:0, y:19847.016,z:2990.871}, end3D:{x:0, y:19847.016,z:3185.898}, usage: 'web', flipped: true },
  { name: 'W10', start3D:{x:0, y:19428.658,z:3121.442}, end3D:{x:0, y:19792.415,z:3199.673}, usage: 'web', flipped: true },
  { name: 'W11', start3D:{x:0, y:19368.215,z:3119.165}, end3D:{x:0, y:19368.215,z:3409.166}, usage: 'web', flipped: true },
  { name: 'W12', start3D:{x:0, y:18437.185,z:3393.335}, end3D:{x:0, y:19314.384,z:3416.507}, usage: 'web', flipped: true },
  { name: 'W13', start3D:{x:0, y:18377.512,z:3384.623}, end3D:{x:0, y:18377.512,z:3871.139}, usage: 'web', flipped: true },
  { name: 'W14', start3D:{x:0, y:17585.829,z:3610.558}, end3D:{x:0, y:18321.412,z:3889.984}, usage: 'web', flipped: true },
  { name: 'W15', start3D:{x:0, y:17523.887,z:3613.351}, end3D:{x:0, y:17523.887,z:4269.190}, usage: 'web', flipped: true },
  { name: 'W16', start3D:{x:0, y:16737.333,z:3832.426}, end3D:{x:0, y:17464.613,z:4294.372}, usage: 'web', flipped: true },
];

const positions = computeTb2bWebPositions(sticks);
console.log('Positions:');
for (const [k, ps] of positions) {
  console.log(`  ${k}: [${ps.map(p => p.toFixed(2)).join(', ')}]`);
}
console.log('B1 pre-rev:', positions.get('B1#0').map(p => (4149.508-p).toFixed(2)).join(', '));
