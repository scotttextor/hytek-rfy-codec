#!/usr/bin/env node
/**
 * Verify the framecad-import → synthesizeRfyFromPlans → decoded RFY pipeline
 * produces outline corners that match a Detailer-emitted reference RFY for
 * the same job, frame-for-frame.
 *
 * Inputs (configurable via env or CLI args):
 *   INPUT_XML  — path to a framecad_import.xml (Detailer-emitted)
 *   REFERENCE  — path to a Detailer-emitted .rfy for the same plan
 *   TOLERANCE  — mm (default 0.005)
 *
 * Defaults to the HG260001 LBW case captured 2026-04-30:
 *   INPUT_XML  = C:/Users/Scott/CLAUDE CODE/HG260001-LBW-INPUT.xml
 *   REFERENCE  = Y:/.../Split_HG260001/HG260001_PK5-GF-LBW-70.075.rfy
 *
 * Exits 0 on green (every shared stick within tolerance), 1 otherwise.
 */
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";
import {
  synthesizeRfyFromPlans,
  decode,
  generateTooling,
} from "../dist/index.js";

const INPUT_XML = process.env.INPUT_XML
  ?? process.argv[2]
  ?? "C:/Users/Scott/CLAUDE CODE/HG260001-LBW-INPUT.xml";
const REFERENCE = process.env.REFERENCE
  ?? process.argv[3]
  ?? "Y:/(17) 2026 HYTEK PROJECTS/CORAL HOMES/HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI/06 MANUFACTURING/04 ROLLFORMER FILES/Split_HG260001/HG260001_PK5-GF-LBW-70.075.rfy";
const TOLERANCE = parseFloat(process.env.TOLERANCE ?? "0.005");

console.log("=== verify-elevation-fix ===");
console.log("Input XML :", INPUT_XML);
console.log("Reference :", REFERENCE);
console.log("Tolerance : ±" + TOLERANCE + "mm");
console.log("");

// ---------------------------------------------------------------------------
// 1. Parse input XML → ParsedProject (mirrors framecad-import.ts logic).
// ---------------------------------------------------------------------------

function parseTriple(text) {
  const nums = String(text).trim().split(/[ ,\t]+/).map(Number);
  return { x: nums[0] || 0, y: nums[1] || 0, z: nums[2] || 0 };
}

function distance3D(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function profileCode(web, l, r, gauge) {
  return `${web}S${Math.round(Math.max(l, r))}_${gauge.toFixed(2)}`;
}

function roleForUsage(usage, type, name) {
  const u = (usage || "").toLowerCase();
  if (u === "topplate") return "T";
  if (u === "bottomplate") return "B";
  if (u === "headplate" || u === "head") return "H";
  if (u === "nog" || u === "noggin") return "N";
  if (u === "endstud" || u === "stud") return "S";
  if (u === "jackstud" || u === "trimstud") return "J";
  if (u === "brace") return "Br";
  const prefix = (name || "").replace(/[0-9_].*$/, "");
  if (prefix) return prefix;
  if (type === "plate") return "T";
  return "S";
}

function parseInputXml(xmlText) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: true,
    parseTagValue: false,
    isArray: (name) => ["plan", "frame", "stick", "vertex"].includes(name),
  });
  const doc = parser.parse(xmlText);
  const root = doc.framecad_import;
  if (!root) throw new Error("Not a <framecad_import> XML document");

  const jobnum = String(root.jobnum ?? "JOB").replace(/["\s]/g, "");
  const projectName = String(root["@_name"] ?? jobnum).replace(/^"\s*|\s*"$/g, "").trim();
  const client = String(root.client ?? "").replace(/["\s]/g, " ").trim();
  const dateRaw = String(root.drawing_info?.datedrawn ?? "").replace(/["\s]/g, "");
  const dm = dateRaw.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  const date = dm
    ? `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`
    : new Date().toISOString().slice(0, 10);

  const plans = [];
  for (const planNode of root.plan ?? []) {
    const plan = { name: String(planNode["@_name"] ?? "PLAN"), frames: [] };
    for (const frameNode of planNode.frame ?? []) {
      const envelopeRaw = [];
      const envNode = frameNode.envelope;
      if (envNode && Array.isArray(envNode.vertex)) {
        for (const v of envNode.vertex) {
          const text = typeof v === "string" ? v : (v["#text"] ?? String(v));
          envelopeRaw.push(parseTriple(text));
        }
      }
      if (envelopeRaw.length !== 4) {
        console.warn(`Skipping frame ${frameNode["@_name"]}: envelope has ${envelopeRaw.length} vertices`);
        continue;
      }
      const frame = {
        name: String(frameNode["@_name"] ?? "F1"),
        envelope: envelopeRaw,
        sticks: [],
      };
      for (const stickNode of frameNode.stick ?? []) {
        const profile = {
          web: Number(stickNode.profile?.["@_web"] ?? 0),
          lFlange: Number(stickNode.profile?.["@_l_flange"] ?? 0),
          rFlange: Number(stickNode.profile?.["@_r_flange"] ?? 0),
          lLip: Number(stickNode.profile?.["@_l_lip"] ?? 0),
          rLip: Number(stickNode.profile?.["@_r_lip"] ?? 0),
          shape: String(stickNode.profile?.["@_shape"] ?? "C"),
          gauge: String(Number(stickNode["@_gauge"] ?? 0)),
        };
        const stickName = String(stickNode["@_name"] ?? "");
        const inputFlipped = String(stickNode.flipped ?? "").trim().toLowerCase() === "true";
        // Detailer rule: Kb/W diagonal-brace sticks always have flipped=false.
        const isDiagonalBrace = /^(Kb|W)\d/.test(stickName);
        const stick = {
          name: stickName,
          start: parseTriple(String(stickNode.start ?? "0,0,0")),
          end: parseTriple(String(stickNode.end ?? "0,0,0")),
          flipped: isDiagonalBrace ? false : inputFlipped,
          profile,
          usage: String(stickNode["@_usage"] ?? ""),
          type: String(stickNode["@_type"] ?? ""),
        };
        // Generate per-stick tooling via rules engine
        const length = Math.round(distance3D(stick.start, stick.end) * 10) / 10;
        const role = roleForUsage(stick.usage, stick.type, stick.name);
        const profileFamily = profileCode(profile.web, profile.lFlange, profile.rFlange, parseFloat(profile.gauge) || 0.75).split("_")[0];
        const ops = generateTooling({
          role, length,
          profileFamily,
          gauge: profile.gauge,
          flipped: stick.flipped,
          planName: plan.name,
          frameName: frame.name,
          usage: stick.usage,
        });
        frame.sticks.push({
          name: stick.name,
          start: stick.start,
          end: stick.end,
          flipped: stick.flipped,
          profile,
          usage: stick.usage,
          tooling: ops,
        });
      }
      plan.frames.push(frame);
    }
    plans.push(plan);
  }
  return { name: projectName, jobNum: jobnum, client, date, plans };
}

// ---------------------------------------------------------------------------
// 2. Build & decode our RFY.
// ---------------------------------------------------------------------------

const xmlText = fs.readFileSync(INPUT_XML, "utf8");
const project = parseInputXml(xmlText);
console.log(`Parsed input: ${project.plans.length} plans, ${project.plans.reduce((s, p) => s + p.frames.length, 0)} frames`);

const synth = synthesizeRfyFromPlans(project, {});
console.log(`Synthesized RFY: ${synth.rfy.length} bytes, ${synth.frameCount} frames, ${synth.stickCount} sticks`);

const ourDecoded = decode(synth.rfy);

// ---------------------------------------------------------------------------
// 3. Decode the Detailer reference.
// ---------------------------------------------------------------------------

const refBuf = fs.readFileSync(REFERENCE);
const refDecoded = decode(refBuf);
console.log(`Reference RFY: ${refDecoded.project.plans.reduce((s, p) => s + p.frames.length, 0)} frames`);
console.log("");

// ---------------------------------------------------------------------------
// 4. Diff frame-by-frame.
// ---------------------------------------------------------------------------

const refFramesByName = new Map();
for (const p of refDecoded.project.plans) {
  for (const f of p.frames) refFramesByName.set(f.name, f);
}

let totalSticksCompared = 0;
let totalSticksWithinTolerance = 0;
const offenders = [];
const transformationmatrixDeltas = [];

for (const p of ourDecoded.project.plans) {
  for (const ourFrame of p.frames) {
    const refFrame = refFramesByName.get(ourFrame.name);
    if (!refFrame) continue;

    // Compare per-stick outline corners.
    const refSticksByName = new Map();
    for (const s of refFrame.sticks) refSticksByName.set(s.name, s);

    for (const ourStick of ourFrame.sticks) {
      const refStick = refSticksByName.get(ourStick.name);
      if (!refStick || !refStick.outlineCorners || !ourStick.outlineCorners) continue;
      totalSticksCompared++;

      // Sort each side by (x, y) for canonical compare (Detailer's order may
      // differ from ours by rotation, but the SET of corners must match).
      const ourC = canonOrder(ourStick.outlineCorners);
      const refC = canonOrder(refStick.outlineCorners);

      let worst = 0;
      for (let i = 0; i < 4; i++) {
        const dx = Math.abs(ourC[i].x - refC[i].x);
        const dy = Math.abs(ourC[i].y - refC[i].y);
        worst = Math.max(worst, dx, dy);
      }

      if (worst <= TOLERANCE) {
        totalSticksWithinTolerance++;
      } else {
        offenders.push({
          frame: ourFrame.name, stick: ourStick.name, worst,
          ours: ourC, ref: refC,
        });
      }
    }
  }
}

function canonOrder(corners) {
  return corners.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
}

// ---------------------------------------------------------------------------
// 5. Report.
// ---------------------------------------------------------------------------

console.log(`Sticks compared: ${totalSticksCompared}`);
console.log(`Within ±${TOLERANCE}mm: ${totalSticksWithinTolerance}`);
console.log(`Outside tolerance: ${offenders.length}`);

if (offenders.length > 0) {
  console.log("");
  console.log("Top 20 offenders:");
  offenders.sort((a, b) => b.worst - a.worst);
  for (const o of offenders.slice(0, 20)) {
    console.log(`  ${o.frame}/${o.stick}: worst Δ ${o.worst.toFixed(4)}mm`);
    console.log(`    ours: ${JSON.stringify(o.ours)}`);
    console.log(`    ref : ${JSON.stringify(o.ref)}`);
  }
}

const passed = offenders.length === 0 && totalSticksCompared > 0;
console.log("");
console.log(passed ? "✓ PASS" : "✗ FAIL");
process.exit(passed ? 0 : 1);
