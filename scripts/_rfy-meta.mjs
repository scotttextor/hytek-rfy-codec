import { decode } from "../dist/index.js";
import fs from "node:fs";
const buf = fs.readFileSync(process.argv[2]);
const decoded = decode(buf);
console.log("name:", decoded.project.name);
console.log("date:", decoded.project.date);
console.log("designId:", decoded.project.designId);
