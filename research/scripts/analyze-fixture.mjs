// Analyse the local decrypted XML fixture to get an early read on
// Detailer's rules — useful while the big Y: scan completes.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeXml } from "../../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, "..", "output");
if (!existsSync(OUTPUT)) mkdirSync(OUTPUT, { recursive: true });

const TOOL_TO_CSV = {
  Bolt: "BOLT HOLES", Chamfer: "FULL CHAMFER", InnerDimple: "INNER DIMPLE",
  InnerNotch: "WEB NOTCH", InnerService: "SERVICE HOLE",
  LeftFlange: "LIP NOTCH", LeftPartialFlange: "LIP NOTCH", LipNotch: "LIP NOTCH",
  RightFlange: "LIP NOTCH", RightPartialFlange: "LIP NOTCH",
  ScrewHoles: "ANCHOR", Swage: "SWAGE",
  TrussChamfer: "FULL CHAMFER", Web: "WEB NOTCH",
};

function lengthBucket(mm) {
  if (mm <= 500) return "<=500";
  if (mm <= 1500) return "500-1500";
  if (mm <= 3000) return "1500-3000";
  if (mm <= 6000) return "3000-6000";
  return ">6000";
}
function profileFamily(profile) { return profile.replace(/_[0-9.]+$/, ""); }

const xml = readFileSync(join(__dirname, "..", "..", "test", "fixtures", "HG260001_LOT289_decrypted.xml"), "utf8");
const doc = decodeXml(xml);
console.log(`Fixture: ${doc.project.name} (job ${doc.project.jobNum})`);
console.log(`${doc.project.plans.length} plans`);

const rows = [];
for (const plan of doc.project.plans) {
  for (const frame of plan.frames) {
    for (const stick of frame.sticks) {
      const profile = stick.profile?.metricLabel
        ? `${stick.profile.metricLabel.replace(/\s/g, "")}_${stick.profile.gauge}`
        : "unknown";
      const role = (stick.name ?? "").replace(/[0-9_].*$/, "") || stick.type;
      const ops = stick.tooling ?? [];
      ops.forEach((op, idx) => {
        let pos = 0, endPos = 0;
        if (op.kind === "point") { pos = op.pos; endPos = op.pos; }
        else if (op.kind === "spanned") { pos = op.startPos; endPos = op.endPos; }
        else if (op.kind === "start") { pos = 0; endPos = 0; }
        else if (op.kind === "end") { pos = stick.length; endPos = stick.length; }
        rows.push({
          planName: plan.name, frameName: frame.name,
          frameLength: frame.length, frameHeight: frame.height,
          stickName: stick.name, role, type: stick.type,
          length: stick.length, lengthBucket: lengthBucket(stick.length),
          profile, profileFamily: profileFamily(profile),
          flipped: stick.flipped,
          opIndex: idx, totalOps: ops.length,
          opType: TOOL_TO_CSV[op.type] ?? op.type,
          opRawType: op.type,
          opKind: op.kind,
          opPos: pos, opEndPos: endPos,
          opFromEnd: stick.length - pos,
        });
      });
    }
  }
}

// Group by role × profileFamily × lengthBucket
const groups = new Map();
for (const r of rows) {
  const k = `${r.role}|${r.profileFamily}|${r.lengthBucket}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

const summary = [`# Fixture analysis: ${doc.project.jobNum}  ·  ${rows.length} ops total`];
summary.push(`# Groups: ${groups.size}`);
summary.push("");

const sortedGroups = [...groups.entries()].sort((a,b)=>b[1].length - a[1].length);
for (const [key, gRows] of sortedGroups) {
  const [role, profileFamily, lengthBucket] = key.split("|");
  // Unique sticks in this group
  const sticks = new Set(gRows.map(r => `${r.planName}|${r.frameName}|${r.stickName}`));
  summary.push(`## ${role} on ${profileFamily} — ${lengthBucket}  (${sticks.size} sticks, ${gRows.length} ops)`);

  // Op tally
  const opTally = {};
  for (const r of gRows) {
    const k = r.opType;
    if (!opTally[k]) opTally[k] = [];
    opTally[k].push(r);
  }
  for (const [opType, opRows] of Object.entries(opTally).sort((a,b)=>b[1].length - a[1].length)) {
    const sticksWith = new Set(opRows.map(r => `${r.planName}|${r.frameName}|${r.stickName}`));
    const freq = sticksWith.size / sticks.size;
    const conf = freq >= 0.9 ? "HIGH" : freq >= 0.5 ? "MED" : freq >= 0.1 ? "LOW" : "NOISE";
    const positions = opRows.map(r => r.opPos).sort((a,b)=>a-b);
    const fromEnd = opRows.map(r => r.opFromEnd).sort((a,b)=>a-b);
    const rawTypes = {};
    for (const r of opRows) rawTypes[r.opRawType] = (rawTypes[r.opRawType] || 0) + 1;
    const kinds = {};
    for (const r of opRows) kinds[r.opKind] = (kinds[r.opKind] || 0) + 1;
    summary.push(`  ${conf.padEnd(5)} ${opType.padEnd(15)} ${(freq*100).toFixed(0).padStart(3)}% (${sticksWith.size}/${sticks.size}), avg ${(opRows.length/sticksWith.size).toFixed(1)}/stick`);
    summary.push(`         raw=${JSON.stringify(rawTypes)} kinds=${JSON.stringify(kinds)}`);
    summary.push(`         pos: median=${positions[Math.floor(positions.length/2)].toFixed(0)}mm  range=${positions[0].toFixed(0)}-${positions[positions.length-1].toFixed(0)}`);
    summary.push(`         from-end: median=${fromEnd[Math.floor(fromEnd.length/2)].toFixed(0)}mm  range=${fromEnd[0].toFixed(0)}-${fromEnd[fromEnd.length-1].toFixed(0)}`);
    // Per-stick op-count distribution (e.g. how many INNER DIMPLE per stick?)
    const perStick = {};
    for (const r of opRows) {
      const k = `${r.planName}|${r.frameName}|${r.stickName}`;
      perStick[k] = (perStick[k] || 0) + 1;
    }
    const counts = Object.values(perStick).sort((a,b)=>a-b);
    summary.push(`         per-stick counts: min=${counts[0]}, median=${counts[Math.floor(counts.length/2)]}, max=${counts[counts.length-1]}`);
  }
  summary.push("");
}

writeFileSync(join(OUTPUT, "fixture-analysis.txt"), summary.join("\n"));
console.log(`Wrote: research/output/fixture-analysis.txt (${summary.length} lines)`);

// Also write a flat CSV of every op
const csv = ["planName,frameName,stickName,role,type,length,lengthBucket,profile,profileFamily,flipped,opIndex,totalOps,opType,opRawType,opKind,opPos,opEndPos,opFromEnd"];
for (const r of rows) {
  csv.push([r.planName, r.frameName, r.stickName, r.role, r.type, r.length, r.lengthBucket, r.profile, r.profileFamily, r.flipped, r.opIndex, r.totalOps, r.opType, r.opRawType, r.opKind, r.opPos, r.opEndPos, r.opFromEnd].map(v => JSON.stringify(v ?? "")).join(","));
}
writeFileSync(join(OUTPUT, "fixture-ops.csv"), csv.join("\n"));
console.log(`Wrote: research/output/fixture-ops.csv (${rows.length} rows)`);
