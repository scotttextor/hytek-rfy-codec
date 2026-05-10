import { computeTb2bWebPositions } from "../dist/simplify-tb2b-truss.js";

// FULL TN6-1 sticks
const sticks = [
  // Top chords
  { name: 'T3', start3D: {x:0, y:13994.911, z:4807.682}, end3D: {x:0, y:15176.586, z:5358.706}, usage: 'topchord', flipped: false },
  { name: 'W10', start3D:{x:0, y:14072.217,z:3163.644}, end3D:{x:0, y:14072.217,z:4862.180}, usage: 'web', flipped: false },
  { name: 'W11', start3D:{x:0, y:15086.548,z:3435.946}, end3D:{x:0, y:14142.043,z:4897.996}, usage: 'web', flipped: true },
  { name: 'R8', start3D: {x:0, y:14971.018, z:5255.624}, end3D: {x:0, y:15353.415, z:5255.624}, usage: 'rail', flipped: false },
  { name: 'T4', start3D: {x:0, y:15147.848, z:5358.706}, end3D: {x:0, y:21222.425, z:2526.084}, usage: 'topchord', flipped: false },
  { name: 'W12', start3D:{x:0, y:15162.217,z:3455.709}, end3D:{x:0, y:15162.217,z:5370.455}, usage: 'web', flipped: false },
  { name: 'B1', start3D: {x:0, y:16646.275, z:3872.832}, end3D: {x:0, y:14046.275, z:3176.164}, usage: 'bottomchord', flipped: false },
  { name: 'W13', start3D:{x:0, y:15244.503,z:3483.334}, end3D:{x:0, y:15839.704,z:5058.047}, usage: 'web', flipped: false },
  { name: 'T5', start3D: {x:0, y:16112.260, z:4908.994}, end3D: {x:0, y:15745.835, z:5079.860}, usage: 'topchord', flipped: false },
  { name: 'W14', start3D:{x:0, y:15916.148,z:3657.724}, end3D:{x:0, y:15916.148,z:5018.891}, usage: 'web', flipped: false },
  { name: 'W15', start3D:{x:0, y:16522.197,z:3819.401}, end3D:{x:0, y:15990.325,z:4974.265}, usage: 'web', flipped: true },
  { name: 'T6', start3D: {x:0, y:16788.083, z:4593.852}, end3D: {x:0, y:16490.175, z:4732.769}, usage: 'topchord', flipped: false },
  { name: 'R9', start3D: {x:0, y:17558.703, z:4018.109}, end3D: {x:0, y:15881.148, z:4018.109}, usage: 'rail', flipped: true },
  { name: 'W16', start3D:{x:0, y:16602.217,z:3841.556}, end3D:{x:0, y:16602.217,z:4698.972}, usage: 'web', flipped: false },
  { name: 'W17', start3D:{x:0, y:16672.217,z:3841.556}, end3D:{x:0, y:16672.217,z:4666.331}, usage: 'web', flipped: true },
  { name: 'W18', start3D:{x:0, y:16737.337,z:3832.420}, end3D:{x:0, y:17464.425,z:4294.465}, usage: 'web', flipped: false },
  { name: 'B2', start3D: {x:0, y:16628.158, z:3872.832}, end3D: {x:0, y:20636.275, z:2798.860}, usage: 'bottomchord', flipped: true },
  { name: 'W19', start3D:{x:0, y:17523.703,z:3613.401}, end3D:{x:0, y:17523.703,z:4269.276}, usage: 'web', flipped: false },
  { name: 'W20', start3D:{x:0, y:17585.646,z:3610.606}, end3D:{x:0, y:18321.228,z:3890.071}, usage: 'web', flipped: false },
  { name: 'W21', start3D:{x:0, y:18377.328,z:3384.673}, end3D:{x:0, y:18377.328,z:3871.224}, usage: 'web', flipped: false },
  { name: 'W22', start3D:{x:0, y:18437.001,z:3393.382}, end3D:{x:0, y:19314.200,z:3416.594}, usage: 'web', flipped: false },
];

const positions = computeTb2bWebPositions(sticks);
console.log('B2 positions:', positions.get('B2#0'));
