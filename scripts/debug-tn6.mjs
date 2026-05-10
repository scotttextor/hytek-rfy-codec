import { computeTb2bWebPositions } from "../dist/simplify-tb2b-truss.js";

const sticks = [
  { name: 'B2', start3D: {x:0, y:16628.158, z:3872.832}, end3D: {x:0, y:20636.275, z:2798.860}, usage: 'bottomchord', flipped: true },
  { name: 'W17', start3D:{x:0, y:16672.217,z:3841.556}, end3D:{x:0, y:16672.217,z:4666.331}, usage: 'web', flipped: true },
  { name: 'W18', start3D:{x:0, y:16737.337,z:3832.420}, end3D:{x:0, y:17464.425,z:4294.465}, usage: 'web', flipped: false },
  { name: 'W19', start3D:{x:0, y:17523.703,z:3613.401}, end3D:{x:0, y:17523.703,z:4269.276}, usage: 'web', flipped: false },
  { name: 'W20', start3D:{x:0, y:17585.646,z:3610.606}, end3D:{x:0, y:18321.228,z:3890.071}, usage: 'web', flipped: false },
  { name: 'W21', start3D:{x:0, y:18377.328,z:3384.673}, end3D:{x:0, y:18377.328,z:3871.224}, usage: 'web', flipped: false },
  { name: 'W22', start3D:{x:0, y:18437.001,z:3393.382}, end3D:{x:0, y:19314.200,z:3416.594}, usage: 'web', flipped: false },
  { name: 'W23', start3D:{x:0, y:19368.031,z:3119.215}, end3D:{x:0, y:19368.031,z:3409.252}, usage: 'web', flipped: false },
  { name: 'W24', start3D:{x:0, y:19428.475,z:3121.487}, end3D:{x:0, y:19792.231,z:3199.763}, usage: 'web', flipped: false },
  { name: 'W25', start3D:{x:0, y:19846.832,z:2990.920}, end3D:{x:0, y:19846.832,z:3185.983}, usage: 'web', flipped: false },
];

const positions = computeTb2bWebPositions(sticks);
console.log('B2#0:', positions.get('B2#0'));
