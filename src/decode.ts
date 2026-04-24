import { XMLParser } from "fast-xml-parser";
import { decryptRfy } from "./crypto.js";
import type {
  RfyDocument, RfyProject, RfyPlan, RfyFrame, RfyStick,
  RfyProfile, RfyToolingOp, ToolType, StickType, RfyPoint,
} from "./format.js";
import { TOOL_TYPES, STICK_TYPES } from "./format.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  isArray: (name) => ["plan", "frame", "stick", "point-tool", "spanned-tool", "start-tool", "end-tool"].includes(name),
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function num(s: string | undefined, fallback = 0): number {
  if (s === undefined || s === null || s === "") return fallback;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
}

function asToolType(s: string): ToolType {
  if ((TOOL_TYPES as readonly string[]).includes(s)) return s as ToolType;
  throw new Error(`Unknown tool type: ${s}`);
}

function asStickType(s: string): StickType {
  if ((STICK_TYPES as readonly string[]).includes(s)) return s as StickType;
  throw new Error(`Unknown stick type: ${s}`);
}

interface ToolingRaw {
  "point-tool"?: Array<{ "@_type": string; "@_pos": string }>;
  "spanned-tool"?: Array<{ "@_type": string; "@_start-pos": string; "@_end-pos": string }>;
  "start-tool"?: Array<{ "@_type": string }>;
  "end-tool"?: Array<{ "@_type": string }>;
}

function parseTooling(raw: ToolingRaw | undefined): RfyToolingOp[] {
  if (!raw) return [];
  const out: RfyToolingOp[] = [];
  for (const t of asArray(raw["start-tool"])) out.push({ kind: "start", type: asToolType(t["@_type"]) });
  for (const t of asArray(raw["point-tool"])) out.push({ kind: "point", type: asToolType(t["@_type"]), pos: num(t["@_pos"]) });
  for (const t of asArray(raw["spanned-tool"])) out.push({ kind: "spanned", type: asToolType(t["@_type"]), startPos: num(t["@_start-pos"]), endPos: num(t["@_end-pos"]) });
  for (const t of asArray(raw["end-tool"])) out.push({ kind: "end", type: asToolType(t["@_type"]) });
  return out;
}

interface ProfileRaw {
  "@_metric-label"?: string;
  "@_imperial-label"?: string;
  "@_gauge"?: string;
  "@_yield"?: string;
  "@_machine-series"?: string;
  shape?: string;
  web?: string;
  "l-flange"?: string;
  "r-flange"?: string;
  lip?: string;
}

function parseProfile(raw: ProfileRaw): RfyProfile {
  return {
    metricLabel: raw["@_metric-label"] ?? "",
    imperialLabel: raw["@_imperial-label"],
    gauge: raw["@_gauge"] ?? "",
    yield: raw["@_yield"],
    machineSeries: raw["@_machine-series"],
    shape: raw.shape ?? "",
    web: num(raw.web),
    lFlange: num(raw["l-flange"]),
    rFlange: num(raw["r-flange"]),
    lip: num(raw.lip),
  };
}

interface PolyRaw {
  pt?: Array<{ "@_x": string; "@_y": string }> | { "@_x": string; "@_y": string };
  "@_closed"?: string;
}

interface ElevationGraphicsRaw {
  poly?: PolyRaw[] | PolyRaw;
}

interface StickRaw {
  "@_name": string;
  "@_length": string;
  "@_type": string;
  "@_flipped": string;
  "@_design_hash"?: string;
  profile: ProfileRaw;
  tooling?: ToolingRaw;
  "elevation-graphics"?: ElevationGraphicsRaw;
}

function parseFirstClosedPolyCorners(eg: ElevationGraphicsRaw | undefined): RfyPoint[] | undefined {
  if (!eg) return undefined;
  const polys = asArray(eg.poly);
  const firstClosed = polys.find(p => p["@_closed"] === "1");
  if (!firstClosed) return undefined;
  const pts = asArray(firstClosed.pt);
  if (pts.length < 4) return undefined;
  return pts.slice(0, 4).map(p => ({ x: num(p["@_x"]), y: num(p["@_y"]) }));
}

function parseStick(raw: StickRaw): RfyStick {
  return {
    name: raw["@_name"],
    length: num(raw["@_length"]),
    type: asStickType(raw["@_type"]),
    flipped: raw["@_flipped"] === "1",
    designHash: raw["@_design_hash"],
    profile: parseProfile(raw.profile),
    tooling: parseTooling(raw.tooling),
    outlineCorners: parseFirstClosedPolyCorners(raw["elevation-graphics"]),
  };
}

interface FrameRaw {
  "@_name": string;
  "@_design_id"?: string;
  "@_weight": string;
  "@_length": string;
  "@_height": string;
  transformationmatrix?: string;
  stick?: StickRaw | StickRaw[];
}

function parseFrame(raw: FrameRaw): RfyFrame {
  return {
    name: raw["@_name"],
    designId: raw["@_design_id"],
    weight: num(raw["@_weight"]),
    length: num(raw["@_length"]),
    height: num(raw["@_height"]),
    transformationMatrix: raw.transformationmatrix,
    sticks: asArray(raw.stick).map(parseStick),
  };
}

interface PlanRaw {
  "@_name": string;
  "@_design_id"?: string;
  elevation?: string;
  frame?: FrameRaw | FrameRaw[];
}

function parsePlan(raw: PlanRaw): RfyPlan {
  return {
    name: raw["@_name"],
    designId: raw["@_design_id"],
    elevation: raw.elevation !== undefined ? num(raw.elevation) : undefined,
    frames: asArray(raw.frame).map(parseFrame),
  };
}

interface ProjectRaw {
  "@_name": string;
  "@_jobnum": string;
  "@_client": string;
  "@_date": string;
  "@_design_id"?: string;
  plan?: PlanRaw | PlanRaw[];
}

function parseProject(raw: ProjectRaw): RfyProject {
  return {
    name: raw["@_name"],
    jobNum: raw["@_jobnum"],
    client: raw["@_client"],
    date: raw["@_date"],
    designId: raw["@_design_id"],
    plans: asArray(raw.plan).map(parsePlan),
  };
}

/** Decode an RFY file (encrypted bytes) to a structured document. */
export function decode(rfyBytes: Buffer): RfyDocument {
  const xml = decryptRfy(rfyBytes);
  return decodeXml(xml);
}

/** Decode already-decrypted XML (useful for tests). */
export function decodeXml(xml: string): RfyDocument {
  const root = parser.parse(xml);
  const schedule = root.schedule;
  if (!schedule) throw new Error("Missing <schedule> root");
  return {
    scheduleVersion: schedule["@_version"] ?? "2",
    project: parseProject(schedule.project),
  };
}
