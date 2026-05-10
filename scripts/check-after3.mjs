import { decode } from "../dist/index.js";
import fs from "node:fs";
const buf = fs.readFileSync("C:/Users/Scott/AppData/Local/Temp/t4-pk11-after3.ours.rfy");
const dec = decode(buf);
for (const p of dec.project.plans || []) {
  for (const f of p.frames || []) {
    if (f.name !== "TN4-1") continue;
    for (const s of f.sticks) {
      if (s.name !== "B2") continue;
      console.log("Ours TN4-1 B2 after3:", s.length);
      for (const op of s.tooling) console.log(" ", op);
    }
  }
}
