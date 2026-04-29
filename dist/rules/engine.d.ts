/**
 * Rule engine — applies a set of OpRules to a StickContext to produce
 * the list of RfyToolingOps that Detailer would emit for that stick.
 *
 * The rule TABLE itself lives in src/rules/table.ts; this file is the
 * generic application machinery.
 */
import type { RfyToolingOp } from "../format.js";
import type { OpRule, RuleGroup, RuleApplicationResult, StickContext } from "./types.js";
/** Apply a single rule to a stick context — emits 0..n ops. */
export declare function applyRule(rule: OpRule, ctx: StickContext): RfyToolingOp[];
/** Find the first rule group that matches a given stick context. */
export declare function findGroup(ctx: StickContext, table: RuleGroup[]): RuleGroup | undefined;
/** Apply all rules in the matching group to a stick context. */
export declare function applyRules(ctx: StickContext, table: RuleGroup[]): RuleApplicationResult;
