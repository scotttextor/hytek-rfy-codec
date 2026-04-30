#!/usr/bin/env node
/**
 * Generate src/machine-setups.ts from HYTEK's .sups export.
 *
 * Input:  HYTEK-MACHINE-TYPES.json (UTF-8 BOM JSON exported from FrameCAD Detailer)
 * Output: src/machine-setups.ts (typed constants used by the synthesiser)
 *
 * Re-run whenever HYTEK updates their machine setup file. Source of truth lives
 * on Y:\(08) DETAILING\(13) FRAMECAD\FrameCAD DETAILER\HYTEK MACHINE_FRAME TYPES\
 *
 * Usage:
 *   node scripts/generate-machine-setups.mjs <input-json-path>
 */
import fs from "node:fs";
import path from "node:path";

const INPUT = process.argv[2]
  ?? "C:/Users/Scott/CLAUDE CODE/HYTEK-MACHINE-TYPES.json";
const OUT = "src/machine-setups.ts";

const raw = fs.readFileSync(INPUT, "utf8").replace(/^﻿/, "");
const parsed = JSON.parse(raw);

// Fields we care about for tooling generation. Add more as the codec needs them.
const NUM_FIELDS = [
  "ChamferTolerance", "BraceToDimple", "BraceToWebhole", "ToolClearance",
  "DimpleToEnd", "BoltHoleToEnd", "WebHoleToEnd", "B2BStickClearance",
  "BoxedEndLength", "BoxedFirstDimpleOffset", "BoxDimpleSpacing",
  "DoorSillNotchOffset", "DoubleBoltSpacing", "EndClearance",
  "EndToTabDistance", "ExtraFlangeHoleOffset", "ExtraFlangeHoleOffsetAt90",
  "FPlateWidthDifferential", "FlangeSlotHeight",
  "LargeServiceToLeadingEdgeDistance", "LargeServiceToTrailingEdgeDistance",
  "MaxBoxToBoxHoleDelta", "MaxSplicingLength", "MinimumTagLength",
  "SplicingDimpleSpacing", "TabToTabDistance", "Web2Web",
];
const BOOL_FIELDS = [
  "BraceAsStud", "ExtraChamfers", "EndToEndChamfers", "FDualSection",
  "FixedWeb2Web", "InvertDimpleFlangeFastenings", "OnEdgeLipNotches",
  "OnFlySwage", "SuppressFasteners", "UseMaleFemaleDimples",
];

function toBool(s) { return String(s).toLowerCase() === "true"; }
function toNum(s) { return Number(s); }

// Convert each setup
const setups = [];
for (const id of Object.keys(parsed.MachineSetups).filter(k => k !== "Count")) {
  const s = parsed.MachineSetups[id];
  const setup = {
    id,
    name: s.Name,
    machineModel: s.FMachineModel,
    machineSeries: s.FMachineSeries,
    defaultGuid: s.DefaultGUID,
    instanceGuid: s.InstanceGUID,
  };
  for (const f of NUM_FIELDS) setup[f.charAt(0).toLowerCase() + f.slice(1)] = toNum(s[f]);
  for (const f of BOOL_FIELDS) setup[f.charAt(0).toLowerCase() + f.slice(1)] = toBool(s[f]);
  // Chamfer geometry (3-5 (x,y) points)
  const chamferPoints = (key) => {
    const obj = s.ToolSetup?.[key];
    if (!obj) return [];
    return Object.keys(obj)
      .filter(k => /^\d+$/.test(k))
      .map(k => ({ x: toNum(obj[k].X), y: toNum(obj[k].Y) }));
  };
  setup.chamferDetail = chamferPoints("ChamferDetail");
  setup.trussChamferDetail = chamferPoints("TrussChamferDetail");
  setup.webChamferDetail = chamferPoints("WebChamferDetail");
  setups.push(setup);
}

// Profile-web → setup ID mapping. Pick the simplest (non-B2B/LINEAR/PERTH) variant.
const setupByWeb = {};
for (const s of setups) {
  const m = s.name.match(/(\d+)\s*mm/);
  if (!m) continue;
  const web = parseInt(m[1], 10);
  const isSpecial = /B2B|LINEAR|PERTH/i.test(s.name);
  if (!setupByWeb[web] || (setupByWeb[web].special && !isSpecial)) {
    setupByWeb[web] = { id: s.id, special: isSpecial };
  }
}

// Generate TypeScript
const banner = `/**
 * HYTEK FrameCAD Detailer machine setups — AUTO-GENERATED from
 * HYTEK MACHINE TYPES *.sups (master copy on Y:\\\\(08) DETAILING\\\\(13)
 * FRAMECAD\\\\FrameCAD DETAILER\\\\HYTEK MACHINE_FRAME TYPES\\\\).
 *
 * DO NOT EDIT BY HAND. Regenerate with:
 *   node scripts/generate-machine-setups.mjs <input-json>
 *
 * Source: HYTEK MACHINE TYPES 20260402.sups
 * Generated: ${new Date().toISOString()}
 */

export interface ChamferPoint { x: number; y: number; }

export interface MachineSetup {
  id: string;
  name: string;
  machineModel: string;
  machineSeries: string;
  defaultGuid: string;
  instanceGuid: string;

  // Tolerances/clearances (mm)
  chamferTolerance: number;
  braceToDimple: number;
  braceToWebhole: number;
  toolClearance: number;
  dimpleToEnd: number;
  boltHoleToEnd: number;
  webHoleToEnd: number;
  b2BStickClearance: number;
  boxedEndLength: number;
  boxedFirstDimpleOffset: number;
  boxDimpleSpacing: number;
  doorSillNotchOffset: number;
  doubleBoltSpacing: number;
  endClearance: number;
  endToTabDistance: number;
  extraFlangeHoleOffset: number;
  extraFlangeHoleOffsetAt90: number;
  fPlateWidthDifferential: number;
  flangeSlotHeight: number;
  largeServiceToLeadingEdgeDistance: number;
  largeServiceToTrailingEdgeDistance: number;
  maxBoxToBoxHoleDelta: number;
  maxSplicingLength: number;
  minimumTagLength: number;
  splicingDimpleSpacing: number;
  tabToTabDistance: number;
  web2Web: number;

  // Boolean flags
  braceAsStud: boolean;
  extraChamfers: boolean;
  endToEndChamfers: boolean;
  fDualSection: boolean;
  fixedWeb2Web: boolean;
  invertDimpleFlangeFastenings: boolean;
  onEdgeLipNotches: boolean;
  onFlySwage: boolean;
  suppressFasteners: boolean;
  useMaleFemaleDimples: boolean;

  // Chamfer geometry: (x,y) points defining the cut shape
  chamferDetail: ChamferPoint[];        // standard chamfer triangle
  trussChamferDetail: ChamferPoint[];   // larger truss-end chamfer
  webChamferDetail: ChamferPoint[];     // web-crossing chamfer
}

export const MACHINE_SETUPS: Record<string, MachineSetup> = ${JSON.stringify(
  Object.fromEntries(setups.map(s => [s.id, s])),
  null, 2
)};

/**
 * Map profile web (in mm) to the simplest non-special HYTEK setup.
 * For 70S41 input, returns setup ID "2" (F325iT 70mm).
 */
export const SETUP_BY_PROFILE_WEB: Record<number, string> = ${JSON.stringify(
  Object.fromEntries(Object.entries(setupByWeb).map(([w, v]) => [w, v.id])),
  null, 2
)};

/**
 * Look up the appropriate machine setup for a stick's profile.
 *
 * @param profileWeb - Web depth in mm (e.g. 70 for 70S41 profile)
 * @returns MachineSetup or undefined if no match
 */
export function getMachineSetupForProfile(profileWeb: number): MachineSetup | undefined {
  const id = SETUP_BY_PROFILE_WEB[profileWeb];
  return id ? MACHINE_SETUPS[id] : undefined;
}

/**
 * Default fallback setup — used if the profile web doesn't match any HYTEK
 * configured machine. Returns the F325iT 70mm setup (most common LBW profile).
 */
export function getDefaultMachineSetup(): MachineSetup {
  return MACHINE_SETUPS["2"] ?? Object.values(MACHINE_SETUPS)[0];
}
`;

fs.writeFileSync(OUT, banner);
console.log(`Generated: ${OUT}`);
console.log(`Setups: ${setups.length} (${Object.keys(setupByWeb).length} unique profile webs)`);
console.log("Profile mapping:");
for (const [web, info] of Object.entries(setupByWeb)) {
  console.log(`  ${web}mm -> setup [${info.id}] ${setups.find(s => s.id === info.id).name}`);
}
