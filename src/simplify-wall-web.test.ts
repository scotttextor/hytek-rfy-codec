import { describe, it, expect } from "vitest";

import {
  simplifyWallWebInProject,
  simplifyWallWebFrame,
  applicableWebPositionsForStud,
  isWallWebPlanName,
} from "./simplify-wall-web.js";
import type {
  ParsedFrame,
  ParsedStick,
  Vec3,
  WebAction,
} from "./synthesize-plans.js";

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const ZERO_ENVELOPE: [Vec3, Vec3, Vec3, Vec3] = [ZERO, ZERO, ZERO, ZERO];

function makeStud(
  name: string,
  startZ: number,
  endZ: number,
  x: number = 0,
  y: number = 0,
  usage: string = "Stud",
): ParsedStick {
  return {
    name,
    type: "Stud",
    usage,
    profile: { web: 70, lFlange: 41, rFlange: 41, lLip: 11, rLip: 11, shape: "C", gauge: "0.75" },
    start: { x, y, z: startZ },
    end: { x, y, z: endZ },
    flipped: false,
    tooling: [],
  };
}

function makePlate(
  name: string,
  startX: number,
  endX: number,
  z: number,
  usage: string = "TopPlate",
): ParsedStick {
  return {
    name,
    type: "Plate",
    usage,
    profile: { web: 70, lFlange: 41, rFlange: 41, lLip: 11, rLip: 11, shape: "C", gauge: "0.75" },
    start: { x: startX, y: 0, z },
    end: { x: endX, y: 0, z },
    flipped: false,
    tooling: [],
  };
}

function horizontalWebAction(x1: number, x2: number, z: number, y: number = 0): WebAction {
  return { start: { x: x1, y, z }, end: { x: x2, y, z } };
}

function verticalDropWebAction(x: number, z1: number, z2: number, y: number = 0): WebAction {
  return { start: { x, y, z: z1 }, end: { x, y, z: z2 } };
}

describe("isWallWebPlanName", () => {
  it("accepts LBW + NLBW plan names", () => {
    expect(isWallWebPlanName("PK1-GF-LBW-70.075")).toBe(true);
    expect(isWallWebPlanName("GF-NLBW-89.075")).toBe(true);
  });
  it("rejects truss / RP / TB2B plans", () => {
    expect(isWallWebPlanName("GF-TIN-70.075")).toBe(false);
    expect(isWallWebPlanName("GF-RP-70.075")).toBe(false);
    expect(isWallWebPlanName("PK1-GF-TB2B-70.075")).toBe(false);
    expect(isWallWebPlanName("GF-CP-70.075")).toBe(false);
  });
});

describe("applicableWebPositionsForStud", () => {
  it("emits one Web op per crossing horizontal Web tool_action", () => {
    const stud = makeStud("S1", 0, 2800, 100);
    const webs: WebAction[] = [
      horizontalWebAction(80, 120, 500),
      horizontalWebAction(80, 120, 2200),
    ];
    const positions = applicableWebPositionsForStud(stud, webs, 2800);
    expect(positions).toEqual([500, 2200]);
  });

  it("skips vertical-drop Web actions (plate-style)", () => {
    const stud = makeStud("S1", 0, 2800, 100);
    const webs: WebAction[] = [verticalDropWebAction(100, 800, 900)];
    const positions = applicableWebPositionsForStud(stud, webs, 2800);
    expect(positions).toEqual([]);
  });

  it("skips Web actions whose X-range does not cover the stud", () => {
    const stud = makeStud("S1", 0, 2800, 100);
    const webs: WebAction[] = [horizontalWebAction(200, 240, 1000)];
    const positions = applicableWebPositionsForStud(stud, webs, 2800);
    expect(positions).toEqual([]);
  });

  it("skips positions outside [5, length - 5] bounds", () => {
    const stud = makeStud("S1", 0, 1000, 100);
    const webs: WebAction[] = [
      horizontalWebAction(80, 120, 2),
      horizontalWebAction(80, 120, 998),
      horizontalWebAction(80, 120, 500),
    ];
    const positions = applicableWebPositionsForStud(stud, webs, 1000);
    expect(positions).toEqual([500]);
  });

  it("computes mirrored position for Z-reversed studs", () => {
    const stud = makeStud("S1", 2800, 0, 100);
    const webs: WebAction[] = [horizontalWebAction(80, 120, 2300)];
    const positions = applicableWebPositionsForStud(stud, webs, 2800);
    expect(positions).toEqual([500]);
  });
});

describe("simplifyWallWebFrame", () => {
  it("emits a single Web op per matching horizontal action on each stud", () => {
    const stud = makeStud("S1", 0, 2800, 100);
    const frame: ParsedFrame = {
      name: "L1",
      envelope: ZERO_ENVELOPE,
      sticks: [stud],
      webActions: [horizontalWebAction(80, 120, 1500)],
    };
    simplifyWallWebFrame(frame);
    expect(stud.tooling).toEqual([{ kind: "point", type: "Web", pos: 1500 }]);
  });

  it("does not duplicate a Web op already present at the same pos (±1mm)", () => {
    const stud = makeStud("S1", 0, 2800, 100);
    stud.tooling.push({ kind: "point", type: "Web", pos: 1500 });
    const frame: ParsedFrame = {
      name: "L1",
      envelope: ZERO_ENVELOPE,
      sticks: [stud],
      webActions: [horizontalWebAction(80, 120, 1500.5)],
    };
    simplifyWallWebFrame(frame);
    const webOps = stud.tooling.filter(op => op.kind === "point" && op.type === "Web");
    expect(webOps.length).toBe(1);
  });

  it("ignores plate-like sticks (TopPlate, Sill, HeadPlate)", () => {
    const top = makePlate("T1", 0, 3000, 2700, "TopPlate");
    const sill = makePlate("L1", 0, 3000, 900, "Sill");
    const head = makePlate("H1", 0, 3000, 2400, "HeadPlate");
    const frame: ParsedFrame = {
      name: "L1",
      envelope: ZERO_ENVELOPE,
      sticks: [top, sill, head],
      webActions: [
        horizontalWebAction(500, 540, 2700),
        horizontalWebAction(500, 540, 900),
        horizontalWebAction(500, 540, 2400),
      ],
    };
    simplifyWallWebFrame(frame);
    expect(top.tooling).toEqual([]);
    expect(sill.tooling).toEqual([]);
    expect(head.tooling).toEqual([]);
  });

  it("no-op when frame has no webActions", () => {
    const stud = makeStud("S1", 0, 2800, 100);
    const frame: ParsedFrame = {
      name: "L1",
      envelope: ZERO_ENVELOPE,
      sticks: [stud],
    };
    simplifyWallWebFrame(frame);
    expect(stud.tooling).toEqual([]);
  });
});

describe("simplifyWallWebInProject", () => {
  it("only runs on LBW/NLBW plans", () => {
    const stud = makeStud("S1", 0, 2800, 100);
    const frame: ParsedFrame = {
      name: "T1",
      envelope: ZERO_ENVELOPE,
      sticks: [stud],
      webActions: [horizontalWebAction(80, 120, 1500)],
    };
    const plans = [{ name: "GF-TIN-70.075", frames: [frame] }];
    simplifyWallWebInProject(plans);
    expect(stud.tooling).toEqual([]);
  });

  it("runs on LBW plans", () => {
    const stud = makeStud("S1", 0, 2800, 100);
    const frame: ParsedFrame = {
      name: "L1",
      envelope: ZERO_ENVELOPE,
      sticks: [stud],
      webActions: [horizontalWebAction(80, 120, 1500)],
    };
    const plans = [{ name: "PK1-GF-LBW-70.075", frames: [frame] }];
    simplifyWallWebInProject(plans);
    expect(stud.tooling.length).toBe(1);
  });
});

describe("HG260044 LBW corpus regression — Pattern A (7-hole evenly spaced)", () => {
  it("emits 7 Web ops at ~447mm spacing from cross-batten panel-points", () => {
    // Mirrors HG260044 L21 / S5 (X=57758.711, length 2761).
    const stud = makeStud("S5", 2, 2763, 57758.711, 15553.849);
    const stickAxisLength = 2761;
    const webs: WebAction[] = [
      42, 488.833, 935.667, 1382.5, 1829.333, 2276.167, 2723,
    ].map(z => horizontalWebAction(57738.211, 57820.211, z, 15553.849));
    const positions = applicableWebPositionsForStud(stud, webs, stickAxisLength);
    expect(positions).toEqual([40, 486.8, 933.7, 1380.5, 1827.3, 2274.2, 2721]);
  });
});

describe("HG260044 LBW corpus regression — Pattern B (king/trim plate-pair)", () => {
  it("emits {z-(-43)=2546, 2726} on a long full-height king stud", () => {
    // L8 / S6 (TrimStud, X=69770.711, start.z=-43, end.z=2763)
    const stud = makeStud("S6", -43, 2763, 69770.711, 19923.849);
    const stickAxisLength = 2806;
    const webs: WebAction[] = [
      horizontalWebAction(69728.711, 69769.711, 2503, 19923.849),
      horizontalWebAction(69728.711, 69769.711, 2683, 19923.849),
    ];
    const positions = applicableWebPositionsForStud(stud, webs, stickAxisLength);
    expect(positions).toEqual([2546, 2726]);
  });
});
