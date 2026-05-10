import { computeTb2bWebPositions } from "../dist/simplify-tb2b-truss.js";

const sticks = [
  { name: 'B1', start3D: {x:0, y:16628.158, z:3872.832}, end3D: {x:0, y:20636.275, z:2798.860}, usage: 'bottomchord', flipped: false },
  { name: 'W17', start3D:{x:0, y:16672.217,z:3841.556}, end3D:{x:0, y:16672.217,z:4666.331}, usage: 'web', flipped: true },
  { name: 'W18', start3D:{x:0, y:16602.217,z:3841.556}, end3D:{x:0, y:16602.217,z:4698.972}, usage: 'web', flipped: true },
  { name: 'W19', start3D:{x:0, y:15231.458,z:3492.014}, end3D:{x:0, y:16538.818,z:4729.449}, usage: 'web', flipped: true },
];

const positions = computeTb2bWebPositions(sticks);
console.log('B1#0:', positions.get('B1#0'));
console.log('Pre-rev (L=4149.5):');
const l = 4149.508;
for (const p of positions.get('B1#0')||[]) console.log(' ', p, '(pre-rev:', l-p, ')');
