import { decode } from "../dist/index.js";
import fs from "node:fs";
const buf = fs.readFileSync(process.argv[2]);
const decoded = decode(buf);
console.log("plans:", decoded.plans?.length);
console.log("first plan frames:", decoded.plans?.[0]?.frames?.length);
console.log("first frame sticks:", decoded.plans?.[0]?.frames?.[0]?.sticks?.length);
console.log("first stick:", JSON.stringify(decoded.plans?.[0]?.frames?.[0]?.sticks?.[0], null, 2).slice(0, 1000));
