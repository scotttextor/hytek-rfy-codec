import { computeTb2bWebPositions } from "../dist/simplify-tb2b-truss.js";

// Just W12 + W13 + B1 to test isolated
const sticks = [
  { name: 'B1', start3D: {x:0, y:16628.158, z:3872.832}, end3D: {x:0, y:20636.275, z:2798.860}, usage: 'bottomchord', flipped: false },
  { name: 'W12', start3D:{x:0, y:18437.185,z:3393.335}, end3D:{x:0, y:19314.384,z:3416.507}, usage: 'web', flipped: true },
  { name: 'W13', start3D:{x:0, y:18377.512,z:3384.623}, end3D:{x:0, y:18377.512,z:3871.139}, usage: 'web', flipped: true },
];

const positions = computeTb2bWebPositions(sticks);
console.log('Positions:');
for (const [k, ps] of positions) {
  console.log(`  ${k}: [${ps.map(p => p.toFixed(2)).join(', ')}]`);
}
console.log('Pre-reversal B1:', positions.get('B1#0').map(p => (4149.508-p).toFixed(2)).join(', '));
