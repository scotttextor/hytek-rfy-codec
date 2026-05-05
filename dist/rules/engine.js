function generatePositions(anchor, length) {
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
            const out = [];
            const usable = length - anchor.firstOffset - anchor.lastOffset;
            if (usable <= 0)
                return out;
            const n = Math.floor(usable / anchor.spacing) + 1;
            for (let i = 0; i < n; i++) {
                const p = anchor.firstOffset + i * anchor.spacing;
                if (p > length - anchor.lastOffset)
                    break;
                out.push(p);
            }
            return out;
        }
        case "evenlyDistributed": {
            const out = [];
            const usable = length - anchor.firstOffset - anchor.lastOffset;
            if (usable <= 0)
                return out;
            const count = Math.ceil(usable / anchor.maxSpacing) + 1;
            const spacing = usable / (count - 1);
            for (let i = 0; i < count; i++) {
                out.push(anchor.firstOffset + i * spacing);
            }
            return out;
        }
    }
}
function opForRule(rule, position, length, ctx) {
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
            let startPos;
            let endPos;
            if (rule.spanLengthFn && rule.anchor.kind === "endAnchored" && rule.anchor.offset === 0) {
                endPos = length;
                startPos = Math.max(0, length - span);
            }
            else {
                startPos = position;
                endPos = Math.min(position + span, length);
            }
            return { kind: "spanned", type: rule.toolType, startPos: round(startPos), endPos: round(endPos) };
        }
    }
}
/** Round to 4 decimal places to match Detailer's typical numeric precision. */
function round(n) { return Math.round(n * 10000) / 10000; }
/** Apply a single rule to a stick context — emits 0..n ops. */
export function applyRule(rule, ctx) {
    if (rule.predicate && !rule.predicate(ctx))
        return [];
    const positions = generatePositions(rule.anchor, ctx.length);
    const ops = [];
    for (const p of positions) {
        if (p < 0 || p > ctx.length)
            continue;
        const op = opForRule(rule, p, ctx.length, ctx);
        if (op)
            ops.push(op);
    }
    return ops;
}
/** Find the first rule group that matches a given stick context. */
export function findGroup(ctx, table) {
    for (const g of table) {
        if (!g.rolePattern.test(ctx.role))
            continue;
        if (!g.profilePattern.test(ctx.profileFamily))
            continue;
        const [min, max] = g.lengthRange;
        if (ctx.length < min || ctx.length >= max)
            continue;
        return g;
    }
    return undefined;
}
/** Apply all rules in the matching group to a stick context. */
export function applyRules(ctx, table) {
    const trace = [];
    const group = findGroup(ctx, table);
    if (!group) {
        trace.push(`No rule group for role="${ctx.role}" profile="${ctx.profileFamily}" length=${ctx.length}`);
        return { ops: [], trace };
    }
    trace.push(`Matched group: ${group.rolePattern} on ${group.profilePattern} length [${group.lengthRange[0]}, ${group.lengthRange[1]}) — ${group.rules.length} rules`);
    const ops = [];
    for (const rule of group.rules) {
        const emit = applyRule(rule, ctx);
        if (emit.length === 0) {
            trace.push(`  ${rule.toolType} (${rule.kind}) → 0 ops`);
        }
        else {
            trace.push(`  ${rule.toolType} (${rule.kind}) → ${emit.length} op(s)`);
            ops.push(...emit);
        }
    }
    return { ops, matchedGroup: group, trace };
}
