import { encryptRfy } from "./crypto.js";
import { buildXml, type XmlNode } from "./encode.js";
import { parseCsv, type CsvPlan, type CsvComponent } from "./csv-parse.js";
import type { RfyToolingOp } from "./format.js";

/**
 * Synthesize a minimal valid RFY from a Detailer-style Rollforming CSV alone
 * (no seed RFY required). The output contains only the tooling/profile data
 * the rollformer needs — graphics, 3D mesh, transformation matrices, and
 * design GUIDs are omitted.
 *
 * Caveats:
 *   - Detailer's UI may display the resulting file oddly (no 3D view).
 *   - Rollformer acceptance is expected but must be validated on a real
 *     machine during planned downtime.
 *
 * Source of truth is the apply-to-seed path for anything that must round-
 * trip through Detailer; this path is for CSV-only inputs.
 */

export interface SynthesizeOptions {
  /** Override the auto-derived project name (defaults to CSV's first job/project token). */
  projectName?: string;
  /** Override jobnum (defaults to the CSV's DETAILS first field). */
  jobNum?: string;
  /** Override client attribute. */
  client?: string;
  /** Override date (ISO YYYY-MM-DD); defaults to today. */
  date?: string;
}

export interface SynthesizeResult {
  rfy: Buffer;
  xml: string;
  planCount: number;
  frameCount: number;
  stickCount: number;
}

/** Generate a stable v4-style GUID from a seed string (deterministic so same
 *  input always produces same RFY — important for rollformer caching). */
function deterministicGuid(seed: string): string {
  // Hash seed into 16 bytes (deterministic FNV-1a + variant)
  const bytes = new Uint8Array(16);
  let h1 = 0x811c9dc5, h2 = 0xdeadbeef, h3 = 0x9e3779b1, h4 = 0x85ebca6b;
  for (const ch of seed) {
    const c = ch.charCodeAt(0);
    h1 = ((h1 ^ c) * 0x01000193) >>> 0;
    h2 = ((h2 ^ c) * 0xa3ffd6ad) >>> 0;
    h3 = ((h3 ^ c) * 0x9e3779b1) >>> 0;
    h4 = ((h4 ^ c) * 0xc2b2ae35) >>> 0;
  }
  const u32 = [h1, h2, h3, h4];
  for (let i = 0; i < 4; i++) {
    bytes[i*4]   = (u32[i]! >>> 24) & 0xff;
    bytes[i*4+1] = (u32[i]! >>> 16) & 0xff;
    bytes[i*4+2] = (u32[i]! >>> 8)  & 0xff;
    bytes[i*4+3] = (u32[i]!)        & 0xff;
  }
  // Format as 8-4-4-4-12 GUID
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0").toUpperCase()).join("");
  return `{${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}}`;
}

export function synthesizeRfyFromCsv(csv: string, options: SynthesizeOptions = {}): SynthesizeResult {
  const csvPlans = parseCsv(csv);
  if (csvPlans.length === 0) throw new Error("No DETAILS/plan rows found in CSV");

  const projectName = options.projectName ?? csvPlans[0]!.jobNum.replace(/^"\s*|\s*"$/g, "").trim() ?? "UNTITLED";
  const jobNum = options.jobNum ?? projectName;
  const client = options.client ?? "";
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const projectGuid = deterministicGuid(`project:${projectName}:${jobNum}`);

  const byPack = new Map<string, CsvPlan[]>();
  for (const p of csvPlans) {
    const arr = byPack.get(p.packId) ?? [];
    arr.push(p);
    byPack.set(p.packId, arr);
  }

  let planCount = 0;
  let frameCount = 0;
  let stickCount = 0;
  const planNodes: XmlNode[] = [];

  for (const [packId, packPlans] of byPack) {
    planCount++;
    // Combine all DETAILS sections with the same packId into one <plan>, one frame per DETAILS block.
    const frameNodes: XmlNode[] = [];
    for (const plan of packPlans) {
      // Group this plan's components by frameName
      const byFrame = new Map<string, CsvComponent[]>();
      for (const c of plan.components) {
        if (c.role === "FILLER" || c.stickName.toUpperCase().startsWith("FIL")) continue;
        const arr = byFrame.get(c.frameName) ?? [];
        arr.push(c);
        byFrame.set(c.frameName, arr);
      }
      for (const [frameName, comps] of byFrame) {
        frameCount++;
        const sticks: XmlNode[] = [];
        for (const c of comps) {
          stickCount++;
          sticks.push(buildStickNode(c));
        }
        const frameGuid = deterministicGuid(`frame:${packId}:${frameName}`);
        const frameLength = Math.max(...comps.map(c => c.lengthA), 0);
        // Heuristic frame height: max stick length when no explicit value
        const frameHeight = Math.max(...comps.map(c => c.lengthA), 0);
        frameNodes.push({
          frame: [
            // Empty plan-graphics (Detailer always emits this; some parsers require it)
            { "plan-graphics": [] },
            ...sticks,
          ],
          ":@": {
            "@_name": frameName,
            "@_design_id": frameGuid,
            "@_weight": "0",
            "@_length": String(frameLength),
            "@_height": String(frameHeight),
          },
        } as XmlNode);
      }
    }
    const planGuid = deterministicGuid(`plan:${packId}`);
    planNodes.push({
      plan: [
        { elevation: [{ "#text": "0" }] },
        { "plan-graphics": [] },
        ...frameNodes,
      ],
      ":@": {
        "@_name": packId,
        "@_design_id": planGuid,
      },
    } as XmlNode);
  }

  const xmlTree: XmlNode[] = [
    {
      schedule: [
        {
          project: planNodes,
          ":@": {
            "@_name": projectName,
            "@_design_id": projectGuid,
            "@_client": client,
            "@_jobnum": jobNum,
            "@_date": date,
          },
        } as XmlNode,
      ],
      ":@": { "@_version": "2" },
    } as XmlNode,
  ];

  // Detailer emits a UTF-8 BOM + <?xml?> prolog; we prepend the prolog manually
  // since fast-xml-parser's builder doesn't round-trip PI nodes cleanly here.
  const xml = `<?xml version="1.0" encoding="utf-8"?>\r\n` + buildXml(xmlTree);
  const rfy = encryptRfy(xml);
  return { rfy, xml, planCount, frameCount, stickCount };
}

function buildStickNode(c: CsvComponent): XmlNode {
  const stickType = inferStickType(c.role);
  const elevationGraphics = buildElevationGraphics(c);
  const profile = buildProfileNode(c);
  const tooling = buildToolingNode(c.tooling);
  return {
    stick: [elevationGraphics, profile, tooling],
    ":@": {
      "@_name": c.stickName,
      "@_length": String(c.lengthA),
      "@_type": stickType,
      "@_flipped": c.orientation === "RIGHT" ? "1" : "0",
    },
  } as XmlNode;
}

/**
 * Reconstruct the stick's elevation outline polygon from the CSV's 6
 * dimension columns — (length, startX, startY, endX, endY, thickness) —
 * which describe the midline and cross-section thickness. We compute
 * the 4 corner points by offsetting start and end perpendicularly by
 * thickness/2.
 *
 * This gives the decoded RfyStick.outlineCorners a shape consistent
 * with the original Detailer RFY, so round-trip through this codec
 * produces byte-correct dimension columns.
 */
function buildElevationGraphics(c: CsvComponent): XmlNode {
  // CsvComponent's 6 dim columns:
  //   widthA = startX, heightA = startY, widthB = endX, heightB = endY, pitch = thickness
  const startX = c.widthA;
  const startY = c.heightA;
  const endX = c.widthB;
  const endY = c.heightB;
  const thickness = c.pitch;

  // Direction vector along the midline
  const dx = endX - startX;
  const dy = endY - startY;
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular unit vector (rotated 90° CCW), scaled to thickness/2
  const px = (-dy / len) * (thickness / 2);
  const py = (dx / len) * (thickness / 2);

  const corners = [
    { x: startX + px, y: startY + py },
    { x: endX + px, y: endY + py },
    { x: endX - px, y: endY - py },
    { x: startX - px, y: startY - py },
  ];

  const pts: XmlNode[] = corners.map(c => ({
    pt: [],
    ":@": { "@_x": c.x.toFixed(4), "@_y": c.y.toFixed(4) },
  } as XmlNode));

  return {
    "elevation-graphics": [
      {
        poly: pts,
        ":@": {
          "@_closed": "1",
          "@_pencolor": "00000000",
          "@_brushcolor": "00FFFFFF",
          "@_penstyle": "psSolid",
          "@_brushstyle": "bsClear",
        },
      } as XmlNode,
    ],
  } as XmlNode;
}

function inferStickType(role: string): "stud" | "plate" {
  // Plates = TOPPLATE / BOTTOMPLATE. Everything else (STUD / NOG / BRACE /
  // TOPCHORD / BOTTOMCHORD / WEB / FILLER) is "stud" in the XML schema.
  return /PLATE/i.test(role) ? "plate" : "stud";
}

function buildProfileNode(c: CsvComponent): XmlNode {
  const shape = c.metricLabel.match(/[A-Z]+/)?.[0] ?? "S";
  const webVal = parseWebFromMetricLabel(c.metricLabel);
  const lFlangeVal = parseLFlangeFromMetricLabel(c.metricLabel);
  // Imperial label is computed by FrameCAD as roughly: width(in 1/100 in) + ' S ' + flange (1/100 in)
  // 70mm web ≈ 275 (1/100 in), 41mm flange ≈ 161 — matches Detailer's "275 S 161".
  const imperialWeb = Math.round(webVal * 3.937);  // mm → 1/100 in
  const imperialFlange = Math.round(lFlangeVal * 3.937);
  const imperialLabel = `${imperialWeb} ${shape} ${imperialFlange}`;
  return {
    profile: [
      { shape: [{ "#text": shape }] },
      { web: [{ "#text": String(webVal) }] },
      { "l-flange": [{ "#text": String(lFlangeVal) }] },
      { "r-flange": [{ "#text": String(Math.max(lFlangeVal - 3, 0)) }] },
      { lip: [{ "#text": "12" }] },
    ],
    ":@": {
      "@_metric-label": c.metricLabel,
      "@_imperial-label": imperialLabel,
      "@_gauge": c.gauge,
      "@_yield": "550",            // Standard high-tensile galvanised steel
      "@_machine-series": "F300i", // HYTEK's rollformer expects this
    },
  } as XmlNode;
}

function parseWebFromMetricLabel(label: string): number {
  // "70 S 41" -> 70; "89 S 41" -> 89
  const m = label.match(/^(\d+)\s/);
  return m ? parseInt(m[1]!, 10) : 70;
}

function parseLFlangeFromMetricLabel(label: string): number {
  // "70 S 41" -> 41
  const m = label.match(/\s(\d+)$/);
  return m ? parseInt(m[1]!, 10) : 41;
}

function buildToolingNode(ops: RfyToolingOp[]): XmlNode {
  const children: XmlNode[] = [];
  for (const op of ops) {
    switch (op.kind) {
      case "start":
        children.push({ "start-tool": [], ":@": { "@_type": op.type } } as XmlNode);
        break;
      case "end":
        children.push({ "end-tool": [], ":@": { "@_type": op.type } } as XmlNode);
        break;
      case "point":
        children.push({ "point-tool": [], ":@": { "@_type": op.type, "@_pos": String(op.pos) } } as XmlNode);
        break;
      case "spanned":
        children.push({
          "spanned-tool": [],
          ":@": { "@_type": op.type, "@_start-pos": String(op.startPos), "@_end-pos": String(op.endPos) },
        } as XmlNode);
        break;
    }
  }
  return { tooling: children } as XmlNode;
}
