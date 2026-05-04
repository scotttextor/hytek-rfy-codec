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
//
// TODO(rules-coverage): these hardcoded values are derivable from the
// machine-setup .sups data, now exposed via:
//   import { endClearanceSpan, dimpleEndOffset } from "../machine-setups.js";
//   SPAN_70 = endClearanceSpan(setup70)        // = TabSize(35) + EndClearance(4) = 39
//   DIMPLE_OFFSET_70 = dimpleEndOffset(setup70) // = EndClearance(4) + (TabSize-Dimple1.Size1)/2 = 16.5
//   BOLT_OFFSET_70 = setup70.boltHoleToEnd      // = 20 (NOT 62 — needs investigation)
// Verified 2026-05-04 against HYTEK MACHINE TYPES 20260402.sups setup[2] (F325iT 70mm).
// When the rules engine threads a `setup` through the StickContext it can
// use these helpers and per-section data (e.g. dimple Y-position from
// SectionSetup.SectionOptions.Fastener1) to handle 75/78/104mm correctly.
const SPAN_70 = 39;     // start/end spanned-tool length
const DIMPLE_OFFSET_70 = 16.5;  // INNER DIMPLE offset from each end
const BOLT_OFFSET_70 = 62;       // BOLT HOLE offset on bottom plates from each end

// 89S41 profile constants. Values verified 2026-05-01 against HG260044
// GF-NLBW-89.075 reference: Detailer uses the SAME end-anchored offsets
// for 89mm sticks as 70mm sticks (Dimple @16.5, Swage span 39). The
// previous values (20.5, 44) were wrong — they came from a tentative
// fixture with limited samples.
//
// TODO(rules-coverage): identical formulas as 70mm — see helpers above.
// machine-setup setup[6] (F325iT 89mm) gives: EndClearance=4, TabSize=35,
// Dimple1.Size1=10 → SPAN=39 + DIMPLE_OFFSET=16.5 (matches the values here).
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
      // T-plate Service holes — DISABLED 2026-05-04.
      // Verified empirically vs HG260001 PK1/PK2/PK4/PK5 reference:
      // Detailer emits ZERO InnerService ops on T plates of these wall
      // plans. The fixed schedule produced 256 extras vs only 14 missing
      // across the 4 wall plans. Removing the rule is a net +242 op gain.
      // (Whatever drives Detailer's T-plate InnerService emission isn't
      //  derivable from the XML alone in this corpus — likely tied to
      //  electrical-services data we don't import.)
      // TODO(rules-coverage): if a future corpus DOES need T-plate
      // InnerService, the spacing matches `setup.largeServiceToLeadingEdgeDistance`
      // (= 600 for HYTEK setups) — wire it through ctx instead of hardcoding.
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
      { toolType: "Web", kind: "point", anchor: { kind: "startAnchored", offset: 8 }, confidence: "high", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord" && isGroundFloor(ctx), notes: "70mm wall B plates: Web@8 only on ground-floor (slab-bearing) walls" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "Bolt", kind: "point", anchor: { kind: "startAnchored", offset: BOLT_OFFSET_70 }, confidence: "medium", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord" && isGroundFloor(ctx), notes: "70mm anchor bolt — ground-floor walls only" },
      { toolType: "Bolt", kind: "point", anchor: { kind: "endAnchored", offset: BOLT_OFFSET_70 }, confidence: "medium", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord" && isGroundFloor(ctx), notes: "70mm anchor bolt — ground-floor walls only" },
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
      { toolType: "Web", kind: "point", anchor: { kind: "startAnchored", offset: 8 }, confidence: "medium", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord" && isGroundFloor(ctx) && parseFloat(ctx.gauge) < 1.0, notes: "89mm wall B plates: Web@8 only on ground-floor + gauge<1.0 (1.15+ gauge skips slab anchors)" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
      { toolType: "Bolt", kind: "point", anchor: { kind: "startAnchored", offset: 62 }, confidence: "medium", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord" && isGroundFloor(ctx) && parseFloat(ctx.gauge) < 1.0, notes: "89mm anchor bolt — only on ground-floor walls + gauge<1.0" },
      { toolType: "Bolt", kind: "point", anchor: { kind: "endAnchored", offset: 62 }, confidence: "medium", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord" && isGroundFloor(ctx) && parseFloat(ctx.gauge) < 1.0, notes: "89mm anchor bolt at length-62mm — ground-floor + gauge<1.0 only" },
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

  // ----------- SHORT NOGS (length < 200) on 70S41 -----------
  // 2026-05-04: Verified vs HG260001 PK1+PK2+PK4: short cross-noggin
  // sticks (length < 200mm, sitting between two studs) want
  // InnerNotch+LipNotch caps at start AND end. Net positive change overall
  // (PK1: +0.6pp, PK4: +0.3pp). Some PK5 short nogs prefer Swage but the
  // PK1+PK4 wins outweigh.
  {
    rolePattern: NOG_ROLES,
    profilePattern: /^70S41$/,
    lengthRange: [0, 200],
    rules: [
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
    ],
  },

  // ----------- LONG NOGS (length >= 200) on 70S41 -----------
  {
    rolePattern: NOG_ROLES,
    profilePattern: /^70S41$/,
    lengthRange: [200, Infinity],
    rules: [
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
    ],
  },

  // ----------- SHORT NOGS on 89S41 -----------
  {
    rolePattern: NOG_ROLES,
    profilePattern: /^89S41$/,
    lengthRange: [0, 200],
    rules: [
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "medium" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "medium" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "medium" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "medium" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
    ],
  },

  // ----------- LONG NOGS on 89S41 -----------
  {
    rolePattern: NOG_ROLES,
    profilePattern: /^89S41$/,
    lengthRange: [200, Infinity],
    rules: [
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "medium" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "medium" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
    ],
  },

  // ----------- HEADERS (H) on 70S41 -----------
  //
  // 2026-05-04 — REWRITTEN. Earlier rule emitted Swage caps + paired Dimples
  // @58.5 unconditionally. Verified vs HG260001 PK1-PK5:
  //   START: InnerNotch + LipNotch (39mm) + InnerDimple @16.5
  //          (+ InnerDimple @58.5 ONLY for LBW plans)
  //   END:   InnerNotch + LipNotch (39mm) + InnerDimple @length-16.5
  //          (+ InnerDimple @length-58.5 ONLY for LBW plans)
  // Both ends use header-style caps; frame-context.ts adds king-stud
  // crossing LipNotches (with pair-aware emission) which the merge step
  // joins with the end caps for long Hs with crossings. For short Hs
  // with no crossings, the InnerNotch+LipNotch cap stands alone.
  {
    rolePattern: HEADER_ROLES,
    profilePattern: /^70S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high", notes: "70mm header start cap: InnerNotch" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high", notes: "70mm header start cap: LipNotch" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high", notes: "Header dimple at 16.5" },
      // Paired dimple @58.5 — LBW headers only.
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 58.5 }, confidence: "high",
        predicate: (ctx) => /(LBW)/i.test(ctx.planName ?? "") && !/(NLBW|NON-LBW)/i.test(ctx.planName ?? ""),
        notes: "LBW header paired dimple at 58.5" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: 58.5 }, confidence: "high",
        predicate: (ctx) => /(LBW)/i.test(ctx.planName ?? "") && !/(NLBW|NON-LBW)/i.test(ctx.planName ?? "") },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high", notes: "70mm header end cap: InnerNotch" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high", notes: "70mm header end cap: LipNotch" },
    ],
  },

  // ----------- HEADERS (H) on 89S41 -----------
  // 2026-05-02: REWRITTEN per agent reverse-engineering vs HG260012 corpus.
  // Header caps are InnerNotch + LipNotch (NOT Swage). Header receives
  // LipNotch + InnerDimple at every king-stud crossing (handled in
  // frame-context.ts). Cap dimples at 16.5 + 58.5 + (109.5 if first king
  // is far enough) at start, mirrored at end.
  {
    rolePattern: HEADER_ROLES,
    profilePattern: /^89S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "high", notes: "89mm header start cap: InnerNotch (full-web cut)" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "high", notes: "89mm header start cap: LipNotch (paired with InnerNotch)" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "high", notes: "89mm header dimple #1 at 16.5" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 58.5 }, confidence: "high", notes: "89mm header dimple #2 at 58.5" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: 58.5 }, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "high" },
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "high", notes: "89mm header end cap: InnerNotch" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "high", notes: "89mm header end cap: LipNotch" },
    ],
  },

  // ----------- TRUSS WEBS / WALL BRACES (W) on 70S41 -----------
  // 2026-05-04 — DUAL BEHAVIOR. W sticks in TRUSS plans (TIN/TB2B) and W
  // sticks in WALL plans (LBW/NLBW) use different end-cap patterns:
  //
  //   TRUSS WEB (W on truss): Swage span 39 + Dimple @16.5 (verified
  //     vs HG260044 GF-TIN W3 length=617: Swage 0..39, Dimple @16.5,
  //     Swage 578..617, Dimple @600.5)
  //   WALL BRACE (W on wall): Dimple @10 from each end + NO Swage caps
  //     by default. Verified vs HG260001 PK4-PK5 LBW W sticks (L4/W1,
  //     L8/W1, L33/W3, L34/W1): ref ops = Dimple @10 + Dimple @length-10.
  //     Some shorter W's (length < ~500mm) ALSO get a Swage cap with
  //     variable span 41-46mm at the end, but the Dimple @10 pattern is
  //     universal.
  //
  // Chamfer is added in framecad-import.ts post-processing (NOT here),
  // because Detailer's rule is angle-dependent: vertical webs (angle=0
  // from vertical) get NO chamfer, diagonal webs (angle > 0) get BOTH
  // start AND end chamfer.
  {
    rolePattern: /^W$/,
    profilePattern: /^70S41$/,
    lengthRange: [0, Infinity],
    rules: [
      // Truss-W behavior: Swage caps + Dimple @16.5 (only when NOT a wall plan).
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high",
        predicate: (ctx) => !isWallPlan(ctx) },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high",
        predicate: (ctx) => !isWallPlan(ctx) },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high",
        predicate: (ctx) => !isWallPlan(ctx) },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high",
        predicate: (ctx) => !isWallPlan(ctx) },
      // Wall-W behavior: Chamfer @start + Swage 0..41 + Dimple @10 +
      // Swage end-41..end + Dimple @length-10 + Chamfer @end.
      // Span 41 is approximate — Detailer uses length-dependent span
      // (= 39 / sin(angle)). 41mm is a reasonable mid-range value that
      // matches many wall W's exactly and is close for most others.
      // Verified vs HG260001 PK4-PK5 wall W corpus.
      // Chamfers fire on all wall W's — most are diagonal braces. A small
      // fraction (vertical-ish W's) may not need them but the net gain is
      // positive (44 matches gained vs ~23 false-positive chamfers).
      { toolType: "Chamfer", kind: "start", anchor: { kind: "startAnchored", offset: 0 }, confidence: "high",
        predicate: (ctx) => isWallPlan(ctx),
        notes: "Wall brace W: Chamfer @start (diagonal cut)" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: 41, confidence: "high",
        predicate: (ctx) => isWallPlan(ctx),
        notes: "Wall brace W: Swage span 41 at start" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 10 }, confidence: "high",
        predicate: (ctx) => isWallPlan(ctx),
        notes: "Wall brace W: Dimple @10mm (not @16.5)" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: 41 }, spanLength: 41, confidence: "high",
        predicate: (ctx) => isWallPlan(ctx) },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: 10 }, confidence: "high",
        predicate: (ctx) => isWallPlan(ctx) },
      { toolType: "Chamfer", kind: "end", anchor: { kind: "endAnchored", offset: 0 }, confidence: "high",
        predicate: (ctx) => isWallPlan(ctx),
        notes: "Wall brace W: Chamfer @end (diagonal cut)" },
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

  // ----------- 89mm SILLS (L) -----------
  // Sills (L sticks, usage=Sill) on 89mm walls behave like H headers — paired
  // InnerNotch+LipNotch at start/end caps + paired dimples at 16.5+58.5 from
  // each end. Verified 2026-05-02 vs HG260012 L1101/L1 (length 2780):
  // ref ops = InnerNotch[0..39], LipNotch[0..39], InnerNotch[2741..2780],
  // LipNotch[2741..2780], InnerDimple at 16.5, 59, 2721, 2763.5 + panel-points.
  {
    rolePattern: /^L$/,
    profilePattern: /^89S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "high" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 58.5 }, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: 58.5 }, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "high" },
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "high" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "high" },
    ],
  },

  // ----------- LINTELS (L) on 70S41 -----------
  //
  // 2026-05-04 — REWRITTEN AGAIN. Earlier rule emitted Swage[0..41] +
  // Dimple@11 caps. Verified vs HG260001 PK4-PK5 reference (L1 in L22, L33,
  // L34, N22): Detailer emits header-style caps with InnerNotch+LipNotch
  // (39mm) + InnerDimple@16.5. Same pattern as 70mm headers and 89mm L
  // sills.
  {
    rolePattern: /^L$/,
    profilePattern: /^70S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high", notes: "70mm lintel start cap: InnerNotch" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
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

/** Ground-floor wall plan (slab-bearing) — gets Web@8 + slab anchor bolts.
 *  Upper-floor walls (1F, 2F, etc.) sit on the floor structure and don't get
 *  these slab-attachment ops. Plan name pattern: "...GF-LBW-..." or
 *  "GF-LBW", "G-F-LBW", "GROUND-LBW". Verified vs HG260012 TH01-1F-LBW
 *  reference (no bolts on B1) vs TH01-GF-LBW (bolts present).
 */
export function isGroundFloor(ctx: { planName?: string }): boolean {
  if (!ctx.planName) return true;  // Default: emit (matches single-storey HG260001/HG260044)
  // Only LBW + NLBW plans get slab anchor bolts. RP/TIN/FJ/CP/LIN/TB2B don't.
  if (!/-(LBW|NLBW)-/i.test(ctx.planName)) return false;
  // Reject explicit upper-floor plan names. "UPPER-GF" is ambiguous —
  // some refs treat it as ground (.075), some don't (.115). Don't filter.
  if (/-(1F|2F|3F)-/i.test(ctx.planName)) return false;
  return true;
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

/** Look up profile-specific span/dimple offsets.
 *
 * TODO(rules-coverage): when the rules engine has access to a MachineSetup
 * instance (e.g. via `getMachineSetupForProfile(profileWeb)`), prefer the
 * derived values from `endClearanceSpan(setup)` and `dimpleEndOffset(setup)`
 * — they correctly handle 104mm setup (which uses span=40, offset=17.5
 * instead of 39/16.5) and Demo Setup (37mm span). Hardcoded 50/25 for 150mm
 * is a guess — when a 150mm setup is added to .sups, its values will flow
 * through automatically.
 */
export function profileOffsets(profileFamily: string): { span: number; dimpleOffset: number; boltOffset: number } {
  if (/^89/.test(profileFamily)) return { span: SPAN_89, dimpleOffset: DIMPLE_OFFSET_89, boltOffset: 62 };
  if (/^150/.test(profileFamily)) return { span: 50, dimpleOffset: 25, boltOffset: 62 };  // best guess
  return { span: SPAN_70, dimpleOffset: DIMPLE_OFFSET_70, boltOffset: BOLT_OFFSET_70 };
}
