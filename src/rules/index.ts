/**
 * Rules engine entry point — given a stick description, return the list of
 * tooling operations Detailer would emit.
 *
 *   import { generateTooling } from "@hytek/rfy-codec/rules";
 *   const ops = generateTooling({ role: "S", length: 2717, profileFamily: "70S41", gauge: "0.75", flipped: false });
 */
export type * from "./types.js";
export { applyRule, applyRules, findGroup } from "./engine.js";
export { RULE_TABLE, profileOffsets } from "./table.js";
export { generateFrameContextOps, layoutFrame, computeBox, roleFromName } from "./frame-context.js";

// ActionDefsManager wiring (env-flag-gated supplement to legacy crossings).
// See `action-defs-pass.ts` for the env-flag explanation; default OFF.
export {
  getActionSection,
  listSectionNames,
  preloadActionDefs,
  type ActionSection,
  type ActionSlot,
  type ActionAlternative,
  type ActionOp,
  type Condition,
  type ActionVerb,
} from "./action-defs.js";
export {
  evalCondition,
  evalConditions,
  packEdgeMask,
  unpackEdgeMask,
  type EdgeFlags,
  type ConditionContext,
} from "./condition-eval.js";
export {
  emitAction,
  emitActions,
  verbToToolType,
  type EmitContext,
  type EmitResult,
} from "./action-emit.js";
export {
  runActionDefsPass,
  isActionDefsPassEnabled,
  emptyActionDefsPass,
  type ActionDefsPassInfo,
  type ActionDefsPassConfig,
} from "./action-defs-pass.js";

import type { RfyToolingOp } from "../format.js";
import type { StickContext, RuleApplicationResult } from "./types.js";
import { applyRules } from "./engine.js";
import { RULE_TABLE } from "./table.js";

/**
 * Generate tooling ops for a single stick, based on its role/profile/length
 * (universal end-anchored ops only — frame-context crossings layered later).
 */
export function generateTooling(ctx: StickContext): RfyToolingOp[] {
  return applyRules(ctx, RULE_TABLE).ops;
}

/** Same as generateTooling but returns full trace for debugging. */
export function generateToolingWithTrace(ctx: StickContext): RuleApplicationResult {
  return applyRules(ctx, RULE_TABLE);
}
