// Identify, per S stick missing @98, whether it has a paired companion at same XY.
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";

const xmlPath = process.argv[2];
const targets = process.argv.slice(3); // list of frame:stick

const xmlText = fs.readFileSync(xmlPath, "utf-8");
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const xml = parser.parse(xmlText);

function arr(x) { return x == null ? [] : Array.isArray(x) ? x : [x]; }
function parseTriple(t) { const n = String(t).trim().split(/[, \t]+/).map(s=>parseFloat(s)).filter(n=>!isNaN(n)); return {x:n[0]||0,y:n[1]||0,z:n[2]||0}; }

const proj = xml.framecad_import || xml;
const plans = arr(proj.plan);
for (const plan of plans) {
  const frames = arr(plan.frame);
  for (const f of frames) {
    const fName = f["@_name"];
    const sticks = arr(f.stick);
    const stickInfo = sticks.map(s => {
      const start = parseTriple(s.start);
      const end = parseTriple(s.end);
      const len = Math.sqrt((end.x-start.x)**2 + (end.y-start.y)**2 + (end.z-start.z)**2);
      return { name: s["@_name"], usage: s["@_usage"], start, end, len };
    });
    // Plates determine wall extent
    const plates = stickInfo.filter(s => /plate/i.test(s.usage));
    const studs = stickInfo.filter(s => /^S\d+$/.test(s.name) && (/stud/i.test(s.usage)));
    let wallXMin=Infinity, wallXMax=-Infinity, wallYMin=Infinity, wallYMax=-Infinity;
    for (const p of plates) {
      const minX = Math.min(p.start.x, p.end.x), maxX = Math.max(p.start.x, p.end.x);
      const minY = Math.min(p.start.y, p.end.y), maxY = Math.max(p.start.y, p.end.y);
      if (minX < wallXMin) wallXMin = minX;
      if (maxX > wallXMax) wallXMax = maxX;
      if (minY < wallYMin) wallYMin = minY;
      if (maxY > wallYMax) wallYMax = maxY;
    }
    const wallExtentX = wallXMax - wallXMin;
    const wallExtentY = wallYMax - wallYMin;
    const wallAlongY = wallExtentY > wallExtentX;
    const planeMin = wallAlongY ? wallYMin : wallXMin;
    const planeMax = wallAlongY ? wallYMax : wallXMax;

    for (const target of targets) {
      const [tFrame, tStick] = target.split(":");
      if (tFrame !== fName) continue;
      const stud = studs.find(s => s.name === tStick);
      if (!stud) continue;
      // Find paired companion (same X, same Y, length differs)
      const paired = studs.filter(s =>
        s.name !== stud.name &&
        Math.abs(s.start.x - stud.start.x) < 1 &&
        Math.abs(s.start.y - stud.start.y) < 1
      );
      const studPos = wallAlongY ? stud.start.y : stud.start.x;
      const distFromWallStart = Math.abs(studPos - planeMin);
      const distFromWallEnd = Math.abs(planeMax - studPos);
      const isWallEnd = distFromWallStart < 100 || distFromWallEnd < 100;
      console.log(`${fName} / ${tStick}: len=${stud.len.toFixed(0)} usage=${stud.usage} wallAlongY=${wallAlongY} pos=${studPos.toFixed(0)} planeMin=${planeMin.toFixed(0)} planeMax=${planeMax.toFixed(0)} distEnd=[${distFromWallStart.toFixed(0)}, ${distFromWallEnd.toFixed(0)}] isWallEnd=${isWallEnd}, paired=${paired.map(p=>`${p.name}(len=${p.len.toFixed(0)},u=${p.usage})`).join(",") || "NONE"}`);
    }
  }
}
