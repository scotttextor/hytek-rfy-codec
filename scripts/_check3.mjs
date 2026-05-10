import { decode } from "../dist/index.js";
import fs from "node:fs";
const buf = fs.readFileSync(process.argv[2]);
const decoded = decode(buf);
console.log("Top-level keys:", Object.keys(decoded));
console.log(JSON.stringify(decoded, null, 2).slice(0, 2000));
