import { decode } from "../dist/index.js";
import fs from "node:fs";
const buf = fs.readFileSync(process.argv[2]);
const decoded = decode(buf);
// Print top-level
console.log("scheduleVersion:", decoded.scheduleVersion);
console.log("project keys:", Object.keys(decoded.project));
console.log("first plan keys:", Object.keys(decoded.project.plans?.[0] || {}));
console.log("First plan minus frames:", JSON.stringify({...decoded.project.plans?.[0], frames: '...'}, null, 2));
