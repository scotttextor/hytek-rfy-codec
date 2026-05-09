// Reversed-Tooling simplifier for Roof-Panel (RP) plans.
//
// SCOPE (v3, 2026-05-09):
//   Targets ONLY S-prefix studs in RP plans. The previous v2 (Scott's Rule 7)
//   disabled the simplifier entirely after evidence that the chord-style cap
//   rewrite over-applied on horizontal RP plates. v3 restores the high-confidence
//   STUD-side rewrite (which gives the strongest cross-corpus signal) and leaves
//   plates untouched.
//
// EVIDENCE (re-verified 2026-05-09 vs HG260044 GF-RP-70.075 with v2 disabled):
//   - 67 missing `InnerDimple @78.5` (start)
//   - 64 missing `Swage|LipNotch 56..101` (start)  (43 Swage + 21 LipNotch)
//   - 92 extras `InnerDimple @16.5` (the standard wall-stud start dimple)
//   - 89 extras `Swage 0..39` (standard wall-stud start cap)
//   - 75 missing `Chamfer @end` on studs
//   Cross-checked vs HG260001 GF-RP-70.075 — identical pattern, similar counts.
//
// Strategy:
//   On every S-prefix stick in an RP plan:
//     1. Remove start-anchored `Swage|LipNotch 0..39` (standard wall cap)
//     2. Remove start-anchored `InnerDimple @16.5` (standard wall start dimple)
//     3. Add `Swage 56..101` (RP plate-over-plate start notch) — Swage is the
//        majority emission across HG260001+HG260044 RP corpora; LipNotch minority
//        cases produce a same-position single-op miss that's still net positive.
//     4. Add `InnerDimple @78.5` (RP start dimple)
//     5. Add `Chamfer @end` if not already present
//
// PLATES: Not touched. The plate-side gaps (Chamfer @start + ID @10 chord-style
// cap, drifted body-crossing positions) involve stick-length drift between the
// codec's geometry and Detailer's emitted geometry (~5-10mm). That's a separate
// problem requiring length adjustment, not just end-cap rewrite.
//
// END-CAP (stud end side): Not rewritten. The codec's per-stick rule already
// emits `Swage L-39..L` + `ID @L-16.5` at the stud end, and ref usually emits
// `Swage L-66..L` (or similar variable span) + a body-crossing dimple ~10mm
// away. The end-side drift is length-dependent (matches body-crossing drift)
// and best fixed at the rules-engine level.

import type { ParsedFrame, ParsedStick } from "./synthesize-plans.js";
import type { RfyToolingOp } from "./format.js";

/** True iff the plan name marks this as a Roof-Panel (Reversed-Tooling) plan.
 *  Matches `-RP-` anywhere in the plan name (e.g. PK1-GF-RP-89.075).
 *  Cross-checked against TIN/TB2B detection in src/csv.ts:332 — RP plans are
 *  disjoint from those. */
export function isRpPlanName(planName: string): boolean {
  return /(?:^|-)RP(?:-|$|\d)/i.test(planName);
}

/** Tolerance (mm) within which a spanned op is considered to be the
 *  end-cap span (anchored at startPos≈0 or endPos≈stickLength). */
const END_ANCHOR_TOL_MM = 1.0;

/** Tolerance (mm) within which a point op is considered to be at the
 *  end-anchored offset (e.g. ID @16.5). */
const POINT_ANCHOR_TOL_MM = 1.0;

/** Standard wall-stud start span (Swage|LipNotch 0..39) emitted by the codec's
 *  generic per-stick rule. */
const STD_END_SPAN_MM = 39;

/** Standard wall-stud start dimple offset (16.5 mm). */
const STD_DIMPLE_OFFSET_MM = 16.5;

/** RP vertical NOTCHED start-cap dimple offset (78.5 mm). */
const RP_STUD_START_DIMPLE_OFFSET_MM = 78.5;

/** RP vertical NOTCHED start-cap span — Swage from 56..101 mm. */
const RP_STUD_START_SPAN_LO_MM = 56;
const RP_STUD_START_SPAN_HI_MM = 101;

/** Strip start-anchored ops the standard wall rule emits on a stud:
 *    {Swage|LipNotch} 0..39  +  InnerDimple @16.5
 *  Returns the number of ops removed. */
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

/** Decide if a stick is an RP S-stud — name starts with "S" followed by digit. */
function isSstud(stick: ParsedStick): boolean {
  return /^S\d/.test(stick.name);
}

export interface SimplifyRpDecision {
  frame: string;
  decision: "APPLY" | "SKIP";
  reason: string;
  /** Sticks (S) whose start cap was rewritten. */
  studStartsRewritten?: string[];
  /** Sticks (S) whose end side received a Chamfer @end. */
  studEndsChamfered?: string[];
}

/** Apply the RP stud-only rewrite to a single frame. */
export function simplifyRpFrame(frame: ParsedFrame): SimplifyRpDecision {
  const studStartsRewritten: string[] = [];
  const studEndsChamfered: string[] = [];

  for (const stick of frame.sticks) {
    if (!isSstud(stick)) continue;

    // Replace standard wall-stud start cap with RP plate-over-plate notch.
    const removed = stripStandardStartCap(stick.tooling);
    stick.tooling.push(
      { kind: "spanned", type: "Swage", startPos: RP_STUD_START_SPAN_LO_MM, endPos: RP_STUD_START_SPAN_HI_MM },
      { kind: "point", type: "InnerDimple", pos: RP_STUD_START_DIMPLE_OFFSET_MM },
    );
    studStartsRewritten.push(stick.name);
    void removed;

    // Add Chamfer @end if not already present.
    let hasEndChamfer = false;
    for (const op of stick.tooling) {
      if (op.kind === "end" && op.type === "Chamfer") { hasEndChamfer = true; break; }
    }
    if (!hasEndChamfer) {
      stick.tooling.push({ kind: "end", type: "Chamfer" });
      studEndsChamfered.push(stick.name);
    }
  }

  if (studStartsRewritten.length === 0 && studEndsChamfered.length === 0) {
    return { frame: frame.name, decision: "SKIP", reason: "no S-prefix studs found" };
  }
  return {
    frame: frame.name,
    decision: "APPLY",
    reason:
      `${studStartsRewritten.length} stud starts rewritten, ` +
      `${studEndsChamfered.length} stud ends chamfered`,
    ...(studStartsRewritten.length ? { studStartsRewritten } : {}),
    ...(studEndsChamfered.length ? { studEndsChamfered } : {}),
  };
}

/** Public entry point for the RP simplifier post-pass. Walks every plan and
 *  frame in the project; for each frame inside an RP plan, runs `simplifyRpFrame`.
 *  Mutates `project.plans[].frames[].sticks[]` in place. */
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
