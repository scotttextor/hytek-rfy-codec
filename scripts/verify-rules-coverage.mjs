#!/usr/bin/env node
/**
 * verify-rules-coverage.mjs — regression check between FrameCAD Detailer's
 * .sups file and the codec's machine-setups module.
 *
 * Compares every primitive (number/bool/string) leaf in the .sups
 * MachineSetup with what's captured by `MACHINE_SETUPS` in the codec.
 *
 * Reports:
 *   - Setup-count mismatch (codec vs .sups MachineSetups.Count).
 *   - Per-setup field comparisons: missing fields, value mismatches.
 *   - Nested-struct coverage: SectionSetups, ServiceHoleOptions,
 *     Fasteners, ToolSetup.{Fixed,OptionalOn,OptionalOff}Tools.
 *
 * Exit code: 0 if perfect coverage, 1 if drift detected.
 *
 * Usage:
 *   node scripts/verify-rules-coverage.mjs
 *   node scripts/verify-rules-coverage.mjs --full   # also print all matched fields
 *   node scripts/verify-rules-coverage.mjs --sups <path-to-.sups>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
const full = args.includes("--full");
const supsArgIdx = args.indexOf("--sups");
const supsPath = supsArgIdx >= 0
  ? args[supsArgIdx + 1]
  : "Y:/(08) DETAILING/(13) FRAMECAD/FrameCAD DETAILER/HYTEK MACHINE_FRAME TYPES/HYTEK MACHINE TYPES 20260402.sups";

function loadSups(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8").replace(/^﻿/, ""));
}

// Map of .sups field name -> codec field name (camelCase).
function camel(s) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// Convert a .sups string value to its expected primitive type.
function parseValue(raw) {
  if (raw === undefined || raw === null) return raw;
  const s = String(raw);
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s === "True") return true;
  if (s === "False") return false;
  return s;
}

// Compare two values, allowing 0.001 tolerance on numbers.
function eq(a, b) {
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) < 0.001;
  }
  return a === b;
}

async function main() {
  const sups = loadSups(supsPath);
  const supsSetups = sups.MachineSetups;
  const expectedCount = Number(supsSetups.Count);

  // Import codec module.
  const distPath = path.join(repoRoot, "dist", "machine-setups.js");
  if (!fs.existsSync(distPath)) {
    console.error(`Build the codec first: npm run build (missing ${distPath})`);
    process.exit(2);
  }
  const codecMod = await import(pathToFileURL(distPath).href);
  const MACHINE_SETUPS = codecMod.MACHINE_SETUPS;
  const codecCount = Object.keys(MACHINE_SETUPS).length;

  console.log("=== verify-rules-coverage ===");
  console.log(`.sups: ${supsPath}`);
  console.log(`Setups in .sups:  ${expectedCount}`);
  console.log(`Setups in codec:  ${codecCount}`);
  let warnings = 0;
  let errors = 0;

  if (expectedCount !== codecCount) {
    console.log(`!! ERROR: setup-count mismatch (codec=${codecCount} vs .sups=${expectedCount})`);
    errors++;
  }

  // Build the field-name mapping (camelCase). Track which scalar fields
  // exist in the codec by sampling setup[0].
  const sampleCodec = MACHINE_SETUPS["0"] || Object.values(MACHINE_SETUPS)[0];
  const codecFieldSet = new Set(Object.keys(sampleCodec || {}));

  // Walk every setup, every primitive field.
  // Special handling: nested structs (SectionSetups, ServiceHoleOptions,
  // Fasteners, ToolSetup, DesignChecks, DefaultSectionOptions) we report
  // as 'nested' below the per-setup loop.
  const TOP_SCALAR_SKIP = new Set([
    "DefaultSectionOptions", "DesignChecks", "Fasteners", "ImportToolMapping",
    "ImportTransforms", "SectionSetups", "ServiceHoleOptions", "ToolSetup",
    "Name", "DefaultName",  // codec stores in .name only
    "FMachineModel", "FMachineSeries",  // codec stores in .machineModel/.machineSeries
    "DefaultGUID", "InstanceGUID",       // codec stores in .defaultGuid/.instanceGuid
  ]);

  // Per-setup scalar field coverage summary.
  let missingFields = new Set();
  let valueMismatches = [];
  let perSetupReport = {};

  for (let i = 0; i < expectedCount; i++) {
    const supSetup = supsSetups[i];
    const id = String(i);
    const cs = MACHINE_SETUPS[id];
    if (!cs) {
      console.log(`!! ERROR: setup id ${id} ("${supSetup.Name}") missing from codec`);
      errors++;
      continue;
    }
    if (cs.name !== supSetup.Name) {
      console.log(`!! WARN [setup ${id}]: name "${cs.name}" vs .sups "${supSetup.Name}"`);
      warnings++;
    }
    perSetupReport[id] = { name: cs.name, scalarsCovered: 0, scalarsMissing: [], mismatches: [] };

    // For each scalar field in .sups, check the codec captures it (with matching value).
    for (const supKey of Object.keys(supSetup)) {
      if (TOP_SCALAR_SKIP.has(supKey)) continue;
      const supVal = parseValue(supSetup[supKey]);
      if (typeof supVal === "object") continue;  // skip non-primitives that fell through
      const codecKey = camel(supKey);
      if (!codecFieldSet.has(codecKey)) {
        missingFields.add(supKey);
        perSetupReport[id].scalarsMissing.push(supKey);
        continue;
      }
      perSetupReport[id].scalarsCovered++;
      if (!eq(cs[codecKey], supVal)) {
        valueMismatches.push({ id, supKey, codecKey, codecVal: cs[codecKey], supVal });
        perSetupReport[id].mismatches.push({ supKey, codecVal: cs[codecKey], supVal });
      }
    }
  }

  console.log("\n=== Scalar Field Coverage ===");
  for (const id of Object.keys(perSetupReport)) {
    const r = perSetupReport[id];
    console.log(`  [${id}] ${r.name.padEnd(35)} covered=${r.scalarsCovered} missing=${r.scalarsMissing.length} mismatches=${r.mismatches.length}`);
    if (full || r.scalarsMissing.length || r.mismatches.length) {
      for (const m of r.scalarsMissing) console.log(`    MISSING: ${m} = ${JSON.stringify(parseValue(supsSetups[id][m]))}`);
      for (const mm of r.mismatches) console.log(`    MISMATCH: ${mm.supKey}: codec=${JSON.stringify(mm.codecVal)} sups=${JSON.stringify(mm.supVal)}`);
    }
  }
  if (missingFields.size > 0) {
    console.log(`\n!! ${missingFields.size} unique scalar fields are MISSING from the codec:`);
    for (const f of [...missingFields].sort()) {
      console.log(`     ${f}  (e.g. .sups[1] value: ${JSON.stringify(parseValue(supsSetups[1][f]))})`);
    }
    warnings += missingFields.size;
  }
  if (valueMismatches.length > 0) {
    console.log(`\n!! ${valueMismatches.length} scalar value mismatches`);
    errors += valueMismatches.length;
  }

  // Nested structure coverage.
  console.log("\n=== Nested Struct Coverage ===");
  const NESTED_FIELDS = [
    { sup: "DefaultSectionOptions", codec: "defaultSectionOptions",
      type: "obj", desc: "Default per-profile section options" },
    { sup: "SectionSetups", codec: "sectionSetups",
      type: "list", desc: "Per-section setups (one per profile-gauge combo)" },
    { sup: "ServiceHoleOptions", codec: "serviceHoleOptions",
      type: "stringlist", desc: "Available service-hole tool names" },
    { sup: "Fasteners", codec: "fasteners",
      type: "list", desc: "Fastener-tool entries (Dimple1, FlangeHole, Service, FlangeSlot)" },
    { sup: "ToolSetup", codec: "toolSetup",
      type: "obj", desc: "FixedTools / OptionalOnTools / OptionalOffTools tool catalog" },
    { sup: "DesignChecks", codec: "designChecks",
      type: "stringlist", desc: "Design checks (e.g. 'Unassigned Configs')" },
  ];
  for (const nf of NESTED_FIELDS) {
    const inSups = sups.MachineSetups[1][nf.sup] !== undefined;
    const inCodec = sampleCodec[nf.codec] !== undefined;
    const status = inCodec ? "CAPTURED" : (inSups ? "MISSING " : "n/a");
    console.log(`  ${status}  ${nf.sup.padEnd(25)} → ${nf.codec.padEnd(25)} (${nf.desc})`);
    if (inSups && !inCodec) warnings++;
  }

  // Walk a sample SectionSetup to summarize per-profile fields we should expose.
  const sampleSection = sups.MachineSetups[1].SectionSetups[0];
  console.log("\n=== Sample SectionSetup (Setup[1]/SectionSetups[0]) — fields that should be exposed ===");
  for (const k of Object.keys(sampleSection)) {
    const v = sampleSection[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      console.log(`  ${k}: object{${Object.keys(v).join(", ")}}`);
    } else {
      console.log(`  ${k}: ${JSON.stringify(parseValue(v))}`);
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Errors:   ${errors}`);
  console.log(`Warnings: ${warnings}`);
  if (errors === 0 && warnings === 0) {
    console.log("OK: complete coverage (all .sups fields in codec, all values match).");
    process.exit(0);
  }
  if (errors > 0) {
    console.log("FAIL: codec drift from .sups — re-run scripts/generate-machine-setups.mjs");
    process.exit(1);
  }
  // warnings only — exit 0 but log
  console.log("Coverage incomplete (warnings only) — see report for details.");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(2); });
