#!/usr/bin/env node
/**
 * One-shot inspector for asymmetric sub-panel nog cases.
 *
 * For each named frame in --frames, dumps every nog stick + which stud is
 * touched at each endpoint (TrimStud / regular interior Stud / perimeter
 * Stud / corner-cluster Stud). Used to derive the per-end discriminator
 * for the NLBW3 asymmetric Notch-cap rule.
 */
import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";

function parseTriple(s) {
  const [x, y, z] = String(s).split(",").map(Number);
  return { x, y, z };
}

const xml = process.argv[2];
const wantedFrames = new Set((process.argv[3] ?? "").split(",").filter(Boolean));

if (!xml) {
  console.error("Usage: node inspect-asym-nogs.mjs <xml> N12,N19,N22,...");
  process.exit(1);
}

const txt = readFileSync(xml, "utf8");
const xmlDoc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" }).parse(txt);

function asArray(x) { return Array.isArray(x) ? x : x === undefined || x === null ? [] : [x]; }

const project = xmlDoc.framecad_import ?? xmlDoc.project ?? xmlDoc;
const plans = asArray(project.plan);

for (const plan of plans) {
  const frames = asArray(plan.frame);
  for (const f of frames) {
    const fname = String(f["@_name"] ?? "");
    if (wantedFrames.size && !wantedFrames.has(fname)) continue;
    const sticks = asArray(f.stick);
    const nogs = [], studs = [];
    for (const s of sticks) {
      const u = String(s["@_usage"] ?? "").toLowerCase();
      const ps = parseTriple(String(s.start ?? "0,0,0"));
      const pe = parseTriple(String(s.end ?? "0,0,0"));
      const L = Math.hypot(pe.x - ps.x, pe.y - ps.y, pe.z - ps.z);
      const name = String(s["@_name"]);
      if (u === "nog" || u === "noggin") nogs.push({ name, start: ps, end: pe, length: L });
      else if (u === "stud" || u === "trimstud") studs.push({ name, usage: u, start: ps, end: pe });
    }
    if (nogs.length < 2 || studs.length < 2) continue;

    // Determine wall axis from longest nog
    const longestNog = [...nogs].sort((a, b) => b.length - a.length)[0];
    const dxL = longestNog.end.x - longestNog.start.x;
    const dyL = longestNog.end.y - longestNog.start.y;
    const axis = Math.abs(dxL) > Math.abs(dyL) ? "x" : "y";
    const canonicalZ = (longestNog.start.z + longestNog.end.z) / 2;

    const studsSorted = [...studs].sort((a, b) =>
      axis === "x" ? a.start.x - b.start.x : a.start.y - b.start.y);
    const leftStud = studsSorted[0];
    const rightStud = studsSorted[studsSorted.length - 1];
    const leftPos = axis === "x" ? leftStud.start.x : leftStud.start.y;
    const rightPos = axis === "x" ? rightStud.start.x : rightStud.start.y;

    function classifyStud(point) {
      let best = null, bestDist = Infinity;
      for (const ss of studs) {
        const sp = axis === "x" ? ss.start.x : ss.start.y;
        const np = axis === "x" ? point.x : point.y;
        const d = Math.abs(np - sp);
        if (d < bestDist) { bestDist = d; best = ss; }
      }
      if (!best || bestDist > 30) return { kind: "nostud", dist: bestDist };
      const sp = axis === "x" ? best.start.x : best.start.y;
      const distToLeft = Math.abs(sp - leftPos);
      const distToRight = Math.abs(sp - rightPos);
      const isPerimeter = best.name === leftStud.name || best.name === rightStud.name;
      const isCornerCluster = !isPerimeter && (distToLeft <= 100 || distToRight <= 100);
      let kind = "interior";
      if (best.usage === "trimstud") kind = "trimstud";
      else if (isPerimeter) kind = "perimeter";
      else if (isCornerCluster) kind = "corner-cluster";
      return { kind, name: best.name, usage: best.usage, sp, distToLeft, distToRight };
    }

    console.log(`\n=== Frame ${fname} (axis=${axis}, canonicalZ=${canonicalZ.toFixed(1)}) ===`);
    console.log(`  Studs: ${studs.length} (perimeter L=${leftStud.name}@${leftPos.toFixed(1)} R=${rightStud.name}@${rightPos.toFixed(1)})`);
    console.log(`  TrimStuds: ${studs.filter(s => s.usage === "trimstud").map(s => `${s.name}@${(axis === "x" ? s.start.x : s.start.y).toFixed(1)}`).join(", ") || "none"}`);
    for (const nog of nogs) {
      const myZ = (nog.start.z + nog.end.z) / 2;
      const isCanonical = Math.abs(myZ - canonicalZ) <= 5;
      const cls0 = classifyStud(nog.start);
      const cls1 = classifyStud(nog.end);
      const sp0 = axis === "x" ? nog.start.x : nog.start.y;
      const sp1 = axis === "x" ? nog.end.x : nog.end.y;
      console.log(
        `  ${nog.name}  L=${nog.length.toFixed(1)}  z=${myZ.toFixed(0)}${isCanonical ? "(canon)" : "(sub)"}  ` +
        `start@${sp0.toFixed(1)}->[${cls0.kind} ${cls0.name ?? "-"} ${cls0.usage ?? ""}]  ` +
        `end@${sp1.toFixed(1)}->[${cls1.kind} ${cls1.name ?? "-"} ${cls1.usage ?? ""}]`);
    }
  }
}
