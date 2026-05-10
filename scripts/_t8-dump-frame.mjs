#!/usr/bin/env node
/**
 * Dump full geometry of one frame from the XML.
 */
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";

const XML = "Y:/(17) 2026 HYTEK PROJECTS/CORAL HOMES/HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI/03 DETAILING/03 FRAMECAD DETAILER/01 XML OUTPUT/HG260001 LOT 289 COORA CRESCENT CURRIMUNDI 4551-GF-TB2B-70.075.xml";

const xmlText = fs.readFileSync(XML, "utf8");
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseAttributeValue: true });
const root = parser.parse(xmlText).framecad_import;

const wantNames = (process.argv[2] || "TT2-1,TT3-1,TT4-1,TT5-1,TN1-1,TN19-1").split(",");

const frames = root.frames?.frame ? (Array.isArray(root.frames.frame) ? root.frames.frame : [root.frames.frame]) : [];

for (const f of frames) {
  if (!wantNames.includes(f["@_name"])) continue;
  console.log("=".repeat(80));
  console.log(`FRAME: ${f["@_name"]}  type=${f["@_type"]}  flipped=${f["@_flipped"]}`);
  console.log("=".repeat(80));
  const sticks = Array.isArray(f.stick) ? f.stick : (f.stick ? [f.stick] : []);
  for (const s of sticks) {
    if (/\(Box\d+\)/.test(s["@_name"])) continue;
    const st = s.start;
    const en = s.end;
    const profile = s.profile?.["@_web"] ?? "?";
    const usage = s["@_usage"] || "?";
    const flipped = s["@_flipped"] === "true" || s["@_flipped"] === true;
    const len = Math.hypot(en["@_x"]-st["@_x"], en["@_y"]-st["@_y"], en["@_z"]-st["@_z"]);
    const yzLen = Math.hypot(en["@_y"]-st["@_y"], en["@_z"]-st["@_z"]);
    console.log(`  ${(s["@_name"]).padEnd(6)} usage=${usage.padEnd(10)} flipped=${flipped} len=${len.toFixed(2)} yzLen=${yzLen.toFixed(2)} profile=${profile}`);
    console.log(`    start=(${st["@_x"].toFixed(0)},${st["@_y"].toFixed(0)},${st["@_z"].toFixed(0)})  end=(${en["@_x"].toFixed(0)},${en["@_y"].toFixed(0)},${en["@_z"].toFixed(0)})`);
  }
}
