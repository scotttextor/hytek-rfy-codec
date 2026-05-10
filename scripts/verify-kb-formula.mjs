#!/usr/bin/env node
/**
 * Verify the formula: pos = (z_target + 6 - stickStart.z) / cos(angle_from_vert)
 * where z_target is z=300 or z=450 (Service horizontal line z-value).
 *
 * Equivalently: world Z of InnerService = z_target + 6mm. We just project
 * that world-Z onto the stick.
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

const TOL = 1.5;
const OFFSET_MM = 6;

let totalRef = 0, predicted = 0, matches = 0, extras = 0;
const missingRef = [];

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
    const horizontalServices = services.filter((s) => Math.abs(s.start.z - s.end.z) < 0.01);
    const refFrame = refFrames.find((f) => f.name === frame.name);
    if (!refFrame) continue;
    for (const stick of sticks) {
      if (!String(stick.name).startsWith("Kb")) continue;
      const start = parseTriple(stick.start);
      const end = parseTriple(stick.end);
      const length = Math.round(distance3D(start, end) * 10) / 10;
      const dz = end.z - start.z;
      if (Math.abs(dz) < 0.01) continue;
      // Predict positions: for each horizontal service line, world Z + 6 → along-stick position
      const studStartZ = Math.min(start.z, end.z);
      const studEndZ = Math.max(start.z, end.z);
      const studX = (start.x + end.x) / 2;
      const studY = (start.y + end.y) / 2;
      const predictedSet = new Set();
      for (const svc of horizontalServices) {
        const z_h = svc.start.z;
        const z_target = z_h + OFFSET_MM;
        if (z_target < studStartZ - 0.5 || z_target > studEndZ + 0.5) continue;
        // Find t where stick has world Z = z_target
        const t = (z_target - start.z) / dz;
        if (t < 0 || t > 1) continue;
        const xCross = start.x + t * (end.x - start.x);
        const yCross = start.y + t * (end.y - start.y);
        // Check span (loosened ±5mm)
        const svcDx = Math.abs(svc.end.x - svc.start.x);
        const svcDy = Math.abs(svc.end.y - svc.start.y);
        const runAxis = svcDx >= svcDy ? "x" : "y";
        if (runAxis === "x") {
          if (Math.abs(yCross - svc.start.y) > 5) continue;
          const sxLo = Math.min(svc.start.x, svc.end.x);
          const sxHi = Math.max(svc.start.x, svc.end.x);
          if (xCross < sxLo - 5 || xCross > sxHi + 5) continue;
        } else {
          if (Math.abs(xCross - svc.start.x) > 5) continue;
          const syLo = Math.min(svc.start.y, svc.end.y);
          const syHi = Math.max(svc.start.y, svc.end.y);
          if (yCross < syLo - 5 || yCross > syHi + 5) continue;
        }
        const localPos = t * length;
        if (localPos < 30 || localPos > length - 30) continue;
        predictedSet.add(Math.round(localPos * 10) / 10);
      }
      const predictedList = [...predictedSet];
      const refStick = refFrame.sticks.find((s) => s.name === stick.name);
      if (!refStick) continue;
      const refPositions = (refStick.tooling || []).filter((op) => op.type === "InnerService" && op.kind === "point").map((op) => op.pos);
      totalRef += refPositions.length;
      predicted += predictedList.length;
      const usedRef = new Set();
      for (const p of predictedList) {
        let matched = false;
        for (let i = 0; i < refPositions.length; i++) {
          if (usedRef.has(i)) continue;
          if (Math.abs(refPositions[i] - p) <= TOL) {
            usedRef.add(i);
            matched = true;
            matches++;
            break;
          }
        }
        if (!matched) extras++;
      }
      for (let i = 0; i < refPositions.length; i++) {
        if (!usedRef.has(i)) missingRef.push({ frame: frame.name, stick: stick.name, len: length, pos: refPositions[i], worldZ: start.z + (refPositions[i] / length) * dz });
      }
    }
  }
}

console.log(`Total Kb InnerService: ref=${totalRef}, predicted=${predicted}, matches=${matches}, extras=${extras}, missing=${totalRef - matches}`);
console.log("\nUnmatched ref positions (missing after applying formula):");
for (const m of missingRef) {
  console.log(`  ${m.frame} ${m.stick} (len=${m.len.toFixed(1)}): @${m.pos.toFixed(2)} (worldZ=${m.worldZ.toFixed(2)})`);
}
