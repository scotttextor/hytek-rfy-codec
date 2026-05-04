/**
 * Rule engine — applies a set of OpRules to a StickContext to produce
 * the list of RfyToolingOps that Detailer would emit for that stick.
 *
 * The rule TABLE itself lives in src/rules/table.ts; this file is the
 * generic application machinery.
 */
import type { RfyToolingOp } from "../format.js";
import type { Anchor, OpRule, RuleGroup, RuleApplicationResult, StickContext } from "./types.js";

function generatePositions(anchor: Anchor, length: number): number[] {
  switch (anchor.kind) {
    case "startAnchored":
      return [anchor.offset];
    case "endAnchored":
      return [length - anchor.offset];
    case "centred":
      return [length / 2 + (anchor.offset ?? 0)];
    case "fraction":
      return [length * anchor.fraction];
    case "spaced": {
      const out: number[] = [];
      const usable = length - anchor.firstOffset - anchor.lastOffset;
      if (usable <= 0) return out;
      const n = Math.floor(usable / anchor.spacing) + 1;
      for (let i = 0; i < n; i++) {
        const p = anchor.firstOffset + i * anchor.spacing;
        if (p > length - anchor.lastOffset) break;
        out.push(p);
      }
      return out;
    }
    case "evenlyDistributed": {
      const out: number[] = [];
      const usable = length - anchor.firstOffset - anchor.lastOffset;
      if (usable <= 0) return out;
      const count = Math.ceil(usable / anchor.maxSpacing) + 1;
      const spacing = usable / (count - 1);
      for (let i = 0; i < count; i++) {
        out.push(anchor.firstOffset + i * spacing);
      }
      return out;
    }
  }
}

function opForRule(rule: OpRule, position: number, length: number, ctx: StickContext): RfyToolingOp | null {
  switch (rule.kind) {
    case "start":
      return { kind: "start", type: rule.toolType };
    case "end":
      return { kind: "end", type: rule.toolType };
    case "point":
      return { kind: "point", type: rule.toolType, pos: round(position) };
    case "spanned": {
      const span = rule.spanLengthFn ? rule.spanLengthFn(ctx) : (rule.spanLength ?? 0);
      // If endAnchored with offset==0 AND dynamic span, anchor end to stick
      // end and set start = length - span. Otherwise position is start.
      let startPos: number;
      let endPos: number;
      if (rule.spanLengthFn && rule.anchor.kind === "endAnchored" && rule.anchor.offset === 0) {
        endPos = length;
        startPos = Math.max(0, length - span);
      } else {
        startPos = position;
        endPos = Math.min(position + span, length);
      }
      return { kind: "spanned", type: rule.toolType, startPos: round(startPos), endPos: round(endPos) };
    }
  }
}

/** Round to 4 decimal places to match Detailer's typical numeric precision. */
function round(n: number): number { return Math.round(n * 10000) / 10000; }

/** Apply a single rule to a stick context — emits 0..n ops. */
export function applyRule(rule: OpRule, ctx: StickContext): RfyToolingOp[] {
  if (rule.predicate && !rule.predicate(ctx)) return [];
  const positions = generatePositions(rule.anchor, ctx.length);
  const ops: RfyToolingOp[] = [];
  for (const p of positions) {
    if (p < 0 || p > ctx.length) continue;
    const op = opForRule(rule, p, ctx.length, ctx);
    if (op) ops.push(op);
  }
  return ops;
}

/** Find the first rule group that matches a given stick context. */
export function findGroup(ctx: StickContext, table: RuleGroup[]): RuleGroup | undefined {
  for (const g of table) {
    if (!g.rolePattern.test(ctx.role)) continue;
    if (!g.profilePattern.test(ctx.profileFamily)) continue;
    const [min, max] = g.lengthRange;
    if (ctx.length < min || ctx.length >= max) continue;
    return g;
  }
  return undefined;
}

/** Apply all rules in the matching group to a stick context. */
export function applyRules(ctx: StickContext, table: RuleGroup[]): RuleApplicationResult {
  const trace: string[] = [];
  const group = findGroup(ctx, table);
  if (!group) {
    trace.push(`No rule group for role="${ctx.role}" profile="${ctx.profileFamily}" length=${ctx.length}`);
    return { ops: [], trace };
  }
  trace.push(`Matched group: ${group.rolePattern} on ${group.profilePattern} length [${group.lengthRange[0]}, ${group.lengthRange[1]}) — ${group.rules.length} rules`);
  const ops: RfyToolingOp[] = [];
  for (const rule of group.rules) {
    const emit = applyRule(rule, ctx);
    if (emit.length === 0) {
      trace.push(`  ${rule.toolType} (${rule.kind}) → 0 ops`);
    } else {
      trace.push(`  ${rule.toolType} (${rule.kind}) → ${emit.length} op(s)`);
      ops.push(...emit);
    }
  }
  return { ops, matchedGroup: group, trace };
}
