import { describe, it, expect } from "vitest";

import { generateHowickCsv, documentToHowickCsvs } from "./howick-csv.js";
import type {
  RfyDocument, RfyPlan, RfyFrame, RfyStick, RfyToolingOp, RfyProfile,
} from "./format.js";

const PROFILE: RfyProfile = {
  metricLabel: "70 S 41",
  gauge: "0.75",
  shape: "S",
  web: 70,
  lFlange: 41,
  rFlange: 41,
  lip: 11,
};

function makeStick(name: string, length: number, tooling: RfyToolingOp[] = []): RfyStick {
  return {
    name,
    length,
    type: "stud",
    flipped: false,
    profile: PROFILE,
    tooling,
  };
}

function makeFrame(name: string, sticks: RfyStick[]): RfyFrame {
  return { name, weight: 0, length: 0, height: 0, sticks };
}

function makePlan(name: string, frames: RfyFrame[]): RfyPlan {
  return { name, frames };
}

function makeDoc(plans: RfyPlan[]): RfyDocument {
  return {
    scheduleVersion: "1.0",
    project: {
      name: "TEST",
      jobNum: "TEST001",
      client: "Test Client",
      date: "2026-05-08",
      plans,
    },
  };
}

describe("generateHowickCsv — empty stick", () => {
  it("emits header row only when no plans / frames / sticks", () => {
    const doc = makeDoc([]);
    const out = generateHowickCsv(doc);
    expect(out).toBe("Member,Length,OperationType,Position,EndPosition,Tool,Notes\n");
  });

  it("emits a member header row for a stick with no tooling", () => {
    const stick = makeStick("S1", 2400, []);
    const doc = makeDoc([makePlan("P1", [makeFrame("N1", [stick])])]);
    const out = generateHowickCsv(doc);
    const lines = out.trim().split("\n");
    expect(lines).toHaveLength(2); // header + 1 stick header
    expect(lines[1]).toBe("P1/N1-S1,2400,,,,,");
  });
});

describe("generateHowickCsv — one stick with one dimple", () => {
  it("emits 2 rows (header column row + stick header + 1 op = 3 lines total with header)", () => {
    const stick = makeStick("S1", 2400, [
      { kind: "point", type: "InnerDimple", pos: 100 },
    ]);
    const doc = makeDoc([makePlan("P1", [makeFrame("N1", [stick])])]);
    const out = generateHowickCsv(doc);
    const lines = out.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Member,Length,OperationType,Position,EndPosition,Tool,Notes");
    expect(lines[1]).toBe("P1/N1-S1,2400,,,,,");
    expect(lines[2]).toBe("P1/N1-S1,2400,DIMPLE,100,,,");
  });

  it("emits 2 data rows (no column header) with includeHeader=false", () => {
    const stick = makeStick("S1", 2400, [
      { kind: "point", type: "InnerDimple", pos: 100 },
    ]);
    const doc = makeDoc([makePlan("P1", [makeFrame("N1", [stick])])]);
    const out = generateHowickCsv(doc, { includeHeader: false });
    const lines = out.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("P1/N1-S1,2400,,,,,");
    expect(lines[1]).toBe("P1/N1-S1,2400,DIMPLE,100,,,");
  });
});

describe("generateHowickCsv — multiple op types on one stick", () => {
  it("emits each op type with its mapped Howick token", () => {
    const stick = makeStick("S1", 2400, [
      { kind: "start", type: "Chamfer" },
      { kind: "point", type: "InnerDimple", pos: 100 },
      { kind: "spanned", type: "Swage", startPos: 200, endPos: 300 },
      { kind: "spanned", type: "LipNotch", startPos: 400, endPos: 450 },
      { kind: "point", type: "Bolt", pos: 500 },
      { kind: "point", type: "Web", pos: 600 },
      { kind: "spanned", type: "InnerNotch", startPos: 700, endPos: 750 },
      { kind: "point", type: "InnerService", pos: 800 },
      { kind: "spanned", type: "LeftFlange", startPos: 900, endPos: 950 },
      { kind: "spanned", type: "RightFlange", startPos: 1000, endPos: 1050 },
      { kind: "end", type: "Chamfer" },
    ]);
    const doc = makeDoc([makePlan("P1", [makeFrame("N1", [stick])])]);
    const out = generateHowickCsv(doc);
    const lines = out.trim().split("\n");
    // 1 column header + 1 stick header + 11 ops = 13
    expect(lines).toHaveLength(13);
    expect(lines[2]).toBe("P1/N1-S1,2400,TAB,0,,,CHAMFER_START");
    expect(lines[3]).toBe("P1/N1-S1,2400,DIMPLE,100,,,");
    expect(lines[4]).toBe("P1/N1-S1,2400,SWAGE,200,300,,");
    expect(lines[5]).toBe("P1/N1-S1,2400,LIP_CUT,400,450,,");
    expect(lines[6]).toBe("P1/N1-S1,2400,BOLT,500,,,");
    expect(lines[7]).toBe("P1/N1-S1,2400,BOLTA,600,,,");
    expect(lines[8]).toBe("P1/N1-S1,2400,NOTCH,700,750,,");
    expect(lines[9]).toBe("P1/N1-S1,2400,DIMPLE_SLOT,800,,,SERVICE_HOLE");
    expect(lines[10]).toBe("P1/N1-S1,2400,FLANGE1,900,950,,LEFT");
    expect(lines[11]).toBe("P1/N1-S1,2400,FLANGE1,1000,1050,,RIGHT");
    expect(lines[12]).toBe("P1/N1-S1,2400,TAB,2400,,,CHAMFER_END");
  });
});

describe("generateHowickCsv — variant v1 vs v2", () => {
  it("v1 drops the Notes column from header and rows", () => {
    const stick = makeStick("S1", 2400, [
      { kind: "spanned", type: "LeftFlange", startPos: 100, endPos: 200 },
    ]);
    const doc = makeDoc([makePlan("P1", [makeFrame("N1", [stick])])]);
    const v1 = generateHowickCsv(doc, { variant: "v1" });
    const v2 = generateHowickCsv(doc, { variant: "v2" });

    const v1Lines = v1.trim().split("\n");
    const v2Lines = v2.trim().split("\n");

    expect(v1Lines[0]).toBe("Member,Length,OperationType,Position,EndPosition,Tool");
    expect(v2Lines[0]).toBe("Member,Length,OperationType,Position,EndPosition,Tool,Notes");

    // v1 row has 6 commas separating 6 fields → 5 commas; v2 has 6 commas.
    expect(v1Lines[2].split(",").length).toBe(6);
    expect(v2Lines[2].split(",").length).toBe(7);

    // The Notes value LEFT appears in v2 last column and is absent in v1.
    expect(v2Lines[2].endsWith(",LEFT")).toBe(true);
    expect(v1Lines[2].endsWith(",LEFT")).toBe(false);
  });

  it("v2 is the default variant", () => {
    const stick = makeStick("S1", 2400, []);
    const doc = makeDoc([makePlan("P1", [makeFrame("N1", [stick])])]);
    const defaultOut = generateHowickCsv(doc);
    const v2Out = generateHowickCsv(doc, { variant: "v2" });
    expect(defaultOut).toBe(v2Out);
  });
});

describe("generateHowickCsv — round-trip-ish sanity", () => {
  it("re-parses CSV and recovers stick names + op tokens", () => {
    const stick = makeStick("S1", 2400, [
      { kind: "point", type: "InnerDimple", pos: 100 },
      { kind: "spanned", type: "Swage", startPos: 200, endPos: 300 },
    ]);
    const doc = makeDoc([makePlan("P1", [makeFrame("N1", [stick])])]);
    const out = generateHowickCsv(doc);

    const lines = out.trim().split("\n");
    const dataRows = lines.slice(1).map(l => l.split(","));

    // Stick header row: 1st row has Member + Length, no OperationType
    expect(dataRows[0]![0]).toBe("P1/N1-S1");
    expect(dataRows[0]![1]).toBe("2400");
    expect(dataRows[0]![2]).toBe("");

    // First op row: DIMPLE @ 100
    expect(dataRows[1]![0]).toBe("P1/N1-S1");
    expect(dataRows[1]![2]).toBe("DIMPLE");
    expect(dataRows[1]![3]).toBe("100");

    // Second op row: SWAGE 200-300
    expect(dataRows[2]![2]).toBe("SWAGE");
    expect(dataRows[2]![3]).toBe("200");
    expect(dataRows[2]![4]).toBe("300");
  });

  it("round-trips multiple plans + frames with documentToHowickCsvs", () => {
    const stickA = makeStick("S1", 1000, [{ kind: "point", type: "InnerDimple", pos: 50 }]);
    const stickB = makeStick("S2", 2000, [{ kind: "point", type: "Bolt", pos: 100 }]);
    const doc = makeDoc([
      makePlan("PlanA", [makeFrame("FrameA", [stickA])]),
      makePlan("PlanB", [makeFrame("FrameB", [stickB])]),
    ]);

    const csvs = documentToHowickCsvs(doc);

    expect(Object.keys(csvs).sort()).toEqual(["PlanA", "PlanB"]);
    expect(csvs["PlanA"]).toContain("PlanA/FrameA-S1");
    expect(csvs["PlanA"]).toContain("DIMPLE,50");
    expect(csvs["PlanA"]).not.toContain("PlanB"); // isolated per-plan output
    expect(csvs["PlanB"]).toContain("PlanB/FrameB-S2");
    expect(csvs["PlanB"]).toContain("BOLT,100");
  });
});

describe("generateHowickCsv — formatting edge cases", () => {
  it("formats decimal positions with up to 2 decimals trimmed", () => {
    const stick = makeStick("S1", 1234.5, [
      { kind: "point", type: "InnerDimple", pos: 100.25 },
      { kind: "point", type: "Swage", pos: 200.1 },
      { kind: "point", type: "Bolt", pos: 300 },
    ]);
    const doc = makeDoc([makePlan("P1", [makeFrame("N1", [stick])])]);
    const out = generateHowickCsv(doc);
    expect(out).toContain("DIMPLE,100.25");
    expect(out).toContain("SWAGE,200.1");
    expect(out).toContain("BOLT,300,,,");
    expect(out).toContain(",1234.5,"); // Length with 1dp
  });

  it("escapes commas in member names by quoting", () => {
    const stick = makeStick("S,1", 100, []);
    const doc = makeDoc([makePlan("P1", [makeFrame("N1", [stick])])]);
    const out = generateHowickCsv(doc);
    expect(out).toContain('"P1/N1-S,1"');
  });

  it("supports CRLF line endings via lineEnding option", () => {
    const stick = makeStick("S1", 100, [{ kind: "point", type: "Swage", pos: 50 }]);
    const doc = makeDoc([makePlan("P1", [makeFrame("N1", [stick])])]);
    const out = generateHowickCsv(doc, { lineEnding: "\r\n" });
    expect(out.includes("\r\n")).toBe(true);
    expect(out.split("\r\n").length).toBeGreaterThan(2);
  });
});
