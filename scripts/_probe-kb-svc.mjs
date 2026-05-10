import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";

const xmlPath = process.argv[2];
const xml = fs.readFileSync(xmlPath, "utf8");
const p = new XMLParser({ ignoreAttributes: false, parseAttributeValue: true, isArray: (n) => ["plan","frame","stick","tool_action"].includes(n) });
const doc = p.parse(xml);

function parseTriple(t) { const n = String(t).trim().split(/[ ,\t]+/).map(Number); return {x:n[0]||0,y:n[1]||0,z:n[2]||0}; }

const project = doc.framecad_import || doc;
const plans = project.plans?.plan ?? project.plan ?? [];
const targetFrames = process.argv.slice(3); // e.g. "L2 L3"

for (const plan of plans) {
  if (!/-(N?LBW)-/i.test(plan["@_name"] || "")) continue;
  const frames = plan.frames?.frame ?? plan.frame ?? [];
  for (const frame of frames) {
    const fName = frame["@_name"];
    if (targetFrames.length && !targetFrames.includes(fName)) continue;
    console.log(`\n=== ${plan["@_name"]} / ${fName} ===`);

    // Parse ALL tool actions
    const tas = frame.tool_actions?.tool_action ?? frame.tool_action ?? [];
    console.log(`tool_actions: ${tas.length}`);
    const tactionByName = {};
    for (const ta of tas) {
      const n = (ta["@_name"] || "").toString();
      const start = parseTriple(ta.start ?? ta["@_start"] ?? "0,0,0");
      const end = parseTriple(ta.end ?? ta["@_end"] ?? "0,0,0");
      const dz = Math.abs(start.z - end.z);
      const horiz = dz < 0.01;
      const arr = tactionByName[n] = (tactionByName[n] || []);
      arr.push({ horiz, start, end });
    }
    for (const [n, arr] of Object.entries(tactionByName)) {
      console.log(`  ${n} (${arr.length}):`);
      for (const ta of arr) {
        console.log(`    ${ta.horiz ? 'H' : 'V'} start=(${ta.start.x.toFixed(1)},${ta.start.y.toFixed(1)},${ta.start.z.toFixed(1)}) end=(${ta.end.x.toFixed(1)},${ta.end.y.toFixed(1)},${ta.end.z.toFixed(1)})`);
      }
    }

    // Print Kb sticks
    const sticks = frame.sticks?.stick ?? frame.stick ?? [];
    for (const stick of sticks) {
      const name = stick["@_name"];
      if (!/^Kb\d/.test(name || "")) continue;
      const start = parseTriple(stick.start);
      const end = parseTriple(stick.end);
      const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
      const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const inputFlipped = stick.flipped === true || stick.flipped === "true";
      const sinTheta = Math.abs(dz) / len;
      const isTopKb = end.z > start.z;
      console.log(`  ${name}: start=(${start.x.toFixed(1)},${start.y.toFixed(1)},${start.z.toFixed(1)}) end=(${end.x.toFixed(1)},${end.y.toFixed(1)},${end.z.toFixed(1)}) len=${len.toFixed(1)} flipped=${inputFlipped} isTopKb=${isTopKb} sinTheta=${sinTheta.toFixed(3)}`);
    }
  }
}
