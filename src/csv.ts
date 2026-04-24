import type { RfyDocument, RfyPlan, RfyFrame, RfyStick, RfyToolingOp, ToolType, RfyPoint } from "./format.js";

/**
 * Map FrameCAD XML tool-type names to the CSV hole-type labels used in
 * HYTEK's production workflow (matches the format in
 * Split_HG######/<job>_<profile>.csv files).
 */
const TOOL_TO_CSV: Record<ToolType, string> = {
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
  Web: "WEB NOTCH",
};

/**
 * The CSV format is: `PROFILE_CODE_GAUGE` where profile label has spaces
 * removed. e.g. metric-label "70 S 41" + gauge "0.75" -> "70S41_0.75".
 */
function profileCode(metricLabel: string, gauge: string): string {
  return `${metricLabel.replace(/\s+/g, "")}_${gauge}`;
}

/**
 * Format a number for CSV output matching Detailer's conventions:
 * Detailer stores positions internally as Float32 (Delphi's Single),
 * then rounds to 2 decimal places. Replicate the Float32 cast then
 * round so e.g. 6777.8351 -> 6777.8349609375 (Float32) -> 6777.83.
 */
const f32 = new Float32Array(1);
function toFloat32(v: number): number {
  f32[0] = v;
  return f32[0]!;
}

function n(v: number): string {
  const v32 = toFloat32(v);
  const rounded = Math.round(v32 * 100) / 100;
  if (Number.isInteger(rounded)) return rounded.toString();
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Expansion rules for <spanned-tool> declarations in Detailer's XML when
 * rendered as flat per-position cells in the CSV. Reverse-engineered from
 * HG260001, HALIL, CHRIS and PRAKASHAN fixtures on 2026-04-24.
 *
 *   offset = distance from each end-point to the first/last emitted position
 *   stride = step between interior positions
 *
 * If neither is defined for a tool type, the span falls back to two cells
 * at the raw start/end positions.
 */
interface SpanRule { offset: number; stride: number; }
const SPAN_RULES: Partial<Record<ToolType, SpanRule>> = {
  Swage:       { offset: 27.5, stride: 55 },
  LipNotch:    { offset: 24,   stride: 48 },
  InnerNotch:  { offset: 24,   stride: 48 },
  LeftFlange:  { offset: 24,   stride: 48 },
  RightFlange: { offset: 24,   stride: 48 },
  Web:         { offset: 27.5, stride: 55 },
};

function expandSpan(start: number, end: number, type: ToolType): number[] {
  const rule = SPAN_RULES[type];
  if (!rule) return [start, end];
  const first = start + rule.offset;
  const last = end - rule.offset;
  // When the span is shorter than 2 * offset, the interior first/last
  // positions would overlap — Detailer collapses to the span midpoint.
  if (first >= last) return [(start + end) / 2];
  const positions: number[] = [];
  let cursor = first;
  while (cursor < last - 0.001) {
    positions.push(cursor);
    cursor += rule.stride;
  }
  if (positions.length === 0 || Math.abs(positions[positions.length - 1]! - last) > 0.001) {
    positions.push(last);
  }
  return positions;
}

/**
 * Flatten a stick's tooling list into per-position cells, sorted by position
 * in ascending order (matches Detailer's CSV emission order).
 */
function toolingToCsvCells(tooling: RfyToolingOp[], stickLength: number): string[] {
  const flat: Array<{ type: ToolType; pos: number; priority: number }> = [];
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
        for (const pos of positions) flat.push({ type: op.type, pos, priority: 1 });
        break;
      }
    }
  }
  // Stable sort by (pos ascending, priority ascending for same pos).
  flat.sort((a, b) => a.pos - b.pos || a.priority - b.priority);
  const cells: string[] = [];
  for (const op of flat) {
    cells.push(TOOL_TO_CSV[op.type], n(op.pos));
  }
  return cells;
}

interface ComponentRow {
  frameId: string;
  profileCode: string;
  role: string;
  orientation: "LEFT" | "RIGHT";
  qty: number;
  /** The 6 dimension columns — raw numbers, already formatted by the caller's mode. */
  dim: [number, number, number, number, number, number];
  /** Length used to scale end-tool positions in the tooling cells. */
  lengthA: number;
  tooling: RfyToolingOp[];
}

/**
 * Detailer's CSV uses two dimension modes depending on the stick's role:
 *
 * - **profile mode** (walls, HG260001 / HALIL): 6 columns are
 *   `[length, lFlange, 4, rFlange, length+4, web]`.
 *
 * - **midline mode** (trusses, CHRIS / PRAKASHAN): 6 columns are
 *   `[length, startX, startY, endX, endY, flangeThickness]` where
 *   start/end are midpoints of the two short edges of the stick's
 *   elevation outline polygon.
 *
 * Heuristic: any frame whose name starts with "TN" (truss network) or
 * any plan name containing "-TIN-" (truss inset) uses midline mode.
 */
function isTrussContext(planName: string, frameName: string): boolean {
  if (/-TIN-/.test(planName)) return true;
  if (/^TN/i.test(frameName)) return true;
  return false;
}

/** Compute midline endpoints from the 4 outline corners. */
function midlineFromCorners(corners: RfyPoint[]): { start: RfyPoint; end: RfyPoint; thickness: number } | null {
  if (corners.length !== 4) return null;
  // Edge lengths around the polygon
  const edges = [0, 1, 2, 3].map(i => {
    const a = corners[i]!, b = corners[(i + 1) % 4]!;
    return { a, b, len: Math.hypot(b.x - a.x, b.y - a.y) };
  });
  // Identify the two shortest opposite edges — they are the "ends" of the stick
  const sorted = [...edges].sort((x, y) => x.len - y.len);
  const short1 = sorted[0]!, short2 = sorted[1]!;
  const mid = (e: typeof short1) => ({ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 });
  const m1 = mid(short1);
  const m2 = mid(short2);
  // Ordering convention (from comparing our output to Detailer's CSV):
  // start = midpoint with lower Y; tied Y falls back to lower X.
  const [start, end] = m1.y < m2.y || (m1.y === m2.y && m1.x < m2.x) ? [m1, m2] : [m2, m1];
  return { start, end, thickness: short1.len };
}

function computeDims(
  plan: { name: string },
  frame: RfyFrame,
  stick: RfyStick,
): [number, number, number, number, number, number] {
  if (isTrussContext(plan.name, frame.name) && stick.outlineCorners) {
    const m = midlineFromCorners(stick.outlineCorners);
    if (m) {
      return [stick.length, m.start.x, m.start.y, m.end.x, m.end.y, Math.round(m.thickness)];
    }
  }
  // Profile mode (walls)
  return [stick.length, stick.profile.lFlange, 4, stick.profile.rFlange, stick.length + 4, stick.profile.web];
}

function stickToRow(plan: { name: string }, frame: RfyFrame, stick: RfyStick): ComponentRow {
  // Role: map stick type + name conventions to CSV role labels.
  // Walls use STUD/TOPPLATE/BOTTOMPLATE/NOG/BRACE/FILLER.
  // Trusses use TOPCHORD/BOTTOMCHORD/WEB/FILLER.
  const name = stick.name.toUpperCase();
  const frameName = frame.name.toUpperCase();
  const isTruss = frameName.startsWith("T") && /TN|TRUSS|TR/.test(frameName);
  let role = "STUD";
  if (name.startsWith("FIL")) role = "FILLER";
  else if (isTruss) {
    if (name.startsWith("T")) role = "TOPCHORD";
    else if (name.startsWith("B")) role = "BOTTOMCHORD";
    else if (name.startsWith("W")) role = "WEB";
    else role = "WEB";
  } else if (stick.type === "plate") {
    if (name.startsWith("B")) role = "BOTTOMPLATE";
    else role = "TOPPLATE";
  } else {
    if (name.startsWith("N")) role = "NOG";
    else if (name.startsWith("K")) role = "BRACE";
    else role = "STUD";
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
function detailsHeader(project: { name: string; jobNum: string }): string {
  const j = project.jobNum?.replace(/^"\s*|\s*"$/g, "").trim() ?? "";
  if (j && j.length > 0 && !/^\s+$/.test(j)) return `${j}#1-1`;
  return project.name;
}

/** Emit one plan's CSV text. Format mirrors Detailer's Rollforming CSV. */
export function planToCsv(project: { name: string; jobNum: string }, plan: RfyPlan): string {
  const lines: string[] = [];
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
export function documentToCsvs(doc: RfyDocument): Record<string, string> {
  const out: Record<string, string> = {};
  for (const plan of doc.project.plans) {
    out[plan.name] = planToCsv(doc.project, plan);
  }
  return out;
}
