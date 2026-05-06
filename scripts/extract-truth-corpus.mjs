#!/usr/bin/env node
/**
 * For every (XML, ref-RFY) pair in y-drive-pairs.json:
 *   - parse the XML to extract sticks with input context
 *   - decode the RFY to extract Detailer's actual per-stick ops
 *   - match sticks between the two by (frame.name, stick.name, occurrence)
 *   - emit one JSONL record per matched stick:
 *       {
 *         pair_id: "HG260017__GF-LBW-70.075",
 *         plan_type: "LBW", profile: "70.075",
 *         frame_name: "L4-1", frame_type: "Wall",
 *         stick_name: "T1", occurrence: 0,
 *         role: "T", length_mm: 4108.5,
 *         start3D: {x,y,z}, end3D: {x,y,z},
 *         neighbours: ["B1","W1","W2","H1"],
 *         openings: [...], usage: "topplate",
 *         tooling: [
 *           { kind: "point", type: "Web", pos: 234.56 },
 *           { kind: "spanned", type: "Swage", startPos: 0, endPos: 1234 },
 *           ...
 *         ]
 *       }
 *
 * The output JSONL is the canonical "truth corpus" used by:
 *   - the new lookup-based codec layer
 *   - parity diff harnesses
 *   - eventual learned engine
 *
 * Usage:
 *   npm run build
 *   node scripts/extract-truth-corpus.mjs [--limit N] [--out FILE] [--pairs FILE]
 */
import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import { decode } from "../dist/decode.js";

const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
}

const PAIRS_FILE = flag("--pairs", "scripts/y-drive-pairs.json");
const OUT_FILE = flag("--out", "scripts/truth-corpus.jsonl");
const LIMIT = parseInt(flag("--limit", "0"), 10) || Infinity;

const pairsBundle = JSON.parse(fs.readFileSync(PAIRS_FILE, "utf-8"));
const pairs = pairsBundle.pairs;
console.log(`Loaded ${pairs.length} pairs from ${PAIRS_FILE}`);
const work = pairs.slice(0, LIMIT);
console.log(`Processing ${work.length} (LIMIT=${LIMIT === Infinity ? "all" : LIMIT})`);

// Streaming JSONL output
const out = fs.createWriteStream(OUT_FILE, { flags: "w" });
let recordsWritten = 0;
let pairsOk = 0;
let pairsFailed = 0;
const failures = [];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseAttributeValue: false,
});

function parseTriple(t) {
  const n = String(t).trim().split(/[ ,\t]+/).map(Number);
  return { x: n[0] || 0, y: n[1] || 0, z: n[2] || 0 };
}
function distance3D(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}
function profileCode(web, l, r, gauge) {
  return `${web}S${Math.round(Math.max(l, r))}_${Number(gauge).toFixed(2)}`;
}
function roleForUsage(usage, type, name) {
  const prefix = (name || "").replace(/[0-9_].*$/, "");
  if (prefix === "Kb" || prefix === "W") return prefix;
  const u = (usage || "").toLowerCase();
  if (u === "web") return "W";
  if (u === "topplate") return "T";
  if (u === "bottomplate") return "B";
  if (u === "raisedbottomplate") return "Bh";
  if (u === "topchord") return "T";
  if (u === "bottomchord") return "B";
  if (u === "headplate" || u === "head") return "H";
  if (u === "nog" || u === "noggin") return "N";
  if (u === "endstud" || u === "stud") return "S";
  if (u === "jackstud" || u === "trimstud") return "J";
  if (u === "brace") return "Br";
  return prefix || (type === "plate" ? "T" : "S");
}

function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

/**
 * Parse a framecad_import XML and extract a list of sticks with input context.
 * Returns: { plans: [{ name, frames: [{ name, type, sticks: [...] }] }] }
 */
function extractInputSticks(xmlText) {
  const doc = parser.parse(xmlText);
  const root = doc.framecad_import || doc;
  const plans = asArray(root.plan);
  const out = [];
  for (const p of plans) {
    const planName = String(p["@_name"] ?? "PLAN");
    const frames = asArray(p.frame);
    for (const f of frames) {
      const frameName = String(f["@_name"] ?? "");
      const frameType = String(f["@_type"] ?? "");
      // The XML uses <stick> child elements (not <member>); start/end/profile
      // are NESTED elements with text content, not attributes.
      const sticks = asArray(f.stick);
      const enriched = [];
      for (const m of sticks) {
        const start = parseTriple(m.start ?? "");
        const end = parseTriple(m.end ?? "");
        const len = distance3D(start, end);
        const usage = String(m["@_usage"] ?? "");
        const type = String(m["@_type"] ?? "");
        const name = String(m["@_name"] ?? "");
        const prof = m.profile ?? {};
        const web = Number(prof["@_web"] ?? 0);
        const lflange = Number(prof["@_l_flange"] ?? prof["@_lflange"] ?? 0);
        const rflange = Number(prof["@_r_flange"] ?? prof["@_rflange"] ?? 0);
        const gauge = Number(m["@_gauge"] ?? prof["@_gauge"] ?? prof["@_thickness"] ?? 1.0);
        enriched.push({
          name,
          type,
          usage,
          role: roleForUsage(usage, type, name),
          length_mm: Math.round(len * 100) / 100,
          start3D: start,
          end3D: end,
          profile: profileCode(web, lflange, rflange, gauge),
          web,
          lflange,
          rflange,
          gauge,
        });
      }
      // Compute neighbours by simple position proximity (within stick-length tolerance)
      for (const s of enriched) {
        const neighbours = [];
        for (const o of enriched) {
          if (o.name === s.name) continue;
          const d = Math.min(
            distance3D(s.start3D, o.start3D),
            distance3D(s.start3D, o.end3D),
            distance3D(s.end3D, o.start3D),
            distance3D(s.end3D, o.end3D),
          );
          if (d < 50) neighbours.push(o.name);
        }
        s.neighbours = neighbours;
      }
      out.push({ plan_name: planName, frame_name: frameName, frame_type: frameType, sticks: enriched });
    }
  }
  return out;
}

function extractRefOps(rfyBytes) {
  const refDoc = decode(rfyBytes);
  // Build map: (planName, frameName, stickName, occurrence) -> tooling
  const refMap = new Map();
  for (const plan of refDoc.project.plans) {
    const planName = String(plan.name).replace(/^(PK\d+-|PLAN\d*-|P\d+-)/i, "");
    for (const frame of plan.frames) {
      const occ = new Map();
      for (const stick of frame.sticks) {
        const o = occ.get(stick.name) ?? 0;
        occ.set(stick.name, o + 1);
        const key = `${planName}|${frame.name}|${stick.name}#${o}`;
        refMap.set(key, {
          plan_name: planName,
          frame_name: frame.name,
          stick_name: stick.name,
          occurrence: o,
          length_mm: stick.length,
          tooling: stick.tooling.map((op) => {
            if (op.kind === "point") return { kind: "point", type: op.type, pos: Math.round(op.pos * 100) / 100 };
            if (op.kind === "spanned")
              return { kind: "spanned", type: op.type, startPos: Math.round(op.startPos * 100) / 100, endPos: Math.round(op.endPos * 100) / 100 };
            if (op.kind === "start") return { kind: "start", type: op.type };
            if (op.kind === "end") return { kind: "end", type: op.type };
            return op;
          }),
        });
      }
    }
  }
  return refMap;
}

const t0 = Date.now();
let i = 0;
for (const pair of work) {
  i++;
  const id = `${pair.jobnum}__${pair.plan_name}`;
  process.stdout.write(`[${i}/${work.length}] ${id} ... `);
  try {
    const xmlText = fs.readFileSync(pair.xml, "utf-8");
    const inputs = extractInputSticks(xmlText);
    const rfyBytes = fs.readFileSync(pair.rfy);
    const refMap = extractRefOps(rfyBytes);

    // Match input sticks to ref ops by (plan, frame, stick, occurrence)
    let matched = 0, unmatched = 0;
    for (const frame of inputs) {
      const planNameNorm = String(frame.plan_name).replace(/^(PK\d+-|PLAN\d*-|P\d+-)/i, "");
      const occ = new Map();
      for (const s of frame.sticks) {
        const o = occ.get(s.name) ?? 0;
        occ.set(s.name, o + 1);
        const key = `${planNameNorm}|${frame.frame_name}|${s.name}#${o}`;
        const refEntry = refMap.get(key);
        if (!refEntry) {
          unmatched++;
          continue;
        }
        matched++;
        const record = {
          pair_id: id,
          jobnum: pair.jobnum,
          plan_name: pair.plan_name,
          plan_type: pair.plan_name.match(/-([A-Z0-9]+)-\d/)?.[1] ?? "?",
          profile: pair.plan_name.match(/-(\d+\.\d+)$/)?.[1] ?? "?",
          builder: pair.builder,
          year: pair.year,
          frame_name: frame.frame_name,
          frame_type: frame.frame_type,
          stick_name: s.name,
          occurrence: o,
          role: s.role,
          stick_profile: s.profile,
          length_mm: s.length_mm,
          start3D: s.start3D,
          end3D: s.end3D,
          neighbours: s.neighbours,
          usage: s.usage,
          // Detailer's ops for this stick
          tooling: refEntry.tooling,
          ref_length_mm: refEntry.length_mm,
        };
        out.write(JSON.stringify(record) + "\n");
        recordsWritten++;
      }
    }
    pairsOk++;
    console.log(`OK matched=${matched} unmatched=${unmatched}`);
  } catch (e) {
    pairsFailed++;
    failures.push({ id, error: String(e).slice(0, 300) });
    console.log(`FAIL: ${String(e).slice(0, 200)}`);
  }
}

out.end();
const elapsed = (Date.now() - t0) / 1000;
console.log(`\n=== DONE in ${elapsed.toFixed(1)}s ===`);
console.log(`Pairs OK:        ${pairsOk}`);
console.log(`Pairs FAIL:      ${pairsFailed}`);
console.log(`Records written: ${recordsWritten.toLocaleString()}`);
console.log(`Output:          ${OUT_FILE}`);

if (failures.length > 0) {
  fs.writeFileSync(OUT_FILE.replace(/\.jsonl$/, ".failures.json"), JSON.stringify(failures, null, 2));
  console.log(`Failures written to ${OUT_FILE.replace(/\.jsonl$/, ".failures.json")}`);
}
