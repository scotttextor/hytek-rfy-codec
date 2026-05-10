import { decode } from "../dist/index.js";
import fs from "node:fs";
const buf = fs.readFileSync(process.argv[2]);
const decoded = decode(buf);
const proj = decoded.project;
console.log("Project name:", proj?.name);
console.log("ScheduleVersion:", decoded.scheduleVersion);
console.log("designId:", proj?.designId);
console.log("Plan setup:");
for (const p of proj?.plans || []) {
  console.log(`  ${p.name}: setup=${p.setup ?? p.machineSetup ?? '(none)'}`);
}
