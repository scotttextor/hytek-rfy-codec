#!/usr/bin/env node
/**
 * Analyse missing InnerService positions on Kb sticks to determine which
 * Service tool_action z-line (or other source) they project from.
 *
 * For each Kb stick in HG260044 GF-LBW with missing InnerService ops,
 * compute what world-Z each missing local position corresponds to.
 */
import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";

const xmlPath = process.argv[2];
const rfyPath = process.argv[3];

const xmlText = fs.readFileSync(xmlPath, "utf8");
const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
}).parse(xmlText);

import { decode } from "../dist/index.js";

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

const plans = Array.isArray(xml.framecad_import.plan) ? xml.framecad_import.plan : [xml.framecad_import.plan];
for (const plan of plans) {
  const planName = plan.name;
  const frames = Array.isArray(plan.frame) ? plan.frame : [plan.frame].filter(Boolean);

  for (const frame of frames) {
    const frameName = frame.name;
    const sticks = Array.isArray(frame.stick) ? frame.stick : [frame.stick].filter(Boolean);
    const tas = Array.isArray(frame.tool_action) ? frame.tool_action : [frame.tool_action].filter(Boolean);
    const services = tas.filter((t) => t.name === "Service").map((t) => ({
      start: parseTriple(t.start),
      end: parseTriple(t.end),
    }));
    const horizontalServiceZs = services
      .filter((s) => Math.abs(s.start.z - s.end.z) < 0.01)
      .map((s) => s.start.z);

    // Check ref RFY: find this frame and its Kb sticks
    const refFrame = refFrames.find((f) => f.name === frameName);
    if (!refFrame) continue;

    for (const stick of sticks) {
      if (!String(stick.name).startsWith("Kb")) continue;
      const start = parseTriple(stick.start);
      const end = parseTriple(stick.end);
      const length = distance3D(start, end);
      const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
      const angleFromVertDeg = Math.acos(Math.abs(dz) / length) * 180 / Math.PI;
      const flipped = String(stick.flipped).trim() === "true";

      // Find ref stick
      const refStick = refFrame.sticks.find((s) => s.name === stick.name);
      if (!refStick) continue;
      const refInnerService = (refStick.tooling || []).filter((op) => op.type === "InnerService" && op.kind === "point");
      if (refInnerService.length === 0) continue;

      console.log(`\n=== ${planName} ${frameName} ${stick.name} ===`);
      console.log(`  start=(${start.x.toFixed(1)}, ${start.y.toFixed(1)}, ${start.z.toFixed(1)})`);
      console.log(`  end  =(${end.x.toFixed(1)}, ${end.y.toFixed(1)}, ${end.z.toFixed(1)})`);
      console.log(`  length=${length.toFixed(1)}, angle from vert=${angleFromVertDeg.toFixed(1)}°, flipped=${flipped}`);
      console.log(`  Service z-lines (horizontal): ${horizontalServiceZs.map(z => z.toFixed(1)).join(", ")}`);
      console.log(`  ref InnerService positions: ${refInnerService.map((op) => `@${op.pos.toFixed(1)}`).join(", ")}`);

      // For each ref InnerService, compute world-Z where that position is along the stick
      for (const op of refInnerService) {
        const pos = op.pos;
        // Local position along stick (from start)
        const t = pos / length;
        const world = {
          x: start.x + t * dx,
          y: start.y + t * dy,
          z: start.z + t * dz,
        };
        // Distance from each Service z-line height
        const zDiffs = horizontalServiceZs.map((sz) => `z=${sz.toFixed(1)}: dz=${(world.z - sz).toFixed(1)}`).join(", ");
        console.log(`    @${pos.toFixed(1)} → world (${world.x.toFixed(1)}, ${world.y.toFixed(1)}, ${world.z.toFixed(1)}) | ${zDiffs}`);
      }
    }
  }
}
