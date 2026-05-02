import fs from 'fs';
import path from 'path';
import { decode } from '../dist/decode.js';

const CORPUS = 'C:/Users/Scott/CLAUDE CODE/hytek-rfy-codec/test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES';

const f = process.argv[2];
const fullPath = path.isAbsolute(f) ? f : path.join(CORPUS, f);
const buf = fs.readFileSync(fullPath);
const r = await decode(buf);

const plans = r.project?.plans || [];
const plan = plans[0];
const frame = plan.frames[0];
console.log('Frame keys:', Object.keys(frame));
console.log('First stick:');
console.log(JSON.stringify(frame.sticks[0], null, 2));
console.log('\nSecond stick:');
console.log(JSON.stringify(frame.sticks[1], null, 2));
