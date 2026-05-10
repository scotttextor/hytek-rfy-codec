#!/usr/bin/env node
/** Compute ALL pairwise intersections including web-to-web for one stick. */
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";

const XML = "Y:/(17) 2026 HYTEK PROJECTS/CORAL HOMES/HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI/03 DETAILING/03 FRAMECAD DETAILER/01 XML OUTPUT/HG260001 LOT 289 COORA CRESCENT CURRIMUNDI 4551-GF-TB2B-70.075.xml";

const xmlText = fs.readFileSync(XML, "utf8");
const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_", parseAttributeValue:true, parseTagValue:false, isArray:n=>["plan","frame","stick","vertex","tool_action"].includes(n) });
const root = parser.parse(xmlText).framecad_import;

function parseTriple(s) {
  if (typeof s !== "string") return { x:0,y:0,z:0 };
  const [x,y,z] = s.trim().replace(/^"|"$/g,"").split(",").map(Number);
  return {x,y,z};
}

const wantFrame = process.argv[2] || "TT5-1";
const wantTarget = process.argv[3] || "W14";

for (const p of root.plan || []) {
  for (const f of p.frame || []) {
    if (f["@_name"] !== wantFrame) continue;
    const sticks = [];
    for (const s of (f.stick || [])) {
      if (/\(Box\d+\)/.test(s["@_name"])) continue;
      const start = parseTriple(typeof s.start === "string" ? s.start : s.start?.["#text"] ?? "0,0,0");
      const end = parseTriple(typeof s.end === "string" ? s.end : s.end?.["#text"] ?? "0,0,0");
      const flipped = String(s.flipped).trim() === "true";
      const usage = (s["@_usage"] ?? "").toLowerCase();
      sticks.push({ name: s["@_name"], usage, flipped, start, end });
    }
    const target = sticks.find(s => s.name === wantTarget);
    if (!target) { console.log(`No ${wantTarget}`); continue; }
    console.log(`Target: ${target.name}  len(yz)=${Math.hypot(target.end.y-target.start.y, target.end.z-target.start.z).toFixed(2)}`);
    for (const o of sticks) {
      if (o === target) continue;
      const inter = intersect(target, o);
      if (inter === null) continue;
      console.log(`  ${target.name}∩${o.name.padEnd(5)} (${o.usage.padEnd(11)})  posOn${target.name}=${inter.posA.toFixed(2)}  posOn${o.name}=${inter.posB.toFixed(2)}`);
    }
  }
}

function intersect(A, B) {
  const x1=A.start.y, y1=A.start.z, x2=A.end.y, y2=A.end.z;
  const x3=B.start.y, y3=B.start.z, x4=B.end.y, y4=B.end.z;
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
  return { posA: Math.max(0, Math.min(LA, t*LA)), posB: Math.max(0, Math.min(LB, u*LB)), LA, LB };
}
