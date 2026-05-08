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
export function verbToToolType(verb) {
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
            const _exhaustive = verb;
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
export function resolvePosition(token, ec) {
    const t = token.toLowerCase();
    if (t === "wend" || t === "lend")
        return ec.length;
    if (t === "wstart" || t === "lstart")
        return 0;
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
    if (intersectionTokens.has(t))
        return ec.intersectionPos;
    return null;
}
export function emitAction(op, ec) {
    const verb = op.action;
    // Suppress emit verbs — these are sentinels in the dictionary.
    if (verb === "null")
        return { ops: [], suppressed: true, trace: `${op.raw} → null (suppressed)` };
    if (verb === "bad")
        return { ops: [], suppressed: true, trace: `${op.raw} → bad (suppressed)` };
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
    // RightFlange / LeftFlange variants: per detailer-rule-decoded.md these
    // are flange-edge cuts. In our codec they're spanned ops from the
    // intersection to the stick end. The src/dst encoding tells us which
    // direction the cut runs.
    if (tt === "RightFlange" || tt === "LeftFlange" ||
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
    // Internal notches (LipNotch / Swage / InnerNotch) — span centred on the
    // crossing position with lipNotchSpan width.
    // CONSERVATIVE: if src≡dst (most common — both resolve to intersectionPos),
    // emit a span of width `lipNotchSpan` centred at intersectionPos.
    // If src and dst differ (e.g. ww→wend), emit from src to dst (clamped).
    const useCentred = srcPos === dstPos;
    let startPos;
    let endPos;
    if (useCentred) {
        const span = (tt === "InnerNotch") ? ec.webNotchSpan : ec.lipNotchSpan;
        startPos = srcPos - span / 2;
        endPos = srcPos + span / 2;
    }
    else {
        const lo = Math.min(srcPos, dstPos);
        const hi = Math.max(srcPos, dstPos);
        startPos = lo;
        endPos = hi;
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
export function emitActions(ops, ec) {
    const out = [];
    const traces = [];
    let allSuppressed = true;
    for (const a of ops) {
        const r = emitAction(a, ec);
        if (r.ops.length > 0) {
            out.push(...r.ops);
            allSuppressed = false;
        }
        else if (!r.suppressed) {
            // unresolved / no-tool-type — also counts as not-suppressed (something
            // went wrong) so callers know to fall back.
            allSuppressed = false;
        }
        if (r.trace)
            traces.push(r.trace);
    }
    return {
        ops: out,
        trace: traces.join("\n"),
        suppressed: allSuppressed && out.length === 0,
    };
}
function round(n) {
    return Math.round(n * 10000) / 10000;
}
