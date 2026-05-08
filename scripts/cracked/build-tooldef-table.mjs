#!/usr/bin/env node
/**
 * Build the final tooldef-table.json by combining:
 *   - Static extraction (verb -> ToolType ID, from binary scan)
 *   - Empirical extraction (ToolType -> opType + length, from 385-pair corpus)
 *   - Existing csv-mapping (ToolType ID -> codec ToolType name)
 *
 * The output is what the wiring agent needs to correctly emit ops in
 * src/rules/action-emit.ts.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const RAW_PATH = resolve(ROOT, "docs", "cracked", "tooldef-extraction-raw.json");
const EMPIRICAL_PATH = resolve(ROOT, "docs", "cracked", "tooldef-empirical.json");
const OUT_PATH = resolve(ROOT, "docs", "cracked", "tooldef-table.json");

const raw = JSON.parse(readFileSync(RAW_PATH, "utf8"));
const emp = JSON.parse(readFileSync(EMPIRICAL_PATH, "utf8"));

// ===========================================================================
// Verb -> TToolType ID (from static binary scan)
// Source: docs/cracked/tooldef-extraction-raw.json + binary verification
// ===========================================================================
// The 11-entry table at .data:0x590e76 is uninitialized at compile time but
// populated at startup from the source pointer table at .text:0x58fb36.
// Each entry is [4-byte ptr-to-UnicodeString, 1-byte TToolType ordinal].
const VERB_TO_TOOLTYPE_ID = {
  lipnotch:           9,
  webnotch:           8,
  leftflange:         10,
  rightflange:        11,
  leftpartialflange:  12,
  rightpartialflange: 13,
  swage:              14,
  tab:                18,
  webtabholes:        21,
  bad:                254,
  null:               255,
};

// Side-aware variants resolve to the SAME ToolType as their base — Detailer
// only varies CopyType, not ToolType, for these.
const VARIANT_TO_BASE = {
  rl_lipnotch: "lipnotch",
  ll_lipnotch: "lipnotch",
  rh_lipnotch: "lipnotch",
  lh_lipnotch: "lipnotch",
};

// ===========================================================================
// TToolType ID -> codec ToolType name
// Source: src/csv-parse.ts mapping + format.ts TOOL_TYPES
// ===========================================================================
// Note: Detailer's "webnotch" verb (id 8) is what THE CODEC calls "InnerNotch".
// Detailer also has a separate "Web" tool that is NOT in this verb table —
// it's emitted by other code paths (likely an explicit punch).
const TOOLTYPE_ID_TO_CODEC = {
  8:   "InnerNotch",          // Detailer "webnotch"
  9:   "LipNotch",
  10:  "LeftFlange",
  11:  "RightFlange",
  12:  "LeftPartialFlange",
  13:  "RightPartialFlange",
  14:  "Swage",
  18:  null,                  // "tab" — no codec equivalent
  21:  null,                  // "webtabholes" — no codec equivalent
  254: null,                  // "bad" sentinel
  255: null,                  // "null" sentinel
};

// ===========================================================================
// Build the unified table
// ===========================================================================
const inferred = emp.inferred_per_tooltype;
const final = {};

const allVerbs = [
  ...Object.keys(VERB_TO_TOOLTYPE_ID),
  ...Object.keys(VARIANT_TO_BASE),
];

for (const verb of allVerbs) {
  const baseVerb = VARIANT_TO_BASE[verb] ?? verb;
  const toolTypeId = VERB_TO_TOOLTYPE_ID[baseVerb];
  const codecToolType = TOOLTYPE_ID_TO_CODEC[toolTypeId];
  const codecStats = codecToolType ? inferred[codecToolType] : null;

  let opType, length, defaultLength, confidence, opTypeSource;
  let codecLengthSource = null;

  if (codecStats) {
    opType = codecStats.opType;
    confidence = codecStats.confidence;
    opTypeSource = "empirical-corpus";

    // Default length — for fixed-length tools (LipNotch, Swage, InnerNotch),
    // the modal value is the tool length minus optional clearance. For variable
    // tools (LeftFlange, RightFlange), there is no fixed length — the span
    // depends on geometry.
    if (codecStats.span_stats) {
      const ss = codecStats.span_stats;
      // Combined-mode test: do the top 2 buckets form an adjacent pair (within
      // ~12mm, e.g. 39 vs 45 = 6mm clearance)? If yes, the tool has a default
      // length with optional clearance trim.
      const top1 = ss.top_buckets[0];
      const top2 = ss.top_buckets[1];
      const combinedTop2Pct = top1 && top2 ? top1.pct + top2.pct : 0;
      const top2Adjacent = top2 && Math.abs(top1.span_mm - top2.span_mm) <= 12;

      if (top2Adjacent && combinedTop2Pct >= 35) {
        // Fixed-length tool with optional clearance trim.
        // Detailer convention: the LARGER value is the no-clearance length;
        // the smaller is with clearance trimmed.
        length = Math.max(top1.span_mm, top2.span_mm);
        defaultLength = "machine-setup-dependent (lipNotchToolLength); smaller adjacent mode reflects swage-clearance trim";
        codecLengthSource = `empirical-modal: ${top1.span_mm}mm (${top1.pct}%) and ${top2.span_mm}mm (${top2.pct}%); using max ${length}mm as nominal Lengthh1P`;
      } else if (top1 && top1.pct >= 50) {
        length = top1.span_mm;
        codecLengthSource = `empirical-modal: ${top1.pct}% of ${codecStats.total_samples} samples`;
      } else {
        // Variable-length spanned tool (geometry-driven).
        length = null;
        defaultLength = "geometry-driven (span = src..dst position pair)";
        codecLengthSource = `empirical: spans range ${ss.min}..${ss.max}mm, no dominant mode (top mode only ${ss.modal_pct}%, top-2 combined ${combinedTop2Pct.toFixed(1)}%)`;
      }
    }
  } else {
    // No codec mapping — unknown opType.
    opType = null;
    length = null;
    confidence = "unknown";
    opTypeSource = "n/a — sentinel or no codec mapping";
  }

  final[verb] = {
    detailer_verb: verb,
    base_verb: baseVerb !== verb ? baseVerb : undefined,
    tool_type_id: toolTypeId,
    codec_tool_type: codecToolType,
    op_type: opType,
    length_mm: length,
    default_length_note: defaultLength,
    op_type_source: opTypeSource,
    length_source: codecLengthSource,
    confidence,
    samples: codecStats?.total_samples ?? 0,
    composition: codecStats?.composition,
    span_stats: codecStats?.span_stats,
  };
  // Strip undefined keys for cleaner JSON
  for (const k of Object.keys(final[verb])) {
    if (final[verb][k] === undefined) delete final[verb][k];
  }
}

// ===========================================================================
// Build the OPERATION-TYPE table for non-verb codec ToolTypes
// (Bolt, InnerDimple, InnerService, ScrewHoles, Web, Chamfer, TrussChamfer)
// These are EMITTED BY OTHER CODE PATHS but their opTypes are useful for
// the codec's downstream consumers.
// ===========================================================================
const otherCodecTypes = {};
const allCodecTypes = ["Bolt", "Chamfer", "InnerDimple", "InnerService",
  "ScrewHoles", "Web", "TrussChamfer", "InnerNotch", "LipNotch", "Swage",
  "LeftFlange", "RightFlange", "LeftPartialFlange", "RightPartialFlange"];

for (const ctt of allCodecTypes) {
  const stats = inferred[ctt];
  if (!stats) {
    otherCodecTypes[ctt] = {
      op_type: null,
      length_mm: null,
      confidence: "unknown",
      note: "Not present in 385-pair Detailer-vs-codec MISSING corpus — either codec emits identically or both sides skip.",
    };
    continue;
  }
  let length = null;
  let lengthNote = null;
  if (stats.span_stats) {
    if (stats.span_stats.modal_pct >= 50) {
      length = stats.span_stats.top_buckets[0].span_mm;
      lengthNote = `empirical-modal: ${stats.span_stats.modal_pct}%`;
    } else if (stats.span_stats.modal_pct >= 25) {
      length = stats.span_stats.top_buckets[0].span_mm;
      lengthNote = `empirical-modal (weak): ${stats.span_stats.modal_pct}%`;
    } else {
      lengthNote = "geometry-driven";
    }
  }
  otherCodecTypes[ctt] = {
    op_type: stats.opType,
    length_mm: length,
    length_source: lengthNote,
    confidence: stats.confidence,
    samples: stats.total_samples,
    composition: stats.composition,
    span_stats: stats.span_stats,
  };
}

// ===========================================================================
// Output
// ===========================================================================
const output = {
  _meta: {
    version: "1.0.0",
    generated: new Date().toISOString(),
    description: "TToolDef table extracted from FrameCAD Detailer's Tooling.dll",
    method_path1_static: "PE-scan: located 11-entry verb-name table at .text:0x58fb36 (UTF-16 string ptrs + 1-byte TToolType ordinals)",
    method_path2_empirical: "385-pair corpus mining: each Detailer 'missing' op tells us a verb's opType + span distribution",
    method_path3_crossref: "Verbs' codec mapping confirmed against src/csv-parse.ts ToolType naming",
    coverage: {
      verbs_with_high_confidence_optype: 7,
      verbs_with_high_confidence_length: 3,
      verbs_with_no_corpus_evidence: 4,  // tab, webtabholes, bad, null
      total_verbs: 15,
    },
    notes: [
      "Verb names come from Tooling.dll string-table; TToolType IDs are the 5th byte of each entry in the table at VA 0x58fb36.",
      "Detailer's `webnotch` verb maps to the codec's `InnerNotch` ToolType (csv name 'WEB NOTCH').",
      "Side-aware verbs (rl_lipnotch, ll_lipnotch, rh_lipnotch, lh_lipnotch) all resolve to the SAME ToolType (LipNotch) but encode CopyType (octLeftLow/octLeftHigh/octRightLow/octRightHigh).",
      "Fixed-length tools (LipNotch, Swage, InnerNotch) have a default length from the machine setup (typically 45–48mm).",
      "Variable-length tools (LeftFlange, RightFlange) have spans driven by joint geometry (corner to stick-end).",
      "Sentinels (`null`, `bad`) emit nothing — `null` is a no-op and `bad` is a debug marker.",
      "`tab` and `webtabholes` have no equivalent in the codec's TOOL_TYPES enum and 0 samples in the 385-pair corpus — likely specialty operations not used in HYTEK plans.",
    ],
  },
  verbs: final,
  codec_tool_types: otherCodecTypes,
};

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));

console.log(`Wrote ${OUT_PATH}`);
console.log("\n=== VERB SUMMARY ===");
for (const [verb, info] of Object.entries(final)) {
  const cct = info.codec_tool_type ?? "(no mapping)";
  const ot = info.op_type ?? "?";
  const ln = info.length_mm !== null && info.length_mm !== undefined ? `${info.length_mm}mm` : "(geom)";
  const conf = info.confidence;
  console.log(`  ${verb.padEnd(22)} -> ${cct.padEnd(20)} ${ot.padEnd(20)} length=${ln.padEnd(10)} confidence=${conf}  samples=${info.samples}`);
}
