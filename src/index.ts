export { decode, decodeXml } from "./decode.js";
export { decryptRfy, encryptRfy, RFY_KEY, RFY_ALGORITHM, RFY_IV_LENGTH } from "./crypto.js";
export { planToCsv, documentToCsvs } from "./csv.js";
export { parseCsv, validateCsv, type CsvPlan, type CsvComponent } from "./csv-parse.js";
export { parseXmlTree, buildXml, encodeXml, encodeTree, type XmlNode } from "./encode.js";
export { applyCsvToRfy, type ApplyResult } from "./apply.js";
export { synthesizeRfyFromCsv, type SynthesizeOptions, type SynthesizeResult } from "./synthesize.js";
export {
  synthesizeRfyFromPlans,
  deriveFrameBasis,
  coerceEnvelopeToRect,
  projectToFrameLocal,
  transformationMatrixString,
  type ParsedProject, type ParsedPlan, type ParsedFrame, type ParsedStick, type ParsedStickProfile,
  type FrameBasis, type Vec2, type Vec3,
  type SynthesizePlansOptions, type SynthesizePlansResult,
} from "./synthesize-plans.js";
export {
  MACHINE_SETUPS,
  SETUP_BY_PROFILE_WEB,
  getMachineSetupForProfile,
  getDefaultMachineSetup,
  findSectionSetup,
  findTool,
  endClearanceSpan,
  dimpleEndOffset,
  lipNotchToolLength,
  type MachineSetup,
  type ChamferPoint,
  type ToolEntry,
  type FastenerEntry,
  type SectionOptions,
  type ProfileGeometry,
  type MaterialSpec,
  type SectionSetup,
  type ToolSetup,
} from "./machine-setups.js";
export {
  generateTooling, generateToolingWithTrace,
  applyRule, applyRules, findGroup,
  RULE_TABLE, profileOffsets,
  generateFrameContextOps, layoutFrame, computeBox, roleFromName,
  type StickContext, type Anchor, type OpRule, type RuleGroup, type RuleApplicationResult,
} from "./rules/index.js";
export {
  STICK_TYPES,
  TOOL_TYPES,
  type StickType,
  type ToolType,
  type RfyPointTool,
  type RfySpannedTool,
  type RfyEdgeTool,
  type RfyToolingOp,
  type RfyProfile,
  type RfyStick,
  type RfyFrame,
  type RfyPlan,
  type RfyProject,
  type RfyDocument,
} from "./format.js";
export {
  simplifyLinearTrussRfy,
  isLinearTruss,
  assertRfyVersion,
  RfyVersionMismatch,
  DEFAULT_PROFILE_GATE,
  type SimplifyLinearTrussOptions,
  type SimplifyDecision,
  type SimplifyResult,
  type ProfileGate,
  // Junction-list extraction (#5) — exported so hytek-itm's label & drawing
  // PDF generators can consume `decisions[].sticks` without a deep import.
  type Junction,
  type JunctionMate,
  type StickJunctions,
} from "./simplify-linear-truss.js";

export const VERSION = "0.1.0";
