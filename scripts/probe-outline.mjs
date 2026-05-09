import fs from 'node:fs';
import { decode } from '../dist/index.js';
const refPath = process.argv[2];
const refDoc = decode(fs.readFileSync(refPath));
for (const plan of refDoc.project.plans) {
  for (const frame of plan.frames) {
    if (frame.name !== process.argv[3]) continue;
    for (const stick of frame.sticks) {
      console.log(stick.name, 'outline:', JSON.stringify(stick.outlineCorners));
    }
  }
}
