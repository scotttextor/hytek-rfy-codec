import { decode } from "../dist/index.js";
import fs from "node:fs";
const buf = fs.readFileSync("Y:/(17) 2026 HYTEK PROJECTS/CORAL HOMES/HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI/06 MANUFACTURING/04 ROLLFORMER FILES/Split_HG260001/HG260001_PK9-GF-TB2B-70.075.rfy");
const dec = decode(buf);
const project = dec.project;
for (const p of project.plans || []) {
  for (const f of p.frames || []) {
    if (f.name !== "TN11-1") continue;
    for (const s of f.sticks) {
      if (s.name !== "B1") continue;
      console.log("Ref TN11-1 B1 flipped:", s.flipped, "len:", s.length);
      for (const op of s.tooling) {
        console.log(" ", op);
      }
    }
  }
}
