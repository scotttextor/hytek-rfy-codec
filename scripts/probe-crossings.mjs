#!/usr/bin/env node
/**
 * Probe: for a given stick in a TB2B truss, compute and dump every centerline
 * crossing with every other stick — showing the raw arc-length, the dot product
 * (angle), and what kind of stick it crosses.
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { XMLParser } from "fast-xml-parser";

const [, , xmlPath, frameName, stickName] = process.argv;
if (!xmlPath || !frameName || !stickName) {
  console.error("Usage: node scripts/probe-crossings.mjs <xml> <frame> <stick>");
  process.exit(1);
}

// Replicate XML parse (mirroring diff-vs-detailer.mjs structure)
const xmlText = fs.readFileSync(xmlPath, "utf8");
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseAttributeValue: true });
const xml = parser.parse(xmlText);

function parseTriple(t) { const n = String(t).trim().split(/[ ,\t]+/).map(Number); return {x:n[0]||0,y:n[1]||0,z:n[2]||0}; }

const root = xml.framecad_import ?? xml.RFYProject ?? xml.Project ?? xml;
const planArr = Array.isArray(root.plan) ? root.plan : [root.plan];
let frameSticks = null;
for (const plan of planArr) {
  if (!plan || !plan.frame) continue;
  const frames = Array.isArray(plan.frame) ? plan.frame : [plan.frame];
  for (const f of frames) {
    if (String(f["@_name"]) !== frameName) continue;
    const sticks = Array.isArray(f.stick) ? f.stick : [f.stick];
    frameSticks = sticks.map(s => ({
      name: String(s["@_name"]),
      start: parseTriple(s.start),
      end: parseTriple(s.end),
      usage: String(s["@_usage"] ?? "").toLowerCase(),
      flipped: String(s.flipped ?? "false").trim() === "true",
    }));
  }
}

if (!frameSticks) {
  console.error(`Frame ${frameName} not found`);
  process.exit(1);
}

// Detect plane
const axes = ["x","y","z"];
const ranges = { x:[Infinity,-Infinity], y:[Infinity,-Infinity], z:[Infinity,-Infinity] };
for (const s of frameSticks) for (const p of [s.start, s.end]) for (const a of axes) {
  if (p[a] < ranges[a][0]) ranges[a][0] = p[a];
  if (p[a] > ranges[a][1]) ranges[a][1] = p[a];
}
const spans = { x: ranges.x[1]-ranges.x[0], y: ranges.y[1]-ranges.y[0], z: ranges.z[1]-ranges.z[0] };
const sortedAxes = axes.slice().sort((a,b) => spans[a]-spans[b]);
const u = sortedAxes[1], v = sortedAxes[2];
console.log(`Plane: u=${u}, v=${v}`);

const target = frameSticks.find(s => s.name === stickName);
if (!target) { console.error("stick not found"); process.exit(1); }

function len2D(s) {
  const du = s.end[u] - s.start[u];
  const dv = s.end[v] - s.start[v];
  return Math.hypot(du, dv);
}
function unitDir(s) {
  const du = s.end[u] - s.start[u];
  const dv = s.end[v] - s.start[v];
  const L = Math.hypot(du, dv);
  return L > 0 ? [du/L, dv/L] : [0,0];
}
function intersect(a, b) {
  const x1 = a.start[u], y1 = a.start[v];
  const x2 = a.end[u], y2 = a.end[v];
  const x3 = b.start[u], y3 = b.start[v];
  const x4 = b.end[u], y4 = b.end[v];
  const denom = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4);
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / denom;
  const u_ = -((x1-x2)*(y1-y3) - (y1-y2)*(x1-x3)) / denom;
  const L1 = Math.hypot(x2-x1, y2-y1);
  const L2 = Math.hypot(x4-x3, y4-y3);
  const SLACK = 5;
  const stA = L1>0 ? SLACK/L1 : 0;
  const stB = L2>0 ? SLACK/L2 : 0;
  if (t < -stA || t > 1+stA) return null;
  if (u_ < -stB || u_ > 1+stB) return null;
  return { t, u: u_, L1, L2 };
}

const targetL = len2D(target);
const targetDir = unitDir(target);
console.log(`\n${target.name} (${target.usage}, flipped=${target.flipped}): L=${targetL.toFixed(2)}, dir=(${targetDir[0].toFixed(3)},${targetDir[1].toFixed(3)})`);
console.log(`  start=(${target.start[u].toFixed(1)},${target.start[v].toFixed(1)})  end=(${target.end[u].toFixed(1)},${target.end[v].toFixed(1)})`);
console.log(`\nCrossings:`);
console.log(`  other  | usage     | rawArc  | otherArc | dot   | dotSign | direction (relative to target)`);
const xs = [];
for (const other of frameSticks) {
  if (other === target) continue;
  const inter = intersect(target, other);
  if (!inter) continue;
  const posT_arc = Math.max(0, Math.min(inter.L1, inter.t * inter.L1));
  const posO_arc = Math.max(0, Math.min(inter.L2, inter.u * inter.L2));
  const odir = unitDir(other);
  const dot = targetDir[0]*odir[0] + targetDir[1]*odir[1];
  // Direction of "other" stick relative to target's heel/apex.
  // Apex direction: where target points (target.end-target.start in 2D, normalised).
  // Other direction: other.end-other.start in 2D.
  // For a web pointing INTO target: from target's surface toward open space.
  const xs_entry = {
    other: other.name,
    usage: other.usage,
    rawArc: posT_arc,
    otherArc: posO_arc,
    dot,
    L: other.flipped ? -1 : 1,
  };
  xs.push(xs_entry);
}
xs.sort((a,b) => a.rawArc - b.rawArc);
for (const x of xs) {
  console.log(`  ${x.other.padEnd(7)}| ${x.usage.padEnd(10)}| ${x.rawArc.toFixed(2).padStart(7)} | ${x.otherArc.toFixed(2).padStart(8)} | ${x.dot.toFixed(2).padStart(5)} | ${(Math.abs(x.dot) < 0.5 ? "PERP" : "PAR").padStart(7)}`);
}
