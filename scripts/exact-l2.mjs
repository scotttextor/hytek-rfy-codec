// EXACT op-by-op comparison of L2 frame, no tolerance.
import { readFileSync } from "node:fs";
import { decode } from "../dist/decode.js";

const ours = decode(readFileSync(process.argv[2]));
const ref = decode(readFileSync(process.argv[3]));
const frameName = process.argv[4] ?? "L2";

function key(op) {
  switch (op.kind) {
    case "point":   return `${op.type}@pt:${op.pos.toFixed(4)}`;
    case "spanned": return `${op.type}@span:${op.startPos.toFixed(4)}..${op.endPos.toFixed(4)}`;
    case "start":   return `${op.type}@start`;
    case "end":     return `${op.type}@end`;
  }
}

function getFrameSticks(doc, name) {
  for (const plan of doc.project.plans) for (const frame of plan.frames) if (frame.name === name) return frame.sticks;
  return null;
}

const oursF = getFrameSticks(ours, frameName);
const refF = getFrameSticks(ref, frameName);
if (!oursF || !refF) { console.error(`Frame ${frameName} not found`); process.exit(1); }

let totalOurs = 0, totalRef = 0, exactMatch = 0;
const stickDiffs = [];
const oursByName = new Map(oursF.map(s => [s.name, s]));
const refByName = new Map(refF.map(s => [s.name, s]));
const allNames = new Set([...oursByName.keys(), ...refByName.keys()]);

for (const name of [...allNames].sort()) {
  const o = oursByName.get(name);
  const r = refByName.get(name);
  const oOps = (o?.tooling ?? []).map(key).sort();
  const rOps = (r?.tooling ?? []).map(key).sort();
  totalOurs += oOps.length;
  totalRef += rOps.length;
  const oSet = new Set(oOps), rSet = new Set(rOps);
  const matched = oOps.filter(k => rSet.has(k));
  const ourExtras = oOps.filter(k => !rSet.has(k));
  const refMissing = rOps.filter(k => !oSet.has(k));
  exactMatch += matched.length;
  const lenMatch = (o?.length ?? -1) === (r?.length ?? -1);
  if (ourExtras.length || refMissing.length || !lenMatch) {
    stickDiffs.push({ name, oLen: o?.length, rLen: r?.length, lenMatch, ourExtras, refMissing });
  }
}

console.log(`\nEXACT comparison of ${frameName} (0.0001mm precision, no tolerance):`);
console.log(`  Ours: ${oursF.length} sticks, ${totalOurs} ops`);
console.log(`  Ref:  ${refF.length} sticks, ${totalRef} ops`);
console.log(`  Bit-exact matches: ${exactMatch}`);
console.log(`  Sticks with any diff: ${stickDiffs.length} of ${allNames.size}`);

if (stickDiffs.length === 0 && totalOurs === totalRef) {
  console.log(`\n  ✅ 100% IDENTICAL — every op at exact same position, same lengths.`);
} else {
  console.log(`\n  Differences:\n`);
  for (const d of stickDiffs) {
    console.log(`  ${d.name}: ours=${d.oLen}mm, ref=${d.rLen}mm${d.lenMatch ? "" : "  ⚠ LENGTH MISMATCH"}`);
    for (const op of d.ourExtras)  console.log(`      + ${op}    (ours has, ref doesn't)`);
    for (const op of d.refMissing) console.log(`      − ${op}    (ref has, ours doesn't)`);
  }
}
