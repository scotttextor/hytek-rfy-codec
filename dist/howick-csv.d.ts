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
import type { RfyDocument } from "./format.js";
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
 * Generate a Howick-format CSV from a parsed RFY document.
 *
 * Iterates: project → plans → frames → sticks. For each stick:
 *   1. emit a header row    — Member name + Length, op-cells blank
 *   2. emit N op rows       — one per tooling op (after edge → pos translation)
 *
 * Empty sticks (no tooling) still get a header row so the converter can
 * know the member exists.
 */
export declare function generateHowickCsv(doc: RfyDocument, options?: HowickCsvOptions): string;
/**
 * Convenience wrapper: return one Howick CSV per plan keyed by plan name.
 * Mirrors the shape of `documentToCsvs` from the Detailer CSV module.
 */
export declare function documentToHowickCsvs(doc: RfyDocument, options?: HowickCsvOptions): Record<string, string>;
export declare const generateCsv: typeof generateHowickCsv;
export type CsvOptions = HowickCsvOptions;
