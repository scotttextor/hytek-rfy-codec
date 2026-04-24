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

function toolingToCsvCells(tooling: RfyToolingOp[], stickLength: number): string[] {
  const cells: string[] = [];
  for (const op of tooling) {
    const label = TOOL_TO_CSV[op.type];
    switch (op.kind) {
      case "point":
        cells.push(label, n(op.pos));
        break;
      case "spanned":
        cells.push(label, n(op.startPos), label, n(op.endPos));
        break;
      case "start":
        cells.push(label, "0");
        break;
      case "end":
        // End-tools (e.g. closing Chamfer) render at the component length.
        // Use stickLength so round-trip preserves the position.
        cells.push(label, n(stickLength));
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
