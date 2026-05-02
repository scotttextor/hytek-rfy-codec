import { describe, it, expect } from "vitest";

import { lineIntersectionXZ, stickLength3D } from "./simplify-linear-truss.js";

describe("lineIntersectionXZ", () => {
  it("finds an intersection of two crossing sticks in XZ", () => {
    // Stick A: (0,*,0) → (100,*,100)   diagonal up-right
    // Stick B: (0,*,100) → (100,*,0)   diagonal down-right
    // Crosses at (50, *, 50)
    const a = { start: [0, 0, 0] as const, end: [100, 0, 100] as const };
    const b = { start: [0, 0, 100] as const, end: [100, 0, 0] as const };
    const r = lineIntersectionXZ(a, b, 0);
    expect(r).not.toBeNull();
    expect(r!.pt[0]).toBeCloseTo(50, 5);
    expect(r!.pt[1]).toBeCloseTo(50, 5);
  });

  it("returns null for parallel sticks", () => {
    const a = { start: [0, 0, 0] as const, end: [100, 0, 0] as const };
    const b = { start: [0, 0, 50] as const, end: [100, 0, 50] as const };
    expect(lineIntersectionXZ(a, b, 0)).toBeNull();
  });

  it("returns null if intersection is outside both sticks beyond slack", () => {
    const a = { start: [0, 0, 0] as const, end: [10, 0, 0] as const };
    const b = { start: [50, 0, -50] as const, end: [50, 0, 50] as const };
    // Lines cross at (50,0,0) which is 40mm beyond stick A's end. Slack=10 → reject.
    expect(lineIntersectionXZ(a, b, 10)).toBeNull();
  });
});

describe("stickLength3D", () => {
  it("computes XZ-plane Euclidean distance", () => {
    const s = { start: [0, 1, 0] as const, end: [3, 999, 4] as const };
    expect(stickLength3D(s)).toBeCloseTo(5, 5);
  });
  it("returns 0 for zero-length stick", () => {
    const s = { start: [0, 0, 0] as const, end: [0, 0, 0] as const };
    expect(stickLength3D(s)).toBe(0);
  });
});

import { isLinearTruss } from "./simplify-linear-truss.js";
import type { ParsedFrame, ParsedStick, Vec3 } from "./synthesize-plans.js";

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const ZERO_ENVELOPE: [Vec3, Vec3, Vec3, Vec3] = [ZERO, ZERO, ZERO, ZERO];

function makeStick(
  name: string,
  usage: string,
  profile: Partial<ParsedStick["profile"]> = {},
  gauge = "0.75",
): ParsedStick {
  return {
    name,
    type: "Stud",
    usage,
    gauge,
    profile: { web: 89, lFlange: 38, rFlange: 41, lLip: 11, rLip: 11, shape: "C", ...profile },
    flipped: false,
    start: { x: 0, y: 0, z: 0 },
    end:   { x: 1000, y: 0, z: 0 },
    tooling: [],
  };
}
function makeFrame(name: string, type: string, sticks: ParsedStick[]): ParsedFrame {
  return {
    name,
    type,
    envelope: ZERO_ENVELOPE,
    fasteners: [],
    fastenerCount: 0,
    toolActions: [],
    length: 1000,
    builtHeight: 1000,
    profileLabel: "GF-LIN-89.075",
    pitchMm: 89,
    sticks,
  };
}

describe("isLinearTruss", () => {
  const goodChord = makeStick("T1", "TopChord");
  const goodWeb   = makeStick("W1", "Web");

  it("APPLIES when all 4 layers pass", () => {
    const f = makeFrame("TN1", "Truss", [goodChord, goodWeb]);
    expect(isLinearTruss(f, "GF-LIN-89.075")).toEqual({ ok: true });
  });

  it("SKIPS non-Truss frames", () => {
    const f = makeFrame("N1", "InternalWall", [goodChord, goodWeb]);
    const r = isLinearTruss(f, "GF-LIN-89.075");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not Truss/i);
  });

  it("SKIPS plans not matching /-LIN-/i", () => {
    const f = makeFrame("TT1", "Truss", [goodChord, goodWeb]);
    const r = isLinearTruss(f, "GF-TB2B-70.075");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not Linear/i);
  });

  it("SKIPS wrong profile (70x41 instead of 89x41)", () => {
    const wrong = makeStick("T1", "TopChord", { web: 70 });
    const f = makeFrame("TN1", "Truss", [wrong, goodWeb]);
    const r = isLinearTruss(f, "GF-LIN-70.075");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/wrong profile/i);
  });

  it("SKIPS wrong gauge (0.95 instead of 0.75)", () => {
    const wrong = makeStick("T1", "TopChord", {}, "0.95");
    const f = makeFrame("TN1", "Truss", [wrong, goodWeb]);
    const r = isLinearTruss(f, "GF-LIN-89.095");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/wrong gauge/i);
  });

  it("SKIPS frames with no chord", () => {
    const f = makeFrame("TN1", "Truss", [goodWeb, makeStick("W2", "Web")]);
    const r = isLinearTruss(f, "GF-LIN-89.075");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no chord/i);
  });

  it("SKIPS frames with no web", () => {
    const f = makeFrame("TN1", "Truss", [goodChord, makeStick("T2", "BottomChord")]);
    const r = isLinearTruss(f, "GF-LIN-89.075");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no web/i);
  });

  it("APPLIES when gauge has surrounding whitespace (matches via trim)", () => {
    const s = makeStick("T1", "TopChord", {}, " 0.75 ");
    const f = makeFrame("TN1", "Truss", [s, makeStick("W1", "Web")]);
    expect(isLinearTruss(f, "GF-LIN-89.075")).toEqual({ ok: true });
  });

  it("SKIPS frames where frame.type is undefined", () => {
    const f = makeFrame("X1", undefined as unknown as string, [makeStick("T1", "TopChord"), makeStick("W1", "Web")]);
    const r = isLinearTruss(f, "GF-LIN-89.075");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/frame type missing/i);
  });

  it("respects a custom profileGate override (70x41 0.75)", () => {
    const customGate = { web: 70, rFlange: 41, lFlange: 38, lLip: 11, rLip: 11, shape: "C" as const, gauge: "0.75" };
    const stick70 = makeStick("T1", "TopChord", { web: 70 });
    const f70 = makeFrame("TN1", "Truss", [stick70, makeStick("W1", "Web", { web: 70 })]);
    expect(isLinearTruss(f70, "GF-LIN-70.075", customGate)).toEqual({ ok: true });
    // And 89x41 frame must SKIP under the 70x41 gate
    const f89 = makeFrame("TN2", "Truss", [makeStick("T1", "TopChord"), makeStick("W1", "Web")]);
    const r89 = isLinearTruss(f89, "GF-LIN-89.075", customGate);
    expect(r89.ok).toBe(false);
  });
});

import { guardZeroLength } from "./simplify-linear-truss.js";

describe("guardZeroLength", () => {
  it("passes for normal-length sticks", () => {
    const sticks = [makeStick("T1", "TopChord"), makeStick("W1", "Web")];
    expect(guardZeroLength(sticks)).toEqual({ ok: true });
  });

  it("fails when any stick has near-zero length (<1e-3 mm)", () => {
    const zeroStick: ParsedStick = {
      ...makeStick("W2", "Web"),
      start: { x: 0, y: 0, z: 0 },
      end:   { x: 0, y: 0, z: 0 },
    };
    const sticks = [makeStick("T1", "TopChord"), zeroStick];
    const r = guardZeroLength(sticks);
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/zero-length stick W2/i);
  });
});
