// Analyse a single (framecad_import.xml, Detailer .rfy) pair.
// Usage: node analyze-pair.mjs <jobFolder>
//
// For each stick in Detailer's RFY, emits one CSV row with:
//   jobName, planName, frameName, stickName, type, profile, length,
//   opType, opPosition, opPositionFromEnd, opIndex, totalOpsOnStick
//
// This row-per-op format is what the corpus analyser aggregates.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { decode } from "../../dist/index.js";
import { XMLParser } from "fast-xml-parser";

const TOOL_TO_CSV = {
  Bolt: "BOLT HOLES",
  Chamfer: "FULL CHAMFER",
  InnerDimple: "INNER DIMPLE",
  InnerNotch: "WEB NOTCH",
  InnerService: "SERVICE HOLE",
  LeftFlange: "LIP NOTCH",
  LeftPartialFlange: "LIP NOTCH",
  LipNotch: "LIP NOTCH",
  RightFlange: "LIP NOTCH",
  RightPartialFlange: "LIP NOTCH",
  ScrewHoles: "ANCHOR",
  Swage: "SWAGE",
  TrussChamfer: "FULL CHAMFER",
  Web: "WEB NOTCH",
};

function lengthBucket(mm) {
  if (mm <= 500) return "<=500";
  if (mm <= 1500) return "500-1500";
  if (mm <= 3000) return "1500-3000";
  if (mm <= 6000) return "3000-6000";
  return ">6000";
}

function profileFamily(profile) {
  // 89S41_0.95 → 89S41 (drop gauge)
  return profile.replace(/_[0-9.]+$/, "");
}

function analyzeRfy(rfyBuf, jobName) {
  const doc = decode(rfyBuf);
  const rows = [];
  for (const plan of doc.project?.plans ?? []) {
    for (const frame of plan.frames ?? []) {
      for (const stick of frame.sticks ?? []) {
        const profile = stick.profile?.metricLabel
          ? `${stick.profile.metricLabel.replace(/\s/g, "")}_${stick.profile.gauge}`
          : "unknown";
        // Stick role lives in the name (Tp1, Bp1, S1, N1, B1, Kb1) — type is just stud/plate
        const role = (stick.name ?? "").replace(/[0-9_].*$/, "") || stick.type;
        const ops = (stick.tooling ?? []).filter(o => TOOL_TO_CSV[o.type]);
        const total = ops.length;
        const base = {
          jobName, planName: plan.name, frameName: frame.name, stickName: stick.name,
          type: stick.type, role, profile, profileFamily: profileFamily(profile),
          length: stick.length, lengthBucket: lengthBucket(stick.length),
          flipped: stick.flipped ?? false,
        };
        if (total === 0) {
          rows.push({
            ...base,
            opType: "(none)", opRawType: "", opKind: "", opPosition: 0,
            opPositionFromEnd: 0, opEndPosition: 0, opIndex: 0, totalOps: 0,
          });
          continue;
        }
        ops.forEach((op, i) => {
          // Tool position depends on kind: point=pos, spanned=startPos/endPos, start=0, end=length
          let pos = 0, endPos = 0;
          if (op.kind === "point") { pos = op.pos; endPos = op.pos; }
          else if (op.kind === "spanned") { pos = op.startPos; endPos = op.endPos; }
          else if (op.kind === "start") { pos = 0; endPos = 0; }
          else if (op.kind === "end") { pos = stick.length; endPos = stick.length; }
          rows.push({
            ...base,
            opType: TOOL_TO_CSV[op.type] ?? op.type,
            opRawType: op.type,
            opKind: op.kind,
            opPosition: pos,
            opPositionFromEnd: stick.length - pos,
            opEndPosition: endPos,
            opIndex: i,
            totalOps: total,
          });
        });
      }
    }
  }
  return rows;
}

function findRfys(jobFolder) {
  return readdirSync(jobFolder)
    .filter(f => f.toLowerCase().endsWith(".rfy"))
    .map(f => join(jobFolder, f));
}

function findXml(jobFolder) {
  const xmls = readdirSync(jobFolder)
    .filter(f => f.toLowerCase().endsWith(".xml"));
  if (xmls.length === 0) return null;
  // Prefer one named "framecad_import.xml" if present
  const framecad = xmls.find(f => f.toLowerCase().includes("framecad"));
  return join(jobFolder, framecad ?? xmls[0]);
}

export function analyzeJob(jobFolder) {
  const jobName = basename(jobFolder);
  const rfyPaths = findRfys(jobFolder);
  if (rfyPaths.length === 0) return [];
  const rows = [];
  for (const rfyPath of rfyPaths) {
    try {
      const rfyBuf = readFileSync(rfyPath);
      const stickRows = analyzeRfy(rfyBuf, jobName);
      // Tag with the source RFY filename for traceability
      stickRows.forEach(r => { r.sourceRfy = basename(rfyPath); });
      rows.push(...stickRows);
    } catch (e) {
      console.warn(`  ! Could not decode ${basename(rfyPath)}: ${e.message}`);
    }
  }
  return rows;
}

// CLI: analyse one job folder, write a per-job CSV
if (process.argv[1] && process.argv[1].endsWith("analyze-pair.mjs")) {
  const jobFolder = process.argv[2];
  if (!jobFolder) {
    console.error("Usage: node analyze-pair.mjs <jobFolder>");
    process.exit(1);
  }
  const rows = analyzeJob(jobFolder);
  console.log(`Job: ${basename(jobFolder)}`);
  console.log(`  Sticks analysed: ${new Set(rows.map(r => `${r.planName}|${r.frameName}|${r.stickName}`)).size}`);
  console.log(`  Op rows:         ${rows.length}`);
  if (rows.length > 0) {
    const types = [...new Set(rows.map(r => r.opType))].sort();
    console.log(`  Op types seen:   ${types.join(", ")}`);
  }
}
