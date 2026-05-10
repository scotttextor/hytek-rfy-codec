#!/usr/bin/env node
/**
 * Print ours + ref Web@pt positions side-by-side for specific (frame,stick)
 * pairs in PK12 TT2-1 / TT3-1 / etc.
 *
 * Uses already-generated /tmp/t8-pk12.json which gives missing+matched
 * positions. We supplement by reading the ref RFY directly.
 */
import fs from "node:fs";

import {
  synthesizeRfyFromPlans,
  decode,
} from "../dist/index.js";
import { XMLParser } from "fast-xml-parser";

const XML = "Y:/(17) 2026 HYTEK PROJECTS/CORAL HOMES/HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI/03 DETAILING/03 FRAMECAD DETAILER/01 XML OUTPUT/HG260001 LOT 289 COORA CRESCENT CURRIMUNDI 4551-GF-TB2B-70.075.xml";
const REF = "Y:/(17) 2026 HYTEK PROJECTS/CORAL HOMES/HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI/06 MANUFACTURING/04 ROLLFORMER FILES/Split_HG260001/HG260001_PK12-GF-TB2B-70.075.rfy";

// Read ref RFY (raw, then decode to get plan→frame→stick→tooling)
const refBytes = fs.readFileSync(REF);
const refDoc = decode(refBytes);

// Read XML and parse
const xmlText = fs.readFileSync(XML, "utf8");
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseAttributeValue: true });
const xmlRoot = parser.parse(xmlText).framecad_import;

// We need to build "our" RFY from the XML to compare. Easiest: shell out to
// diff script, then use its synth output.
const oursRfy = fs.readFileSync("C:/Users/Scott/AppData/Local/Temp/t8-pk12.ours.rfy");
const oursDoc = decode(oursRfy);

const want = new Set([
  "TT2-1:W15", "TT2-1:W16", "TT2-1:W17", "TT2-1:T4", "TT2-1:T3",
  "TT3-1:W18", "TT3-1:W19", "TT3-1:T4", "TT3-1:H7",
  "TT5-1:R5", "TT5-1:W14", "TT5-1:W16",
  "TN1-1:B2", "TN1-1:W12", "TN1-1:W20",
  "TN19-1:R5", "TN19-1:T2", "TN19-1:B1",
  "TT2-1:H7", "TT2-1:T2",
]);

function gatherFrames(doc) {
  const out = new Map();
  for (const plan of doc.project.plans || []) {
    for (const f of plan.frames || []) {
      out.set(f.name, f);
    }
  }
  return out;
}
const oursFrames = gatherFrames(oursDoc);
const refFrames = gatherFrames(refDoc);

for (const key of want) {
  const [fname, sname] = key.split(":");
  const ourFrame = oursFrames.get(fname);
  const refFrame = refFrames.get(fname);
  if (!ourFrame || !refFrame) continue;
  // For each stick of that name, find both
  const ourSticks = ourFrame.sticks.filter(s => s.name === sname);
  const refSticks = refFrame.sticks.filter(s => s.name === sname);
  for (let i = 0; i < Math.max(ourSticks.length, refSticks.length); i++) {
    const o = ourSticks[i];
    const r = refSticks[i];
    if (!o || !r) continue;
    const oWebs = (o.tooling || []).filter(t => t.kind === "point" && t.type === "Web").map(t => t.pos).sort((a,b)=>a-b);
    const rWebs = (r.tooling || []).filter(t => t.kind === "point" && t.type === "Web").map(t => t.pos).sort((a,b)=>a-b);
    // 3D start/end if avail
    const start = o.start || o.start3D || {};
    const end = o.end || o.end3D || {};
    const len = (typeof o.lengthMm === "number") ? o.lengthMm : (typeof o.length === "number" ? o.length : null);
    console.log(`\n${fname}  ${sname}  flipped=${o.flipped}  len=${len?.toFixed?.(2) ?? "?"}`);
    if (start.x !== undefined) console.log(`  start=(${start.x?.toFixed?.(1)},${start.y?.toFixed?.(1)},${start.z?.toFixed?.(1)})  end=(${end.x?.toFixed?.(1)},${end.y?.toFixed?.(1)},${end.z?.toFixed?.(1)})`);
    console.log(`  OURS Webs (${oWebs.length}):  ${oWebs.map(p => p.toFixed(2)).join(" ")}`);
    console.log(`  REF  Webs (${rWebs.length}):  ${rWebs.map(p => p.toFixed(2)).join(" ")}`);
  }
}
