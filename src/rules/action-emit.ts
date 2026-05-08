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
import { getToolDef } from "./tooldef-table.js";

// ---------------------------------------------------------------------------
// Position resolution context
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Verb → tool-type table
// ---------------------------------------------------------------------------

/**
 * Map an action-defs verb to a codec ToolType. Returns `null` for verbs
 * that don't have a direct ToolType analog (`null` = no-op, `bad` = error
 * sentinel). The side-aware lipnotch variants resolve to "LipNotch" but
 * with corner metadata we don't currently track — for now we treat them
 * the same as plain `lipnotch` (TODO-AMBIGUOUS).
 */
export function verbToToolType(verb: ActionVerb): ToolType | null {
  switch (verb) {
    case "lipnotch":
    case "rl_lipnotch":
    case "ll_lipnotch":
    case "rh_lipnotch":
    case "lh_lipnotch":
      // TODO-AMBIGUOUS: r/l-lipnotch ought to encode a CopyType (octRightLow,
      // etc.) but our op shape lacks that field. Treat all as LipNotch for
      // now; the position resolver still places them at the right corner.
      return "LipNotch";
    case "swage":
      return "Swage";
    case "webnotch":
      // TODO-AMBIGUOUS: Detailer's "webnotch" is its own tool type; the
      // closest in our format is "InnerNotch". Cross-checked against
      // OnFlat - DualTrack rules (slot 4 emits webnotch on web crossings)
      // → corresponds to InnerNotch in our codec.
      return "InnerNotch";
    case "rightflange":
    case "leftflange":
      // Flange-Cut variants — emit as RightFlange/LeftFlange spanned ops.
      // Distinguished in caller via verb name.
      return verb === "rightflange" ? "RightFlange" : "LeftFlange";
    case "rightpartialflange":
    case "leftpartialflange":
      return verb === "rightpartialflange" ? "RightPartialFlange" : "LeftPartialFlange";
    case "tab":
    case "WebTabHoles":
      // TODO-AMBIGUOUS: no exact codec equivalent for "Tab" or "WebTabHoles"
      // — they appear only in OnFlat - Tabbed/TabHoles slots which the
      // existing engine doesn't emit. Suppress for now (return null).
      return null;
    case "null":
    case "bad":
      return null;
    default: {
      const _exhaustive: never = verb;
      void _exhaustive;
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Position-token resolver
// ---------------------------------------------------------------------------

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
export function resolvePosition(token: string, ec: EmitContext): number | null {
  const t = token.toLowerCase();
  if (t === "wend" || t === "lend") return ec.length;
  if (t === "wstart" || t === "lstart") return 0;
  // Intersection-corner / edge tokens all resolve to the crossing position
  // — the corner identity is encoded in the verb (rl_/ll_/rh_/lh_), not the
  // mm offset.
  const intersectionTokens = new Set([
    "ww", "wl", "lw", "ll",
    "we", "le", "ew", "el",
    "rl_e", "rl_lf", "rl_rf",
    "ll_e", "ll_lf", "ll_rf",
    "tab", "d2tab",
  ]);
  if (intersectionTokens.has(t)) return ec.intersectionPos;
  return null;
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

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

export function emitAction(op: ActionOp, ec: EmitContext): EmitResult {
  const verb = op.action as ActionVerb;
  // Suppress emit verbs — these are sentinels in the dictionary.
  if (verb === "null") return { ops: [], suppressed: true, trace: `${op.raw} → null (suppressed)` };
  if (verb === "bad")  return { ops: [], suppressed: true, trace: `${op.raw} → bad (suppressed)` };
  if (verb === "tab" || verb === "WebTabHoles") {
    return { ops: [], suppressed: true, trace: `${op.raw} → ${verb} (TODO — no codec equivalent)` };
  }

  const tt = verbToToolType(verb);
  if (tt === null) {
    return { ops: [], trace: `${op.raw} → no ToolType for verb '${verb}'` };
  }

  const srcPos = resolvePosition(op.src, ec);
  const dstPos = resolvePosition(op.dst, ec);
  if (srcPos === null || dstPos === null) {
    return { ops: [], trace: `${op.raw} → unresolved pos (src=${op.src}→${srcPos}, dst=${op.dst}→${dstPos})` };
  }

  // ---------------------------------------------------------------------
  // TToolDef table lookup (per docs/cracked/tooldef-table.json).
  // The table tells us authoritatively whether the verb's span is
  // GEOMETRY-DRIVEN (src..dst position pair) or FIXED-LENGTH centred
  // on the crossing.
  // ---------------------------------------------------------------------
  const td = getToolDef(verb);

  // Geometry-driven verbs (LeftFlange / RightFlange) — the span is the
  // src..dst position pair. NEVER override with a fixed length.
  // PartialFlange variants aren't in the table (no corpus samples) but
  // share the same geometry semantics — keep the legacy branch.
  if (td?.lengthMm === "geometry" ||
      tt === "RightFlange" || tt === "LeftFlange" ||
      tt === "RightPartialFlange" || tt === "LeftPartialFlange") {
    const lo = Math.min(srcPos, dstPos);
    const hi = Math.max(srcPos, dstPos);
    if (hi - lo < 1) {
      return { ops: [], trace: `${op.raw} → degenerate flange span ${lo}..${hi}` };
    }
    return {
      ops: [{
        kind: "spanned",
        type: tt,
        startPos: round(lo),
        endPos: round(hi),
      }],
      trace: `${op.raw} → ${tt} ${round(lo)}..${round(hi)}`,
    };
  }

  // Fixed-length spanned verbs (LipNotch / Swage / InnerNotch / variants).
  // Detailer's TToolDef.OperationType for these is otSpannedTool with a
  // nominal Lengthh1P drawn from the machine setup. We use the EmitContext
  // lipNotchSpan / webNotchSpan (already profile-aware via
  // lipNotchToolLength(setup)) — that's more accurate than the corpus-wide
  // 45mm modal in tooldef-table.ts because LipNotch length actually varies
  // 48–75mm by profile.
  //
  // Span semantics (per docs/action-defs-input-pipeline-2026-05-08.md TODO,
  // closed 2026-05-08 by anchored-span fix):
  //
  //   - src == dst (e.g. `swage@ww-ww`): centred on src. Empirical corpus
  //     confirms centred for these ambiguous-corner cases.
  //   - src != dst with finite tool length (e.g. `swage@ww-wend`,
  //     `lipnotch@le-lend`): ANCHORED at src, fixed length, direction
  //     toward dst. The dst token is a directional sentinel — `wend`/`lend`
  //     mean "anchor extends toward stick end". This matches Detailer's
  //     `RToolDef.OperationType=otSpannedTool + Lengthh1P` placement rule.
  //     End-leaning crossings (where ww is near wend) get clamped to a
  //     short geometric span; interior crossings get a fixed-length anchored
  //     span that's much narrower than the old src..dst geometric span.
  //
  // The anchor-direction (forward = toward higher pos, backward = toward
  // lower pos) is governed by sign(dst - src). Override via env
  // CODEC_ANCHOR_DIRECTION="forward"|"backward" for empirical testing.
  const useCentred = srcPos === dstPos;
  let startPos: number;
  let endPos: number;
  if (useCentred) {
    const span = (tt === "InnerNotch") ? ec.webNotchSpan : ec.lipNotchSpan;
    startPos = srcPos - span / 2;
    endPos = srcPos + span / 2;
  } else {
    // Anchored fixed-length span. Width = profile-aware lipNotchSpan /
    // webNotchSpan (already accounts for tool length per profile).
    const span = (tt === "InnerNotch") ? ec.webNotchSpan : ec.lipNotchSpan;
    // Direction: dst > src → forward (toward stick end), else backward.
    // Override via env for empirical A/B testing.
    const dir = process.env.CODEC_ANCHOR_DIRECTION === "backward"
      ? -1
      : process.env.CODEC_ANCHOR_DIRECTION === "forward"
        ? +1
        : (dstPos > srcPos ? +1 : -1);
    if (dir > 0) {
      startPos = srcPos;
      endPos = srcPos + span;
    } else {
      startPos = srcPos - span;
      endPos = srcPos;
    }
  }

  // Clamp to stick bounds.
  startPos = Math.max(0, startPos);
  endPos = Math.min(ec.length, endPos);
  if (endPos - startPos < 1) {
    return { ops: [], trace: `${op.raw} → degenerate span ${startPos}..${endPos}` };
  }

  return {
    ops: [{
      kind: "spanned",
      type: tt,
      startPos: round(startPos),
      endPos: round(endPos),
    }],
    trace: `${op.raw} → ${tt} ${round(startPos)}..${round(endPos)}`,
  };
}

/** Emit a list of ActionOps, accumulating ops + trace lines. */
export function emitActions(ops: ActionOp[], ec: EmitContext): EmitResult {
  const out: RfyToolingOp[] = [];
  const traces: string[] = [];
  let allSuppressed = true;
  for (const a of ops) {
    const r = emitAction(a, ec);
    if (r.ops.length > 0) {
      out.push(...r.ops);
      allSuppressed = false;
    } else if (!r.suppressed) {
      // unresolved / no-tool-type — also counts as not-suppressed (something
      // went wrong) so callers know to fall back.
      allSuppressed = false;
    }
    if (r.trace) traces.push(r.trace);
  }
  return {
    ops: out,
    trace: traces.join("\n"),
    suppressed: allSuppressed && out.length === 0,
  };
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
