#!/usr/bin/env node
/**
 * Measure the empirical offset between simple z-line projection on Kb sticks
 * and Detailer's actual InnerService position. Aim: find the constant offset
 * for the codec's Kb InnerService rule.
 */
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { decode } from "../dist/index.js";

const xmlPath = process.argv[2];
const rfyPath = process.argv[3];

const xmlText = fs.readFileSync(xmlPath, "utf8");
const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
}).parse(xmlText);

const refBytes = fs.readFileSync(rfyPath);
const refDecoded = decode(refBytes);
const refFrames = refDecoded.project.plans.flatMap((p) => p.frames);

function parseTriple(t) {
  const n = String(t).trim().split(/[ ,\t]+/).map(Number);
  return { x: n[0] || 0, y: n[1] || 0, z: n[2] || 0 };
}
function distance3D(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const offsetsZ300 = []; // world-Z offsets above z=300 (Kb2 bottom)
const offsetsZ450 = [];
const z300_alongStickOffsets = [];
const z450_alongStickOffsets = [];
const unmapped = []; // ref InnerService positions that don't match z=300 or z=450

const plans = Array.isArray(xml.framecad_import.plan) ? xml.framecad_import.plan : [xml.framecad_import.plan];
for (const plan of plans) {
  const frames = Array.isArray(plan.frame) ? plan.frame : [plan.frame].filter(Boolean);
  for (const frame of frames) {
    const sticks = Array.isArray(frame.stick) ? frame.stick : [frame.stick].filter(Boolean);
    const refFrame = refFrames.find((f) => f.name === frame.name);
    if (!refFrame) continue;
    for (const stick of sticks) {
      if (!String(stick.name).startsWith("Kb")) continue;
      const start = parseTriple(stick.start);
      const end = parseTriple(stick.end);
      const length = distance3D(start, end);
      const dz = end.z - start.z;
      const refStick = refFrame.sticks.find((s) => s.name === stick.name);
      if (!refStick) continue;
      const refPositions = (refStick.tooling || []).filter((op) => op.type === "InnerService" && op.kind === "point").map((op) => op.pos);
      for (const pos of refPositions) {
        const t = pos / length;
        const worldZ = start.z + t * dz;
        // Try classify: closest to z=300 or z=450?
        const d300 = Math.abs(worldZ - 300);
        const d450 = Math.abs(worldZ - 450);
        if (d300 < 50 && d300 < d450) {
          offsetsZ300.push({ frame: frame.name, stick: stick.name, len: length, dz, worldZ, offset: worldZ - 300, posAlong: pos });
        } else if (d450 < 50) {
          offsetsZ450.push({ frame: frame.name, stick: stick.name, len: length, dz, worldZ, offset: worldZ - 450, posAlong: pos });
        } else {
          unmapped.push({ frame: frame.name, stick: stick.name, len: length, dz, worldZ, posAlong: pos });
        }
      }
    }
  }
}

console.log("=== Offsets near z=300 ===");
for (const o of offsetsZ300) {
  console.log(`  ${o.frame} ${o.stick} (len=${o.len.toFixed(1)}, dz=${o.dz.toFixed(1)}): worldZ=${o.worldZ.toFixed(2)}, offset=${o.offset.toFixed(2)}`);
}
console.log(`mean offset z=300: ${(offsetsZ300.reduce((s, o) => s + o.offset, 0) / offsetsZ300.length).toFixed(3)} (n=${offsetsZ300.length})`);

console.log("\n=== Offsets near z=450 ===");
for (const o of offsetsZ450) {
  console.log(`  ${o.frame} ${o.stick} (len=${o.len.toFixed(1)}, dz=${o.dz.toFixed(1)}): worldZ=${o.worldZ.toFixed(2)}, offset=${o.offset.toFixed(2)}`);
}
console.log(`mean offset z=450: ${(offsetsZ450.reduce((s, o) => s + o.offset, 0) / offsetsZ450.length).toFixed(3)} (n=${offsetsZ450.length})`);

console.log("\n=== Unmapped (potential Kb1 single, third Kb2, etc.) ===");
for (const o of unmapped) {
  console.log(`  ${o.frame} ${o.stick} (len=${o.len.toFixed(1)}, dz=${o.dz.toFixed(1)}): worldZ=${o.worldZ.toFixed(2)}, posAlong=${o.posAlong.toFixed(2)}`);
}
