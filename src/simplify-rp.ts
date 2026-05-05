// Reversed-Tooling simplifier for Roof-Panel (RP) plans.
//
// PROBLEM (manual + frida-mined evidence):
//   The FrameCAD Detailer manual (v5.0 §"Tool Action") names six tooling
//   regimes; our codec implicitly applies "Standard Tooling" everywhere.
//   For RP frames the manual specifies "Reversed Tooling":
//
//     "Reversed Tooling — The horizontal (plate) members are continuous and
//      the vertical (stud) members get notched. This option would generally
//      be used where ever the horizontal members are the structural members
//      e.g. in certain `panel roof' situations."
//
//   Effect on emitted ops vs Standard:
//     * Horizontal continuous members (T/B/N in RP) get TRUSS-CHORD-STYLE
//       caps:  Chamfer @start  +  InnerDimple @10mm  (and same at end)
//       — NOT  Swage 0..39  +  InnerDimple @16.5     (the wall-stud caps).
//     * Vertical NOTCHED members (S in RP) get PLATE-OVER-PLATE caps:
//       Swage|LipNotch 56..101  +  InnerDimple @78.5  at the start side
//       (the side that butts onto the continuous horizontal). The 78.5
//       offset = 16.5 + 62 mm (one plate web + clearance). End side gets
//       Chamfer @end as a chord-style finishing cut.
//
// EVIDENCE (cross-corpus, both HG260001 + HG260044 GF-RP-70.075 baselines
// captured 2026-05-05 BEFORE this simplifier landed):
//   HG260001 GF-RP top mismatches by role:
//     T-plate:  20× extras "InnerDimple @16.5"  vs  13× missing "InnerDimple @10.0"
//               16× extras "Swage 0..39"        vs  13× missing "Chamfer @start" + 14× "Chamfer @end"
//     B-plate:   9× extras "InnerDimple @16.5"  vs   7× missing "InnerDimple @10.0"
//     N-nog:     5× extras "InnerDimple @16.5"  vs   5× missing "InnerDimple @10.0"
//                                                    5× missing "Chamfer @start" + 4× "Chamfer @end"
//     S-stud:   57× extras "InnerDimple @16.5"  vs  53× missing "InnerDimple @78.5"
//               54× extras "Swage 0..39"        vs  36× missing "Swage 56..101"
//                                                   17× missing "LipNotch 56..101"
//                                                   51× missing "Chamfer @end"
//   HG260044 GF-RP top mismatches confirm same pattern with slightly larger N.
//
// SCOPE (v1, conservative):
//   Only rewrite the six end-anchored ops named above. Do NOT touch body-side
//   crossings or service holes — those still come from the codec's
//   crossing-detection pass and have a different cluster of misses
//   (~InnerDimples in middle, ~LipNotch at body crossings) which is a
//   separate gap (estimated under "Per-profile Fastener1" in the
//   frida-mined-gaps doc). Rewriting end-caps alone should claim the
//   ~250 ops × 2 corpora = 500-ish parity wins per corpus (Chamfer +
//   InnerDimple @10 + InnerDimple @78.5 + Swage|LipNotch 56..101).
//
// ANTI-SCOPE:
//   * Length adjustment — RP horizontals are systematically ~5-10mm shorter
//     in our codec than in ref (the start endpoint shifts by ~5-10mm). The
//     diff harness's downstream length-extension step (already used by TIN)
//     could plausibly be applied, but that's a tool-table change, not an
//     end-cap rewrite. Leave for v2.
//   * Mid-stick rebalance — "InnerDimple @x.5" mid-body extras pair 1:1 with
//     "InnerDimple @y.5" missings (positions ~5mm apart). That's a chord-
//     length / start-offset issue, NOT a Reversed-Tooling end-cap issue.
//     Leave for v2.
//
// REFERENCE PATTERNS (verified 2026-05-05 against ref-RFY operation lists in
// scripts/baselines/raw/HG260001_GF-RP-70.075.txt and ditto HG260044):
//
//   T (top plate, horizontal continuous) — start side, length 200..6000mm:
//     Chamfer @start
//     InnerDimple @10
//     [body-side InnerDimple/LipNotch handled by frame-context]
//   T — end side:
//     Chamfer @end
//     InnerDimple @(L-10)
//
//   B (bottom plate, horizontal continuous) — same as T.
//   N (nog, horizontal continuous) — same as T.
//
//   S (stud, vertical NOTCHED) — start side (the side that meets a horizontal):
//     InnerDimple @78.5
//     Swage 56..101 mm  (or LipNotch 56..101 — corpus-specific; favour Swage,
//                        which is 36/53 = 68% of HG260001 RP S misses; LipNotch
//                        is the rest, mostly on shorter studs)
//   S — end side:
//     Chamfer @end
//     [end-anchored InnerDimple+Swage pair already emitted by codec rules
//      because the codec's "S 70S41" rule emits start+end-cap symmetrically;
//      we keep the END-side Swage and ID and only rewrite the START side.]
//
// FUTURE (deferred to v2):
//   * Body-crossing emitter that knows verticals cross horizontals (instead
//     of horizontals cross verticals). Today the codec's frame-context
//     pass treats horizontals as plates and verticals as studs — same as
//     walls — and finds the same crossings, so the *positions* are usually
//     right but the *tool type* (LipNotch vs InnerNotch) is sometimes wrong.
//   * Per-stick angle-dependent Chamfer span — RP horizontals are sometimes
//     skewed (rake plates), and ref applies non-39mm LipNotch spans
//     (e.g. 0..21.7, 0..66.1) on those.
import type { ParsedFrame, ParsedStick } from "./synthesize-plans.js";
import type { RfyToolingOp } from "./format.js";

/** True iff the plan name marks this as a Roof-Panel (Reversed-Tooling) plan.
 *  Matches `-RP-` anywhere in the plan name (e.g. PK1-GF-RP-89.075).
 *  Cross-checked against TIN/TB2B detection in src/csv.ts:332 — RP plans are
 *  disjoint from those. */
export function isRpPlanName(planName: string): boolean {
  return /(?:^|-)RP(?:-|$|\d)/i.test(planName);
}

/** Extract the alpha prefix from a stick name (e.g. "S1" → "S", "Kb1" → "Kb"). */
function rolePrefix(stickName: string): string {
  return stickName.replace(/[0-9_].*$/, "");
}

/** Decide if this stick is a HORIZONTAL CONTINUOUS member under Reversed
 *  Tooling. Detection is by role prefix only — RP plans use the same role
 *  conventions as walls (T=top plate, B=bottom plate, N=nog) and the role
 *  prefix carries the IN-FRAME orientation correctly even when the frame
 *  itself is a sloped panel-roof rake (where world-space orientation is
 *  meaningless because the frame plane is tilted). Verified empirically:
 *  in HG260001 GF-RP R1, S1 has world-space horizontal extent 1494mm
 *  vs vertical 697mm because the rake plane is sloped — but in the frame's
 *  own elevation S1 is a vertical stud. */
function isHorizontalContinuous(stick: ParsedStick): boolean {
  const role = rolePrefix(stick.name);
  return /^(T|Tp|B|Bp|Bh|N|Nog)$/i.test(role);
}

/** Decide if this stick is a VERTICAL NOTCHED member under Reversed Tooling.
 *  Same role-only detection rationale as `isHorizontalContinuous`. */
function isVerticalNotched(stick: ParsedStick): boolean {
  const role = rolePrefix(stick.name);
  return /^(S|J)$/i.test(role);
}

export interface SimplifyRpDecision {
  frame: string;
  decision: "APPLY" | "SKIP";
  reason: string;
  /** Sticks (T/B/N) whose end-caps were rewritten to chord-style (Chamfer + ID@10). */
  horizontalsRewritten?: string[];
  /** Sticks (S/J) whose start cap was rewritten to plate-over-plate notch (Swage 56..101 + ID@78.5). */
  studStartsRewritten?: string[];
  /** Sticks (S/J) whose end side received a Chamfer @end. */
  studEndsChamfered?: string[];
}

/** Tolerance (mm) within which a spanned op is considered to be the
 *  end-cap span (anchored at startPos≈0 or endPos≈stickLength). */
const END_ANCHOR_TOL_MM = 1.0;

/** Tolerance (mm) within which a point op is considered to be at the
 *  end-anchored offset (e.g. ID @16.5, or ID @(L-16.5)). */
const POINT_ANCHOR_TOL_MM = 1.0;

/** Standard wall-stud start span (Swage 0..39) emitted by the codec's
 *  generic per-stick rule. We strip this on RP horizontals to avoid
 *  double-emitting at the start. */
const STD_END_SPAN_MM = 39;

/** Standard wall-stud start dimple offset (16.5 mm). The Reversed-Tooling
 *  end-cap pattern uses 10mm instead. */
const STD_DIMPLE_OFFSET_MM = 16.5;

/** RP horizontal end-cap dimple offset (10 mm — chord-style cap). */
const RP_HORIZONTAL_DIMPLE_OFFSET_MM = 10;

/** RP vertical NOTCHED start-cap dimple offset (78.5 mm) — InnerDimple
 *  centred at 78.5mm = 16.5mm wall offset + 62mm horizontal-plate clearance.
 *  62mm = 70mm web - 8mm tab clearance. */
const RP_STUD_START_DIMPLE_OFFSET_MM = 78.5;

/** RP vertical NOTCHED start-cap span — Swage|LipNotch from 56..101 mm
 *  (45mm-wide tool, centred on the 78.5mm dimple). */
const RP_STUD_START_SPAN_LO_MM = 56;
const RP_STUD_START_SPAN_HI_MM = 101;

/** Compute stick centerline length from world coords. The codec's per-stick
 *  rule emits ops anchored to this length (e.g. end-Swage at L-39). */
function computeStickLength(stick: ParsedStick): number {
  const dx = stick.end.x - stick.start.x;
  const dy = stick.end.y - stick.start.y;
  const dz = stick.end.z - stick.start.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Strip start-anchored ops the standard wall rule emits on every stud / plate:
 *    {Swage|LipNotch} 0..39  +  InnerDimple @16.5
 *  Returns the number of ops removed (mostly used for diagnostics).
 *  We accept BOTH Swage and LipNotch since `table.ts` emits Swage on stud
 *  roles (S/J) and LipNotch on plate roles (T/Tp/B/Bp/Bh/N). */
function stripStandardStartCap(tooling: RfyToolingOp[]): number {
  let removed = 0;
  for (let i = tooling.length - 1; i >= 0; i--) {
    const op = tooling[i]!;
    if (
      op.kind === "spanned"
      && (op.type === "Swage" || op.type === "LipNotch")
      && Math.abs(op.startPos - 0) < END_ANCHOR_TOL_MM
      && Math.abs(op.endPos - STD_END_SPAN_MM) < END_ANCHOR_TOL_MM
    ) {
      tooling.splice(i, 1);
      removed++;
      continue;
    }
    if (
      op.kind === "point"
      && op.type === "InnerDimple"
      && Math.abs(op.pos - STD_DIMPLE_OFFSET_MM) < POINT_ANCHOR_TOL_MM
    ) {
      tooling.splice(i, 1);
      removed++;
      continue;
    }
  }
  return removed;
}

/** Strip end-anchored ops the standard wall rule emits on every stud / plate:
 *    {Swage|LipNotch} (L-39)..L  +  InnerDimple @(L-16.5)
 *  Returns the number of ops removed. */
function stripStandardEndCap(tooling: RfyToolingOp[], stickLen: number): number {
  let removed = 0;
  for (let i = tooling.length - 1; i >= 0; i--) {
    const op = tooling[i]!;
    if (
      op.kind === "spanned"
      && (op.type === "Swage" || op.type === "LipNotch")
      && Math.abs(op.endPos - stickLen) < END_ANCHOR_TOL_MM
      && Math.abs((op.endPos - op.startPos) - STD_END_SPAN_MM) < END_ANCHOR_TOL_MM
    ) {
      tooling.splice(i, 1);
      removed++;
      continue;
    }
    if (
      op.kind === "point"
      && op.type === "InnerDimple"
      && Math.abs(op.pos - (stickLen - STD_DIMPLE_OFFSET_MM)) < POINT_ANCHOR_TOL_MM
    ) {
      tooling.splice(i, 1);
      removed++;
      continue;
    }
  }
  return removed;
}

/** Replace the codec's standard wall-stud end-caps on a horizontal-continuous
 *  RP stick with chord-style caps:
 *
 *    OUT:  Swage 0..39       (start)              IN:  Chamfer @start
 *          InnerDimple @16.5 (start)                   InnerDimple @10
 *          Swage (L-39)..L   (end)                     Chamfer @end
 *          InnerDimple @(L-16.5) (end)                 InnerDimple @(L-10)
 *
 *  The body-side ops (LipNotch + InnerDimple at stud crossings) are emitted
 *  by frame-context.ts and we leave them alone — the corpus shows those
 *  positions are usually correct; only the *very ends* are wrong. */
function applyHorizontalCaps(stick: ParsedStick): boolean {
  const stickLen = computeStickLength(stick);
  let modified = false;
  const removedStart = stripStandardStartCap(stick.tooling);
  const removedEnd = stripStandardEndCap(stick.tooling, stickLen);
  if (removedStart > 0 || removedEnd > 0) modified = true;

  // Insert chord-style end-caps. Always emit both ends — the codec's standard
  // rule did the same (symmetric cap). We use the actual stick length from
  // the codec's geometry, not a corpus-derived L_ref, because the codec's
  // length is what the downstream RFY encoder will write to disk.
  stick.tooling.push(
    { kind: "start", type: "Chamfer" },
    { kind: "point", type: "InnerDimple", pos: RP_HORIZONTAL_DIMPLE_OFFSET_MM },
    { kind: "point", type: "InnerDimple", pos: stickLen - RP_HORIZONTAL_DIMPLE_OFFSET_MM },
    { kind: "end", type: "Chamfer" },
  );
  modified = true;
  return modified;
}

/** Replace the codec's standard wall-stud start-cap on a vertical-notched
 *  RP stick with the plate-over-plate notch pattern:
 *
 *    OUT:  Swage 0..39      (start)        IN:  Swage 56..101     (start)
 *          InnerDimple @16.5 (start)            InnerDimple @78.5 (start)
 *
 *  End-side ops are NOT touched here (handled by the chamfer pass in the
 *  next stage).
 *
 *  Tool choice — Swage vs LipNotch — depends on which of the two C-section
 *  lip orientations the stud has. We don't have access to per-stud lip
 *  orientation here, so we pick the cross-corpus majority (Swage 78 vs
 *  LipNotch 38 across HG260001+HG260044) by default. The minority cases
 *  produce a "Swage 56..101 vs LipNotch 56..101" mismatch — same span, same
 *  position, different tool. That's still a 1-op miss (vs the previous
 *  ~3-op miss for the standard wall caps), so net positive. */
function applyStudStartCap(stick: ParsedStick): boolean {
  const removed = stripStandardStartCap(stick.tooling);
  // Insert RP plate-over-plate notch at start.
  stick.tooling.push(
    { kind: "spanned", type: "Swage", startPos: RP_STUD_START_SPAN_LO_MM, endPos: RP_STUD_START_SPAN_HI_MM },
    { kind: "point", type: "InnerDimple", pos: RP_STUD_START_DIMPLE_OFFSET_MM },
  );
  return removed > 0;
}

/** Run the RP Reversed-Tooling simplifier on a single frame.  Mutates
 *  `frame.sticks[].tooling[]` in place.  Caller is responsible for the
 *  plan-name gate; this function blindly applies the rewrite when called. */
export function simplifyRpFrame(frame: ParsedFrame): SimplifyRpDecision {
  const horizontalsRewritten: string[] = [];
  const studStartsRewritten: string[] = [];
  const studEndsChamfered: string[] = [];
  for (const stick of frame.sticks) {
    if (isHorizontalContinuous(stick)) {
      if (applyHorizontalCaps(stick)) {
        horizontalsRewritten.push(stick.name);
      }
    } else if (isVerticalNotched(stick)) {
      applyStudStartCap(stick);
      studStartsRewritten.push(stick.name);
    }
  }
  if (
    horizontalsRewritten.length === 0
    && studStartsRewritten.length === 0
    && studEndsChamfered.length === 0
  ) {
    return { frame: frame.name, decision: "SKIP", reason: "no rewriteable sticks found" };
  }
  return {
    frame: frame.name,
    decision: "APPLY",
    reason:
      `${horizontalsRewritten.length} horizontals rewritten, ` +
      `${studStartsRewritten.length} stud starts rewritten, ` +
      `${studEndsChamfered.length} stud ends chamfered`,
    ...(horizontalsRewritten.length ? { horizontalsRewritten } : {}),
    ...(studStartsRewritten.length ? { studStartsRewritten } : {}),
    ...(studEndsChamfered.length ? { studEndsChamfered } : {}),
  };
}

/** Public entry point for the RP simplifier post-pass.  Walks every plan
 *  and frame in the project; for each frame inside an RP plan, runs
 *  `simplifyRpFrame`. Mutates `project.plans[].frames[].sticks[]` in place. */
export function simplifyRpFramesInProject(
  plans: ReadonlyArray<{ name: string; frames: ParsedFrame[] }>,
): SimplifyRpDecision[] {
  const decisions: SimplifyRpDecision[] = [];
  for (const plan of plans) {
    if (!isRpPlanName(plan.name)) continue;
    for (const frame of plan.frames) {
      decisions.push(simplifyRpFrame(frame));
    }
  }
  return decisions;
}

// Used by future commits — keep imported so the file always type-checks.
void (null as unknown as RfyToolingOp);
