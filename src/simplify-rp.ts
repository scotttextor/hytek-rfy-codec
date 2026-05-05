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
 *  Tooling. Role is one of the wall horizontals (T/B/N) AND its world-space
 *  centerline is more horizontal than vertical. RP frames sometimes contain
 *  sloped rake-plates whose horizontal extent still dominates — those are
 *  still horizontal continuous. */
function isHorizontalContinuous(stick: ParsedStick): boolean {
  const role = rolePrefix(stick.name);
  if (!/^(T|Tp|B|Bp|Bh|N|Nog)$/i.test(role)) return false;
  const dx = stick.end.x - stick.start.x;
  const dy = stick.end.y - stick.start.y;
  const dz = stick.end.z - stick.start.z;
  const horiz = Math.sqrt(dx * dx + dy * dy);
  const vert = Math.abs(dz);
  return horiz >= vert;
}

/** Decide if this stick is a VERTICAL NOTCHED member under Reversed Tooling.
 *  Role is wall-stud-like (S/J) AND z-extent dominates xy-extent. */
function isVerticalNotched(stick: ParsedStick): boolean {
  const role = rolePrefix(stick.name);
  if (!/^(S|J)$/i.test(role)) return false;
  const dx = stick.end.x - stick.start.x;
  const dy = stick.end.y - stick.start.y;
  const dz = stick.end.z - stick.start.z;
  const horiz = Math.sqrt(dx * dx + dy * dy);
  const vert = Math.abs(dz);
  return vert > horiz;
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

/** Run the RP Reversed-Tooling simplifier on a single frame.  Mutates
 *  `frame.sticks[].tooling[]` in place.  Caller is responsible for the
 *  plan-name gate; this function blindly applies the rewrite when called. */
export function simplifyRpFrame(frame: ParsedFrame): SimplifyRpDecision {
  // v1 stub — detection layer only. Rule rewriting lives in commits 2-4.
  // Walk every stick to populate the decision (so the apply-pass log is useful)
  // but emit no tooling changes yet.
  const horizontalsRewritten: string[] = [];
  const studStartsRewritten: string[] = [];
  const studEndsChamfered: string[] = [];
  for (const stick of frame.sticks) {
    if (isHorizontalContinuous(stick)) {
      // commit 2 will rewrite end-caps here
      void stick;
    } else if (isVerticalNotched(stick)) {
      // commit 3 will rewrite start cap here
      void stick;
    }
  }
  if (
    horizontalsRewritten.length === 0
    && studStartsRewritten.length === 0
    && studEndsChamfered.length === 0
  ) {
    return { frame: frame.name, decision: "SKIP", reason: "v1 stub — no rules wired yet" };
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
