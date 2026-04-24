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

export function synthesizeRfyFromCsv(csv: string, options: SynthesizeOptions = {}): SynthesizeResult {
  const csvPlans = parseCsv(csv);
  if (csvPlans.length === 0) throw new Error("No DETAILS/plan rows found in CSV");

  const projectName = options.projectName ?? csvPlans[0]!.jobNum.replace(/^"\s*|\s*"$/g, "").trim() ?? "UNTITLED";
  const jobNum = options.jobNum ?? projectName;
  const client = options.client ?? "";
  const date = options.date ?? new Date().toISOString().slice(0, 10);

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
        frameNodes.push({
          frame: sticks,
          ":@": {
            "@_name": frameName,
            "@_weight": "0",
            "@_length": String(Math.max(...comps.map(c => c.lengthA), 0)),
            "@_height": "0",
          },
        } as XmlNode);
      }
    }
    planNodes.push({
      plan: [
        { elevation: [{ "#text": "0" }] },
        ...frameNodes,
      ],
      ":@": { "@_name": packId },
    } as XmlNode);
  }

  const xmlTree: XmlNode[] = [
    {
      schedule: [
        {
          project: planNodes,
          ":@": {
            "@_name": projectName,
            "@_jobnum": jobNum,
            "@_client": client,
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
  const profile = buildProfileNode(c);
  const tooling = buildToolingNode(c.tooling);
  return {
    stick: [profile, tooling],
    ":@": {
      "@_name": c.stickName,
      "@_length": String(c.lengthA),
      "@_type": stickType,
      "@_flipped": c.orientation === "RIGHT" ? "1" : "0",
    },
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
      "@_gauge": c.gauge,
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
