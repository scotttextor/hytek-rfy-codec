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
});
