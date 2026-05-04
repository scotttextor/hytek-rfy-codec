#!/usr/bin/env node
/**
 * Generate src/machine-setups.ts from HYTEK's .sups export.
 *
 * Input:  HYTEK-MACHINE-TYPES.json (UTF-8 BOM JSON exported from FrameCAD Detailer)
 *         OR a .sups file directly (auto-strips BOM).
 * Output: src/machine-setups.ts (typed constants used by the synthesiser)
 *
 * Re-run whenever HYTEK updates their machine setup file. Source of truth lives
 * on Y:\(08) DETAILING\(13) FRAMECAD\FrameCAD DETAILER\HYTEK MACHINE_FRAME TYPES\
 *
 * Usage:
 *   node scripts/generate-machine-setups.mjs <input-json-or-sups-path>
 *   node scripts/generate-machine-setups.mjs    # uses Y: master if accessible
 */
import fs from "node:fs";
import path from "node:path";

const DEFAULT_INPUT = "Y:/(08) DETAILING/(13) FRAMECAD/FrameCAD DETAILER/HYTEK MACHINE_FRAME TYPES/HYTEK MACHINE TYPES 20260402.sups";
const INPUT = process.argv[2] ?? DEFAULT_INPUT;
const OUT = "src/machine-setups.ts";

const raw = fs.readFileSync(INPUT, "utf8").replace(/^﻿/, "");
const parsed = JSON.parse(raw);

// Scalars at the MachineSetup root level. Add new entries as Detailer adds them.
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
// Enum-style strings (e.g. "ecrOutsideWeb", "b2bWebHole"). Detailer's source
// uses these to switch behaviour — codec needs them so rule logic can branch.
const STRING_FIELDS = [
  "EndClearanceReference",      // ecrOutsideWeb / ecrInsideFlange / ...
  "ExtraFlangeHoles",           // efhNone / efhSingle / efhDouble / ...
  "FB2BTooling",                // b2bWebHole / b2bSingleHole / b2bNone — controls B2B partner-stud Web ops
  "FastenerMating",             // fmNone / fmDimple / fmFlangeHole — Detailer's internal mating model
  "PlateBoxingPieceType",       // bptSelf / bptParent — what type the boxing piece is
  "StudBoxingPieceType",        // bptSelf / bptParent
];

function toBool(s) { return String(s).toLowerCase() === "true"; }
function toNum(s) { return Number(s); }
function toStr(s) { return String(s ?? ""); }

// --- Helpers for nested structs --------------------------------------------

/** Convert a .sups "Count"-keyed pseudo-list into a JS array. */
function toList(obj) {
  if (!obj) return [];
  const out = [];
  const keys = Object.keys(obj).filter(k => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
  for (const k of keys) out.push(obj[k]);
  return out;
}

/** Decode a "0,1,2,...,Count" structure where each numeric key is one
 * character of a string (Detailer serialises strings this way for some
 * collections, e.g. ServiceHoleOptions and DesignChecks). */
function decodeCharString(obj) {
  if (typeof obj === "string") return obj;
  if (!obj || typeof obj !== "object") return "";
  const chars = [];
  const keys = Object.keys(obj).filter(k => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
  for (const k of keys) chars.push(String(obj[k]));
  return chars.join("");
}

function chamferPoints(toolSetup, key) {
  const obj = toolSetup?.[key];
  if (!obj) return [];
  return Object.keys(obj)
    .filter(k => /^\d+$/.test(k))
    .map(Number).sort((a, b) => a - b)
    .map(k => ({ x: toNum(obj[k].X), y: toNum(obj[k].Y) }));
}

/** Map a tool entry from .sups to JS — typed via ToolEntry interface below. */
function mapTool(t) {
  return {
    fName: toStr(t.FName),
    drawStyle: toStr(t.DrawStyle),
    id: toNum(t.ID),
    length: toNum(t.Length),
    size1: toNum(t.Size1),
    size2: toNum(t.Size2),
  };
}

/** Map a Fastener entry from .sups: {ToolName, Condition}. */
function mapFastener(f) {
  return { toolName: toStr(f.ToolName), condition: toStr(f.Condition) };
}

/** Map a SectionOptions sub-object (per-section dimple/flange Y-positions). */
function mapSectionOptions(opt) {
  if (!opt) return undefined;
  return {
    boxable: toBool(opt.Boxable),
    deflectionTrackEndClearance: toNum(opt.DeflectionTrackEndClearance),
    deflectionTrackScrewHeight: toNum(opt.DeflectionTrackScrewHeight),
    dualFasteners: toBool(opt.DualFasteners),
    fastener1: toNum(opt.Fastener1),                  // Y-position of dimple from flange edge
    fastener1Name: toStr(opt.Fastener1Name),
    fastener2: toNum(opt.Fastener2),
    fastener2Name: toStr(opt.Fastener2Name),
    flangeBoltHoleHeight: toNum(opt.FlangeBoltHoleHeight),
    flangeHoleHeight: toNum(opt.FlangeHoleHeight),    // Y-position of flange hole
    innerBendRadius: toNum(opt.InnerBendRadius),
    automaticChamfer: toBool(opt.AutomaticChamfer),
    automaticCruciform: toBool(opt.AutomaticCruciform),
    tripleHoleSpacing: toNum(opt.TripleHoleSpacing),  // pitch between triple-hole pairs
  };
}

function mapProfile(p) {
  if (!p) return undefined;
  return {
    shapeClassification: toStr(p.ShapeClassification),
    leftFlange: toNum(p.LeftFlange),
    rightFlange: toNum(p.RightFlange),
    flangeLabel: toStr(p.FlangeLabel),
    web: toNum(p.Web),
    leftLip: toNum(p.LeftLip),
    rightLip: toNum(p.RightLip),
  };
}

function mapMaterial(m) {
  if (!m) return undefined;
  return {
    bmt: m.BMT ? { color: toStr(m.BMT.FColor), thickness: toNum(m.BMT.FThickness) } : undefined,
    coating: m.Coating ? { displayLabel: toStr(m.Coating.DisplayLabel), minMass: toNum(m.Coating.MinMass) } : undefined,
    steelSpec: toStr(m.SteelSpec),
    strength: m.Strength ? {
      displayLabel: toStr(m.Strength.DisplayLabel),
      elongation: toNum(m.Strength.Elongation),
      tensile: toNum(m.Strength.Tensile),
      yield: toNum(m.Strength.Yield),
    } : undefined,
  };
}

function mapSectionSetup(s) {
  return {
    automaticallyDetermineExportSection: toBool(s.AutomaticallyDetermineExportSection),
    guid: toStr(s.GUID),
    name: toStr(s.Name),
    manualRFYImperialLabel: toStr(s.ManualRFYImperialLabel),
    manualRFYMetricLabel: toStr(s.ManualRFYMetricLabel),
    manualSectionIDForRFX: toNum(s.ManualSectionIDForRFX),
    profile: mapProfile(s.Profile),
    material: mapMaterial(s.Material),
    sectionOptions: mapSectionOptions(s.SectionOptions),
  };
}

function mapToolSetup(ts) {
  if (!ts) return undefined;
  return {
    chamferDetail: chamferPoints(ts, "ChamferDetail"),
    trussChamferDetail: chamferPoints(ts, "TrussChamferDetail"),
    webChamferDetail: chamferPoints(ts, "WebChamferDetail"),
    fixedTools: toList(ts.FixedTools).map(mapTool),
    optionalOnTools: toList(ts.OptionalOnTools).map(mapTool),
    optionalOffTools: toList(ts.OptionalOffTools).map(mapTool),
  };
}

// --- Build setups list -----------------------------------------------------

const setups = [];
for (const id of Object.keys(parsed.MachineSetups).filter(k => k !== "Count")) {
  const s = parsed.MachineSetups[id];
  const setup = {
    id,
    name: toStr(s.Name),
    machineModel: toStr(s.FMachineModel),
    machineSeries: toStr(s.FMachineSeries),
    defaultGuid: toStr(s.DefaultGUID),
    instanceGuid: toStr(s.InstanceGUID),
  };
  for (const f of NUM_FIELDS) setup[f.charAt(0).toLowerCase() + f.slice(1)] = toNum(s[f]);
  for (const f of BOOL_FIELDS) setup[f.charAt(0).toLowerCase() + f.slice(1)] = toBool(s[f]);
  for (const f of STRING_FIELDS) setup[f.charAt(0).toLowerCase() + f.slice(1)] = toStr(s[f]);

  // Chamfer geometry (kept at top level for backward compat with v1 schema)
  setup.chamferDetail = chamferPoints(s.ToolSetup, "ChamferDetail");
  setup.trussChamferDetail = chamferPoints(s.ToolSetup, "TrussChamferDetail");
  setup.webChamferDetail = chamferPoints(s.ToolSetup, "WebChamferDetail");

  // Nested structures (NEW in 2026-05-04 — exposes Detailer's full rule database)
  setup.defaultSectionOptions = mapSectionOptions(s.DefaultSectionOptions);
  setup.sectionSetups = toList(s.SectionSetups).map(mapSectionSetup);
  setup.serviceHoleOptions = toList(s.ServiceHoleOptions).map(decodeCharString);
  setup.fasteners = toList(s.Fasteners).map(mapFastener);
  setup.toolSetup = mapToolSetup(s.ToolSetup);
  setup.designChecks = toList(s.DesignChecks).map(decodeCharString);

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

// --- Generate TypeScript ---------------------------------------------------

const banner = `/**
 * HYTEK FrameCAD Detailer machine setups — AUTO-GENERATED from
 * HYTEK MACHINE TYPES *.sups (master copy on Y:\\\\(08) DETAILING\\\\(13)
 * FRAMECAD\\\\FrameCAD DETAILER\\\\HYTEK MACHINE_FRAME TYPES\\\\).
 *
 * DO NOT EDIT BY HAND. Regenerate with:
 *   node scripts/generate-machine-setups.mjs <input-.sups-or-json>
 *
 * Source: ${path.basename(INPUT)}
 * Generated: ${new Date().toISOString()}
 */

export interface ChamferPoint { x: number; y: number; }

/** A single Detailer tool entry — tool name, draw style, ID, dimensional sizes. */
export interface ToolEntry {
  /** Detailer's internal tool name, e.g. "Dimple1", "LipNotch", "Swage". */
  fName: string;
  /** Detailer's draw style enum, e.g. "dsDimpleHole", "dsLipcut". */
  drawStyle: string;
  /** Detailer's tool ID — referenced by RFY tool-code mapping. */
  id: number;
  /** Tool length (e.g. LipNotch=48mm or 75mm depending on profile width). */
  length: number;
  /** Primary tool dimension (varies — Dimple1=10mm, LeftTab=50mm, etc.). */
  size1: number;
  /** Secondary tool dimension (e.g. Dimple1.size2=7 = dimple radius). */
  size2: number;
}

/** A fastener-mating rule: which Detailer tool serves which CSV condition. */
export interface FastenerEntry {
  /** Tool name to emit (e.g. "Dimple1", "FlangeHole", "Service"). */
  toolName: string;
  /** CSV condition pattern (e.g. "d1d1", "fh", "sh", "slot"). */
  condition: string;
}

/** Per-profile section options — Y-positions of dimples and flange holes. */
export interface SectionOptions {
  /** Whether this profile can be boxed (back-to-back paired). */
  boxable: boolean;
  /** Mid-track end clearance for deflection tracks. */
  deflectionTrackEndClearance: number;
  /** Mid-track screw height for deflection tracks. */
  deflectionTrackScrewHeight: number;
  /** True if dimple operations come in pairs (one per flange). */
  dualFasteners: boolean;
  /** Y-position (mm from web edge) of primary dimple/fastener. */
  fastener1: number;
  /** Tool name for primary fastener (typically "Dimple1"). */
  fastener1Name: string;
  /** Y-position of secondary fastener; -1 = none. */
  fastener2: number;
  /** Tool name for secondary fastener. */
  fastener2Name: string;
  /** Y-position of flange-bolt hole; -1 = none. */
  flangeBoltHoleHeight: number;
  /** Y-position of flange hole. */
  flangeHoleHeight: number;
  /** Inner bend radius of the section profile. */
  innerBendRadius: number;
  /** Auto-emit chamfer at end? */
  automaticChamfer: boolean;
  /** Auto-emit cruciform pattern? */
  automaticCruciform: boolean;
  /** Pitch between triple-hole-pattern holes. */
  tripleHoleSpacing: number;
}

/** Profile geometry (web depth, flange widths, lip lengths). */
export interface ProfileGeometry {
  shapeClassification: string;  // "S"=simple, "C"=cee, etc.
  leftFlange: number;
  rightFlange: number;
  flangeLabel: string;
  web: number;
  leftLip: number;
  rightLip: number;
}

/** Material spec (BMT, coating, steel grade). */
export interface MaterialSpec {
  bmt?: { color: string; thickness: number };
  coating?: { displayLabel: string; minMass: number };
  steelSpec: string;
  strength?: { displayLabel: string; elongation: number; tensile: number; yield: number };
}

/** Per-profile section setup (one per profile-gauge combination). */
export interface SectionSetup {
  automaticallyDetermineExportSection: boolean;
  guid: string;
  name: string;                       // e.g. "70S41_0.75"
  manualRFYImperialLabel: string;
  manualRFYMetricLabel: string;
  manualSectionIDForRFX: number;
  profile?: ProfileGeometry;
  material?: MaterialSpec;
  sectionOptions?: SectionOptions;
}

/** Tool catalog: chamfer geometry + tool entries categorised by activation. */
export interface ToolSetup {
  chamferDetail: ChamferPoint[];        // standard chamfer triangle
  trussChamferDetail: ChamferPoint[];   // larger truss-end chamfer
  webChamferDetail: ChamferPoint[];     // web-crossing chamfer
  /** Tools always available (Dimple1, LipNotch, WebNotch, Bad, Swage, Dummy). */
  fixedTools: ToolEntry[];
  /** Tools enabled by default (Service, FlangeHole, TripleWebHole, etc.). */
  optionalOnTools: ToolEntry[];
  /** Tools available but not enabled by default (Tab, Logo, BoltHole, FlangeBolt, ...). */
  optionalOffTools: ToolEntry[];
}

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

  // Enum-style strings
  /** End-clearance reference scheme — "ecrOutsideWeb" or other variants. */
  endClearanceReference: string;
  /** Extra flange-hole policy — "efhNone" / "efhSingle" / "efhDouble". */
  extraFlangeHoles: string;
  /** Back-to-back tooling mode — "b2bWebHole" enables B2B partner Web ops. */
  fB2BTooling: string;
  /** Fastener-mating mode — "fmNone" / "fmDimple" / "fmFlangeHole". */
  fastenerMating: string;
  /** Plate boxing piece type — "bptSelf" or "bptParent". */
  plateBoxingPieceType: string;
  /** Stud boxing piece type — "bptSelf" or "bptParent". */
  studBoxingPieceType: string;

  // Chamfer geometry (preserved at top level for backward compat — same data
  // is also in toolSetup.chamferDetail / trussChamferDetail / webChamferDetail)
  chamferDetail: ChamferPoint[];
  trussChamferDetail: ChamferPoint[];
  webChamferDetail: ChamferPoint[];

  // Nested rule structures (NEW 2026-05-04)
  /** Default section options — applied when a stick has no per-section override. */
  defaultSectionOptions?: SectionOptions;
  /** Per-profile-gauge section setups (e.g. 70S41_0.75 has its own options). */
  sectionSetups: SectionSetup[];
  /** Available service-hole tool names ("Service", "LongService"). */
  serviceHoleOptions: string[];
  /** Fastener-tool mapping: which tool serves which CSV condition. */
  fasteners: FastenerEntry[];
  /** Full tool catalog: chamfer geometry + FixedTools/OptionalOnTools/OptionalOffTools. */
  toolSetup?: ToolSetup;
  /** Design-check labels (e.g. "Unassigned Configs"). */
  designChecks: string[];
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

/**
 * Look up a per-profile SectionSetup for a stick — matches by metric label
 * (e.g. "70S41_0.75"). Each section provides per-profile dimple Y-positions
 * (Fastener1) and flange-hole heights — Detailer's actual values, not the
 * codec's empirical guesses.
 *
 * @param setup    The MachineSetup to search.
 * @param sectionName  Section name like "70S41_0.75" or "89S41_1.15".
 * @returns The matching SectionSetup or undefined.
 */
export function findSectionSetup(
  setup: MachineSetup, sectionName: string
): SectionSetup | undefined {
  return setup.sectionSetups.find(s => s.name === sectionName);
}

/**
 * Look up a tool entry in any of FixedTools / OptionalOnTools / OptionalOffTools
 * by FName. Returns the tool entry — gives access to size1/size2/length/id.
 *
 * @example
 *   const dimple = findTool(setup, "Dimple1");  // size1=10 (the dimple width)
 *   const lipNotch = findTool(setup, "LipNotch");  // length=48 (or 75 for 104mm)
 *   const tab = findTool(setup, "Tab");  // size1=35 (the start-tab clearance)
 */
export function findTool(setup: MachineSetup, fName: string): ToolEntry | undefined {
  const ts = setup.toolSetup;
  if (!ts) return undefined;
  for (const list of [ts.fixedTools, ts.optionalOnTools, ts.optionalOffTools]) {
    const found = list.find(t => t.fName === fName);
    if (found) return found;
  }
  return undefined;
}

/**
 * Get the "end-clearance span" — the distance from a stick's end where Detailer
 * places the start of the LipNotch / Swage / Tab cap. This is the canonical
 * derivation used throughout Detailer:
 *
 *   span = TabSize + EndClearance
 *
 * For HYTEK F325iT setups this is 39mm (Tab=35, EndClearance=4) for all
 * profiles except the Demo Setup (37mm) and 104mm (40mm).
 *
 * Use this in rules code instead of hardcoding 39.
 */
export function endClearanceSpan(setup: MachineSetup): number {
  const tab = findTool(setup, "Tab");
  const tabSize = tab?.size1 ?? 35;
  return tabSize + setup.endClearance;
}

/**
 * Get the dimple longitudinal offset from a stick's end — the position along
 * the stick where the InnerDimple sits. Detailer's derivation:
 *
 *   offset = EndClearance + (TabSize - Dimple1.Size1) / 2
 *
 * For HYTEK F325iT 70/89mm setups this is 16.5mm (4 + (35-10)/2). For 104mm
 * setup (EndClearance=5) it's 17.5mm.
 */
export function dimpleEndOffset(setup: MachineSetup): number {
  const tab = findTool(setup, "Tab");
  const dimple = findTool(setup, "Dimple1");
  const tabSize = tab?.size1 ?? 35;
  const dimpleSize = dimple?.size1 ?? 10;
  return setup.endClearance + (tabSize - dimpleSize) / 2;
}

/**
 * Get the lip-notch tool length for the setup. Detailer uses different lip-notch
 * widths per profile (70=48mm, 75/78=60mm, 89=48mm, 104=75mm). Use this
 * instead of hardcoding the internal-lip-notch span in frame-context rules.
 */
export function lipNotchToolLength(setup: MachineSetup): number {
  const t = findTool(setup, "LipNotch");
  return t?.length ?? 48;
}
`;

fs.writeFileSync(OUT, banner);
console.log(`Generated: ${OUT}`);
console.log(`Setups: ${setups.length} (${Object.keys(setupByWeb).length} unique profile webs)`);
console.log("Profile mapping:");
for (const [web, info] of Object.entries(setupByWeb)) {
  console.log(`  ${web}mm -> setup [${info.id}] ${setups.find(s => s.id === info.id).name}`);
}
