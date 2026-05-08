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
export { getActionSection, listSectionNames, preloadActionDefs, type ActionSection, type ActionSlot, type ActionAlternative, type ActionOp, type Condition, type ActionVerb, } from "./action-defs.js";
export { evalCondition, evalConditions, packEdgeMask, unpackEdgeMask, type EdgeFlags, type ConditionContext, } from "./condition-eval.js";
export { emitAction, emitActions, verbToToolType, type EmitContext, type EmitResult, } from "./action-emit.js";
export { runActionDefsPass, isActionDefsPassEnabled, emptyActionDefsPass, type ActionDefsPassInfo, type ActionDefsPassConfig, } from "./action-defs-pass.js";
import type { RfyToolingOp } from "../format.js";
import type { StickContext, RuleApplicationResult } from "./types.js";
/**
 * Generate tooling ops for a single stick, based on its role/profile/length
 * (universal end-anchored ops only — frame-context crossings layered later).
 */
export declare function generateTooling(ctx: StickContext): RfyToolingOp[];
/** Same as generateTooling but returns full trace for debugging. */
export declare function generateToolingWithTrace(ctx: StickContext): RuleApplicationResult;
