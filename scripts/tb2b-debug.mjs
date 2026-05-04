// TB2B analyzer: dump per-stick coords from XML and reference RFY positions
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";

const xmlPath = "Y:/(17) 2026 HYTEK PROJECTS/CORAL HOMES/HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI/03 DETAILING/03 FRAMECAD DETAILER/01 XML OUTPUT/HG260001 LOT 289 COORA CRESCENT CURRIMUNDI 4551-GF-TB2B-70.075.xml";
const frameTarget = process.argv[2] || "TN6-1";

function parseTriple(t) { const n = String(t).trim().split(/[ ,\t]+/).map(Number); return {x:n[0]||0,y:n[1]||0,z:n[2]||0}; }

const xmlText = fs.readFileSync(xmlPath, "utf8");
const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_", parseAttributeValue:true, parseTagValue:false, isArray:n=>["plan","frame","stick","vertex","tool_action"].includes(n) });
const root = parser.parse(xmlText).framecad_import;

for (const p of root.plan ?? []) {
  for (const f of p.frame ?? []) {
    if (String(f["@_name"]) !== frameTarget) continue;
    console.log(`Plan: ${p["@_name"]}, Frame: ${f["@_name"]}, type=${f["@_type"]}`);
    const sticks = [];
    for (const s of f.stick ?? []) {
      const start = parseTriple(String(s.start ?? "0,0,0"));
      const end = parseTriple(String(s.end ?? "0,0,0"));
      const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
      const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
      sticks.push({ name: String(s["@_name"]), usage: String(s["@_usage"] ?? "").toLowerCase(), start, end, len, flip: String(s.flipped ?? "false") });
      console.log(`  ${String(s["@_name"]).padEnd(8)} usage=${String(s["@_usage"]).padEnd(12)} len=${len.toFixed(2)}  start=(${start.x.toFixed(1)},${start.y.toFixed(1)},${start.z.toFixed(1)})  end=(${end.x.toFixed(1)},${end.y.toFixed(1)},${end.z.toFixed(1)})  flip=${s.flipped ?? "false"}`);
    }

    // Compute Y-Z plane intersections for each pair, see what raw arc-lengths we get
    console.log("\n=== PAIRWISE INTERSECTIONS (in YZ plane) ===");
    for (let i = 0; i < sticks.length; i++) {
      for (let j = i + 1; j < sticks.length; j++) {
        const sA = sticks[i], sB = sticks[j];
        if (sA.usage === "web" && sB.usage === "web") continue;
        const x1 = sA.start.y, y1 = sA.start.z;
        const x2 = sA.end.y,   y2 = sA.end.z;
        const x3 = sB.start.y, y3 = sB.start.z;
        const x4 = sB.end.y,   y4 = sB.end.z;
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 1e-9) continue;
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
        const L1 = Math.hypot(x2 - x1, y2 - y1);
        const L2 = Math.hypot(x4 - x3, y4 - y3);
        if (t < -0.05 || t > 1.05 || u < -0.05 || u > 1.05) continue;
        const auy = (sA.end.y - sA.start.y) / L1;
        const auz = (sA.end.z - sA.start.z) / L1;
        const buy = (sB.end.y - sB.start.y) / L2;
        const buz = (sB.end.z - sB.start.z) / L2;
        const dot = auy * buy + auz * buz;
        const angDeg = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
        console.log(`  ${sA.name} ∩ ${sB.name}: arcA=${(t*L1).toFixed(2)} arcB=${(u*L2).toFixed(2)}  cos=${dot.toFixed(4)} ang=${angDeg.toFixed(1)}°  (sA.usage=${sA.usage} sB.usage=${sB.usage})  (azY,azZ=${auy.toFixed(3)},${auz.toFixed(3)} bzY,bzZ=${buy.toFixed(3)},${buz.toFixed(3)})`);
      }
    }
  }
}
