#!/usr/bin/env node
// Compare B-plate ref length vs T-plate slope topology.
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";

const XML_PATH = "Y:/(17) 2026 HYTEK PROJECTS/CORAL HOMES/HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI/03 DETAILING/03 FRAMECAD DETAILER/01 XML OUTPUT/HG260001 LOT 289 COORA CRESCENT CURRIMUNDI 4551-GF-RP-70.075.xml";
const xml = fs.readFileSync(XML_PATH, "utf8");
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const doc = parser.parse(xml);
const getArr = (x) => Array.isArray(x) ? x : x == null ? [] : [x];
const parseTriple = (s) => { const [x, y, z] = String(s).split(",").map(v => parseFloat(v.trim())); return { x, y, z }; };
const root = doc.framecad_import ?? doc;

const diff = JSON.parse(fs.readFileSync('scripts/baselines/raw/HG260001_GF-RP-70.075.json', "utf8"));
const refLenByFS = new Map();
for (const f of diff.byFrame) {
  for (const s of f.sticks) refLenByFS.set(`${f.name}/${s.name}`, s.refLength);
}

// Estimate matched-length frames from raw text dumps (frames that had no diff entry)
const refRfyText = fs.readFileSync('C:/Users/Scott/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data/HG260044/HG260044#1-1_GF-RP-70.075.rfy').toString('binary');
// Extract pattern: <stick name="B1" length="N" ...>
const reLen = /<stick name="(B\d+)"[^>]*length="([\d.]+)"/g;
// Above pattern doesn't apply; need actual ref length from rfy. Just use what we have.

const plans = getArr(root.plan ?? []);
for (const plan of plans) {
  for (const frame of getArr(plan.frame ?? [])) {
    const fname = String(frame["@_name"] ?? "?");
    const sticks = getArr(frame.stick ?? []);
    const allTs = sticks.filter(s => /^T\d/.test(String(s["@_name"] ?? "")));
    const tInfo = [];
    for (const t of allTs) {
      const tStart = parseTriple(String(t.start ?? "0,0,0"));
      const tEnd = parseTriple(String(t.end ?? "0,0,0"));
      const tDz = Math.abs(tEnd.z - tStart.z);
      tInfo.push({ name: String(t["@_name"]), dz: tDz, slo: tDz > 5 });
    }
    const tSummary = tInfo.map(t => `${t.name}/dz${t.dz.toFixed(0)}${t.slo?'S':'-'}`).join(",");
    const allHorizontalT = tInfo.every(t => !t.slo);
    const anySlopedT = tInfo.some(t => t.slo);
    const allBs = sticks.filter(s => /^B\d/.test(String(s["@_name"] ?? "")));
    for (const s of allBs) {
      const sname = String(s["@_name"]);
      const start = parseTriple(String(s.start ?? "0,0,0"));
      const end = parseTriple(String(s.end ?? "0,0,0"));
      const rawLen = Math.sqrt((end.x-start.x)**2 + (end.y-start.y)**2 + (end.z-start.z)**2);
      const dz = Math.abs(end.z - start.z);
      const refLen = refLenByFS.get(`${fname}/${sname}`);
      const refMinusRaw = refLen != null ? (refLen - rawLen) : null;
      let bucket = "?";
      if (refMinusRaw != null) {
        if (Math.abs(refMinusRaw) < 1.5) bucket = "0";
        else if (Math.abs(refMinusRaw + 3) < 1.5) bucket = "-3";
        else if (Math.abs(refMinusRaw + 8) < 1.5) bucket = "-8";
        else bucket = refMinusRaw.toFixed(1);
      }
      // Check: does any T-plate endpoint sit further along this B's axis than B's endpoints?
      const bX = end.x - start.x, bY = end.y - start.y;
      const bAxis = Math.sqrt(bX*bX + bY*bY);
      const bUx = bX / bAxis, bUy = bY / bAxis;
      let maxOverhangStart = 0, maxOverhangEnd = 0;
      for (const t of allTs) {
        const ts = parseTriple(String(t.start ?? "0,0,0"));
        const te = parseTriple(String(t.end ?? "0,0,0"));
        // Project T endpoints onto B's axis (parametrize: t at start.x..end.x)
        const projTs = ((ts.x - start.x) * bUx + (ts.y - start.y) * bUy);
        const projTe = ((te.x - start.x) * bUx + (te.y - start.y) * bUy);
        const overhangBeforeStart = -Math.min(projTs, projTe);
        const overhangPastEnd = Math.max(projTs, projTe) - bAxis;
        if (overhangBeforeStart > maxOverhangStart) maxOverhangStart = overhangBeforeStart;
        if (overhangPastEnd > maxOverhangEnd) maxOverhangEnd = overhangPastEnd;
      }
      const overhangTag = `oh:s${maxOverhangStart.toFixed(0)}/e${maxOverhangEnd.toFixed(0)}`;
      console.log(`${fname.padEnd(5)}${sname.padEnd(4)} rawL=${rawLen.toFixed(1).padStart(7)} dz=${dz.toFixed(1).padStart(7)} sloped=${dz>5?"Y":"-"}  bucket=${bucket.padEnd(4)}  ${overhangTag.padEnd(15)}  tInfo=${tSummary.padEnd(40)}`);
    }
  }
}
