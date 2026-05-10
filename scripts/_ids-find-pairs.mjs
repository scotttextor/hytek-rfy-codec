// Find every S stud in a plan that has a paired shorter companion at same XY,
// and report whether it's listed as missing @98 dimple in the current diff.
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";

const xmlPath = process.argv[2];
const diffJsonPath = process.argv[3];

const xmlText = fs.readFileSync(xmlPath, "utf-8");
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const xml = parser.parse(xmlText);
const diffData = JSON.parse(fs.readFileSync(diffJsonPath, "utf-8"));

function arr(x) { return x == null ? [] : Array.isArray(x) ? x : [x]; }
function parseTriple(t) { const n = String(t).trim().split(/[, \t]+/).map(s=>parseFloat(s)).filter(n=>!isNaN(n)); return {x:n[0]||0,y:n[1]||0,z:n[2]||0}; }

// Build diff lookup
const diffByFS = {};
for (const f of diffData.byFrame || []) {
  for (const s of f.sticks || []) {
    diffByFS[`${f.name}|${s.name}`] = s;
  }
}

const proj = xml.framecad_import || xml;
let totalPaired = 0, has98=0, no98ButPaired=[];
for (const plan of arr(proj.plan)) {
  for (const f of arr(plan.frame)) {
    const fName = f["@_name"];
    const sticks = arr(f.stick).map(s => {
      const start = parseTriple(s.start);
      const end = parseTriple(s.end);
      const len = Math.sqrt((end.x-start.x)**2 + (end.y-start.y)**2 + (end.z-start.z)**2);
      return { name: s["@_name"], usage: s["@_usage"], start, end, len };
    });
    const studs = sticks.filter(s => /^S\d+$/.test(s.name) && /^Stud$/i.test(s.usage));
    for (const stud of studs) {
      // Find paired shorter companion at same XY with usage=Stud
      const paired = studs.filter(p =>
        p.name !== stud.name &&
        Math.abs(p.start.x - stud.start.x) < 1 &&
        Math.abs(p.start.y - stud.start.y) < 1 &&
        p.len < stud.len &&  // shorter
        /^Stud$/i.test(p.usage)
      );
      if (paired.length === 0) continue;
      // Stud must be the LONGER of the pair (not the cripple)
      totalPaired += 1;
      const diff = diffByFS[`${fName}|${stud.name}`];
      const missing98 = diff?.missing?.some(m => m.includes("InnerDimple @98")) || false;
      if (missing98) has98++;
      else no98ButPaired.push({frame:fName, stick:stud.name, len:stud.len.toFixed(0), usage:stud.usage, paired:paired.map(p=>p.name+"("+p.len.toFixed(0)+")")});
    }
  }
}
console.log(`\nTotal studs paired with shorter companion: ${totalPaired}`);
console.log(`  With @98 missing: ${has98}`);
console.log(`  Without @98 missing: ${totalPaired - has98}`);
if (no98ButPaired.length > 0) {
  console.log(`\nPaired-but-not-missing-@98 (sticks where ours already emits or pattern doesn't apply):`);
  for (const x of no98ButPaired.slice(0, 25)) console.log(`  ${x.frame}/${x.stick} len=${x.len} usage=${x.usage} paired=${x.paired.join(",")}`);
}
