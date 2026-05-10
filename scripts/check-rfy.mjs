import { decode } from "../dist/index.js";
import fs from "node:fs";
const buf = fs.readFileSync("C:/Users/Scott/AppData/Local/Temp/t4-pk9.ours.rfy");
const dec = decode(buf);
const project = dec.project;
for (const p of project.plans || []) {
  for (const f of p.frames || []) {
    if (f.name !== "TN11-1") continue;
    for (const s of f.sticks) {
      if (s.name !== "B1") continue;
      console.log("Frame", f.name, "Stick", s.name, "flipped:", s.flipped, "len:", s.length);
      for (const op of s.tooling) {
        console.log(" ", op);
      }
    }
  }
}
