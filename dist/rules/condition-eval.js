// ---------------------------------------------------------------------------
// Token-level evaluator
// ---------------------------------------------------------------------------
/** Tolerance in degrees for `is90`. Detailer's `FUN_00538b00` rounds against
 *  the 90° axis with a small slop; 5° matches our observation in the
 *  decompile (line 98545 et al.) and avoids snapping 88-89° inputs to lt90. */
const ANGLE_EPS_DEG = 5;
/** Evaluate a single token against a context. Tokens whose data the context
 *  doesn't supply default to `false` (conservative — emit nothing rather than
 *  emit wrong). */
export function evalCondition(token, ctx) {
    switch (token) {
        // --------------- Edge tokens ---------------
        // `ee` is Detailer's "every-edge" fallback — fires whenever ANY of the 4
        // edge bits is set. (Mined from action-defs grammar: `ee:null@wend-wend`
        // is the slot-0 fallback in OnEdge - LipNotchedStandard, the fallback
        // is the FINAL alternative that fires when nothing else does.)
        case "ee":
            return Boolean(ctx.edges.ll || ctx.edges.lw || ctx.edges.wl || ctx.edges.ww);
        // `we` = web-edge crossing on connector — the connector's web is hit by
        // the connectee's edge. Maps to the LW bit (left-lip-of-connectee on
        // web-of-connector) OR WW (both webs intersect).
        // TODO-AMBIGUOUS: split between `we` (web-connector) vs `ew`
        // (edge-connector) is inferred from grammar symmetry; needs Frida hook
        // to confirm exact bit mapping. For now treat `we` as LW|WW.
        case "we":
            return Boolean(ctx.edges.lw || ctx.edges.ww);
        // `le` = lip-edge crossing on connector — connector's lip hit by
        // connectee's edge. Maps to LL bit primarily.
        case "le":
            return Boolean(ctx.edges.ll);
        // `el` = edge-on-lip on connectee side — connector's edge hits connectee's
        // lip. Maps to WL bit (which is "web × leftLip" in connector frame, i.e.
        // connectee's lip).
        case "el":
            return Boolean(ctx.edges.el ?? ctx.edges.wl);
        // `ew` = edge-on-web on connectee side. Independent EW byte is the
        // primary signal; fall back to LW symmetry if not provided.
        case "ew":
            return Boolean(ctx.edges.ew ?? ctx.edges.lw);
        // --------------- Multi-hit ---------------
        case "mh":
            return ctx.multiHit;
        case "nmh":
            return !ctx.multiHit;
        // --------------- Web-angle ---------------
        // The classifier compares against 90° with a tolerance. We mirror the
        // FUN_00538b00 decompile (line ~98538): tests are essentially `abs(a-90)
        // < eps` for is90, `a < 90-eps` for lt90, `a > 90+eps` for gt90.
        case "is90": {
            if (ctx.webAngleDeg === undefined)
                return false;
            return Math.abs(ctx.webAngleDeg - 90) < ANGLE_EPS_DEG;
        }
        case "lt90": {
            if (ctx.webAngleDeg === undefined)
                return false;
            return ctx.webAngleDeg < 90 - ANGLE_EPS_DEG;
        }
        case "gt90": {
            if (ctx.webAngleDeg === undefined)
                return false;
            return ctx.webAngleDeg > 90 + ANGLE_EPS_DEG;
        }
        // --------------- Box flags ---------------
        case "box_l":
            return Boolean(ctx.box?.left);
        case "box_r":
            return Boolean(ctx.box?.right);
        // --------------- Chord flags ---------------
        case "t_tchord":
            return Boolean(ctx.chord?.t_tchord);
        case "b_tchord":
            return Boolean(ctx.chord?.b_tchord);
        case "t_bchord":
            return Boolean(ctx.chord?.t_bchord);
        // --------------- Lip-edge fine-grained ---------------
        case "rl_e":
            return Boolean(ctx.lipEdge?.rl_e);
        case "rl_lf":
            return Boolean(ctx.lipEdge?.rl_lf);
        case "rl_rf":
            return Boolean(ctx.lipEdge?.rl_rf);
        case "ll_e":
            return Boolean(ctx.lipEdge?.ll_e);
        case "ll_lf":
            return Boolean(ctx.lipEdge?.ll_lf);
        case "ll_rf":
            return Boolean(ctx.lipEdge?.ll_rf);
        default: {
            // Unreachable — TypeScript exhaustiveness check
            const _exhaustive = token;
            void _exhaustive;
            return false;
        }
    }
}
/**
 * Evaluate a conjunction of tokens (AND-semantics). Empty array = `true`
 * (this is Detailer's "fallback alternative" — the unconditional clause that
 * appears at the end of every slot, e.g. `rightflange@ww-wend` with no leading
 * conditions).
 */
export function evalConditions(tokens, ctx) {
    if (tokens.length === 0)
        return true;
    for (const t of tokens) {
        if (!evalCondition(t, ctx))
            return false;
    }
    return true;
}
/**
 * Pack 4 boolean edge flags into the 0..15 mask used as the slot index.
 * Mirrors `FUN_00545694`:
 *   mask = (LL ? 1 : 0) | (LW ? 2 : 0) | (WL ? 4 : 0) | (WW ? 8 : 0)
 */
export function packEdgeMask(edges) {
    let m = 0;
    if (edges.ll)
        m |= 0x1;
    if (edges.lw)
        m |= 0x2;
    if (edges.wl)
        m |= 0x4;
    if (edges.ww)
        m |= 0x8;
    return m;
}
/** Inverse — unpack a 0..15 mask into an EdgeFlags record. */
export function unpackEdgeMask(mask) {
    return {
        ll: (mask & 0x1) !== 0,
        lw: (mask & 0x2) !== 0,
        wl: (mask & 0x4) !== 0,
        ww: (mask & 0x8) !== 0,
    };
}
