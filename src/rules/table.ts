/**
 * Detailer-replacement rules table — derived from corpus analysis of real
 * Detailer outputs (see research/output/rules-fixture.txt and sample-sticks-*.txt).
 *
 * The table covers UNIVERSAL per-stick patterns: end-anchored ops on every
 * stud/plate/nog/brace/etc. Frame-context-dependent ops (LIP notches at stud
 * crossings on top/bottom plates, WEB+LIP notches at stud crossings on nogs)
 * are computed separately by src/rules/frame-context.ts.
 *
 * The patterns observed are remarkably consistent:
 *
 *   STUDS (S):
 *     start: SWAGE [0..39] + INNER DIMPLE @16.5
 *     end:   SWAGE [length-39..length] + INNER DIMPLE @length-16.5
 *
 *   TOP PLATES (T) and BOTTOM PLATES (B) (asymmetric ends — same TYPE):
 *     start: LIP NOTCH [0..39] + INNER DIMPLE @16.5
 *     end:   LIP NOTCH [length-39..length] + INNER DIMPLE @length-16.5
 *
 *   NOGS (N):
 *     start: SWAGE [0..39] + INNER DIMPLE @16.5
 *     end:   SWAGE [length-39..length] + INNER DIMPLE @length-16.5
 *
 *   BOTTOM PLATES additionally have BOLT HOLES at start+62 and end-62 for
 *   anchoring to the slab.
 *
 *   HEAD plates (H), KING-/J(amb)-studs (Kb), and similar variant studs
 *   share the same structure with different terminal ops; pending more data.
 *
 * The 39mm span and 16.5mm dimple offset are tied to the 70S41 profile
 * (web=70mm, flange=41mm). For other profiles (89S41, 150S41, etc.) the
 * offsets scale with profile width (≈ flange/2 + small fixed offset).
 */
import type { RuleGroup } from "./types.js";

const STUD_ROLES = /^(S|J)$/;          // S=full stud, J=jack stud (door/window jamb)
const CRIPPLE_ROLES = /^Kb$/;          // Kb=king brace/cripple stud
const HEADER_ROLES = /^H$/;            // H=header/headplate (separate rules — paired dimples)
const PLATE_ROLES = /^(T|B|Tp|Bp)$/;   // T/Tp=top plate, B/Bp=bottom plate
const NOG_ROLES = /^(N|Nog)$/;
const BRACE_ROLES = /^(Br|W|R|L)$/;    // W=web brace, R=ribbon, L=lintel — sticks-as-bracing

// 70S41 profile constants (most common — derived empirically from fixture)
const SPAN_70 = 39;     // start/end spanned-tool length
const DIMPLE_OFFSET_70 = 16.5;  // INNER DIMPLE offset from each end
const BOLT_OFFSET_70 = 62;       // BOLT HOLE offset on bottom plates from each end

// 89S41 profile constants. Values verified 2026-05-01 against HG260044
// GF-NLBW-89.075 reference: Detailer uses the SAME end-anchored offsets
// for 89mm sticks as 70mm sticks (Dimple @16.5, Swage span 39). The
// previous values (20.5, 44) were wrong — they came from a tentative
// fixture with limited samples.
const SPAN_89 = 39;
const DIMPLE_OFFSET_89 = 16.5;

export const RULE_TABLE: RuleGroup[] = [
  // ----------- STUDS on 70S41 (any length) -----------
  {
    rolePattern: STUD_ROLES,
    profilePattern: /^70S41$/,
    lengthRange: [0, Infinity],
    rules: [
      {
        toolType: "Swage", kind: "spanned",
        anchor: { kind: "startAnchored", offset: 0 },
        spanLength: SPAN_70,
        confidence: "high",
        notes: "100% of S sticks; fixture: 521/523 in S|70S41|1500-3000",
      },
      {
        toolType: "InnerDimple", kind: "point",
        anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 },
        confidence: "high",
        notes: "100% of S sticks; pos hotspot 17mm × 492",
      },
      {
        toolType: "Swage", kind: "spanned",
        anchor: { kind: "endAnchored", offset: SPAN_70 },
        spanLength: SPAN_70,
        confidence: "high",
        notes: "End swage span [length-39 .. length]",
      },
      {
        toolType: "InnerDimple", kind: "point",
        anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 },
        confidence: "high",
        notes: "End dimple at length-16.5",
      },
      // Service holes — only on wall studs (LBW or NLBW plans) with length >= ~500
      {
        toolType: "InnerService", kind: "point",
        anchor: { kind: "startAnchored", offset: 296 },
        confidence: "medium",
        predicate: (ctx) => isWallPlan(ctx) && ctx.length >= 500 && ctx.length >= 296 + 200,
        notes: "Electrical service hole at ~300mm from start (outlet height)",
      },
      {
        toolType: "InnerService", kind: "point",
        anchor: { kind: "startAnchored", offset: 446 },
        confidence: "medium",
        predicate: (ctx) => isWallPlan(ctx) && ctx.length >= 500 && ctx.length >= 446 + 200,
        notes: "Electrical service hole at ~450mm from start (paired with 296mm)",
      },
      // Web holes are emitted in framecad-import.ts as a post-processing step
      // (the rules engine emits one op per rule entry, but we need N evenly-
      // spaced holes per stud which can't be expressed as fixed offsets).
    ],
  },

  // ----------- STUDS on 89S41 -----------
  {
    rolePattern: STUD_ROLES,
    profilePattern: /^89S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "medium", notes: "Pending 89-profile corpus refinement" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "medium" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
      // Service holes — same as 70mm pattern (electrical outlet/switch heights).
      {
        toolType: "InnerService", kind: "point",
        anchor: { kind: "startAnchored", offset: 296 },
        confidence: "medium",
        predicate: (ctx) => isWallPlan(ctx) && ctx.length >= 500 && ctx.length >= 296 + 200,
        notes: "89mm stud: electrical outlet hole at 296mm",
      },
      {
        toolType: "InnerService", kind: "point",
        anchor: { kind: "startAnchored", offset: 446 },
        confidence: "medium",
        predicate: (ctx) => isWallPlan(ctx) && ctx.length >= 500 && ctx.length >= 446 + 200,
        notes: "89mm stud: paired service hole at 446mm",
      },
    ],
  },

  // ----------- CRIPPLE STUDS / HEADERS (Kb / H) on 70S41 -----------
  // Observed pattern (fixture HG260001):
  //   START: Chamfer-start  (no Chamfer-end)
  //   START: Swage spanned with VARIABLE span ~115-125mm (skipped — can't predict)
  //   START: InnerDimple @ 10mm
  //   END:   Swage spanned (length-43)..length
  //   END:   InnerDimple @ length-10
  {
    rolePattern: CRIPPLE_ROLES,
    profilePattern: /^70S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "Chamfer", kind: "start", anchor: { kind: "startAnchored", offset: 0 }, confidence: "high", notes: "Kb/H sticks: Chamfer at START only (no Chamfer-end observed)" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 10 }, confidence: "high", notes: "Kb dimple at 10mm (not 16.5mm)" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: 43 }, spanLength: 43, confidence: "medium", notes: "End swage span 43mm (slightly different from S stud 39mm)" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: 10 }, confidence: "high" },
    ],
  },

  // ----------- CRIPPLE STUDS on 89S41 -----------
  {
    rolePattern: CRIPPLE_ROLES,
    profilePattern: /^89S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "Chamfer", kind: "start", anchor: { kind: "startAnchored", offset: 0 }, confidence: "medium" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 10 }, confidence: "medium" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: 50 }, spanLength: 50, confidence: "low" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: 10 }, confidence: "medium" },
    ],
  },

  // ----------- TOP PLATES on 70S41 -----------
  {
    rolePattern: /^(T|Tp)$/,
    profilePattern: /^70S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high", notes: "100% of T plates have lip notch span at start" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      // InnerNotch on T plates is SELECTIVE (some short T sub-plates have it,
      // some don't — pattern not yet derivable from sample). Skipping to avoid
      // over-emission (100 extras vs 12 matches when emitted unconditionally).
      // T-plate Service holes — every 600mm starting at 306mm.
      // 2026-05-02: REVERTED to fixed schedule. The frame-context midpoint
      // approach matched HG260044 better but FAILED for HG260001 (which is
      // the actual factory corpus). HG260001 reference uses fixed positions
      // @306, @906, @1506, @2106, @2706, @3306 etc. — every 600mm.
      {
        toolType: "InnerService", kind: "point",
        anchor: { kind: "spaced", firstOffset: 306, spacing: 600, lastOffset: 306 },
        confidence: "high",
        predicate: (ctx) => isWallPlan(ctx) && ctx.length >= 600,
        notes: "T plates: power-feed drops at 600mm intervals from offset 306mm",
      },
    ],
  },

  // ----------- BOTTOM PLATES on 70S41 -----------
  // Same as top plates PLUS anchor bolts at 62mm offsets for slab attachment
  // PLUS Web notch point at 8mm (web access slot for sub-floor wiring).
  {
    rolePattern: /^(B|Bp)$/,
    profilePattern: /^70S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "Web", kind: "point", anchor: { kind: "startAnchored", offset: 8 }, confidence: "high", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord", notes: "Wall B plates: Web access slot for sub-floor wiring (HG260001 has it on B1, B2, B3 alike)" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "Bolt", kind: "point", anchor: { kind: "startAnchored", offset: BOLT_OFFSET_70 }, confidence: "medium", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord", notes: "Anchor bolt for slab attachment — wall B plates only" },
      { toolType: "Bolt", kind: "point", anchor: { kind: "endAnchored", offset: BOLT_OFFSET_70 }, confidence: "medium", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord", notes: "Anchor bolt for slab attachment — wall B plates only" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      // InnerNotch on B plates is SELECTIVE — same as T (some sticks have it,
      // some don't). Skipping to avoid over-emission (96 extras vs 12 matches).
    ],
  },

  // ----------- TOP PLATES on 89S41 -----------
  {
    rolePattern: /^(T|Tp)$/,
    profilePattern: /^89S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "medium" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "medium" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
    ],
  },

  // ----------- BOTTOM PLATES on 89S41 -----------
  // Same as top plates PLUS Web@8 + Bolt@~50mm for slab attachment.
  // Verified 2026-05-01 against HG260044 GF-NLBW-89.075: B1 has
  // BOLT HOLES @8, ANCHOR @53.7. B3 has ANCHOR @48.
  // Wall B plates only — truss BottomChord doesn't get these.
  {
    rolePattern: /^(B|Bp)$/,
    profilePattern: /^89S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "medium" },
      { toolType: "Web", kind: "point", anchor: { kind: "startAnchored", offset: 8 }, confidence: "medium", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord", notes: "89mm wall B plates" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
      { toolType: "Bolt", kind: "point", anchor: { kind: "startAnchored", offset: 62 }, confidence: "medium", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord", notes: "89mm anchor bolt — same offset as 70mm (62mm). Verified vs HG260012 LBW-89.075." },
      { toolType: "Bolt", kind: "point", anchor: { kind: "endAnchored", offset: 62 }, confidence: "medium", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord", notes: "89mm anchor bolt at length-62mm" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "medium" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
    ],
  },

  // ----------- RAISED B-PLATES (Bh) on 89S41 -----------
  // 89mm B plates whose z-coordinate sits at frame_elevation + 61.5 (one
  // flange-height above the floor) are RAISED — they form the rough-opening
  // sill above doors, NOT the slab plate. Detailer emits HEADER-STYLE ops:
  //   - InnerNotch + LipNotch at start AND end (39mm clearance)
  //   - InnerDimple at start + end (16.5mm offset)
  //   - NO Web@8 (not slab-attached)
  //   - NO Bolts (not slab-anchored)
  // Verified 2026-05-02 vs HG260012 L1001/B2 (length 894mm, z=51861.5,
  // elevation=51800).
  // 70mm raised B plates (HG260001 L24/B2) DON'T use this pattern — keep
  // slab-style ops.
  {
    rolePattern: /^Bh$/,
    profilePattern: /^89S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "high", notes: "Raised 89mm B: InnerNotch at start clearance" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "high" },
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "high" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "high" },
    ],
  },

  // ----------- NOGS on 70S41 -----------
  {
    rolePattern: NOG_ROLES,
    profilePattern: /^70S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
    ],
  },

  // ----------- NOGS on 89S41 -----------
  {
    rolePattern: NOG_ROLES,
    profilePattern: /^89S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "medium" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "medium" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
    ],
  },

  // ----------- HEADERS (H) on 70S41 -----------
  //
  // 2026-05-02 — InnerNotch ops REMOVED. Earlier note ("verified HG260044
  // L6/H1") was incorrect — re-checking against HG260001 reference shows H
  // headers have NO InnerNotch ops. The cut steel had spurious web-notches
  // that didn't exist in Detailer's output. The header pattern is:
  //   - Swage 0..39 at start
  //   - Dimple @16.5 + paired Dimple @58.5 at start
  //   - Dimple @length-58.5 + paired Dimple @length-16.5 at end
  //   - Swage length-39..length at end
  // Paired dimples (16.5 + 58.5 = 42mm spacing) at each end is the
  // distinctive header pattern (vs 1 dimple for studs).
  {
    rolePattern: HEADER_ROLES,
    profilePattern: /^70S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high", notes: "Header dimple #1 at 16.5" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 58.5 }, confidence: "high", notes: "Header paired dimple at 58.5 (= 16.5 + 42mm)" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: 58.5 }, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
    ],
  },

  // ----------- HEADERS (H) on 89S41 -----------
  // Same pattern as 70mm headers but with 89mm dimensions.
  // Verified 2026-05-01 against HG260044 GF-NLBW-89.075: H1 has 12 InnerDimples
  // at panel-point spacings.
  {
    rolePattern: HEADER_ROLES,
    profilePattern: /^89S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "medium" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium", notes: "89mm header dimple #1 at 16.5" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 58.5 }, confidence: "medium", notes: "89mm header paired dimple at 58.5" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: 58.5 }, confidence: "medium" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "medium" },
    ],
  },

  // ----------- TRUSS WEBS (W) on 70S41 -----------
  // Truss web members get the SAME end-anchored pattern as full studs:
  // Swage span 39mm + Dimple at 16.5 from each end.
  //
  // Chamfer is added in framecad-import.ts post-processing (NOT here),
  // because Detailer's rule is angle-dependent: vertical webs (angle=0
  // from vertical) get NO chamfer, diagonal webs (angle > 0) get BOTH
  // start AND end chamfer. Verified 2026-04-30 against HG260044 GF-TIN
  // reference: 100% correlation between non-zero angle and chamfer-both-ends.
  //
  // Sample W3 (length 617): Swage 0..39, Dimple @16.5, Swage 578..617, Dimple @600.5
  {
    rolePattern: /^W$/,
    profilePattern: /^70S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
    ],
  },

  // ----------- TRUSS WEBS / FJ JOIST WEBS (W) on 89S41 -----------
  // FJ joist V-prefix sticks are mapped to W role (usage="Web"). They get
  // the same stud-style end clearance pattern: Swage span 39 + Dimple @16.5.
  // Verified 2026-05-02 against HG260012 TH01-2F-FJ-89.075/J1201-1/V5
  // (length 352): Swage 0..39 + Dimple@16.5 + Swage 313..352 + Dimple@335.5.
  {
    rolePattern: /^W$/,
    profilePattern: /^89S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "high" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "high" },
    ],
  },

  // ----------- LINTELS (L) on 70S41 -----------
  //
  // 2026-05-02 — REWRITTEN. Earlier rule emitted InnerNotch + 16.5/39mm
  // stud-style ops; the rollformer test cut had wrong web-notches and the
  // Swage span was 2mm too narrow. HG260001 reference shows lintels use a
  // diagonal-W-style pattern: 41mm Swage span (not 39), 11mm dimple offset
  // (not 16.5), NO InnerNotch.
  //
  // Sample L1 (length 2266): Swage[0..41] + Dimple@11 + Swage[2225..2266] + Dimple@2255
  {
    rolePattern: /^L$/,
    profilePattern: /^70S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: 41, confidence: "high", notes: "Lintel: 41mm Swage span (not 39 like studs)" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 11 }, confidence: "high", notes: "Lintel: dimple at 11mm (not 16.5)" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: 41 }, spanLength: 41, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: 11 }, confidence: "high" },
    ],
  },

  // ----------- BRACE / Ribbon sticks on 70S41 (NOT truss webs, NOT lintels) -----------
  // Brace dimple offset 11mm (vs 16.5 for studs); span 41mm (vs 39 for studs).
  // Pulled from W|70S41|500-1500 sample data — note this is for wall braces,
  // truss webs (W) and lintels (L) are handled in dedicated rules above.
  {
    rolePattern: /^(Br|R)$/,
    profilePattern: /^70S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: 41, confidence: "medium" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 11 }, confidence: "medium", notes: "Brace dimple at 11mm" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: 41 }, spanLength: 41, confidence: "medium" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: 11 }, confidence: "medium" },
    ],
  },
];

/** Wall plans contain studs that need electrical service holes. */
export function isWallPlan(ctx: { planName?: string }): boolean {
  if (!ctx.planName) return false;
  return /(LBW|NLBW|LOAD-BEARING|NON-LOAD)/i.test(ctx.planName);
}

/**
 * Primary B plate detection: B1 OR any other B plate >= 1500mm long.
 * Detailer emits anchor bolts (slab attachment) only on the slab-resting
 * plate. Short B2/B3 plates above doors/windows don't get anchor bolts.
 */
export function isPrimaryBPlate(ctx: { stickName?: string; length: number }): boolean {
  if (ctx.stickName === "B1" || ctx.stickName === "Bp1") return true;
  if (ctx.length >= 1500) return true;
  return false;
}

/** Look up profile-specific span/dimple offsets. */
export function profileOffsets(profileFamily: string): { span: number; dimpleOffset: number; boltOffset: number } {
  if (/^89/.test(profileFamily)) return { span: SPAN_89, dimpleOffset: DIMPLE_OFFSET_89, boltOffset: 62 };
  if (/^150/.test(profileFamily)) return { span: 50, dimpleOffset: 25, boltOffset: 62 };  // best guess
  return { span: SPAN_70, dimpleOffset: DIMPLE_OFFSET_70, boltOffset: BOLT_OFFSET_70 };
}
