// Print web-chord crossings for a specific TIN frame, for ALL T2 instances.
// Usage: node scripts/_dump-tin-crossings.mjs <input.xml> <frame-name>
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";

const [, , xmlPath, frameName] = process.argv;
if (!xmlPath || !frameName) {
  console.error("Usage: node scripts/_dump-tin-crossings.mjs <input.xml> <frame-name>");
  process.exit(1);
}
const xml = fs.readFileSync(xmlPath, "utf8");
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: false,
  trimValues: true,
});
const doc = parser.parse(xml);

function parseTriple(t) {
  const n = String(t).trim().split(/[ ,\t]+/).map(Number);
  return { x: n[0] || 0, y: n[1] || 0, z: n[2] || 0 };
}

function findFrame(node, target) {
  if (!node || typeof node !== "object") return null;
  if (node["@_name"] === target) return node;
  for (const k of Object.keys(node)) {
    if (k.startsWith("@_")) continue;
    const v = node[k];
    if (Array.isArray(v)) for (const it of v) { const r = findFrame(it, target); if (r) return r; }
    else if (v && typeof v === "object") { const r = findFrame(v, target); if (r) return r; }
  }
  return null;
}

const frame = findFrame(doc, frameName);
if (!frame) { console.error("Frame not found:", frameName); process.exit(1); }

const stickArr = Array.isArray(frame.stick) ? frame.stick : (frame.stick ? [frame.stick] : []);
const t2sticks = stickArr.filter(s => s["@_name"] === "T2" || s["@_name"] === "H2");
console.log("Found", t2sticks.length, "T2/H2 sticks");

function projectOnto(p, a, b) {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const ap = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z };
  const len2 = ab.x*ab.x + ab.y*ab.y + ab.z*ab.z;
  const t = (ap.x*ab.x + ap.y*ab.y + ap.z*ab.z) / len2;
  const proj = { x: a.x + ab.x*t, y: a.y + ab.y*t, z: a.z + ab.z*t };
  const d = Math.hypot(p.x-proj.x, p.y-proj.y, p.z-proj.z);
  return { d, t, len: Math.sqrt(len2), pos: t * Math.sqrt(len2) };
}

for (let ti = 0; ti < t2sticks.length; ti++) {
  const t2 = t2sticks[ti];
  const t2start = parseTriple(t2.start);
  const t2end = parseTriple(t2.end);
  const t2dx = t2end.x - t2start.x, t2dy = t2end.y - t2start.y, t2dz = t2end.z - t2start.z;
  const t2len = Math.hypot(t2dx, t2dy, t2dz);
  console.log(`\n===== ${t2["@_name"]} #${ti} =====`);
  console.log("  start:", t2start);
  console.log("  end:  ", t2end);
  console.log("  len:  ", t2len.toFixed(2));

  const others = stickArr.filter(s => {
    const n = s["@_name"] || "";
    if (n === "T2" || n === "T3" || n === "H2") return false;
    if (n.startsWith("B")) return false;
    return true;
  });
  const cross = [];
  for (const w of others) {
    const ws = parseTriple(w.start);
    const we = parseTriple(w.end);
    const ps = projectOnto(ws, t2start, t2end);
    const pe = projectOnto(we, t2start, t2end);
    const better = ps.d < pe.d ? ps : pe;
    if (better.d > 100) continue;
    if (better.pos < -10 || better.pos > t2len + 10) continue;
    cross.push({ name: w["@_name"], tin: better.pos, perp: better.d });
  }
  cross.sort((a, b) => a.tin - b.tin);
  for (const c of cross) {
    console.log(`  ${c.name.padEnd(6)} tin=${c.tin.toFixed(2).padStart(8)} perp=${c.perp.toFixed(2).padStart(6)}`);
  }
  console.log("  Pair detection:");
  const used = new Set();
  for (let i = 0; i < cross.length; i++) {
    if (used.has(i)) continue;
    const a = cross[i];
    let pi = -1;
    for (let j = i + 1; j < cross.length; j++) {
      if (used.has(j)) continue;
      if (cross[j].tin - a.tin > 60) break;
      pi = j;
      break;
    }
    if (pi >= 0) {
      used.add(i); used.add(pi);
      const b = cross[pi];
      console.log(`    PAIR  ${a.name}@${a.tin.toFixed(2)} + ${b.name}@${b.tin.toFixed(2)}  delta=${(b.tin-a.tin).toFixed(2)}  → IDs @${(a.tin-7.71).toFixed(2)}, @${(a.tin+43.54).toFixed(2)}`);
    } else {
      used.add(i);
      console.log(`    SOLO  ${a.name}@${a.tin.toFixed(2)}  → ID @${(a.tin-7.71).toFixed(2)}`);
    }
  }
}
