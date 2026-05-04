#!/usr/bin/env node
/**
 * Probe: replicate computeTB2BWebPositions logic verbosely for one stick.
 * Shows every crossing, its corrected position, and any pair-bolts emitted.
 */
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";

const [, , xmlPath, frameName, stickName] = process.argv;
if (!xmlPath || !frameName || !stickName) {
  console.error("Usage: node scripts/probe-emit.mjs <xml> <frame> <stick>");
  process.exit(1);
}
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
      start3D: parseTriple(s.start),
      end3D: parseTriple(s.end),
      usage: String(s["@_usage"] ?? "").toLowerCase(),
      flipped: String(s.flipped ?? "false").trim() === "true",
    }));
  }
}
if (!frameSticks) { console.error(`Frame ${frameName} not found`); process.exit(1); }

// Detect plane
const axes = ["x","y","z"];
const ranges = { x:[Infinity,-Infinity], y:[Infinity,-Infinity], z:[Infinity,-Infinity] };
for (const s of frameSticks) for (const p of [s.start3D, s.end3D]) for (const a of axes) {
  if (p[a] < ranges[a][0]) ranges[a][0] = p[a];
  if (p[a] > ranges[a][1]) ranges[a][1] = p[a];
}
const spans = { x: ranges.x[1]-ranges.x[0], y: ranges.y[1]-ranges.y[0], z: ranges.z[1]-ranges.z[0] };
const sortedAxes = axes.slice().sort((a,b) => spans[a]-spans[b]);
const u = sortedAxes[1], v = sortedAxes[2];

function len2D(s) { const du = s.end3D[u] - s.start3D[u]; const dv = s.end3D[v] - s.start3D[v]; return Math.hypot(du, dv); }
function unitDir(s) { const du = s.end3D[u] - s.start3D[u]; const dv = s.end3D[v] - s.start3D[v]; const L = Math.hypot(du, dv); return L > 0 ? [du/L, dv/L] : [0,0]; }
function intersect(a, b) {
  const x1=a.start3D[u],y1=a.start3D[v];
  const x2=a.end3D[u],y2=a.end3D[v];
  const x3=b.start3D[u],y3=b.start3D[v];
  const x4=b.end3D[u],y4=b.end3D[v];
  const denom=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);
  if (Math.abs(denom) < 1e-9) return null;
  const t=((x1-x3)*(y3-y4)-(y1-y3)*(x3-x4))/denom;
  const u_=-((x1-x2)*(y1-y3)-(y1-y2)*(x1-x3))/denom;
  const L1=Math.hypot(x2-x1,y2-y1);
  const L2=Math.hypot(x4-x3,y4-y3);
  const SLACK=5;
  const stA=L1>0?SLACK/L1:0;
  const stB=L2>0?SLACK/L2:0;
  if (t<-stA||t>1+stA) return null;
  if (u_<-stB||u_>1+stB) return null;
  return { t,u:u_,L1,L2 };
}
function needsArcReversal(s) {
  if (s.usage === "bottomchord" && !s.flipped && s.start3D.z > s.end3D.z + 0.1) return true;
  if (s.usage === "rail" && s.flipped) {
    const dy = s.end3D[u] - s.start3D[u];
    const dz = s.end3D[v] - s.start3D[v];
    const len = Math.hypot(dy, dz);
    if (len > 600) return true;
  }
  return false;
}

const target = frameSticks.find(s => s.name === stickName);
if (!target) { console.error("not found"); process.exit(1); }
const targetL = len2D(target);
const targetDir = unitDir(target);
const targetReversal = needsArcReversal(target);
const targetIsChord = ["topchord","bottomchord","rail"].includes(target.usage);
console.log(`${target.name}: L=${targetL.toFixed(2)}, reversal=${targetReversal}, isChord=${targetIsChord}`);

const CHORD_HALF_DEPTH = 35;
const PAIR_OFFSET = 98;
const PERP_THRESHOLD = 0.5;
const APEX_PAIR_OFFSET = 153.4;
const APEX_END_THRESHOLD = 50;
const END_ZONE = 8;

const raw = [];
function push(pos, src) { raw.push({ pos, src }); }

for (const other of frameSticks) {
  if (other === target) continue;
  if (target.usage === "web" && other.usage === "web") continue;
  const inter = intersect(target, other);
  if (!inter) continue;
  const odir = unitDir(other);
  const dot = targetDir[0]*odir[0] + targetDir[1]*odir[1];
  const otherIsChord = ["topchord","bottomchord","rail"].includes(other.usage);
  const aZ = (v === "z") ? targetDir[1] : (u === "z") ? targetDir[0] : 0;
  let posA_arc = Math.max(0, Math.min(inter.L1, inter.t * inter.L1));
  let posA = posA_arc;
  if (targetIsChord) {
    const corrRaw = otherIsChord ? -CHORD_HALF_DEPTH * aZ / 2 : -CHORD_HALF_DEPTH * dot / 2;
    const correction = targetReversal ? -corrRaw : corrRaw;
    posA = Math.max(0, Math.min(inter.L1, posA_arc + correction));
  }
  push(posA, `cross(${other.name}, dot=${dot.toFixed(2)})`);
  // Bolt-pair
  if (targetIsChord && other.usage === "web" && Math.abs(dot) < PERP_THRESHOLD && !targetReversal) {
    const sign = posA < inter.L1 / 2 ? +1 : -1;
    const pairA = posA + sign * PAIR_OFFSET;
    if (pairA >= 0 && pairA <= inter.L1) push(pairA, `+98 perp pair from ${other.name}`);
  }
  // Apex pair
  if (targetIsChord && otherIsChord) {
    const otherIsAtEnd = (() => {
      const posB_arc = Math.max(0, Math.min(inter.L2, inter.u * inter.L2));
      return Math.min(posB_arc, inter.L2 - posB_arc) < APEX_END_THRESHOLD;
    })();
    const aAtEnd = Math.min(posA, inter.L1 - posA) < APEX_END_THRESHOLD;
    if (aAtEnd && otherIsAtEnd) {
      const aNearStart = posA < inter.L1 / 2;
      const sign_a = aNearStart ? +1 : -1;
      const pairA = posA + sign_a * APEX_PAIR_OFFSET;
      if (pairA >= 0 && pairA <= inter.L1) push(pairA, `+153 apex pair w/ ${other.name}`);
    }
  }
}

raw.sort((a,b) => a.pos - b.pos);
console.log("\nRaw emissions (pre-reversal, pre-end-zone-filter):");
for (const r of raw) console.log(`  ${r.pos.toFixed(2).padStart(8)}   ${r.src}`);

// Apply reversal + filter
let final = raw.filter(r => r.pos >= END_ZONE - 0.5 && r.pos <= targetL - END_ZONE + 0.5);
if (targetReversal) final = final.map(r => ({ ...r, pos: targetL - r.pos }));
final.sort((a,b) => a.pos - b.pos);
console.log("\nFinal emissions (post-reversal, post-filter):");
for (const r of final) console.log(`  ${r.pos.toFixed(2).padStart(8)}   ${r.src}`);
