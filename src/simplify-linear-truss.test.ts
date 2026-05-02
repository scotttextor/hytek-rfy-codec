import { describe, it, expect } from "vitest";

describe("simplify-linear-truss", () => {
  it("module loads", () => {
    expect(true).toBe(true);
  });
});

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
