// Trace: build our codec output for one specific frame/stick, show emitted ops sorted
import { decodeXmlToFc } from "../dist/decode-xml.js";
import { computeFrames } from "../dist/runtime/compute-frames.js";
import fs from "node:fs";

const xml = fs.readFileSync(process.argv[2], "utf8");
const targetFrame = process.argv[3];
const targetStick = process.argv[4];

const fc = decodeXmlToFc(xml);
const fcfg = { resolveProfile: () => null, resolveSetup: () => null, getSetupMap: () => ({}) };
const computed = computeFrames(fc, fcfg);

for (const f of computed.frames) {
  if (f.name !== targetFrame) continue;
  console.log(`Frame ${f.name}`);
  for (const s of f.sticks) {
    if (s.name !== targetStick) continue;
    console.log(`  ${s.name} L=${s.length} usage=${s.usage}`);
    for (const op of (s.ops || [])) {
      console.log(`    ${JSON.stringify(op)}`);
    }
  }
}
