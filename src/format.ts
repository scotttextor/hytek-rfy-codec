/**
 * RFY document types. A decoded RFY file flattens to:
 *   RfyDocument
 *     project: RfyProject
 *       plans: RfyPlan[]
 *         frames: RfyFrame[]
 *           sticks: RfyStick[]
 *             tooling: RfyToolingOp[]
 *
 * Ground truth: decrypted FRAMECAD schedule XML (observed 2026-04-24).
 */

export const STICK_TYPES = ["stud", "plate"] as const;
export type StickType = typeof STICK_TYPES[number];

/** All tool types observed in FrameCAD XML output. */
export const TOOL_TYPES = [
  "Bolt",
  "Chamfer",
  "InnerDimple",
  "InnerNotch",
  "InnerService",
  "LeftFlange",
  "LipNotch",
  "RightFlange",
  "ScrewHoles",
  "Swage",
  "Web",
] as const;
export type ToolType = typeof TOOL_TYPES[number];

/** A point operation (single position) on a stick. */
export interface RfyPointTool {
  kind: "point";
  type: ToolType;
  pos: number;
}

/** A spanned operation (start and end positions). */
export interface RfySpannedTool {
  kind: "spanned";
  type: ToolType;
  startPos: number;
  endPos: number;
}

/** A start or end tool (no position — applied at the stick's edge). */
export interface RfyEdgeTool {
  kind: "start" | "end";
  type: ToolType;
}

export type RfyToolingOp = RfyPointTool | RfySpannedTool | RfyEdgeTool;

/** Profile (cross-section) definition of a stick. */
export interface RfyProfile {
  metricLabel: string;      // e.g. "70 S 41"
  imperialLabel?: string;   // e.g. "275 S 161"
  gauge: string;            // e.g. "0.75" (mm)
  yield?: string;           // e.g. "550" (MPa)
  machineSeries?: string;   // e.g. "F300i"
  shape: string;            // e.g. "S", "C"
  web: number;              // mm
  lFlange: number;          // mm
  rFlange: number;          // mm
  lip: number;              // mm
}

/** 2D point in an elevation drawing. */
export interface RfyPoint {
  x: number;
  y: number;
}

/** A single component (stud, plate, nog, brace). */
export interface RfyStick {
  name: string;             // e.g. "S1", "Kb1"
  length: number;           // mm
  type: StickType;
  flipped: boolean;         // flipped orientation (LEFT vs RIGHT in CSV)
  designHash?: string;
  profile: RfyProfile;
  tooling: RfyToolingOp[];
  /**
   * The 4 corners of the stick's outline polygon in elevation-graphics
   * (first closed <poly>). Used to reproduce Detailer's CSV dimension
   * columns for truss components (which use midline coords rather than
   * profile dims).
   */
  outlineCorners?: RfyPoint[];
}

/** A frame is a group of sticks forming one panel in a plan. */
export interface RfyFrame {
  name: string;             // e.g. "N28"
  weight: number;
  length: number;
  height: number;
  designId?: string;
  transformationMatrix?: string;
  sticks: RfyStick[];
}

/** A plan corresponds to one pack (e.g. "PK1-GF-NLBW-70.075"). */
export interface RfyPlan {
  name: string;             // e.g. "PK1-GF-NLBW-70.075"
  elevation?: number;
  designId?: string;
  frames: RfyFrame[];
}

/** Top-level project metadata. */
export interface RfyProject {
  name: string;             // e.g. "HG260001_LOT 289 (29) COORA CRESENT CURRIMUNDI"
  jobNum: string;           // e.g. "HG260001"
  client: string;           // e.g. "Coral Homes"
  date: string;             // e.g. "2026-02-11"
  designId?: string;
  plans: RfyPlan[];
}

/** Top-level RFY document. */
export interface RfyDocument {
  scheduleVersion: string;
  project: RfyProject;
}
