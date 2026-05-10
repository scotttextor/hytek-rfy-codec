#!/usr/bin/env node
import fs from "node:fs";
import { decode } from "../dist/index.js";

const oursRfy = fs.readFileSync("C:/Users/Scott/AppData/Local/Temp/t8-pk9.ours.rfy");
const refRfy = fs.readFileSync("Y:/(17) 2026 HYTEK PROJECTS/CORAL HOMES/HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI/06 MANUFACTURING/04 ROLLFORMER FILES/Split_HG260001/HG260001_PK9-GF-TB2B-70.075.rfy");
const oursDoc = decode(oursRfy);
const refDoc = decode(refRfy);

const want = (process.argv[2] || "TN11-1:W19,TN11-1:W16,TN6-1:W15").split(",");

for (const k of want) {
  const [fname, sname] = k.split(":");
  for (const doc of [oursDoc, refDoc]) {
    const label = doc === oursDoc ? "OURS" : "REF ";
    for (const plan of doc.project.plans || []) {
      for (const f of plan.frames || []) {
        if (f.name !== fname) continue;
        const sticks = f.sticks.filter(s => s.name === sname);
        for (let i = 0; i < sticks.length; i++) {
          const s = sticks[i];
          const webs = (s.tooling || []).filter(t => t.kind === "point" && t.type === "Web").map(t => t.pos).sort((a,b)=>a-b);
          const st = s.start || {};
          const en = s.end || {};
          console.log(`${label} ${fname} ${sname}#${i}  start=(${st.x?.toFixed?.(0)},${st.y?.toFixed?.(0)},${st.z?.toFixed?.(0)}) end=(${en.x?.toFixed?.(0)},${en.y?.toFixed?.(0)},${en.z?.toFixed?.(0)})  webs=${webs.map(p=>p.toFixed(1)).join(",")}`);
        }
      }
    }
  }
  console.log();
}
