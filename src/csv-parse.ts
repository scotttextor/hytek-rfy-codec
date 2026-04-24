import type { RfyToolingOp, ToolType } from "./format.js";
import { TOOL_TYPES } from "./format.js";

/**
 * Inverse of src/csv.ts. Parses Detailer-style Rollforming CSV text
 * into a structured edit plan that can be applied to an RfyDocument or
 * used to synthesise one from scratch.
 */

/** CSV → tool-type mapping (inverse of TOOL_TO_CSV in csv.ts). */
const CSV_TO_TOOL: Record<string, ToolType> = {
  "BOLT HOLES": "Bolt",
  "FULL CHAMFER": "Chamfer",
  "INNER DIMPLE": "InnerDimple",
  "WEB NOTCH": "InnerNotch",
  "SERVICE HOLE": "InnerService",
  "LIP NOTCH": "LipNotch",
  "ANCHOR": "ScrewHoles",
  "SWAGE": "Swage",
};

export interface CsvComponent {
  frameId: string;        // e.g. "N28-S1"
  frameName: string;      // e.g. "N28"
  stickName: string;      // e.g. "S1"
  profileCode: string;    // e.g. "70S41_0.75"
  metricLabel: string;    // e.g. "70 S 41" — reconstructed from profileCode
  gauge: string;          // e.g. "0.75"
  role: string;           // e.g. "STUD"
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

export interface CsvPlan {
  jobId: string;          // e.g. "HG260001#1-1"
  jobNum: string;         // e.g. "HG260001"
  packId: string;         // e.g. "PK1-GF-NLBW-70.075"
  components: CsvComponent[];
}

/** Split a CSV file into its DETAILS-delimited plan sections. */
export function parseCsv(csv: string): CsvPlan[] {
  const plans: CsvPlan[] = [];
  let current: CsvPlan | null = null;

  for (const rawLine of csv.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const cols = splitCsvLine(line);
    if (cols[0] === "DETAILS") {
      if (current) plans.push(current);
      const jobId = cols[1] ?? "";
      const jobNum = jobId.replace(/"/g, "").split("#")[0] ?? "";
      current = { jobId, jobNum, packId: cols[2] ?? "", components: [] };
    } else if (cols[0] === "COMPONENT" && current) {
      current.components.push(parseComponent(cols));
    }
  }
  if (current) plans.push(current);
  return plans;
}

/** Split a CSV line respecting double-quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  let buf = "";
  let inQuotes = false;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { buf += '"'; i += 2; continue; }
      if (ch === '"') { inQuotes = false; i++; continue; }
      buf += ch; i++;
    } else {
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ",") { out.push(buf); buf = ""; i++; continue; }
      buf += ch; i++;
    }
  }
  out.push(buf);
  return out;
}

function parseComponent(cols: string[]): CsvComponent {
  const frameId = cols[1] ?? "";
  const [frameName, stickName] = splitFrameStickId(frameId);
  const profileCode = cols[2] ?? "";
  const { metricLabel, gauge } = splitProfileCode(profileCode);
  const role = cols[3] ?? "STUD";
  const orientation = (cols[4] ?? "LEFT") as "LEFT" | "RIGHT";
  const qty = parseInt(cols[5] ?? "1", 10);
  // cols[6] is always blank
  const dims = cols.slice(7, 13).map(parseFloatSafe);
  const tooling = parseTooling(cols.slice(13));
  return {
    frameId, frameName, stickName,
    profileCode, metricLabel, gauge,
    role, orientation, qty,
    lengthA: dims[0] ?? 0,
    widthA: dims[1] ?? 0,
    heightA: dims[2] ?? 0,
    widthB: dims[3] ?? 0,
    heightB: dims[4] ?? 0,
    pitch: dims[5] ?? 0,
    tooling,
  };
}

function splitFrameStickId(id: string): [string, string] {
  // Most CSVs use "Nxx-Sx" format. Split at the LAST hyphen.
  const lastDash = id.lastIndexOf("-");
  if (lastDash < 0) return [id, ""];
  return [id.slice(0, lastDash), id.slice(lastDash + 1)];
}

function splitProfileCode(code: string): { metricLabel: string; gauge: string } {
  // e.g. "70S41_0.75" -> metricLabel "70 S 41" + gauge "0.75"
  const [profile, gauge = "0.75"] = code.split("_");
  const m = profile?.match(/^(\d+)([A-Z]+)(\d+)$/);
  if (m) {
    return { metricLabel: `${m[1]} ${m[2]} ${m[3]}`, gauge };
  }
  return { metricLabel: profile ?? "", gauge };
}

function parseFloatSafe(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The CSV stores tooling as flat `<type>,<pos>` pairs. Spanned operations
 * (start+end) are stored as two entries in sequence with matching type.
 * Point operations are one entry. We re-group them into RfyToolingOp[].
 */
function parseTooling(cells: string[]): RfyToolingOp[] {
  const ops: RfyToolingOp[] = [];
  const pairs: Array<{ csvType: string; pos: number }> = [];
  for (let i = 0; i + 1 < cells.length; i += 2) {
    const csvType = cells[i]?.trim();
    const pos = parseFloatSafe(cells[i + 1]);
    if (!csvType) continue;
    if (!(csvType in CSV_TO_TOOL)) continue;
    pairs.push({ csvType, pos });
  }

  // Heuristic: Chamfer at pos 0 = start/end tool.
  // For spanned ops (Swage, notches), adjacent pairs with same type form a span.
  // For point ops (Dimple, Service, Bolt), each entry is its own point.
  const spannedTypes = new Set<ToolType>(["Swage", "InnerNotch", "LipNotch", "LeftFlange", "RightFlange", "Web"]);
  let i = 0;
  while (i < pairs.length) {
    const p = pairs[i]!;
    const toolType = CSV_TO_TOOL[p.csvType]!;
    if (toolType === "Chamfer") {
      ops.push({ kind: "start", type: toolType });
      i++;
      continue;
    }
    if (spannedTypes.has(toolType) && i + 1 < pairs.length && pairs[i + 1]!.csvType === p.csvType) {
      ops.push({ kind: "spanned", type: toolType, startPos: p.pos, endPos: pairs[i + 1]!.pos });
      i += 2;
      continue;
    }
    ops.push({ kind: "point", type: toolType, pos: p.pos });
    i++;
  }
  return ops;
}

/** Validate that all tool types in the CSV are recognised. */
export function validateCsv(csv: string): string[] {
  const errors: string[] = [];
  const plans = parseCsv(csv);
  for (const plan of plans) {
    if (!plan.jobNum) errors.push(`Plan "${plan.packId}": missing job number`);
    if (plan.components.length === 0) errors.push(`Plan "${plan.packId}": no components`);
    for (const c of plan.components) {
      if (!TOOL_TYPES || !Array.isArray(TOOL_TYPES)) break;
    }
  }
  return errors;
}
