import { computeTb2bWebPositions } from "../dist/simplify-tb2b-truss.js";

// TN6-1 sticks. B2 is flipped=true.
const sticks = [
  { name: 'B1', start3D: {x:0, y:16646.275, z:3872.832}, end3D: {x:0, y:14046.275, z:3176.164}, usage: 'bottomchord', flipped: false },
  { name: 'B2', start3D: {x:0, y:16628.158, z:3872.832}, end3D: {x:0, y:20636.275, z:2798.860}, usage: 'bottomchord', flipped: true },
  { name: 'W19', start3D:{x:0, y:17523.703,z:3613.401}, end3D:{x:0, y:17523.703,z:4269.276}, usage: 'web', flipped: false },
  { name: 'W20', start3D:{x:0, y:17585.646,z:3610.606}, end3D:{x:0, y:18321.228,z:3890.071}, usage: 'web', flipped: false },
  { name: 'W21', start3D:{x:0, y:18377.328,z:3384.673}, end3D:{x:0, y:18377.328,z:3871.224}, usage: 'web', flipped: false },
  { name: 'W22', start3D:{x:0, y:18437.001,z:3393.382}, end3D:{x:0, y:19314.200,z:3416.594}, usage: 'web', flipped: false },
  { name: 'W23', start3D:{x:0, y:19368.031,z:3119.215}, end3D:{x:0, y:19368.031,z:3409.252}, usage: 'web', flipped: false },
  { name: 'W24', start3D:{x:0, y:19428.475,z:3121.487}, end3D:{x:0, y:19792.268,z:3199.732}, usage: 'web', flipped: false },
];

const positions = computeTb2bWebPositions(sticks);
console.log('B2 positions:', positions.get('B2#0'));
console.log('B2 (sorted):', positions.get('B2#0').slice().sort((a,b)=>a-b));
