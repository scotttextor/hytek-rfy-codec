import { decode } from "../dist/index.js";
import fs from "node:fs";
const buf = fs.readFileSync(process.argv[2]);
const decoded = decode(buf);
console.log("scheduleVersion:", decoded.scheduleVersion);
const proj = decoded.project;
const stripped = {...proj, plans: proj.plans?.map(p => ({...p, frames: undefined}))};
console.log(JSON.stringify(stripped, null, 2));
