// Probe S-stud frame context: list all sticks in a frame with their bbox
// geometry, then list all crossings of a target S stud against horizontal members.
// Usage: node scripts/_ids-stud-probe.mjs <xml> <frameName> <stickName>
import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import {
  decode,
  deriveFrameBasis,
  coerceEnvelopeToRect,
  projectToFrameLocal,
} from "../dist/index.js";

const xmlPath = process.argv[2];
const targetFrame = process.argv[3];
const targetStick = process.argv[4];

const xmlText = fs.readFileSync(xmlPath, "utf-8");
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const xml = parser.parse(xmlText);

// Walk down to plans/frames/sticks
const proj = xml.framecad_import || xml.Project || xml.project || xml;
function arr(x) { return x == null ? [] : Array.isArray(x) ? x : [x]; }

function parseTriple(t) { const n = String(t).trim().split(/[, \t]+/).map(s=>parseFloat(s)).filter(n=>!isNaN(n)); return {x:n[0]||0,y:n[1]||0,z:n[2]||0}; }

const plans = arr(proj.plan ?? proj.Plans?.Plan ?? proj.Plan);
for (const plan of plans) {
  const planName = plan["@_name"] ?? plan["@_Name"] ?? plan.Name ?? "?";
  const frames = arr(plan.frame ?? plan.Frames?.Frame ?? plan.Frame);
  for (const f of frames) {
    const fName = f["@_name"] ?? f["@_Name"] ?? f.Name ?? "?";
    if (fName !== targetFrame) continue;

    console.log(`=== Plan: ${planName} | Frame: ${fName} ===`);

    // Frame basis
    const sticks = arr(f.stick ?? f.Sticks?.Stick ?? f.Stick);

    // Find frame Z direction from top plate
    const stickInfo = sticks.map(s => {
      const name = s["@_name"] ?? s["@_Name"] ?? s.Name ?? "?";
      const usage = s["@_usage"] ?? s["@_Usage"] ?? s.Usage ?? "";
      const startStr = s.start ?? s["@_WorldStart"] ?? s.WorldStart ?? s.Start ?? "";
      const endStr = s.end ?? s["@_WorldEnd"] ?? s.WorldEnd ?? s.End ?? "";
      const start = parseTriple(startStr);
      const end = parseTriple(endStr);
      const len = Math.sqrt((end.x-start.x)**2 + (end.y-start.y)**2 + (end.z-start.z)**2);
      return { name, usage, len, start, end };
    });

    // Find frame's plates to derive basis
    const plates = stickInfo.filter(s => /plate/i.test(s.usage));
    if (plates.length === 0) {
      console.log("No plates found. Sticks:");
      for (const si of stickInfo) console.log(`  ${si.name} usage=${si.usage} len=${si.len}`);
      continue;
    }

    // Print all sticks with their world coords + length + role
    console.log(`\nAll sticks (${stickInfo.length}):`);
    for (const si of stickInfo) {
      const role = (si.name || "").replace(/[0-9_].*$/, "");
      const dy = si.end.y - si.start.y;
      const dz = si.end.z - si.start.z;
      const dx = si.end.x - si.start.x;
      console.log(`  ${si.name.padEnd(8)} usage=${si.usage.padEnd(15)} len=${String(si.len).padEnd(8)} role=${role.padEnd(4)} d=(${dx.toFixed(0)},${dy.toFixed(0)},${dz.toFixed(0)}) start=(${si.start.x.toFixed(0)}, ${si.start.y.toFixed(0)}, ${si.start.z.toFixed(0)}) end=(${si.end.x.toFixed(0)}, ${si.end.y.toFixed(0)}, ${si.end.z.toFixed(0)})`);
    }

    if (targetStick) {
      const tgt = stickInfo.find(s => s.name === targetStick);
      if (!tgt) { console.log(`\nStick ${targetStick} not found.`); continue; }
      console.log(`\n=== Crossing analysis for ${targetStick} ===`);
      console.log(`  start=(${tgt.start.x.toFixed(2)}, ${tgt.start.y.toFixed(2)}, ${tgt.start.z.toFixed(2)})`);
      console.log(`  end  =(${tgt.end.x.toFixed(2)}, ${tgt.end.y.toFixed(2)}, ${tgt.end.z.toFixed(2)})`);
      // Stud direction (longest)
      const dx = tgt.end.x - tgt.start.x;
      const dy = tgt.end.y - tgt.start.y;
      const dz = tgt.end.z - tgt.start.z;
      const L = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const u = { x: dx/L, y: dy/L, z: dz/L };
      console.log(`  stick dir=(${u.x.toFixed(3)}, ${u.y.toFixed(3)}, ${u.z.toFixed(3)}) len=${L.toFixed(2)}`);

      // Project each candidate horizontal member's center onto stud axis to get local pos
      console.log(`\nHorizontal-member crossings on ${targetStick}:`);
      for (const other of stickInfo) {
        if (other.name === targetStick) continue;
        // Center of other stick
        const cx = (other.start.x + other.end.x) / 2;
        const cy = (other.start.y + other.end.y) / 2;
        const cz = (other.start.z + other.end.z) / 2;
        // Vector from stud start to other center
        const vx = cx - tgt.start.x;
        const vy = cy - tgt.start.y;
        const vz = cz - tgt.start.z;
        const localPos = vx*u.x + vy*u.y + vz*u.z;
        // Perpendicular distance
        const projx = u.x * localPos;
        const projy = u.y * localPos;
        const projz = u.z * localPos;
        const px = vx - projx;
        const py = vy - projy;
        const pz = vz - projz;
        const perpDist = Math.sqrt(px*px + py*py + pz*pz);
        if (localPos < -50 || localPos > L + 50) continue;
        if (perpDist > 200) continue;
        const odx = other.end.x - other.start.x;
        const ody = other.end.y - other.start.y;
        const odz = other.end.z - other.start.z;
        console.log(`  ${other.name.padEnd(8)} usage=${other.usage.padEnd(15)} len=${String(other.len).padEnd(7)} crosses @${localPos.toFixed(1)} (perp=${perpDist.toFixed(1)}) center=(${cx.toFixed(0)}, ${cy.toFixed(0)}, ${cz.toFixed(0)}) d=(${odx.toFixed(0)},${ody.toFixed(0)},${odz.toFixed(0)})`);
      }
    }
  }
}
