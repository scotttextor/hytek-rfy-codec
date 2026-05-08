/**
 * Action-verb → RfyToolingOp emitter.
 *
 * Translates the `<verb>@<src><rel><dst>` records mined from
 * `Tooling.dll`'s ActionDefsManager into the codec's existing
 * `RfyToolingOp` shape (point / spanned / start / end).
 *
 * The 15 verbs map to either:
 *   1. A `ToolType` (ToolingOp.type — e.g. "lipnotch" → "LipNotch")
 *   2. A meta-action ("null" → emit nothing, "bad" → debug sentinel)
 *   3. A side-aware variant that picks left vs right at runtime
 *      ("rl_lipnotch" → right-lip LipNotch, "lh_lipnotch" → left-half).
 *
 * The src/dst tokens encode the geometry — `ww`/`wl`/`lw`/`ll` name the four
 * intersection corners (web-on-web, web-on-lip, lip-on-web, lip-on-lip);
 * `wend`/`lend` mean "the corresponding stick end"; `we`/`le`/`ww`/etc. echo
 * the condition tokens for sub-corner identifiers.
 *
 * IMPORTANT: this emitter is intentionally CONSERVATIVE. When the position
 * tokens or verb resolution is ambiguous, we emit nothing (and stash a
 * trace string for debugging) rather than emit a wrong op.
 */
import type { RfyToolingOp, ToolType } from "../format.js";
import type { ActionOp, ActionVerb } from "./action-defs.js";
/**
 * Geometry resolver for action-emit. The codec's pipeline already computes
 * the relevant intersection coordinates in `frame-context.ts` (e.g.
 * `localPos` of a stud crossing on a plate, or the `centerCrossingX` of a
 * truss web on a chord). The emit step just needs to translate `src`/`dst`
 * tokens into mm offsets along the connector stick's local axis.
 *
 * Required minimum: the connector stick's `length` (mm) and the
 * `intersectionPos` of the crossing on the connector (mm from worldStart).
 *
 * Optional fields enable richer emit (e.g. `lipNotchSpan` for the standard
 * 45mm internal LipNotch span; `swageClearance` for the configurable 4mm
 * end-clearance trim).
 */
export interface EmitContext {
    /** Connector stick length in mm. */
    length: number;
    /** Position of the crossing on the connector (mm from start). */
    intersectionPos: number;
    /** Default span for lipnotch / swage / partial flange ops (mm). */
    lipNotchSpan: number;
    /** Default span for webnotch ops (mm) — typically same as lipNotchSpan. */
    webNotchSpan: number;
    /** End-clearance trim in mm (Detailer's "swage clearance" = 4mm typically). */
    swageClearance: number;
    /** Optional: dimple offset for inner-dimple emission (we don't currently
     *  emit dimples here — the existing crossing engine handles them). */
    dimpleOffset?: number;
}
/**
 * Map an action-defs verb to a codec ToolType. Returns `null` for verbs
 * that don't have a direct ToolType analog (`null` = no-op, `bad` = error
 * sentinel). The side-aware lipnotch variants resolve to "LipNotch" but
 * with corner metadata we don't currently track — for now we treat them
 * the same as plain `lipnotch` (TODO-AMBIGUOUS).
 */
export declare function verbToToolType(verb: ActionVerb): ToolType | null;
/**
 * Resolve a src/dst token to a mm offset on the connector stick.
 *
 * Token meanings (inferred from action-defs.json grammar examples):
 *   - `wend` / `lend`: the connector's far stick-end (length)
 *   - `wstart` / `lstart`: the connector's near stick-end (0)
 *   - `ww`/`wl`/`lw`/`ll`: the four sub-corners of the intersection — at
 *     this scale (per-crossing), they all collapse onto `intersectionPos`.
 *     The corner identity is what the verb's CopyType captures, not the
 *     mm offset.
 *   - `we`/`le`/`ew`/`el`: shorthand for the connectee's edge mid — also
 *     resolves to `intersectionPos` for the connector.
 *   - `rl_e`/`rl_lf`/`rl_rf`/`ll_e`/`ll_lf`/`ll_rf`: lip-edge variants —
 *     resolves to `intersectionPos` ± a small offset (we use ±0).
 *     TODO-AMBIGUOUS: needs Frida-confirmed lip-edge offset.
 *
 * Returns `null` if the token can't be resolved.
 */
export declare function resolvePosition(token: string, ec: EmitContext): number | null;
/**
 * Translate one ActionOp into 0..n RfyToolingOps. Returns the ops alongside
 * an optional `trace` line for debugging.
 *
 * Emit semantics:
 *   - `null`/`bad`: emit nothing
 *   - `tab`/`WebTabHoles`: emit nothing (TODO-AMBIGUOUS)
 *   - `lipnotch`/`swage`/`webnotch`/`*partialflange`: emit a SPANNED op
 *     centred on the crossing position with `lipNotchSpan` mm width
 *   - `rightflange`/`leftflange`: emit a SPANNED op from `intersectionPos`
 *     to the stick end (treating these as flange cuts, not internal notches)
 *
 * The geometry math here is intentionally simple — it places the op at the
 * resolved position with the configured span. The existing frame-context
 * crossings engine layers richer behaviour (cluster-merging, dimple emit,
 * etc.) on top.
 */
export interface EmitResult {
    ops: RfyToolingOp[];
    trace?: string;
    /** True if this op was deliberately suppressed (null/bad/TODO). Distinct
     *  from "couldn't resolve" — this is "intentionally emitted nothing". */
    suppressed?: boolean;
}
export declare function emitAction(op: ActionOp, ec: EmitContext): EmitResult;
/** Emit a list of ActionOps, accumulating ops + trace lines. */
export declare function emitActions(ops: ActionOp[], ec: EmitContext): EmitResult;
