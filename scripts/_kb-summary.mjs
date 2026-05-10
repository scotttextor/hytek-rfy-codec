import fs from "node:fs";
import { decode } from "../dist/index.js";
const rfyPath = process.argv[2];
const buf = fs.readFileSync(rfyPath);
const decoded = decode(buf);
let bothCount = 0, startOnly = 0, endOnly = 0, neither = 0;
for (const plan of decoded.project?.plans || []) {
  for (const frame of plan.frames || []) {
    for (const stick of frame.sticks || []) {
      if (!/^Kb\d/.test(stick.name)) continue;
      const hasStart = (stick.tooling || []).some(t => t.kind === "start" && (t.type === "Chamfer" || t.type === "TrussChamfer"));
      const hasEnd = (stick.tooling || []).some(t => t.kind === "end" && (t.type === "Chamfer" || t.type === "TrussChamfer"));
      if (hasStart && hasEnd) bothCount++;
      else if (hasStart) startOnly++;
      else if (hasEnd) endOnly++;
      else neither++;
    }
  }
}
console.log(`${rfyPath.split("/").pop()}: both=${bothCount} startOnly=${startOnly} endOnly=${endOnly} neither=${neither}`);
