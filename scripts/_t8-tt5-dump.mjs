#!/usr/bin/env node
/** Dump TT5-1 geometry from XML and compute centerline intersections to
 *  understand where Detailer's @81.59 / @633.78 bolts come from. */
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";

const XML = "Y:/(17) 2026 HYTEK PROJECTS/CORAL HOMES/HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI/03 DETAILING/03 FRAMECAD DETAILER/01 XML OUTPUT/HG260001 LOT 289 COORA CRESCENT CURRIMUNDI 4551-GF-TB2B-70.075.xml";

const xmlText = fs.readFileSync(XML, "utf8");
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: true,
  parseTagValue: false,
  isArray: n => ["plan","frame","stick","vertex","tool_action"].includes(n),
});
const root = parser.parse(xmlText).framecad_import;

function parseTriple(s) {
  if (typeof s !== "string") return { x:0, y:0, z:0 };
  const [x,y,z] = s.trim().replace(/^"|"$/g, "").split(",").map(Number);
  return { x, y, z };
}

const wantFrame = process.argv[2] || "TT5-1";

for (const p of root.plan || []) {
  for (const f of p.frame || []) {
    if (f["@_name"] !== wantFrame) continue;
    console.log("="+ "=".repeat(78));
    console.log(`FRAME: ${f["@_name"]}  flipped=${f["@_flipped"]}`);
    console.log("="+ "=".repeat(78));
    const sticks = [];
    for (const s of (f.stick || [])) {
      if (/\(Box\d+\)/.test(s["@_name"])) continue;
      const start = parseTriple(typeof s.start === "string" ? s.start : s.start?.["#text"] ?? "0,0,0");
      const end = parseTriple(typeof s.end === "string" ? s.end : s.end?.["#text"] ?? "0,0,0");
      const flipped = String(s.flipped).trim() === "true" || s.flipped === true;
      const usage = (s["@_usage"] ?? "").toLowerCase();
      sticks.push({ name: s["@_name"], usage, flipped, start, end });
    }
    for (const st of sticks) {
      const len = Math.hypot(st.end.y-st.start.y, st.end.z-st.start.z);
      console.log(`  ${st.name.padEnd(6)} usage=${st.usage.padEnd(10)} flipped=${st.flipped}  len(yz)=${len.toFixed(2)}`);
      console.log(`    start=(${st.start.x.toFixed(0)},${st.start.y.toFixed(0)},${st.start.z.toFixed(0)})  end=(${st.end.x.toFixed(0)},${st.end.y.toFixed(0)},${st.end.z.toFixed(0)})`);
    }
    // Now compute every centerline intersection involving W14 / W16 (TT5).
    const target = process.argv[3] || "W14";
    const targetStick = sticks.find(s => s.name === target);
    if (!targetStick) { console.log(`No ${target}`); continue; }
    console.log(`\n  *** Intersections involving ${target} (yz-plane) ***`);
    for (const o of sticks) {
      if (o.name === target) continue;
      const inter = intersect(targetStick, o);
      if (inter === null) continue;
      console.log(`    ${target}∩${o.name.padEnd(5)}  posOn${target}=${inter.posA.toFixed(2)}  posOn${o.name}=${inter.posB.toFixed(2)}  L${target}=${inter.LA.toFixed(2)} L${o.name}=${inter.LB.toFixed(2)}`);
    }
  }
}

function intersect(A, B) {
  const x1 = A.start.y, y1 = A.start.z;
  const x2 = A.end.y,   y2 = A.end.z;
  const x3 = B.start.y, y3 = B.start.z;
  const x4 = B.end.y,   y4 = B.end.z;
  const denom = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4);
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4))/denom;
  const u = -((x1-x2)*(y1-y3) - (y1-y2)*(x1-x3))/denom;
  const LA = Math.hypot(x2-x1, y2-y1);
  const LB = Math.hypot(x4-x3, y4-y3);
  const SLACK = 5;
  const stA = LA>0 ? SLACK/LA : 0;
  const stB = LB>0 ? SLACK/LB : 0;
  if (t < -stA || t > 1+stA) return null;
  if (u < -stB || u > 1+stB) return null;
  return { posA: Math.max(0, Math.min(LA, t*LA)), posB: Math.max(0, Math.min(LB, u*LB)), LA, LB, t, u };
}
