#!/usr/bin/env node
/**
 * Audit script: cross-references each sub-panel infill nog in a corpus
 * against the Detailer reference RFY to determine the per-end cap-style
 * (Swage vs InnerNotch+LipNotch). Prints a table that the rule designer
 * can use to verify candidate discriminators.
 */
import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { decode } from "../dist/index.js";

function parseTriple(s) {
  const [x, y, z] = String(s).split(",").map(Number);
  return { x, y, z };
}

const xmlPath = process.argv[2];
const rfyPath = process.argv[3];

const xmlText = readFileSync(xmlPath, "utf8");
const xmlDoc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" }).parse(xmlText);
const refRfyBuf = readFileSync(rfyPath);
const refDecoded = decode(refRfyBuf);

// Build a map: refStickKey -> ops list (only InnerNotch/LipNotch/Swage)
function buildRefOps(decoded) {
  const m = new Map();
  for (const plan of decoded.project?.plans ?? []) {
    for (const f of plan.frames ?? []) {
      for (const s of f.sticks ?? []) {
        const key = `${f.name}|${s.name}`;
        const ops = (s.tooling ?? []).filter(o =>
          ["InnerNotch", "LipNotch", "Swage"].includes(o.type));
        m.set(key, ops);
      }
    }
  }
  return m;
}
const refMap = buildRefOps(refDecoded);

function asArray(x) { return Array.isArray(x) ? x : x === undefined || x === null ? [] : [x]; }

const project = xmlDoc.framecad_import ?? xmlDoc.project ?? xmlDoc;
const plans = asArray(project.plan);

console.log(`Frame  Stick  Length  z(sub?)  Start->[stud kind]  End->[stud kind]  Tight@start@neighbour@dist@inSpan?  Tight@end@neighbour@dist@inSpan?  Detailer{startCap, endCap}`);
console.log("-".repeat(130));

for (const plan of plans) {
  const frames = asArray(plan.frame);
  for (const f of frames) {
    const fname = String(f["@_name"] ?? "");
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
      if (!best || bestDist > 30) return { kind: "nostud", stud: null };
      const sp = axis === "x" ? best.start.x : best.start.y;
      const distToLeft = Math.abs(sp - leftPos);
      const distToRight = Math.abs(sp - rightPos);
      const isPerimeter = best.name === leftStud.name || best.name === rightStud.name;
      const isCornerCluster = !isPerimeter && (distToLeft <= 100 || distToRight <= 100);
      let kind = "interior";
      if (best.usage === "trimstud") kind = "trimstud";
      else if (isPerimeter) kind = "perimeter";
      else if (isCornerCluster) kind = "corner-cluster";
      return { kind, stud: best };
    }

    function tightNeighbour(stud, span, threshold = 500) {
      if (!stud) return null;
      const sp = axis === "x" ? stud.start.x : stud.start.y;
      const candidates = [];
      for (const ss of studs) {
        if (ss.name === stud.name) continue;
        const np = axis === "x" ? ss.start.x : ss.start.y;
        const d = Math.abs(np - sp);
        if (d > threshold) continue;
        const inSpan = np >= span.min - 5 && np <= span.max + 5;
        candidates.push({ stud: ss, dist: d, inSpan });
      }
      candidates.sort((a, b) => a.dist - b.dist);
      return candidates[0] ?? null;
    }

    for (const nog of nogs) {
      const myZ = (nog.start.z + nog.end.z) / 2;
      if (Math.abs(myZ - canonicalZ) <= 5) continue;
      const cls0 = classifyStud(nog.start);
      const cls1 = classifyStud(nog.end);
      const sp0 = axis === "x" ? nog.start.x : nog.start.y;
      const sp1 = axis === "x" ? nog.end.x : nog.end.y;
      const span = { min: Math.min(sp0, sp1), max: Math.max(sp0, sp1) };
      const tn0 = tightNeighbour(cls0.stud, span);
      const tn1 = tightNeighbour(cls1.stud, span);
      // Detailer caps
      const refOps = refMap.get(`${fname}|${nog.name}`) ?? [];
      const startCap = classifyCap(refOps, "start", nog.length);
      const endCap = classifyCap(refOps, "end", nog.length);
      console.log(
        `${fname}  ${nog.name}  L=${nog.length.toFixed(0).padStart(4)}  z=${myZ.toFixed(0)}(sub)  ` +
        `start->[${cls0.kind}${cls0.stud ? " " + cls0.stud.name : ""}]  ` +
        `end->[${cls1.kind}${cls1.stud ? " " + cls1.stud.name : ""}]  ` +
        `tn0=[${tn0 ? `${tn0.stud.name}@${tn0.dist.toFixed(0)} ${tn0.inSpan ? "in" : "out"}` : "none"}]  ` +
        `tn1=[${tn1 ? `${tn1.stud.name}@${tn1.dist.toFixed(0)} ${tn1.inSpan ? "in" : "out"}` : "none"}]  ` +
        `Detailer={${startCap}, ${endCap}}`);
    }
  }
}

// Detailer cap classification: at startSide (pos~0..39) or endSide (pos~length-39..length).
function classifyCap(ops, side, length) {
  const tol = 5;
  const startMin = -tol, startMax = 39 + tol;
  const endMin = length - 39 - tol, endMax = length + tol;
  const range = side === "start" ? [startMin, startMax] : [endMin, endMax];
  const opsInRange = ops.filter(o => {
    if (o.kind === "spanned") {
      const cMid = ((o.startPos ?? o.pos) + (o.endPos ?? o.pos)) / 2;
      return cMid >= range[0] && cMid <= range[1];
    }
    return o.pos >= range[0] && o.pos <= range[1];
  });
  const types = new Set(opsInRange.map(o => o.type));
  if (types.has("InnerNotch") && types.has("LipNotch")) return "Notch";
  if (types.has("Swage")) return "Swage";
  if (types.size === 0) return "none";
  return Array.from(types).join("+");
}
