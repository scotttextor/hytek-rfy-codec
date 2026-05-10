import { computeTb2bWebPositions } from "../dist/simplify-tb2b-truss.js";

const sticks = [
  { name: 'T3', start3D: {x:0, y:15147.848, z:5358.706}, end3D: {x:0, y:21222.425, z:2526.084}, usage: 'topchord', flipped: false },
  { name: 'T4', start3D: {x:0, y:21222.425, z:2526.084}, end3D: {x:0, y:18207.731, z:3931.859}, usage: 'topchord', flipped: false },
  { name: 'B1', start3D: {x:0, y:16628.158, z:3872.832}, end3D: {x:0, y:20636.275, z:2798.860}, usage: 'bottomchord', flipped: false },
  { name: 'W9',  start3D:{x:0, y:19847.016,z:2990.871}, end3D:{x:0, y:19847.016,z:3185.898}, usage: 'web', flipped: true },
  { name: 'W10', start3D:{x:0, y:19428.658,z:3121.442}, end3D:{x:0, y:19792.415,z:3199.673}, usage: 'web', flipped: true },
  { name: 'W11', start3D:{x:0, y:19368.215,z:3119.165}, end3D:{x:0, y:19368.215,z:3409.166}, usage: 'web', flipped: true },
  { name: 'W12', start3D:{x:0, y:18437.185,z:3393.335}, end3D:{x:0, y:19314.384,z:3416.507}, usage: 'web', flipped: true },
  { name: 'W13', start3D:{x:0, y:18377.512,z:3384.623}, end3D:{x:0, y:18377.512,z:3871.139}, usage: 'web', flipped: true },
  { name: 'W14', start3D:{x:0, y:17585.829,z:3610.558}, end3D:{x:0, y:18321.412,z:3889.984}, usage: 'web', flipped: true },
  { name: 'W15', start3D:{x:0, y:17523.887,z:3613.351}, end3D:{x:0, y:17523.887,z:4269.190}, usage: 'web', flipped: true },
  { name: 'W16', start3D:{x:0, y:16737.333,z:3832.426}, end3D:{x:0, y:17464.613,z:4294.372}, usage: 'web', flipped: true },
  { name: 'T5', start3D: {x:0, y:16870.354, z:4555.488}, end3D: {x:0, y:16410.137, z:4770.091}, usage: 'topchord', flipped: false },
  { name: 'R7', start3D: {x:0, y:17558.887, z:3962.083}, end3D: {x:0, y:13787.217, z:3962.083}, usage: 'rail', flipped: false },
  { name: 'W17', start3D:{x:0, y:16672.217,z:3841.556}, end3D:{x:0, y:16672.217,z:4666.331}, usage: 'web', flipped: true },
  { name: 'W18', start3D:{x:0, y:16602.217,z:3841.556}, end3D:{x:0, y:16602.217,z:4698.972}, usage: 'web', flipped: true },
  { name: 'W19', start3D:{x:0, y:15231.458,z:3492.014}, end3D:{x:0, y:16538.818,z:4729.449}, usage: 'web', flipped: true },
  { name: 'B2', start3D: {x:0, y:16646.275, z:3872.832}, end3D: {x:0, y:13778.158, z:3104.322}, usage: 'bottomchord', flipped: true },
];

const positions = computeTb2bWebPositions(sticks);
console.log('B1 positions:', positions.get('B1#0'));
console.log('B1 pre-rev:', positions.get('B1#0').map(p => (4149.508-p).toFixed(2)).join(', '));
