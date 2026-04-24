import type { RfyDocument, RfyPlan, RfyFrame, RfyStick, RfyToolingOp, ToolType } from "./format.js";

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

/** Format a number for CSV output — integer if whole, else minimal decimal. */
function n(v: number): string {
  if (Number.isInteger(v)) return v.toString();
  // Match Detailer style: up to 4 decimal places, trim trailing zeros
  return Number(v.toFixed(4)).toString();
}

function toolingToCsvCells(tooling: RfyToolingOp[]): string[] {
  const cells: string[] = [];
  for (const op of tooling) {
    const label = TOOL_TO_CSV[op.type];
    switch (op.kind) {
      case "point":
        cells.push(label, n(op.pos));
        break;
      case "spanned":
        // Spanned operations emit two entries — one at each endpoint
        cells.push(label, n(op.startPos), label, n(op.endPos));
        break;
      case "start":
      case "end":
        // Start/end markers (chamfer etc.) — emit at 0 or length position
        cells.push(label, "0");
        break;
    }
  }
  return cells;
}

interface ComponentRow {
  frameId: string;
  profileCode: string;
  role: string;
  orientation: "LEFT" | "RIGHT";
  qty: number;
  lengthA: number;
  widthA: number;
  heightA: number;
  widthB: number;
  heightB: number;
  pitch: number;
  tooling: RfyToolingOp[];
}

function stickToRow(frame: RfyFrame, stick: RfyStick): ComponentRow {
  // Role: map stick type + name conventions to CSV role labels.
  const name = stick.name.toUpperCase();
  let role = "STUD";
  if (stick.type === "plate") {
    if (name.startsWith("T") || name.startsWith("B")) role = name.startsWith("T") ? "TOPPLATE" : "BOTTOMPLATE";
    else role = "TOPPLATE";
  } else {
    if (name.startsWith("N")) role = "NOG";
    else if (name.startsWith("K")) role = "BRACE";
    else if (name.startsWith("FIL")) role = "FILLER";
    else role = "STUD";
  }

  return {
    frameId: `${frame.name}-${stick.name}`,
    profileCode: profileCode(stick.profile.metricLabel, stick.profile.gauge),
    role,
    orientation: stick.flipped ? "RIGHT" : "LEFT",
    qty: 1,
    lengthA: stick.length,
    widthA: stick.profile.lFlange,
    heightA: 4,
    widthB: stick.profile.rFlange,
    heightB: stick.length + 4,
    pitch: stick.profile.web,
    tooling: stick.tooling,
  };
}

/** Emit one plan's CSV text. Format mirrors Detailer's Rollforming CSV. */
export function planToCsv(project: { jobNum: string }, plan: RfyPlan): string {
  const lines: string[] = [];
  const packId = plan.name;
  const jobHeader = `${project.jobNum}#1-1`;
  lines.push(`DETAILS,${jobHeader},${packId}`);
  for (const frame of plan.frames) {
    for (const stick of frame.sticks) {
      const r = stickToRow(frame, stick);
      const row = [
        "COMPONENT",
        r.frameId,
        r.profileCode,
        r.role,
        r.orientation,
        String(r.qty),
        "",
        n(r.lengthA), n(r.widthA), n(r.heightA), n(r.widthB), n(r.heightB), n(r.pitch),
        ...toolingToCsvCells(r.tooling),
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
