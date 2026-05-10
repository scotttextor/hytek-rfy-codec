#!/usr/bin/env node
/**
 * Trace PK12 TT2-1 frame: dump every stick's 3D geometry + the codec's
 * computed Web@pt positions vs Detailer ref's positions. Goal: see
 * what's drifting and why.
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { parseFcFile } from "../dist/parser-fc-xml.js";
import { simplifyTb2bTrussFrame } from "../dist/simplify-tb2b-truss.js";

const XML = "Y:/(17) 2026 HYTEK PROJECTS/CORAL HOMES/HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI/03 DETAILING/03 FRAMECAD DETAILER/01 XML OUTPUT/HG260001 LOT 289 COORA CRESCENT CURRIMUNDI 4551-GF-TB2B-70.075.xml";
const frameNames = (process.argv[2] || "TT2-1,TT3-1,TT4-1,TT5-1,TN1-1").split(",");

const xmlText = fs.readFileSync(XML, "utf8");
const parsed = parseFcFile(xmlText);
console.log(`Parsed frames: ${parsed.frames.length}`);

const ref = JSON.parse(fs.readFileSync("C:/Users/Scott/AppData/Local/Temp/t8-pk12.json", "utf8"));

for (const wantFrameName of frameNames) {
  const frame = parsed.frames.find(f => f.name === wantFrameName);
  if (!frame) { console.log(`Frame ${wantFrameName} not found`); continue; }
  console.log("=".repeat(80));
  console.log(`FRAME: ${frame.name} (${frame.sticks.length} sticks)`);
  console.log("=".repeat(80));

  // Run codec
  simplifyTb2bTrussFrame(frame);

  const refFrame = ref.byFrame.find(f => f.name === wantFrameName);

  for (const stick of frame.sticks) {
    if (/\(Box\d+\)/.test(stick.name)) continue;
    // Show geometry
    const s = stick.start;
    const e = stick.end;
    const dx = e.x - s.x, dy = e.y - s.y, dz = e.z - s.z;
    const len = Math.hypot(dx, dy, dz);
    const yLen = Math.hypot(dy, dz);
    const isWeb = (stick.usage ?? "").toLowerCase() === "web";
    const points = stick.tooling.filter(o => o.kind === "point" && o.type === "Web").map(o => o.pos).sort((a, b) => a - b);
    console.log(
      `\n  ${stick.name.padEnd(6)} usage=${stick.usage?.padEnd(10) ?? "?".padEnd(10)} flipped=${stick.flipped} len=${len.toFixed(2)} yzLen=${yLen.toFixed(2)}`,
    );
    console.log(`    start=(${s.x.toFixed(0)},${s.y.toFixed(0)},${s.z.toFixed(0)})  end=(${e.x.toFixed(0)},${e.y.toFixed(0)},${e.z.toFixed(0)})`);
    console.log(`    OURS Webs (${points.length}): ${points.map(p => p.toFixed(1)).join(" ")}`);
    const refStick = refFrame?.sticks.find(rs => rs.name === stick.name);
    if (refStick) {
      console.log(`    REF  matched=${refStick.matchedCount}`);
      if (refStick.missing?.length) console.log(`      MISSING: ${refStick.missing.join(" | ")}`);
      if (refStick.extras?.length) console.log(`      EXTRAS:  ${refStick.extras.join(" | ")}`);
    }
  }
}
