import { decode } from "../dist/index.js";
import fs from "node:fs";
const buf = fs.readFileSync("Y:/(17) 2026 HYTEK PROJECTS/CORAL HOMES/HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI/06 MANUFACTURING/04 ROLLFORMER FILES/Split_HG260001/HG260001_PK10-GF-TB2B-70.075.rfy");
const dec = decode(buf);
for (const p of dec.project.plans || []) {
  for (const f of p.frames || []) {
    if (f.name !== "TN6-1") continue;
    for (const s of f.sticks) {
      if (!/^B/.test(s.name)) continue;
      console.log("Ref TN6-1", s.name, "flipped:", s.flipped, "len:", s.length);
      for (const op of s.tooling) console.log(" ", op);
      console.log("");
    }
  }
}
