#!/usr/bin/env node
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { synthesizeRfyFromPlans, decode } from "../dist/index.js";

const xmlPath = process.argv[2];
const xmlText = fs.readFileSync(xmlPath, "utf8");

function parseTriple(t) {
  const n = String(t).trim().split(/[ ,\t]+/).map(Number);
  return { x: n[0] || 0, y: n[1] || 0, z: n[2] || 0 };
}

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true }).parse(xmlText);
const root = xml.framecad_import;
const planEntries = Array.isArray(root.plan) ? root.plan : [root.plan];
const plans = [];
for (const p of planEntries) {
  const frames = [];
  const frameEntries = Array.isArray(p.frame) ? p.frame : [p.frame].filter(Boolean);
  for (const f of frameEntries) {
    if (String(f["@_name"]) !== "L20") continue;
    const sticks = [];
    const stickEntries = Array.isArray(f.stick) ? f.stick : [f.stick].filter(Boolean);
    for (const s of stickEntries) {
      const usage = String(s["@_usage"] ?? "");
      const flipped = String(s.flipped ?? "").trim().toLowerCase() === "true";
      const profile = {
        web: Number(s.profile["@_web"]),
        lFlange: Number(s.profile["@_l_flange"]),
        rFlange: Number(s.profile["@_r_flange"]),
        lLip: Number(s.profile["@_l_lip"]),
        rLip: Number(s.profile["@_r_lip"]),
        shape: String(s.profile["@_shape"]),
        gauge: String(s["@_gauge"]),
      };
      sticks.push({
        name: String(s["@_name"]),
        start: parseTriple(s.start),
        end: parseTriple(s.end),
        flipped, profile, usage,
        tooling: [],
        type: String(s["@_type"] ?? ""),
        gauge: String(s["@_gauge"]),
      });
    }
    const tas = Array.isArray(f.tool_action) ? f.tool_action : [f.tool_action].filter(Boolean);
    const services = tas.filter(t => String(t["@_name"]) === "Service").map(t => ({ start: parseTriple(t.start), end: parseTriple(t.end) }));
    const env = (Array.isArray(f.envelope.vertex) ? f.envelope.vertex : [f.envelope.vertex]).map(parseTriple);
    frames.push({ name: "L20", envelope: env, sticks, type: String(f["@_type"] ?? ""), serviceActions: services, webActions: [] });
  }
  plans.push({ name: String(p["@_name"]), frames });
}

const project = { name: String(root["@_name"]), jobNum: "JOB", client: "", date: "2026-04-30", plans };
const result = synthesizeRfyFromPlans(project, { lenient: true });
const decoded = decode(result.rfy);
for (const p of decoded.project.plans) {
  for (const f of p.frames) {
    if (f.name !== "L20") continue;
    for (const s of f.sticks) {
      const is = (s.tooling||[]).filter(o => o.type === "InnerService" && o.kind === "point");
      console.log(`${s.name}: usage=${s.usage}  IS:`, is.map(o=>"@"+o.pos.toFixed(2)).join(", "));
    }
  }
}
