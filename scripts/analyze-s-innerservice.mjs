#!/usr/bin/env node
/**
 * Analyse missing InnerService positions on S/J studs (vertical wall studs)
 * to find Detailer's emission rule for service positions BEYOND the
 * z=300/z=450 horizontal projection.
 */
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { decode } from "../dist/index.js";

const xmlPath = process.argv[2];
const rfyPath = process.argv[3];

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
}).parse(fs.readFileSync(xmlPath, "utf8"));
const refDecoded = decode(fs.readFileSync(rfyPath));
const refFrames = refDecoded.project.plans.flatMap((p) => p.frames);

function parseTriple(t) {
  const n = String(t).trim().split(/[ ,\t]+/).map(Number);
  return { x: n[0] || 0, y: n[1] || 0, z: n[2] || 0 };
}
function distance3D(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const plans = Array.isArray(xml.framecad_import.plan) ? xml.framecad_import.plan : [xml.framecad_import.plan];
for (const plan of plans) {
  const frames = Array.isArray(plan.frame) ? plan.frame : [plan.frame].filter(Boolean);
  for (const frame of frames) {
    const sticks = Array.isArray(frame.stick) ? frame.stick : [frame.stick].filter(Boolean);
    const tas = Array.isArray(frame.tool_action) ? frame.tool_action : [frame.tool_action].filter(Boolean);
    const services = tas.filter((t) => t.name === "Service").map((t) => ({
      start: parseTriple(t.start),
      end: parseTriple(t.end),
    }));
    const refFrame = refFrames.find((f) => f.name === frame.name);
    if (!refFrame) continue;
    for (const stick of sticks) {
      const stype = String(stick.usage || "").toLowerCase();
      if (!(stype === "stud" || stype === "endstud" || stype === "trimstud" || stype === "jackstud")) continue;
      const start = parseTriple(stick.start);
      const end = parseTriple(stick.end);
      const length = distance3D(start, end);
      const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
      const isVertical = Math.abs(dz) / length > 0.99;
      if (!isVertical) continue;

      const refStick = refFrame.sticks.find((s) => s.name === stick.name);
      if (!refStick) continue;
      const refIS = (refStick.tooling || []).filter((op) => op.type === "InnerService" && op.kind === "point");
      if (refIS.length <= 2) continue; // Skip studs with only 0-2 (likely z=300/z=450 projections)

      console.log(`\n${plan.name} ${frame.name} ${stick.name} (len=${length.toFixed(1)}, start.z=${start.z.toFixed(1)}, end.z=${end.z.toFixed(1)}, flipped=${stick.flipped})`);
      const horizSvcZs = services.filter(s => Math.abs(s.start.z - s.end.z) < 0.01).map(s => s.start.z);
      const vertSvcs = services.filter(s => Math.abs(s.start.z - s.end.z) > 0.01);
      console.log(`  Horizontal services @z: ${[...new Set(horizSvcZs.map(z => z.toFixed(0)))].join(", ")}`);
      console.log(`  Vertical services: ${vertSvcs.length}`);
      for (const op of refIS) {
        const worldZ = start.z + op.pos;
        console.log(`  ref @${op.pos.toFixed(2)} → worldZ ${worldZ.toFixed(2)}`);
      }
    }
  }
}
