// Run the FULL diff harness logic on a TIN XML and dump tooling for TGI2-1 W4
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";
import {
  synthesizeRfyFromPlans,
  generateTooling,
  decode,
  getMachineSetupForProfile,
  deriveFrameBasis,
  coerceEnvelopeToRect,
  projectToFrameLocal,
} from "../dist/index.js";

// Cribbed from diff-vs-detailer.mjs — the full diff harness preprocessing
function parseTriple(t) { const n = String(t).trim().split(/[ ,\t]+/).map(Number); return {x:n[0]||0,y:n[1]||0,z:n[2]||0}; }
function distance3D(a,b) { const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z; return Math.sqrt(dx*dx+dy*dy+dz*dz); }
function profileCode(web,l,r,gauge) { return `${web}S${Math.round(Math.max(l,r))}_${gauge.toFixed(2)}`; }
function roleForUsage(usage,type,name) {
  const prefix = (name||"").replace(/[0-9_].*$/,"");
  if (prefix === "Kb" || prefix === "W") return prefix;
  const u=(usage||"").toLowerCase();
  if(u==="web")return"W";
  if(u==="topplate")return"T";
  if(u==="bottomplate")return"B";
  if(u==="raisedbottomplate")return"Bh";
  if(u==="topchord")return"T";
  if(u==="bottomchord")return"B";
  if(u==="headplate"||u==="head")return"H";
  if(u==="nog"||u==="noggin")return"N";
  if(u==="endstud"||u==="stud")return"S";
  if(u==="jackstud"||u==="trimstud")return"J";
  if(u==="brace")return"Br";
  return prefix||(type==="plate"?"T":"S");
}

const xml = fs.readFileSync(process.argv[2], "utf8");
const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_", parseAttributeValue:true, parseTagValue:false, isArray:n=>["plan","frame","stick","vertex","tool_action"].includes(n) });
const root = parser.parse(xml).framecad_import;
const setup = getMachineSetupForProfile(70);
const targetFrame = process.argv[3];
const targetStick = process.argv[4];

const plans = [];
for (const p of root.plan ?? []) {
  const plan = { name: String(p["@_name"]), frames: [] };
  for (const f of p.frame ?? []) {
    if (String(f["@_name"]) !== targetFrame) continue;
    const envRaw = (f.envelope?.vertex ?? []).map(v => parseTriple(typeof v==="string" ? v : v["#text"]));
    let env;
    if (envRaw.length === 4) env = envRaw;
    else if (envRaw.length >= 3) { const c = coerceEnvelopeToRect(envRaw); if (!c) continue; env = c; }
    else continue;
    try { deriveFrameBasis(env, true); } catch { continue; }
    const sticks = [];
    for (const s of f.stick ?? []) {
      let start = parseTriple(typeof s.start === "string" ? s.start : "0,0,0");
      let end = parseTriple(typeof s.end === "string" ? s.end : "0,0,0");
      const profile = s.profile;
      const profileObj = {
        web: Number(profile?.["@_web"] ?? 70),
        lFlange: Number(profile?.["@_lip_l"] ?? 41),
        rFlange: Number(profile?.["@_lip_r"] ?? 41),
        rLip: Number(profile?.["@_rlip"] ?? 11),
        lLip: Number(profile?.["@_llip"] ?? 11),
        gauge: String(profile?.["@_gauge"] ?? "0.75"),
        metricLabel: profileCode(profile?.["@_web"]??70, profile?.["@_lip_l"]??41, profile?.["@_lip_r"]??41, parseFloat(profile?.["@_gauge"]??"0.75")),
      };
      const usage = String(s["@_usage"] ?? "");
      const stickName = String(s["@_name"]);
      // W diagonal-trim/vertical-extend (from diff harness)
      if (/^W\d/.test(stickName) && usage.toLowerCase() === "web") {
        const dx = end.x - start.x, dy = end.y - start.y;
        const horizDelta = Math.sqrt(dx*dx + dy*dy);
        const isLINPlanForW = /-LIN-/i.test(plan.name);
        const isTB2BPlanForW = /-TB2B-/i.test(plan.name);
        if (horizDelta < 1.0) {
          if (!isLINPlanForW && !isTB2BPlanForW) {
            const lipDepth = profileObj.rLip > 0 ? profileObj.rLip : 11;
            const dz = end.z - start.z;
            if (Math.abs(dz) > 0.1) {
              const sign = dz > 0 ? 1 : -1;
              end = { x: end.x, y: end.y, z: end.z + sign * lipDepth };
            }
          }
        } else {
          if (!isLINPlanForW && !isTB2BPlanForW) {
            const T = 2.0;
            const dz = end.z - start.z;
            const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (len > T*2) {
              const ux = dx/len, uy = dy/len, uz = dz/len;
              end = { x: end.x - ux*T, y: end.y - uy*T, z: end.z - uz*T };
            }
          }
        }
      }
      sticks.push({ name: stickName, usage, start, end, length: distance3D(start, end), profile: profileObj, tooling: [] });
    }
    plan.frames.push({ name: String(f["@_name"]), type: String(f["@_type"] ?? ""), envelope: env, sticks });
  }
  if (plan.frames.length > 0) plans.push(plan);
}

const project = { name: "TIN-TEST", jobNum: "TIN-TEST", client: "", plans };
const result = synthesizeRfyFromPlans(project, { lenient: true });

for (const plan of project.plans) {
  for (const frame of plan.frames) {
    console.log(`=== ${frame.name} ===`);
    for (const stick of frame.sticks) {
      if (targetStick && stick.name !== targetStick) continue;
      const len = distance3D(stick.start, stick.end);
      console.log(`  ${stick.name} len=${len.toFixed(1)}`);
      for (const op of (stick.tooling || [])) {
        if (op.kind === "spanned") console.log(`     ${op.type} ${op.startPos.toFixed(2)}..${op.endPos.toFixed(2)}`);
        else if (op.kind === "point") console.log(`     ${op.type} @${op.pos.toFixed(2)}`);
        else console.log(`     ${op.type} ${op.kind}`);
      }
    }
  }
}
