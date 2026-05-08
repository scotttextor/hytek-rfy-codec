export { applyRule, applyRules, findGroup } from "./engine.js";
export { RULE_TABLE, profileOffsets } from "./table.js";
export { generateFrameContextOps, layoutFrame, computeBox, roleFromName } from "./frame-context.js";
// ActionDefsManager wiring (env-flag-gated supplement to legacy crossings).
// See `action-defs-pass.ts` for the env-flag explanation; default OFF.
export { getActionSection, listSectionNames, preloadActionDefs, } from "./action-defs.js";
export { evalCondition, evalConditions, packEdgeMask, unpackEdgeMask, } from "./condition-eval.js";
export { emitAction, emitActions, verbToToolType, } from "./action-emit.js";
export { runActionDefsPass, isActionDefsPassEnabled, emptyActionDefsPass, } from "./action-defs-pass.js";
import { applyRules } from "./engine.js";
import { RULE_TABLE } from "./table.js";
/**
 * Generate tooling ops for a single stick, based on its role/profile/length
 * (universal end-anchored ops only — frame-context crossings layered later).
 */
export function generateTooling(ctx) {
    return applyRules(ctx, RULE_TABLE).ops;
}
/** Same as generateTooling but returns full trace for debugging. */
export function generateToolingWithTrace(ctx) {
    return applyRules(ctx, RULE_TABLE);
}
