#!/usr/bin/env node
/**
 * Test: project horizontal Service z-lines onto Kb sticks (using current
 * wall-service simplifier formula) and count how many match REF InnerService
 * positions. Tells us the upside of extending the simplifier to Kbs.
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

// Use the same logic as simplify-wall-service.applicableZLinePositions
// but DROP the "isVerticalStud" check and accept Kb angles too.
function applicableZLinePositions(stick, services, length) {
  const sStart = stick.start, sEnd = stick.end;
  const studStartZ = Math.min(sStart.z, sEnd.z);
  const studEndZ = Math.max(sStart.z, sEnd.z);
  const studX = (sStart.x + sEnd.x) / 2;
  const studY = (sStart.y + sEnd.y) / 2;
  const positions = [];
  for (const svc of services) {
    const svcDz = Math.abs(svc.start.z - svc.end.z);
    if (svcDz > 0.01) continue;
    const z_h = svc.start.z;
    if (z_h < studStartZ - 0.5 || z_h > studEndZ + 0.5) continue;
    // For diagonal Kbs, project the z-line onto the stick's centerline.
    // We need to find where the stick passes through z=z_h.
    // Parametric: stick(t) = sStart + t*(sEnd-sStart), 0<=t<=1.
    // z(t) = sStart.z + t*(sEnd.z - sStart.z); set = z_h.
    const dz = sEnd.z - sStart.z;
    if (Math.abs(dz) < 0.01) continue;
    const t = (z_h - sStart.z) / dz;
    if (t < 0 || t > 1) continue;
    const xCross = sStart.x + t * (sEnd.x - sStart.x);
    const yCross = sStart.y + t * (sEnd.y - sStart.y);
    // Now check if (xCross, yCross) lies within the service line span
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
    // Position along stick = t × length
    const localPos = t * length;
    if (localPos < 30 || localPos > length - 30) continue;
    positions.push(Math.round(localPos * 10) / 10);
  }
  return positions;
}

let totalRef = 0, totalProjected = 0, totalMatches = 0, totalExtras = 0, totalMissingFromRef = 0;
const TOL = 12; // mm tolerance

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
      if (!String(stick.name).startsWith("Kb")) continue;
      const start = parseTriple(stick.start);
      const end = parseTriple(stick.end);
      const length = Math.round(distance3D(start, end) * 10) / 10;
      const projected = applicableZLinePositions({ start, end }, services, length);
      const refStick = refFrame.sticks.find((s) => s.name === stick.name);
      if (!refStick) continue;
      const refPositions = (refStick.tooling || []).filter((op) => op.type === "InnerService" && op.kind === "point").map((op) => op.pos);
      totalRef += refPositions.length;
      totalProjected += projected.length;
      // Match
      const usedRef = new Set();
      for (const p of projected) {
        let matched = false;
        for (let i = 0; i < refPositions.length; i++) {
          if (usedRef.has(i)) continue;
          if (Math.abs(refPositions[i] - p) <= TOL) {
            usedRef.add(i);
            matched = true;
            totalMatches++;
            break;
          }
        }
        if (!matched) totalExtras++;
      }
      totalMissingFromRef += refPositions.length - usedRef.size;
      if (projected.length > 0 || refPositions.length > 0) {
        console.log(`${plan.name} ${frame.name} ${stick.name} (len=${length}): projected=[${projected.join(",")}] ref=[${refPositions.join(",")}]`);
      }
    }
  }
}

console.log(`\nTotal Kb InnerService: ref=${totalRef}, projected=${totalProjected}, matches=${totalMatches}, extras=${totalExtras}, missing=${totalMissingFromRef}`);
