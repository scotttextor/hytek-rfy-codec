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
export declare const STICK_TYPES: readonly ["stud", "plate"];
export type StickType = typeof STICK_TYPES[number];
/** All tool types observed in FrameCAD XML output. */
export declare const TOOL_TYPES: readonly ["Bolt", "Chamfer", "InnerDimple", "InnerNotch", "InnerService", "LeftFlange", "LeftPartialFlange", "LipNotch", "RightFlange", "RightPartialFlange", "ScrewHoles", "Swage", "TrussChamfer", "Web"];
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
    metricLabel: string;
    imperialLabel?: string;
    gauge: string;
    yield?: string;
    machineSeries?: string;
    shape: string;
    web: number;
    lFlange: number;
    rFlange: number;
    lip: number;
}
/** 2D point in an elevation drawing. */
export interface RfyPoint {
    x: number;
    y: number;
}
/** A single component (stud, plate, nog, brace). */
export interface RfyStick {
    name: string;
    length: number;
    type: StickType;
    flipped: boolean;
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
    name: string;
    weight: number;
    length: number;
    height: number;
    designId?: string;
    transformationMatrix?: string;
    sticks: RfyStick[];
}
/** A plan corresponds to one pack (e.g. "PK1-GF-NLBW-70.075"). */
export interface RfyPlan {
    name: string;
    elevation?: number;
    designId?: string;
    frames: RfyFrame[];
}
/** Top-level project metadata. */
export interface RfyProject {
    name: string;
    jobNum: string;
    client: string;
    date: string;
    designId?: string;
    plans: RfyPlan[];
}
/** Top-level RFY document. */
export interface RfyDocument {
    scheduleVersion: string;
    project: RfyProject;
}
