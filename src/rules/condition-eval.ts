/**
 * Condition evaluator for Detailer's `RActionRecs.Conditions`.
 *
 * The grammar mined from `Tooling.dll` (`docs/jailbreak/parsed/action-defs.json`)
 * stores per-slot alternatives as `<conditions>:<actions>`. Each `<conditions>`
 * is a `&`-joined conjunction of tokens drawn from the 21-token vocabulary.
 *
 * The token meanings are inferred from:
 *   - `tooling-strings.txt` lines 6868-6877:
 *       TIntersectionType { explicit_tool, ll_inner_edge, lw_inner_edge,
 *                           wl_inner_edge, ww_inner_edge, ew_inner_edge,
 *                           t_bchord, b_tchord, t_tchord }
 *   - `RFrameObjectIntersections` record fields (lines 6923-6928).
 *   - Cross-validated against the `OnFlat - Standard` and `OnEdge -
 *     LipNotchedStandard` slot 0 alternatives in the dictionary.
 *
 * Token taxonomy:
 *   - **Edge tokens**: `ee` (every-edge fallback), `we`, `le`, `el`, `ew` —
 *     which of the 4 intersection types this slot's edge_mask bit was set on.
 *   - **Multi-hit**: `mh` (multiple intersections on this stick), `nmh` (single).
 *   - **Web-angle**: `is90`, `lt90`, `gt90` — the angle the connectee web
 *     makes with the connector web (computed from the 3D intersection record).
 *   - **Box flags**: `box_l`, `box_r` — RFrameObjectIntersections `Locations`
 *     field bits indicating left- or right-side boxing context.
 *   - **Chord flags**: `t_tchord`, `b_tchord`, `t_bchord` — straight from the
 *     TIntersectionType enum (top stick is TopChord, etc.).
 *   - **Lip-edge flags**: `rl_e`, `rl_lf`, `rl_rf`, `ll_e`, `ll_lf`, `ll_rf` —
 *     fine-grained Right-Lip / Left-Lip edge identifiers used in OnEdge -
 *     LipNotched* slots.
 *
 * IMPORTANT: When the input context cannot answer a token (e.g. the codec
 * doesn't yet plumb the lip-edge flag), the evaluator MUST return `false` for
 * that token rather than guess. This biases toward emitting fewer ops than
 * Detailer rather than emitting wrong ops — see action-emit.ts for the same
 * conservative bias.
 */
import type { Condition } from "./action-defs.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The 4-bit edge mask, packed as Detailer's `FUN_00545694` does:
 *   bit 0 (LL): both leftLips touch (`ll_inner_edge`)
 *   bit 1 (LW): leftLip × web      (`lw_inner_edge`)
 *   bit 2 (WL): web × leftLip      (`wl_inner_edge`)
 *   bit 3 (WW): webs cross         (`ww_inner_edge`)
 *
 * Plus the optional `EW` byte which doesn't pack into the mask but is
 * exposed via `EdgeFlags.ew` for the `ew` condition.
 */
export interface EdgeFlags {
  /** LL bit (0x01) — `ll_inner_edge`. */
  ll: boolean;
  /** LW bit (0x02) — `lw_inner_edge`. */
  lw: boolean;
  /** WL bit (0x04) — `wl_inner_edge`. */
  wl: boolean;
  /** WW bit (0x08) — `ww_inner_edge`. */
  ww: boolean;
  /** EW bit — `ew_inner_edge` (separate from the 0..15 packing). */
  ew?: boolean;
  /** EL bit — connectee-edge × connector-lip. Inferred from the symmetry
   *  of the EW/WE pair (Detailer uses both directions). */
  el?: boolean;
}

/** Box-flag context — drawn from RFrameObjectIntersections.Locations bits. */
export interface BoxFlags {
  /** `box_l` — left-side boxing context active. */
  left: boolean;
  /** `box_r` — right-side boxing context active. */
  right: boolean;
}

/** Truss-chord context — directly mirrors TIntersectionType enum:
 *   - `t_tchord`: connector(top) is TopChord
 *   - `b_tchord`: connector(bottom) is TopChord (Detailer terminology)
 *   - `t_bchord`: connector(top) is BottomChord
 */
export interface ChordFlags {
  t_tchord: boolean;
  b_tchord: boolean;
  t_bchord: boolean;
}

/**
 * Lip-edge fine-grained flags — only used by OnEdge - LipNotched* slots.
 * `rl` = right-lip, `ll` = left-lip; suffix `_e` = edge, `_lf` = on-left-flange,
 * `_rf` = on-right-flange.
 *
 * Until we have a runtime trace of how Detailer derives these bits, callers
 * should pass `undefined` (treated as `false` by the evaluator) — that
 * defaults the OnEdge slots to their fallback alternative.
 */
export interface LipEdgeFlags {
  rl_e?: boolean;
  rl_lf?: boolean;
  rl_rf?: boolean;
  ll_e?: boolean;
  ll_lf?: boolean;
  ll_rf?: boolean;
}

/**
 * Full condition context fed to `evalCondition` /  `evalConditions`. Plumbing
 * the data this struct exposes is the hard part of wiring; the evaluator
 * itself is a pure function.
 */
export interface ConditionContext {
  /** Edge-mask bits — `we`, `le`, `el`, `ew`, `ee` derive from these. */
  edges: EdgeFlags;
  /** True if connector stick has multiple intersection points with connectee. */
  multiHit: boolean;
  /** Web-angle in degrees (0..180). 90 = perpendicular. */
  webAngleDeg?: number;
  /** Box-side flags. Default: both false. */
  box?: BoxFlags;
  /** Chord context. Default: all false. */
  chord?: ChordFlags;
  /** Lip-edge fine-grained flags. */
  lipEdge?: LipEdgeFlags;
}

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
export function evalCondition(token: Condition, ctx: ConditionContext): boolean {
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
      if (ctx.webAngleDeg === undefined) return false;
      return Math.abs(ctx.webAngleDeg - 90) < ANGLE_EPS_DEG;
    }
    case "lt90": {
      if (ctx.webAngleDeg === undefined) return false;
      return ctx.webAngleDeg < 90 - ANGLE_EPS_DEG;
    }
    case "gt90": {
      if (ctx.webAngleDeg === undefined) return false;
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
      const _exhaustive: never = token;
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
export function evalConditions(tokens: Condition[], ctx: ConditionContext): boolean {
  if (tokens.length === 0) return true;
  for (const t of tokens) {
    if (!evalCondition(t, ctx)) return false;
  }
  return true;
}

/**
 * Pack 4 boolean edge flags into the 0..15 mask used as the slot index.
 * Mirrors `FUN_00545694`:
 *   mask = (LL ? 1 : 0) | (LW ? 2 : 0) | (WL ? 4 : 0) | (WW ? 8 : 0)
 */
export function packEdgeMask(edges: EdgeFlags): number {
  let m = 0;
  if (edges.ll) m |= 0x1;
  if (edges.lw) m |= 0x2;
  if (edges.wl) m |= 0x4;
  if (edges.ww) m |= 0x8;
  return m;
}

/** Inverse — unpack a 0..15 mask into an EdgeFlags record. */
export function unpackEdgeMask(mask: number): EdgeFlags {
  return {
    ll: (mask & 0x1) !== 0,
    lw: (mask & 0x2) !== 0,
    wl: (mask & 0x4) !== 0,
    ww: (mask & 0x8) !== 0,
  };
}
