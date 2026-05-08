import { generateToolingWithTrace } from "../dist/rules/index.js";
const r = generateToolingWithTrace({
  role: "Kb",
  length: 1429.08,
  profileFamily: "70S41",
  gauge: "0.75",
  flipped: false,
  planName: "GF-NLBW-70.075",
  frameName: "L4-1",
  usage: "Cripple",
  stickName: "Kb1",
  angleFromVertical: 0,
});
console.log("ops:");
for (const o of r.ops) console.log(" ", JSON.stringify(o));
console.log("trace:");
for (const t of r.trace) console.log(" ", t);
