import type { RfyDocument, RfyPlan, RfyFrame, RfyStick, RfyToolingOp, ToolType, RfyPoint } from "./format.js";

/**
 * Map FrameCAD XML tool-type names to the CSV hole-type labels used in
 * HYTEK's production workflow (matches the format in
 * Split_HG######/<job>_<profile>.csv files).
 */
// Detailer's RFY uses these op-type names with the following CSV labels.
// Verified empirically 2026-05-03 via round-trip diff against
// HG260044#1-1_GF-LBW-70.075.{rfy,csv}: B1 has `point Web @ 8` matching
// CSV `BOLT HOLES,8`; `point Bolt @ 62` matches `ANCHOR,62`.
//
//   Web   → BOLT HOLES   (holes punched THROUGH the web face)
//   Bolt  → ANCHOR       (anchor bolts into the slab — Detailer's "Bolt" tool)
//   InnerNotch → WEB NOTCH  (notches cut INTO the web face for fitment)
//
// Common confusion: "Web" the op-name vs "WEB NOTCH" the CSV label —
// they are NOT the same operation. Web punches a hole; InnerNotch makes
// a notch.
const TOOL_TO_CSV: Record<ToolType, string> = {
  Bolt: "ANCHOR",
  Chamfer: "FULL CHAMFER",
  InnerDimple: "INNER DIMPLE",
  InnerNotch: "WEB NOTCH",
  InnerService: "SERVICE HOLE",
  LeftFlange: "LIP NOTCH",
  LeftPartialFlange: "LIP NOTCH",
  LipNotch: "LIP NOTCH",
  RightFlange: "LIP NOTCH",
  RightPartialFlange: "LIP NOTCH",
  ScrewHoles: "ANCHOR",
  Swage: "SWAGE",
  TrussChamfer: "FULL CHAMFER",
  Web: "BOLT HOLES",
};

/**
 * The CSV format is: `PROFILE_CODE_GAUGE` where profile label has spaces
 * removed. e.g. metric-label "70 S 41" + gauge "0.75" -> "70S41_0.75".
 *
 * Defensive against missing fields — some XML profiles have metric-label
 * as nested <metric-label> text rather than the usual attribute, which
 * parseProfile can leave undefined.
 */
function profileCode(metricLabel: string | undefined, gauge: string | undefined): string {
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
function toFloat32(v: number): number {
  f32[0] = v;
  return f32[0]!;
}

/** Emit a tool POSITION at 1-decimal precision. Ref examples:
 *    INNER DIMPLE,16.5  /  SWAGE,27.5  /  LIP NOTCH,287  /  SERVICE HOLE,296
 * Verified 2026-05-03 vs HG260044 round-trip — tool positions are
 * pre-rounded to 1 decimal in Detailer's internal grid.
 */
function n(v: number): string {
  const v32 = toFloat32(v);
  const rounded = Math.round(v32 * 10) / 10;
  if (Number.isInteger(rounded)) return rounded.toString();
  return rounded.toFixed(1).replace(/\.?0+$/, "");
}

/** Emit a DIMENSION column (length / startX / startY / endX / endY / flange)
 * at 2-decimal precision. Ref examples:
 *    1377.73 (Kb stick length)   1947.8 (zero-trimmed)   2494 (integer)
 * Diagonal Kb-brace lengths and apex/heel outline coords on raking frames
 * need 2 decimals to round-trip from Float32 storage.
 */
function nDim(v: number): string {
  const v32 = toFloat32(v);
  const rounded = Math.round(v32 * 100) / 100;
  if (Number.isInteger(rounded)) return rounded.toString();
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

/** Emit a Chamfer position at 2-decimal precision. Chamfer positions are
 * derived from stick length (`-3`, `length+3`) and inherit length precision.
 * Ref example: Kb1 length 1377.73 → FULL CHAMFER,1380.73 at the end.
 */
function nChamfer(v: number): string {
  return nDim(v);
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

function expandSpan(start: number, end: number, type: ToolType, stickLength: number): number[] {
  const rule = SPAN_RULES[type];
  if (!rule) return [start, end];
  const first = start + rule.offset;
  const last = end - rule.offset;
  // When the span is shorter than 2 * offset (collapse case):
  // Detailer emits the INTERIOR boundary of the cap — the side facing
  // the stick body, not the midpoint. Verified 2026-05-03 vs HG260044
  // round-trip:
  //   - Start cap [0..39]:        emit `first` (= start + offset, e.g. 24)
  //   - End cap [length-39..length]: emit `last` (= end - offset, e.g. length-24)
  //   - Mid-stick collapsed span: fall back to midpoint
  //
  // Old behavior (Swage at first; others at midpoint) was wrong:
  //   • L1-T1 end cap [263..302] LipNotch emitted 282.5 (mid) — ref shows 278 (last)
  //   • L1-S1 end cap [2718..2757] Swage emitted 2745.5 (first) — ref shows 2729.5 (last)
  if (first >= last) {
    const isStartCap = start < 0.5;
    const isEndCap = stickLength > 0 && Math.abs(end - stickLength) < 0.5;
    if (isStartCap) return [first];
    if (isEndCap) return [last];
    return [(start + end) / 2];
  }
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
 * Type-based tiebreaker for same-position ordering. Lower = emitted first.
 *
 * Verified 2026-05-03 vs HG260044 LBW corpus, ref L1-N1 @ 96.5:
 *   "LIP NOTCH, INNER DIMPLE, WEB NOTCH"
 * — interleaves a spanned op (LipNotch) → point op (InnerDimple) → spanned
 * op (InnerNotch/"WEB NOTCH") at the SAME coord. The kind-based priority
 * model (spanned-before-point) gets the InnerDimple in the wrong place.
 *
 * Conservative table: ONLY the LipNotch < InnerDimple < InnerNotch trio
 * gets explicit ordering. All other types share a sentinel (5) so the
 * stable sort preserves their original input order. Adding more types
 * without empirical evidence breaks more cases than it fixes — verified
 * 2026-05-04 by trying a fully-prescribed table (round-trip dropped from
 * 51.7% to 39.3%).
 */
const TYPE_ORDER: Partial<Record<ToolType, number>> = {
  LipNotch: 1,
  LeftFlange: 1,
  RightFlange: 1,
  LeftPartialFlange: 1,
  RightPartialFlange: 1,
  InnerDimple: 2,
  InnerNotch: 3,
};
const TYPE_ORDER_DEFAULT = 5;

/**
 * Flatten a stick's tooling list into per-position cells, sorted by position
 * in ascending order (matches Detailer's CSV emission order).
 *
 * Three-level sort:
 *   1. pos ascending
 *   2. kind (start < body < end) — keeps start/end ops at the right edges
 *   3. type tiebreaker (LipNotch < InnerDimple < InnerNotch; else stable)
 */
function toolingToCsvCells(tooling: RfyToolingOp[], stickLength: number): string[] {
  // Body ops have a sub-priority: spanned (0) before point (1). This is the
  // dominant pattern for non-trio types (e.g. Swage span before InnerDimple
  // point at same pos). The trio (LipNotch < InnerDimple < InnerNotch) is
  // handled as a type-level override below.
  const flat: Array<{ type: ToolType; pos: number; edgePriority: number; bodySubPriority: number; insIdx: number }> = [];
  let counter = 0;
  for (const op of tooling) {
    switch (op.kind) {
      case "point":
        flat.push({ type: op.type, pos: op.pos, edgePriority: 1, bodySubPriority: 1, insIdx: counter++ });
        break;
      case "start":
        // Chamfer/TrussChamfer at start emit at pos -3 (3mm BEFORE the stick
        // origin) to match Detailer's CSV convention. Verified 2026-05-04
        // against HG260044 corpus: 320/320 start-chamfers at pos = -3.
        // Other start-edge tools stay at pos 0.
        {
          const isChamfer = op.type === "Chamfer" || op.type === "TrussChamfer";
          const startPos = isChamfer ? -3 : 0;
          flat.push({ type: op.type, pos: startPos, edgePriority: 0, bodySubPriority: 0, insIdx: counter++ });
        }
        break;
      case "end":
        // Chamfer/TrussChamfer at end emit at pos length+3 (3mm BEYOND the
        // stick end), again per Detailer's CSV convention. Verified
        // 2026-05-04 against HG260044 corpus: 650/650 end-chamfers at
        // pos = length + 3.
        {
          const isChamfer = op.type === "Chamfer" || op.type === "TrussChamfer";
          const endPos = isChamfer ? stickLength + 3 : stickLength;
          flat.push({ type: op.type, pos: endPos, edgePriority: 2, bodySubPriority: 0, insIdx: counter++ });
        }
        break;
      case "spanned": {
        const positions = expandSpan(op.startPos, op.endPos, op.type, stickLength);
        for (const pos of positions) flat.push({ type: op.type, pos, edgePriority: 1, bodySubPriority: 0, insIdx: counter++ });
        break;
      }
    }
  }
  flat.sort((a, b) => {
    if (a.pos !== b.pos) return a.pos - b.pos;
    if (a.edgePriority !== b.edgePriority) return a.edgePriority - b.edgePriority;
    // For body ops at same pos:
    //   If both types are in the explicit TYPE_ORDER trio, use that order
    //   (overrides spanned/point — InnerDimple goes BETWEEN LipNotch and
    //   InnerNotch even though it's a point op).
    //   Otherwise, fall back to spanned-before-point (the dominant pattern
    //   for non-trio types like Swage), with insertion order as final tie.
    const ta = TYPE_ORDER[a.type];
    const tb = TYPE_ORDER[b.type];
    if (ta !== undefined && tb !== undefined) {
      if (ta !== tb) return ta - tb;
    }
    if (a.bodySubPriority !== b.bodySubPriority) return a.bodySubPriority - b.bodySubPriority;
    return a.insIdx - b.insIdx;
  });
  const cells: string[] = [];
  for (const op of flat) {
    const isChamfer = op.type === "Chamfer" || op.type === "TrussChamfer";
    cells.push(TOOL_TO_CSV[op.type], isChamfer ? nChamfer(op.pos) : n(op.pos));
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
  _plan: { name: string },
  _frame: RfyFrame,
  stick: RfyStick,
): [number, number, number, number, number, number] {
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

function stickToRow(plan: { name: string }, frame: RfyFrame, stick: RfyStick): ComponentRow {
  // Role: map stick type + name conventions to CSV role labels.
  // Walls use STUD/TOPPLATE/BOTTOMPLATE/NOG/BRACE/FILLER.
  // Trusses use TOPCHORD/BOTTOMCHORD/WEB/FILLER.
  const name = stick.name.toUpperCase();
  const frameName = frame.name.toUpperCase();
  // Truss detection — verified 2026-05-04 against HG260044 corpus by
  // surveying every CSV's role distribution per plan:
  //   TIN-* and TB2B-* plans use ONLY truss roles (TOPCHORD/BOTTOMCHORD/
  //     WEB/FILLER/RAIL); never STUD/NOG/BRACE/etc.
  //   LBW/NLBW/MH/CP/RP plans use only wall roles.
  // The earlier `frameName ^TN` check missed both TIN frames (PC*, TGI*)
  // and TB2B frames (TT*) — both are trusses but don't start with "TN".
  // The plan-name pattern is the reliable signal.
  const planName = plan.name.toUpperCase();
  const isTrussPlan = /(?:^|-)(TIN|TB2B)(?:-|$|\d)/.test(planName);
  const isTruss = isTrussPlan || /^TN/i.test(frameName) || /TRUSS/.test(frameName);
  let role = "STUD";

  // Name-prefix dictionary (observed in Detailer CSVs on Y: drive):
  //   S*=STUD (or TRIMSTUD if with trim)   T*=TOPPLATE / TOPCHORD
  //   B*=BOTTOMPLATE / BOTTOMCHORD         N*=NOG
  //   K*=BRACE (Kb1)                        W*=WEB (truss)
  //   H*=HEADPLATE (door/window header)    SI*=SILL (window sill)
  //   R*=RAIL / TOPCHORD                    FIL=FILLER
  //   TS*=TRIMSTUD (trim around openings)

  if (name.startsWith("FIL")) role = "FILLER";
  else if (name.startsWith("TS")) role = "TRIMSTUD";
  else if (name.startsWith("SI")) role = "SILL";
  else if (isTruss) {
    if (name.startsWith("T")) role = "TOPCHORD";
    else if (name.startsWith("B")) role = "BOTTOMCHORD";
    else if (name.startsWith("W")) role = "WEB";
    else if (name.startsWith("R")) role = "TOPCHORD";
    else role = "WEB";
  } else if (stick.type === "plate") {
    if (name.startsWith("H")) role = "HEADPLATE";
    else if (name.startsWith("N")) role = "NOG";
    else if (name.startsWith("B")) role = "BOTTOMPLATE";
    else if (name.startsWith("T")) role = "TOPPLATE";
    else if (name.startsWith("R")) role = "RAIL";
    else role = "TOPPLATE";
  } else {
    if (name.startsWith("N")) role = "NOG";
    else if (name.startsWith("K")) role = "BRACE";
    else if (name.startsWith("W")) role = "WEB";
    else if (name.startsWith("H")) role = "HEADPLATE";
    else if (name.startsWith("R")) role = "RAIL";
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

/**
 * Detailer-internal "module class" for a stick — used to insert FILLER
 * separator rows between modules in the CSV.
 *
 *   "W"   = truss webs (W*-prefix sticks; chamfered diagonal)
 *   "Kb"  = diagonal braces (Kb*-prefix; long chamfered diagonal)
 *   "def" = everything else (regular studs, plates, headers, sills, nogs)
 *
 * Verified 2026-05-03 vs HG260044 LBW: FILLER appears at every transition
 * between W and def, between Kb and def, and between W and Kb. Detailer
 * inserts a single FILLER (not one per side) at each module boundary —
 * the trailing-FIL of group N is the same row as the leading-FIL of
 * group N+1.
 */
function moduleClass(stickName: string): "W" | "Kb" | "def" {
  if (/^Kb\d/.test(stickName)) return "Kb";
  if (/^W\d/.test(stickName)) return "W";
  return "def";
}

/**
 * Build the constant FILLER row that separates modules. Detailer's filler
 * row template (verified vs HG260044 corpus 2026-05-03):
 *
 *   COMPONENT,<frame>-FIL,<profile>_<gauge>,FILLER,RIGHT,1,,50,0,0,0,0,41
 *
 * The 6 dim columns are the constant `[50, 0, 0, 0, 0, 41]` regardless of
 * the surrounding sticks' lengths — Detailer treats this as a fixed-length
 * physical filler stub the rollformer outputs while switching programs.
 * No tooling.
 */
function fillerRow(frameName: string, profileCodeStr: string): string {
  return `COMPONENT,${frameName}-FIL,${profileCodeStr},FILLER,RIGHT,1,,50,0,0,0,0,41`;
}

/** Emit one plan's CSV text. Format mirrors Detailer's Rollforming CSV.
 *
 * Detailer emits a `DETAILS,<job>#1-1,<plan>` header BEFORE EACH FRAME,
 * not just once per file. Verified 2026-05-03 vs HG260044#1-1_GF-LBW-70.075.csv
 * which has 39 DETAILS rows for 39 frames.
 */
export function planToCsv(project: { name: string; jobNum: string }, plan: RfyPlan): string {
  const lines: string[] = [];
  const packId = plan.name;
  const header = `DETAILS,${detailsHeader(project)},${packId}`;
  for (const frame of plan.frames) {
    lines.push(header);
    let prevClass: "W" | "Kb" | "def" | null = null;
    let prevProfileCode: string | null = null;
    for (const stick of frame.sticks) {
      const r = stickToRow(plan, frame, stick);
      const cls = moduleClass(stick.name);
      // Insert a FILLER row at every module-class transition (except at
      // the very start of a frame, when there's no "previous" module).
      if (prevClass !== null && cls !== prevClass) {
        lines.push(fillerRow(frame.name, prevProfileCode ?? r.profileCode));
      }
      // Dim columns precision (verified 2026-05-03 vs HG260044 round-trip):
      //   col-7  length    → 2-decimal  (Kb 1377.73, raking-frame heel offsets)
      //   col-8  startX     → 1-decimal
      //   col-9  startY     → 1-decimal
      //   col-10 endX        → 1-decimal
      //   col-11 endY        → 1-decimal
      //   col-12 flange      → 1-decimal (typically integer 41)
      const [length, sx, sy, ex, ey, fl] = r.dim;
      const row = [
        "COMPONENT",
        r.frameId,
        r.profileCode,
        r.role,
        r.orientation,
        String(r.qty),
        "",
        nDim(length),
        n(sx), n(sy), n(ex), n(ey), n(fl),
        ...toolingToCsvCells(r.tooling, r.lengthA),
      ];
      lines.push(row.join(","));
      prevClass = cls;
      prevProfileCode = r.profileCode;
    }
    // Emit a trailing FILLER if the frame ended on a non-default module
    // (W or Kb). Verified vs HG260044 LBW where frames containing W's at
    // the very end (L31, etc.) close with a FIL row after the last W.
    if (prevClass !== null && prevClass !== "def") {
      lines.push(fillerRow(frame.name, prevProfileCode ?? ""));
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
