import { readFileSync } from "node:fs";
import { decode } from "../dist/decode.js";
const ours = decode(readFileSync(process.argv[2]));
const ref = decode(readFileSync(process.argv[3]));
const frame = process.argv[4];

function key(op) {
  if (op.kind === "point") return `${op.type}@pt:${op.pos.toFixed(3)}`;
  if (op.kind === "spanned") return `${op.type}@span:${op.startPos.toFixed(3)}..${op.endPos.toFixed(3)}`;
  return `${op.type}@${op.kind}`;
}
function getSticks(d, fname) {
  for (const p of d.project.plans) for (const f of p.frames) if (f.name === fname) return f.sticks;
  return [];
}
const oS = getSticks(ours, frame), rS = getSticks(ref, frame);
const ours_by = new Map(oS.map(s => [s.name, s]));
const ref_by = new Map(rS.map(s => [s.name, s]));
for (const name of new Set([...ours_by.keys(), ...ref_by.keys()])) {
  const o = ours_by.get(name), r = ref_by.get(name);
  const oOps = o ? o.tooling.map(key).sort() : [];
  const rOps = r ? r.tooling.map(key).sort() : [];
  const oSet = new Set(oOps), rSet = new Set(rOps);
  const extra = oOps.filter(k => !rSet.has(k));
  const missing = rOps.filter(k => !oSet.has(k));
  if (extra.length || missing.length || (o?.length !== r?.length)) {
    console.log(`${name}: ours=${o?.length}mm ref=${r?.length}mm`);
    for (const x of extra) console.log(`  + ${x}`);
    for (const x of missing) console.log(`  - ${x}`);
  }
}
