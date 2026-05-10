// Look at Kb sticks per frame, gather pairs
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { decode } from "../dist/index.js";
const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_", parseAttributeValue:true, parseTagValue:false, isArray:n=>["plan","frame","stick","vertex","tool_action"].includes(n) });
const root = parser.parse(fs.readFileSync(process.argv[2], "utf8")).framecad_import;
const buf = fs.readFileSync(process.argv[3]);
const decoded = decode(buf);

// Index reference Kb chamfer status
const refKb = new Map();
for (const plan of decoded.project?.plans || []) {
  for (const frame of plan.frames || []) {
    for (const stick of frame.sticks || []) {
      if (!/^Kb\d/.test(stick.name)) continue;
      const tooling = stick.tooling || [];
      const start = tooling.some(t => t.kind === "start" && t.type === "Chamfer");
      const end = tooling.some(t => t.kind === "end" && t.type === "Chamfer");
      refKb.set(`${frame.name}/${stick.name}`, { start, end });
    }
  }
}

// Get XML Kb data per frame
for (const p of root.plan ?? []) {
  for (const f of p.frame ?? []) {
    const kbsticks = (f.stick ?? []).filter(s => /^Kb\d/.test(String(s["@_name"])));
    if (kbsticks.length === 0) continue;
    const kbInfo = kbsticks.map(s => {
      const flipped = String(s.flipped ?? "false").toLowerCase() === "true";
      const ch = refKb.get(`${f["@_name"]}/${s["@_name"]}`);
      return { name: String(s["@_name"]), flipped, ch };
    });
    const flippedSet = new Set(kbInfo.map(k => k.flipped));
    const allSame = flippedSet.size === 1;
    const summary = kbInfo.map(k => `${k.name}(f=${k.flipped},s=${k.ch?.start?'Y':'-'},e=${k.ch?.end?'Y':'-'})`).join(" ");
    console.log(`${f["@_name"].padEnd(5)} allSameFlipped=${allSame} ${summary}`);
  }
}
