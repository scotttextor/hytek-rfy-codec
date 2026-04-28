/**
 * Map FrameCAD XML tool-type names to the CSV hole-type labels used in
 * HYTEK's production workflow (matches the format in
 * Split_HG######/<job>_<profile>.csv files).
 */
const TOOL_TO_CSV = {
    Bolt: "BOLT HOLES",
    Chamfer: "FULL CHAMFER",
    InnerDimple: "INNER DIMPLE",
    InnerNotch: "WEB NOTCH",
    InnerService: "SERVICE HOLE",
    LeftFlange: "LIP NOTCH",
    LipNotch: "LIP NOTCH",
    RightFlange: "LIP NOTCH",
    ScrewHoles: "ANCHOR",
    Swage: "SWAGE",
    TrussChamfer: "FULL CHAMFER",
    LeftPartialFlange: "LIP NOTCH",
    RightPartialFlange: "LIP NOTCH",
    Web: "WEB NOTCH",
};
/**
 * The CSV format is: `PROFILE_CODE_GAUGE` where profile label has spaces
 * removed. e.g. metric-label "70 S 41" + gauge "0.75" -> "70S41_0.75".
 *
 * Defensive against missing fields — some XML profiles have metric-label
 * as nested <metric-label> text rather than the usual attribute, which
 * parseProfile can leave undefined.
 */
function profileCode(metricLabel, gauge) {
    const lbl = String(metricLabel ?? "").replace(/\s+/g, "").trim();
    const g = String(gauge ?? "").trim();
    return `${lbl}_${g}`;
}
/**
 * Format a number for CSV output matching Detailer's conventions:
 * Detailer stores positions internally as Float32 (Delphi's Single),
 * then rounds to 2 decimal places. Replicate the Float32 cast then
 * round so e.g. 6777.8351 -> 6777.8349609375 (Float32) -> 6777.83.
 */
const f32 = new Float32Array(1);
function toFloat32(v) {
    f32[0] = v;
    return f32[0];
}
function n(v) {
    const v32 = toFloat32(v);
    // Detailer uses 1 decimal place (observed 2026-04-24 across HG260004,
    // HG260023, HG260032 fixtures — e.g. 1876.0934 -> 1876.1, not 1876.09).
    const rounded = Math.round(v32 * 10) / 10;
    if (Number.isInteger(rounded))
        return rounded.toString();
    return rounded.toFixed(1).replace(/\.?0+$/, "");
}
const SPAN_RULES = {
    Swage: { offset: 27.5, stride: 55 },
    LipNotch: { offset: 24, stride: 48 },
    InnerNotch: { offset: 24, stride: 48 },
    LeftFlange: { offset: 24, stride: 48 },
    RightFlange: { offset: 24, stride: 48 },
    Web: { offset: 27.5, stride: 55 },
};
function expandSpan(start, end, type) {
    const rule = SPAN_RULES[type];
    if (!rule)
        return [start, end];
    const first = start + rule.offset;
    const last = end - rule.offset;
    // When the span is shorter than 2 * offset:
    //   - Swage: still emits at start+offset (observed: span 0..39 -> 27.5)
    //   - Others (LipNotch, etc.): collapse to span midpoint (observed)
    if (first >= last) {
        if (type === "Swage" || type === "Web")
            return [first];
        return [(start + end) / 2];
    }
    const positions = [];
    let cursor = first;
    while (cursor < last - 0.001) {
        positions.push(cursor);
        cursor += rule.stride;
    }
    if (positions.length === 0 || Math.abs(positions[positions.length - 1] - last) > 0.001) {
        positions.push(last);
    }
    return positions;
}
/**
 * Flatten a stick's tooling list into per-position cells, sorted by position
 * in ascending order (matches Detailer's CSV emission order).
 */
function toolingToCsvCells(tooling, stickLength) {
    const flat = [];
    for (const op of tooling) {
        switch (op.kind) {
            case "point":
                flat.push({ type: op.type, pos: op.pos, priority: 1 });
                break;
            case "start":
                flat.push({ type: op.type, pos: 0, priority: 0 });
                break;
            case "end":
                flat.push({ type: op.type, pos: stickLength, priority: 2 });
                break;
            case "spanned": {
                const positions = expandSpan(op.startPos, op.endPos, op.type);
                for (const pos of positions)
                    flat.push({ type: op.type, pos, priority: 1 });
                break;
            }
        }
    }
    // Stable sort by (pos ascending, priority ascending for same pos).
    flat.sort((a, b) => a.pos - b.pos || a.priority - b.priority);
    const cells = [];
    for (const op of flat) {
        cells.push(TOOL_TO_CSV[op.type], n(op.pos));
    }
    return cells;
}
/**
 * Detailer's CSV dimension columns ALWAYS describe the stick's midline
 * in elevation coordinates (not profile dimensions):
 *
 *   [length, startX, startY, endX, endY, flangeThickness]
 *
 * start/end are midpoints of the two short edges of the stick's
 * elevation outline polygon. For vertical sticks start=(midX, minY) and
 * end=(midX, maxY); for horizontal sticks start=(minX, midY) and
 * end=(maxX, midY); for diagonals it's the midline of the parallelogram.
 *
 * Ordering convention: start = midpoint with lower Y; ties broken by lower X.
 */
/** Compute midline endpoints from the 4 outline corners. */
function midlineFromCorners(corners) {
    if (corners.length !== 4)
        return null;
    // Edge lengths around the polygon
    const edges = [0, 1, 2, 3].map(i => {
        const a = corners[i], b = corners[(i + 1) % 4];
        return { a, b, len: Math.hypot(b.x - a.x, b.y - a.y) };
    });
    // Identify the two shortest opposite edges — they are the "ends" of the stick
    const sorted = [...edges].sort((x, y) => x.len - y.len);
    const short1 = sorted[0], short2 = sorted[1];
    const mid = (e) => ({ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 });
    const m1 = mid(short1);
    const m2 = mid(short2);
    // Ordering convention (from comparing our output to Detailer's CSV):
    // start = midpoint with lower Y; tied Y falls back to lower X.
    const [start, end] = m1.y < m2.y || (m1.y === m2.y && m1.x < m2.x) ? [m1, m2] : [m2, m1];
    return { start, end, thickness: short1.len };
}
function computeDims(_plan, _frame, stick) {
    if (stick.outlineCorners) {
        const m = midlineFromCorners(stick.outlineCorners);
        if (m) {
            return [stick.length, m.start.x, m.start.y, m.end.x, m.end.y, Math.round(m.thickness)];
        }
    }
    // Fallback: if no outline corners are available (shouldn't happen in
    // practice, but keeps the codec safe), use profile dims.
    return [stick.length, stick.profile.lFlange, 4, stick.profile.rFlange, stick.length + 4, stick.profile.web];
}
function stickToRow(plan, frame, stick) {
    // Role: map stick type + name conventions to CSV role labels.
    // Walls use STUD/TOPPLATE/BOTTOMPLATE/NOG/BRACE/FILLER.
    // Trusses use TOPCHORD/BOTTOMCHORD/WEB/FILLER.
    const name = stick.name.toUpperCase();
    const frameName = frame.name.toUpperCase();
    const isTruss = /^TN/i.test(frameName) || /TRUSS/.test(frameName);
    let role = "STUD";
    // Name-prefix dictionary (observed in Detailer CSVs on Y: drive):
    //   S*=STUD (or TRIMSTUD if with trim)   T*=TOPPLATE / TOPCHORD
    //   B*=BOTTOMPLATE / BOTTOMCHORD         N*=NOG
    //   K*=BRACE (Kb1)                        W*=WEB (truss)
    //   H*=HEADPLATE (door/window header)    SI*=SILL (window sill)
    //   R*=RAIL / TOPCHORD                    FIL=FILLER
    //   TS*=TRIMSTUD (trim around openings)
    if (name.startsWith("FIL"))
        role = "FILLER";
    else if (name.startsWith("TS"))
        role = "TRIMSTUD";
    else if (name.startsWith("SI"))
        role = "SILL";
    else if (isTruss) {
        if (name.startsWith("T"))
            role = "TOPCHORD";
        else if (name.startsWith("B"))
            role = "BOTTOMCHORD";
        else if (name.startsWith("W"))
            role = "WEB";
        else if (name.startsWith("R"))
            role = "TOPCHORD";
        else
            role = "WEB";
    }
    else if (stick.type === "plate") {
        if (name.startsWith("H"))
            role = "HEADPLATE";
        else if (name.startsWith("N"))
            role = "NOG";
        else if (name.startsWith("B"))
            role = "BOTTOMPLATE";
        else if (name.startsWith("T"))
            role = "TOPPLATE";
        else if (name.startsWith("R"))
            role = "RAIL";
        else
            role = "TOPPLATE";
    }
    else {
        if (name.startsWith("N"))
            role = "NOG";
        else if (name.startsWith("K"))
            role = "BRACE";
        else if (name.startsWith("W"))
            role = "WEB";
        else if (name.startsWith("H"))
            role = "HEADPLATE";
        else if (name.startsWith("R"))
            role = "RAIL";
        else
            role = "STUD";
    }
    const dim = computeDims(plan, frame, stick);
    return {
        frameId: `${frame.name}-${stick.name}`,
        profileCode: profileCode(stick.profile.metricLabel, stick.profile.gauge),
        role,
        orientation: stick.flipped ? "RIGHT" : "LEFT",
        qty: 1,
        dim,
        lengthA: stick.length,
        tooling: stick.tooling,
    };
}
/**
 * Choose the DETAILS header value. Detailer uses `<jobnum>#1-1` when the
 * project has a real job number (e.g. "HG260001#1-1"), and falls back to
 * the project name when jobnum is blank or a placeholder (e.g. `" "`
 * or empty string).
 */
function detailsHeader(project) {
    const j = project.jobNum?.replace(/^"\s*|\s*"$/g, "").trim() ?? "";
    if (j && j.length > 0 && !/^\s+$/.test(j))
        return `${j}#1-1`;
    return project.name;
}
/** Emit one plan's CSV text. Format mirrors Detailer's Rollforming CSV. */
export function planToCsv(project, plan) {
    const lines = [];
    const packId = plan.name;
    lines.push(`DETAILS,${detailsHeader(project)},${packId}`);
    for (const frame of plan.frames) {
        for (const stick of frame.sticks) {
            const r = stickToRow(plan, frame, stick);
            const row = [
                "COMPONENT",
                r.frameId,
                r.profileCode,
                r.role,
                r.orientation,
                String(r.qty),
                "",
                ...r.dim.map(n),
                ...toolingToCsvCells(r.tooling, r.lengthA),
            ];
            lines.push(row.join(","));
        }
    }
    return lines.join("\n") + "\n";
}
/** Emit every plan as separate CSVs, keyed by plan name. */
export function documentToCsvs(doc) {
    const out = {};
    for (const plan of doc.project.plans) {
        out[plan.name] = planToCsv(doc.project, plan);
    }
    return out;
}
