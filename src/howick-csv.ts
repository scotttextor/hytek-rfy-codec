/**
 * Howick CSV exporter — emits a parsed RFY document as a Howick-format CSV.
 *
 * The Howick CSV format is a documented input format that some Howick
 * rollformer firmware accepts directly (per the third-party CAD vendor
 * docs — StrucSoft MWF, AGACAD, Tekla, FrameBuilder-MRD, Sketchframer,
 * LGSF Design — that all converge on the same column layout). Howick
 * also publishes a free `Howick File Converter` tool that converts
 * RFD → CSV v1 and RFD → CSV v2.
 *
 * This module is INTENTIONALLY SEPARATE from `csv.ts` (which emits the
 * HYTEK Detailer Rollforming CSV). The two formats are not interchangeable:
 * Detailer CSV uses positional cells like `BOLT HOLES,8` packed onto a
 * single COMPONENT row; Howick CSV uses one row per stick + one row per
 * tooling op with op-token names like `DIMPLE`, `SWAGE`, `LIP_CUT`, etc.
 *
 * REFERENCE-DATA SOURCES (best-effort — none of these are an authoritative
 * Howick spec; mappings tagged with `TODO-HOWICK-VERIFY` need confirmation
 * from a real Howick CSV file emitted by the official Howick File Converter):
 *   - Tekla Open API docs: op-token alphabet
 *   - AGACAD MWF + StrucSoft documentation: column layout
 *
 * Op-token alphabet (from leaked Tekla docs):
 *   DIMPLE  FLANGE1  LIP_CUT  SWAGE  TAB  TABA  NOTCH  DIMPLE_SLOT  BOLT  BOLTA
 *
 * COLUMN LAYOUT (per Tekla + AGACAD docs):
 *   Member,Length,OperationType,Position,EndPosition,Tool,Notes
 *
 * Per stick we emit:
 *   1 header row : Member name + length, OperationType blank
 *   N op rows    : OperationType + Position (and EndPosition for spans)
 */

import type { RfyDocument, RfyStick, RfyToolingOp, ToolType } from "./format.js";

export interface HowickCsvOptions {
  /**
   * Output variant.
   *   "v1" — original Howick CSV format (no Notes column emitted).
   *   "v2" — extended Howick CSV (current default; includes Notes column
   *          for side-of-flange / extra metadata).
   * Variants differ only in column count + Notes population. Op tokens are
   * identical between v1 and v2 (verified per public AGACAD documentation —
   * TODO-HOWICK-VERIFY against a real v2 export).
   */
  variant?: "v1" | "v2";
  /** Emit the column-name header row (default `true`). */
  includeHeader?: boolean;
  /**
   * Optional line-ending. Defaults to `"\n"`. Some Howick firmware versions
   * require CRLF (`"\r\n"`) — flag here rather than baking into the format.
   */
  lineEnding?: string;
}

/**
 * Internal Howick op token. The alphabet is fixed by the firmware; new
 * tokens cannot be invented. Sourced from Tekla Open API docs.
 */
type HowickOpToken =
  | "DIMPLE"
  | "SWAGE"
  | "LIP_CUT"
  | "FLANGE1"
  | "NOTCH"
  | "BOLT"
  | "BOLTA"
  | "DIMPLE_SLOT"
  | "TAB"
  | "TABA";

/**
 * Result of a tool-type → Howick token lookup.
 *
 *   token   — the Howick op-token to emit
 *   notes   — optional Notes-column value (variant=v2 only). Used to carry
 *             extra metadata that the token alone can't encode (e.g.
 *             which side a FLANGE1 op is on).
 *   skip    — `true` if the op should be skipped entirely (no Howick
 *             equivalent). Currently unused; reserved for ops we may
 *             choose to drop in the future.
 */
interface HowickMapping {
  token: HowickOpToken;
  notes?: string;
  skip?: boolean;
}

/**
 * Map from internal RFY tool types to Howick CSV op tokens.
 *
 * MAPPING CERTAINTY (based on token-name semantic match against Tekla docs):
 *   HIGH    : InnerDimple → DIMPLE        (token name == op name)
 *             Swage       → SWAGE
 *             LipNotch    → LIP_CUT       (Howick's lip-cutter)
 *             Bolt        → BOLT          (anchor bolt)
 *             Web         → BOLTA         (web-side bolt-aux variant)
 *             InnerNotch  → NOTCH         (web notch)
 *
 *   MEDIUM  : LeftFlange  → FLANGE1 + Notes="LEFT"
 *             RightFlange → FLANGE1 + Notes="RIGHT"
 *             LeftPartialFlange  → FLANGE1 + Notes="LEFT_PARTIAL"
 *             RightPartialFlange → FLANGE1 + Notes="RIGHT_PARTIAL"
 *             ScrewHoles  → BOLT (ScrewHoles is Detailer-internal; treat as
 *                                 a generic bolt op until confirmed).
 *
 *   LOW     : Chamfer       → TAB    (chamfer ≈ corner tab cut; uncertain)
 *             TrussChamfer  → TAB
 *             InnerService  → DIMPLE_SLOT (service hole in web)
 *
 * All MEDIUM/LOW entries below are tagged `TODO-HOWICK-VERIFY`. They need
 * confirmation against a real Howick-converter-produced CSV before this
 * module can be considered production-grade.
 */
const TOOL_TO_HOWICK: Record<ToolType, HowickMapping> = {
  // HIGH confidence
  InnerDimple: { token: "DIMPLE" },
  Swage: { token: "SWAGE" },
  LipNotch: { token: "LIP_CUT" },
  InnerNotch: { token: "NOTCH" },
  Bolt: { token: "BOLT" },
  Web: { token: "BOLTA" },

  // MEDIUM confidence — flange side encoded in Notes column. TODO-HOWICK-VERIFY.
  LeftFlange: { token: "FLANGE1", notes: "LEFT" },
  RightFlange: { token: "FLANGE1", notes: "RIGHT" },
  LeftPartialFlange: { token: "FLANGE1", notes: "LEFT_PARTIAL" },
  RightPartialFlange: { token: "FLANGE1", notes: "RIGHT_PARTIAL" },
  // ScrewHoles is rare in HYTEK corpus; provisionally a generic BOLT.
  // TODO-HOWICK-VERIFY against any RFD/CSV pair containing ScrewHoles.
  ScrewHoles: { token: "BOLT", notes: "SCREW_HOLES" },

  // LOW confidence — best guess. TODO-HOWICK-VERIFY.
  // Chamfer is a corner cut at stick start/end. Howick's TAB is the closest
  // semantic match (corner tab/chamfer cut). DIMPLE_SLOT was considered for
  // InnerService (web service hole) by analogy to InnerDimple → DIMPLE.
  Chamfer: { token: "TAB", notes: "CHAMFER" },
  TrussChamfer: { token: "TAB", notes: "TRUSS_CHAMFER" },
  InnerService: { token: "DIMPLE_SLOT", notes: "SERVICE_HOLE" },
};

/** Format a number for Howick CSV. Use 2-decimal precision; trim trailing
 * zeros for compactness. Howick spec is unspecified — 2dp matches what
 * most third-party exporters emit (per the AGACAD samples). */
function formatNum(v: number): string {
  if (!Number.isFinite(v)) return "0";
  const rounded = Math.round(v * 100) / 100;
  if (Number.isInteger(rounded)) return rounded.toString();
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

/** Escape a CSV cell. Wrap in quotes if it contains a comma, quote, or
 * newline; double up internal quotes. Standard RFC-4180 behaviour. */
function csvCell(v: string): string {
  if (v === "") return "";
  if (/[,"\r\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/**
 * Resolve a single op into one or more CSV row tuples (variant-agnostic).
 * Each tuple is in the order: `[OperationType, Position, EndPosition, Tool, Notes]`.
 *
 * Edge ops (`start`, `end`) translate to a position at 0 (start) or
 * `stickLength` (end). This matches the convention most third-party
 * Howick exporters use (verified against AGACAD's documented `TAB,0`
 * / `TAB,<length>` pattern; TODO-HOWICK-VERIFY against a real export).
 */
function opToRows(
  op: RfyToolingOp,
  stickLength: number,
): Array<[string, string, string, string, string]> {
  const mapping = TOOL_TO_HOWICK[op.type];
  if (!mapping || mapping.skip) return [];
  const token = mapping.token;
  const notes = mapping.notes ?? "";
  const tool = ""; // No tool-id column data available from RFY input.

  switch (op.kind) {
    case "point":
      return [[token, formatNum(op.pos), "", tool, notes]];
    case "spanned":
      return [[token, formatNum(op.startPos), formatNum(op.endPos), tool, notes]];
    case "start":
      // Combine mapping notes with the edge marker so we keep BOTH the
      // op subtype (e.g. CHAMFER) and the position (START). Format:
      // "<NOTES>_START" or just "START" if no mapping notes.
      return [[token, "0", "", tool, notes ? `${notes}_START` : "START"]];
    case "end":
      return [[token, formatNum(stickLength), "", tool, notes ? `${notes}_END` : "END"]];
  }
}

/** Compose a stick + frame name into a unique Member identifier. */
function memberName(planName: string, frameName: string, stickName: string): string {
  return `${planName}/${frameName}-${stickName}`;
}

/**
 * Generate a Howick-format CSV from a parsed RFY document.
 *
 * Iterates: project → plans → frames → sticks. For each stick:
 *   1. emit a header row    — Member name + Length, op-cells blank
 *   2. emit N op rows       — one per tooling op (after edge → pos translation)
 *
 * Empty sticks (no tooling) still get a header row so the converter can
 * know the member exists.
 */
export function generateHowickCsv(
  doc: RfyDocument,
  options: HowickCsvOptions = {},
): string {
  const variant = options.variant ?? "v2";
  const includeHeader = options.includeHeader ?? true;
  const lineEnding = options.lineEnding ?? "\n";

  const lines: string[] = [];

  if (includeHeader) {
    if (variant === "v2") {
      lines.push("Member,Length,OperationType,Position,EndPosition,Tool,Notes");
    } else {
      // v1: drop the Notes column.
      lines.push("Member,Length,OperationType,Position,EndPosition,Tool");
    }
  }

  for (const plan of doc.project.plans) {
    for (const frame of plan.frames) {
      for (const stick of frame.sticks) {
        emitStick(lines, plan.name, frame.name, stick, variant);
      }
    }
  }

  return lines.join(lineEnding) + lineEnding;
}

/** Emit one stick's rows (header row + per-op rows) into `lines`. */
function emitStick(
  lines: string[],
  planName: string,
  frameName: string,
  stick: RfyStick,
  variant: "v1" | "v2",
): void {
  const member = memberName(planName, frameName, stick.name);
  const lengthStr = formatNum(stick.length);

  // Header row: Member, Length, then blanks for the op columns.
  if (variant === "v2") {
    lines.push([
      csvCell(member),
      lengthStr,
      "", // OperationType
      "", // Position
      "", // EndPosition
      "", // Tool
      "", // Notes
    ].join(","));
  } else {
    lines.push([csvCell(member), lengthStr, "", "", "", ""].join(","));
  }

  // Op rows.
  for (const op of stick.tooling) {
    const tuples = opToRows(op, stick.length);
    for (const tuple of tuples) {
      const [opType, pos, endPos, tool, notes] = tuple;
      if (variant === "v2") {
        lines.push([
          csvCell(member),
          lengthStr,
          csvCell(opType),
          csvCell(pos),
          csvCell(endPos),
          csvCell(tool),
          csvCell(notes),
        ].join(","));
      } else {
        // v1 drops Notes.
        lines.push([
          csvCell(member),
          lengthStr,
          csvCell(opType),
          csvCell(pos),
          csvCell(endPos),
          csvCell(tool),
        ].join(","));
      }
    }
  }
}

/**
 * Convenience wrapper: return one Howick CSV per plan keyed by plan name.
 * Mirrors the shape of `documentToCsvs` from the Detailer CSV module.
 */
export function documentToHowickCsvs(
  doc: RfyDocument,
  options: HowickCsvOptions = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const plan of doc.project.plans) {
    // Produce a single-plan view of the document for emission.
    const singlePlanDoc: RfyDocument = {
      ...doc,
      project: { ...doc.project, plans: [plan] },
    };
    out[plan.name] = generateHowickCsv(singlePlanDoc, options);
  }
  return out;
}

// Compatibility alias matching the requested API name in the build prompt.
// Exposed alongside `generateHowickCsv` so callers can use either name.
export const generateCsv = generateHowickCsv;
export type CsvOptions = HowickCsvOptions;
