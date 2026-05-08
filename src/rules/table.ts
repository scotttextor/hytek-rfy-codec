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
import {
  MACHINE_SETUPS,
  endClearanceSpan,
  dimpleEndOffset,
} from "../machine-setups.js";

const STUD_ROLES = /^(S|J)$/;          // S=full stud, J=jack stud (door/window jamb)
const CRIPPLE_ROLES = /^Kb$/;          // Kb=king brace/cripple stud
const HEADER_ROLES = /^H$/;            // H=header/headplate (separate rules — paired dimples)
const PLATE_ROLES = /^(T|B|Tp|Bp)$/;   // T/Tp=top plate, B/Bp=bottom plate
const NOG_ROLES = /^(N|Nog)$/;
const BRACE_ROLES = /^(Br|W|R|L)$/;    // W=web brace, R=ribbon, L=lintel — sticks-as-bracing

// Per-profile end-anchored constants — derived from the canonical HYTEK
// machine-setup .sups data via helpers in `../machine-setups.ts`.
//
// Each rule group below has a `profilePattern` of either `^70S41$` or
// `^89S41$`, so by construction the 70-group only fires on 70mm sticks and
// the 89-group only fires on 89mm sticks. We resolve the constants once at
// module load using the setup that matches each profile (setup[2] = F325iT
// 70mm, setup[6] = F325iT 89mm). The helpers compute:
//
//   SPAN          = TabSize + EndClearance                       (= 39)
//   DIMPLE_OFFSET = EndClearance + (TabSize - Dimple1.Size1) / 2 (= 16.5)
//
// For HYTEK F325iT 70mm + 89mm both setups have Tab=35, EndClearance=4,
// Dimple1=10, so SPAN=39 and DIMPLE_OFFSET=16.5 — identical to the previous
// hardcoded values. The architectural improvement: the helpers are now the
// single source of truth, so a future setup edit (or a new 75/78/104mm rule
// group keyed off MACHINE_SETUPS["1"|"4"|"5"]) automatically picks up the
// right values.
//
// BOLT_OFFSET_70 stays a hardcoded HYTEK construction-detail constant — see
// audit Section 5.A. `setup.boltHoleToEnd = 20` does NOT match the 62mm
// slab-anchor offset; the audit concluded that field applies to TB2B truss
// bolts, not slab anchors, and 62 has no direct setup-field source.
const _SETUP_70 = MACHINE_SETUPS["2"]!;  // F325iT 70mm
const _SETUP_89 = MACHINE_SETUPS["6"]!;  // F325iT 89mm
const SPAN_70 = endClearanceSpan(_SETUP_70);              // = 39 (Tab.size1 + endClearance)
const DIMPLE_OFFSET_70 = dimpleEndOffset(_SETUP_70);      // = 16.5
const BOLT_OFFSET_70 = 62;                                // HYTEK slab-anchor constant — not setup-derived
const SPAN_89 = endClearanceSpan(_SETUP_89);              // = 39
const DIMPLE_OFFSET_89 = dimpleEndOffset(_SETUP_89);      // = 16.5

/**
 * Wall-W end-Swage span as a function of stick angle from vertical.
 *
 * For wall braces (W sticks in LBW/NLBW plans), Detailer scales the
 * end-Swage cap span with the stick's angle. Vertical W's get ~39mm,
 * shallow-angle W's grow modestly (~40-45mm), and steep W's grow
 * substantially (~50-60mm at 39-43°).
 *
 * Empirical fit against 280 W-Swage gap pairs across HG260001 + HG260044
 * + HG260023 LBW corpora (mined 2026-05-05 via scripts/mine-wallw-swage.mjs):
 *
 *   span = 39 / cos(angle) + 8 * tan²(angle)
 *
 * Rationale: 39/cos(angle) is the perpendicular cap projected onto the
 * angled stick axis (the cap is fixed-width perpendicular to the plate).
 * The 8*tan²(angle) term captures the additional axial coverage required
 * by the angled-cut chord at the plate join — kicks in noticeably above
 * ~22° where the cut becomes geometrically significant.
 *
 * Per-record RMSE (angles 9-43°): 0.36mm — within the 1.5mm match tolerance
 * across the entire range. The fit also matches `39/cos(angle)^1.4` to
 * 4 decimals; the explicit-residual form was chosen for legibility.
 *
 * Edge cases not captured: 8 short (≈194mm) W sticks at 57° in HG260044
 * L12 want span ≈ 84mm (formula predicts 90mm — 6mm overshoot, still
 * outside the 1.5mm position tolerance). Capped at 92mm to bound damage.
 *
 * Earlier attempt (Agent T): `39/sin(angle)` regressed HG260023 — wrong
 * trig axis (the cap projects from horizontal to stick axis, which is
 * cos not sin), and missing the quadratic-in-tan add for steep angles.
 */
function wallWEndSwageSpan(angleFromVerticalDeg: number): number {
  const a = Math.max(0, angleFromVerticalDeg);
  const rad = a * Math.PI / 180;
  const cos = Math.cos(rad);
  if (cos < 0.05) return 92;  // safety cap for near-horizontal W (shouldn't happen)
  const tan = Math.sin(rad) / cos;
  return Math.min(39 / cos + 8 * tan * tan, 92);
}

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
      // Start Swage: ~42mm at the mid-wall end (cap perpendicular to Kb axis).
      // Verified 2026-05-04 vs HG260001 PK4 LBW Kb1: ref Swage 0..42.4 (span 42).
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: 42, confidence: "high",
        predicate: (ctx) => ctx.role === "Kb",
        notes: "Kb start Swage: ~42mm cap at mid-wall end" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 10 }, confidence: "high", notes: "Kb dimple at 10mm (not 16.5mm)" },
      // End Swage: angle-dependent span = 45/cos(angle from horizontal).
      // For steep Kbs (~68° from horizontal) this is ~120mm — covers the
      // Kb's plate-attached angled cut. Verified 2026-05-04 vs HG260001 PK4
      // LBW Kb1 (angle 68.3°): ref Swage 1354..1476.6 (span 122.6 ≈ 45/cos(68.3°)
      // = 121.6).
      { toolType: "Swage", kind: "spanned",
        anchor: { kind: "endAnchored", offset: 0 },
        spanLengthFn: (ctx) => {
          const angleFromVert = ctx.angleFromVertical ?? 0;
          const angleFromHoriz = 90 - angleFromVert;
          const c = Math.cos(angleFromHoriz * Math.PI / 180);
          if (c < 0.05) return 43;  // near-horizontal Kb
          return Math.min(45 / c, 200);  // cap at 200mm
        },
        confidence: "medium",
        predicate: (ctx) => ctx.role === "Kb",
        notes: "Kb end Swage: angle-dependent span (45/cos(angle from horizontal))" },
      // For H sticks (cripple role but not Kb), keep simpler 43mm span.
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: 43 }, spanLength: 43, confidence: "medium",
        predicate: (ctx) => ctx.role !== "Kb",
        notes: "H end swage span 43mm" },
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

  // ----------- SHORT TOP PLATES (length < 200) on 70S41 -----------
  //
  // 2026-05-04 — Verified vs HG260001 PK4 LBW L4: T2/T3/T4 sub-plates of
  // length 121mm-127mm sit ABOVE the H1 header (header-cap T-plates). They
  // get HEADER-STYLE end caps: InnerNotch + LipNotch + InnerDimple @16.5
  // + InnerDimple @58.5 (paired LBW dimples) at each end. Same pattern
  // as 70mm headers (H rule below).
  //
  // Triggered ONLY when length < 200mm (sub-plates above headers). Long T
  // plates (full top plates) keep their normal LipNotch-only caps.
  {
    rolePattern: /^(T|Tp)$/,
    profilePattern: /^70S41$/,
    lengthRange: [0, 200],
    rules: [
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high", notes: "Short T sub-plate (header cap): InnerNotch @start" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 58.5 }, confidence: "high",
        predicate: (ctx) => /(LBW)/i.test(ctx.planName ?? "") && !/(NLBW|NON-LBW)/i.test(ctx.planName ?? ""),
        notes: "Short T (header cap) on LBW: paired dimple at 58.5" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: 58.5 }, confidence: "high",
        predicate: (ctx) => /(LBW)/i.test(ctx.planName ?? "") && !/(NLBW|NON-LBW)/i.test(ctx.planName ?? "") },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high", notes: "Short T sub-plate: InnerNotch @end" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
    ],
  },

  // ----------- TOP PLATES on 70S41 (length >= 200) -----------
  {
    rolePattern: /^(T|Tp)$/,
    profilePattern: /^70S41$/,
    lengthRange: [200, Infinity],
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
      // Web@8 + Bolt@62 are SLAB-ANCHOR ops — only on the primary slab-bearing
      // B-plate (B1, or any B-plate >= 1500mm). Sub-plates (B2/B3/B4) above
      // doors/windows are NOT slab-bearing and don't get Web@8/Bolt@62.
      // Verified 2026-05-05 (Agent U) vs HG260001 PK1+PK2+PK4+PK5: codec
      // emitted Web@8 on every B sub-plate, producing 230 extras across the
      // 4 LBW/NLBW plans where Detailer's ref had none.
      { toolType: "Web", kind: "point", anchor: { kind: "startAnchored", offset: 8 }, confidence: "high", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord" && isGroundFloor(ctx) && isPrimaryBPlate(ctx), notes: "70mm wall B plates: Web@8 only on ground-floor PRIMARY B plate (B1 or >=1500mm)" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "Bolt", kind: "point", anchor: { kind: "startAnchored", offset: BOLT_OFFSET_70 }, confidence: "medium", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord" && isGroundFloor(ctx) && isPrimaryBPlate(ctx), notes: "70mm anchor bolt — ground-floor PRIMARY B plate only" },
      { toolType: "Bolt", kind: "point", anchor: { kind: "endAnchored", offset: BOLT_OFFSET_70 }, confidence: "medium", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord" && isGroundFloor(ctx) && isPrimaryBPlate(ctx), notes: "70mm anchor bolt — ground-floor PRIMARY B plate only" },
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
      // Web@8 + Bolt@62 are SLAB-ANCHOR ops — only on the primary slab-bearing
      // B-plate (B1, or any B-plate >= 1500mm). See 70S41 rule above for context.
      { toolType: "Web", kind: "point", anchor: { kind: "startAnchored", offset: 8 }, confidence: "medium", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord" && isGroundFloor(ctx) && parseFloat(ctx.gauge) < 1.0 && isPrimaryBPlate(ctx), notes: "89mm wall B plates: Web@8 only on ground-floor PRIMARY B plate (gauge<1.0)" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
      { toolType: "Bolt", kind: "point", anchor: { kind: "startAnchored", offset: 62 }, confidence: "medium", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord" && isGroundFloor(ctx) && parseFloat(ctx.gauge) < 1.0 && isPrimaryBPlate(ctx), notes: "89mm anchor bolt — only on ground-floor PRIMARY B plate + gauge<1.0" },
      { toolType: "Bolt", kind: "point", anchor: { kind: "endAnchored", offset: 62 }, confidence: "medium", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord" && isGroundFloor(ctx) && parseFloat(ctx.gauge) < 1.0 && isPrimaryBPlate(ctx), notes: "89mm anchor bolt at length-62mm — ground-floor PRIMARY B plate + gauge<1.0 only" },
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

  // ----------- RAISED B-PLATES (Bh) on 70S41 -----------
  // 70mm version of the 89mm raised B-plate rule. Same pattern: InnerNotch +
  // LipNotch at both ends, InnerDimple at 16.5 each end.
  //
  // 2026-05-07 (Scott Rule 3): Raised B-plates NEVER get slab anchors. Scott
  // explicitly confirmed the prior NLBW raised-B Web@8 + Bolt@62 emission was
  // "human error" in the reference data. Removed the NLBW slab-anchor sub-rules.
  // Anchors only fire on B-plates sitting at z=0 on the slab — raised B-plates
  // (Bh role, OR z>30) NEVER attach to the slab.
  {
    rolePattern: /^Bh$/,
    profilePattern: /^70S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high", notes: "Raised 70mm B: InnerNotch at start clearance" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
    ],
  },

  // ----------- SHORT NOGS (length < 200) on 70S41 — SPECIAL 164mm CASE -----------
  // 2026-05-05 (Agent T): The original "<200mm short nog wants Notches" rule
  // was empirically WRONG on 91 of 105 short N sticks across HG260001/044/023.
  // Cross-corpus length-bucket analysis (LBW + NLBW + RP):
  //   70-150mm:  Detailer wants Swage @start + Swage @end (89/91 mismatched)
  //   164mm:     Detailer wants InnerNotch + LipNotch caps   (14/14 perfect)
  //   170-190mm: Detailer wants Swage @start + Swage @end (14/14 mismatched)
  // The 164mm case is a DOOR-HEAD CRIPPLE block — Detailer treats it as a
  // header sub-piece and puts Notch caps on it. All other short nogs are
  // regular cross-noggins and get Swage caps like long nogs.
  // Narrowing the lengthRange to [162, 168] keeps the 164mm Notch behavior
  // and lets every other short nog fall through to the LONG_NOG rule below.
  {
    rolePattern: NOG_ROLES,
    profilePattern: /^70S41$/,
    lengthRange: [162, 168],
    rules: [
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
    ],
  },

  // ----------- ALL OTHER NOGS on 70S41 (cross-noggins, both short and long) -----------
  // Length range starts at 0 — short nogs <162mm and >=168mm match here too.
  // Verified across all 3 corpora 2026-05-05: 91/91 short nogs (excluding
  // 164mm header-cripples) get Swage @start + Swage @end like long nogs.
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
      // Web stiffener holes — evenly distributed along the header. H1/H3
      // (the "main" header) starts at @89; H2 (Box1) starts at @50. Both have
      // the same world-X positions but different stick-local offsets due to
      // H2 being inset 39mm from each end. Max spacing 300mm.
      // Verified 2026-05-04 vs HG260001 LBW H1/H3 corpus (L2/L6/L24/L25/L27/
      // L33/L39/L40/L41/L43): all H1 Webs at 89..length-89, count = ceil(
      // (length - 178) / 300) + 1.
      // Only emitted on paired headers (frame has H2/H3 alongside H1) —
      // single-H frames (e.g. L4/L8 with just one H1) get no Webs.
      { toolType: "Web", kind: "point",
        anchor: { kind: "evenlyDistributed", firstOffset: 89, lastOffset: 89, maxSpacing: 300 },
        confidence: "high",
        predicate: (ctx) => /^H[13]$/.test(ctx.stickName ?? "") && ctx.framePairedHeader === true,
        notes: "H1/H3 (main header) on paired-header frame: Web stiffener holes evenly distributed" },
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
      // Swage end-span..end + Dimple @length-10 + Chamfer @end.
      // Start Swage span 41 (always matches Detailer's start cap regardless
      // of angle — verified 2026-05-05: 0/308 wall-W start Swages drift).
      // End Swage span is angle-dependent (Detailer scales with cos+tan²).
      // See wallWEndSwageSpan() for derivation.
      // Verified vs HG260001 PK4-PK5 wall W corpus.
      //
      // Chamfer-emit rule: Detailer chamfers W's that are angled >=28° from
      // vertical, leaves near-vertical W's (B2B partner studs) untouched.
      // Verified 2026-05-04: ref transition between L27/W6 @25.48° (no
      // chamfer) and L27/W2 @29.31° (chamfer). 28° threshold catches both.
      { toolType: "Chamfer", kind: "start", anchor: { kind: "startAnchored", offset: 0 }, confidence: "high",
        predicate: (ctx) => isWallPlan(ctx) && (ctx.angleFromVertical ?? 0) >= 28,
        notes: "Wall brace W: Chamfer @start (diagonal cut, angle>=28°)" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: 41, confidence: "high",
        predicate: (ctx) => isWallPlan(ctx),
        notes: "Wall brace W: Swage span 41 at start" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 10 }, confidence: "high",
        predicate: (ctx) => isWallPlan(ctx),
        notes: "Wall brace W: Dimple @10mm (not @16.5)" },
      { toolType: "Swage", kind: "spanned",
        anchor: { kind: "endAnchored", offset: 0 },
        spanLengthFn: (ctx) => wallWEndSwageSpan(ctx.angleFromVertical ?? 0),
        confidence: "high",
        predicate: (ctx) => isWallPlan(ctx),
        notes: "Wall brace W: end Swage span = 39/cos(angle) + 8*tan²(angle)" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: 10 }, confidence: "high",
        predicate: (ctx) => isWallPlan(ctx) },
      { toolType: "Chamfer", kind: "end", anchor: { kind: "endAnchored", offset: 0 }, confidence: "high",
        predicate: (ctx) => isWallPlan(ctx) && (ctx.angleFromVertical ?? 0) >= 28,
        notes: "Wall brace W: Chamfer @end (diagonal cut, angle>=28°)" },
    ],
  },

  // ----------- TRUSS WEBS / FJ JOIST WEBS / WALL BRACES (W) on 89S41 -----------
  // 2026-05-05 — DUAL BEHAVIOR (Agent P). Mirrors the 70S41 W rule. W sticks
  // in TRUSS plans (TIN/TB2B) and FJ joists use stud-style end clearance,
  // while W sticks in WALL plans (LBW/NLBW) use the wall-brace pattern with
  // Chamfer + Dimple @10.
  //
  //   TRUSS WEB / FJ joist (W on truss/joist): Swage span 39 + Dimple @16.5.
  //     Verified 2026-05-02 against HG260012 TH01-2F-FJ-89.075/J1201-1/V5
  //     (length 352): Swage 0..39 + Dimple@16.5 + Swage 313..352 + Dimple@335.5.
  //   WALL BRACE (W on 89mm wall): Chamfer @start + Swage 0..39 + Dimple @10
  //     + Swage end-39..end + Dimple @length-10 + Chamfer @end.
  //     Verified vs HG260023 PK3-GF-LBW-89.075 L21/W1..W8 (8 sticks length
  //     ≈ 364mm): ref ops include Chamfer @start, Chamfer @end, Dimple @10,
  //     Dimple @length-10. Codec previously emitted truss-style here causing
  //     5 missing ops per stick and 3 wrong-position extras.
  {
    rolePattern: /^W$/,
    profilePattern: /^89S41$/,
    lengthRange: [0, Infinity],
    rules: [
      // Truss/FJ behavior: Swage span 39 + Dimple @16.5 at each end (only NOT wall plans).
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "high",
        predicate: (ctx) => !isWallPlan(ctx) },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "high",
        predicate: (ctx) => !isWallPlan(ctx) },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "high",
        predicate: (ctx) => !isWallPlan(ctx) },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "high",
        predicate: (ctx) => !isWallPlan(ctx) },
      // Wall-W behavior: same shape as 70mm rule. SPAN_89 = 39 (matches the
      // 70mm value) at start. End Swage uses angle-dependent span — same
      // formula works on 89mm (verified vs HG260023 PK3 LBW W's at 28°:
      // ref span 46.6 ≈ 39/cos(28°)+8*tan²(28°) = 46.4).
      // Dimple at @10. Chamfer at angle >= 28° from vertical.
      { toolType: "Chamfer", kind: "start", anchor: { kind: "startAnchored", offset: 0 }, confidence: "high",
        predicate: (ctx) => isWallPlan(ctx) && (ctx.angleFromVertical ?? 0) >= 28,
        notes: "89mm wall brace W: Chamfer @start (diagonal cut, angle>=28°)" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "high",
        predicate: (ctx) => isWallPlan(ctx),
        notes: "89mm wall brace W: Swage span 39 at start" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 10 }, confidence: "high",
        predicate: (ctx) => isWallPlan(ctx),
        notes: "89mm wall brace W: Dimple @10mm (not @16.5)" },
      { toolType: "Swage", kind: "spanned",
        anchor: { kind: "endAnchored", offset: 0 },
        spanLengthFn: (ctx) => wallWEndSwageSpan(ctx.angleFromVertical ?? 0),
        confidence: "high",
        predicate: (ctx) => isWallPlan(ctx),
        notes: "89mm wall brace W: end Swage span = 39/cos(angle) + 8*tan²(angle)" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: 10 }, confidence: "high",
        predicate: (ctx) => isWallPlan(ctx) },
      { toolType: "Chamfer", kind: "end", anchor: { kind: "endAnchored", offset: 0 }, confidence: "high",
        predicate: (ctx) => isWallPlan(ctx) && (ctx.angleFromVertical ?? 0) >= 28,
        notes: "89mm wall brace W: Chamfer @end (diagonal cut, angle>=28°)" },
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

  // ----------- BRACE sticks on 70S41 (NOT truss webs, NOT rails, NOT lintels) -----------
  // Brace dimple offset 11mm (vs 16.5 for studs); span 41mm (vs 39 for studs).
  // Pulled from W|70S41|500-1500 sample data — note this is for wall braces,
  // truss webs (W) and lintels (L) are handled in dedicated rules above.
  //
  // 2026-05-07 (Scott Rule 11): Rails (R role) are HORIZONTAL truss members
  // (named differently from chords T/B to avoid confusion). They get standard
  // stud-style tooling (39mm Swage + 16.5mm dimple), NOT the brace-specific
  // 41/11mm pattern. Removed R from this rolePattern; R sticks now fall
  // through to the truss-web rule (W) or default stud rule which uses
  // SPAN_70 + DIMPLE_OFFSET_70.
  {
    rolePattern: /^Br$/,
    profilePattern: /^70S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: 41, confidence: "medium" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 11 }, confidence: "medium", notes: "Brace dimple at 11mm" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: 41 }, spanLength: 41, confidence: "medium" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: 11 }, confidence: "medium" },
    ],
  },

  // ----------- RAILS (R) on 70S41 — Scott Rule 11 -----------
  // Rails are HORIZONTAL truss members. Get stud-style end caps (Swage 39mm
  // + ID@16.5). Same as truss-W / FJ-joist treatment. Verified vs HG260001
  // GF-TIN ref: rails like R4 in TN8-1 emit Swage 0..39 + ID@16.5 caps.
  {
    rolePattern: /^R$/,
    profilePattern: /^70S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
    ],
  },

  // ----------- RAILS (R) on 89S41 — Scott Rule 11 -----------
  {
    rolePattern: /^R$/,
    profilePattern: /^89S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "high" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "high" },
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
