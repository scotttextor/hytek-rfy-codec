import { describe, it, expect } from "vitest";
import { scoreOps } from "./op-diff.js";
import type { RfyToolingOp } from "../format.js";

const span = (type: string, startPos: number, endPos: number): RfyToolingOp =>
  ({ kind: "spanned", type: type as RfyToolingOp["type"], startPos, endPos });
const point = (type: string, pos: number): RfyToolingOp =>
  ({ kind: "point", type: type as RfyToolingOp["type"], pos });
const edge = (type: string, kind: "start" | "end"): RfyToolingOp =>
  ({ kind, type: type as RfyToolingOp["type"] });

describe("scoreOps — matching & parity", () => {
  it("scores identical op lists as 100% parity with zero gaps", () => {
    const ops = [span("Swage", 0, 39), point("InnerDimple", 16.5), edge("Chamfer", "start")];
    const r = scoreOps(structuredClone(ops), structuredClone(ops));
    expect(r.parity).toBe(1);
    expect(r.matched.length).toBe(3);
    expect(r.extras.length).toBe(0);
    expect(r.missing.length).toBe(0);
    expect(r.gaps.length).toBe(0);
  });

  it("is span-aware: same type+start but different end is NOT a match (old harness bug)", () => {
    const ours = [span("Swage", 0, 39)];
    const ref = [span("Swage", 0, 92)]; // same start, very different end
    const r = scoreOps(ours, ref, { toleranceMm: 1.5 });
    expect(r.matched.length).toBe(0);
    expect(r.parity).toBe(0);
  });

  it("matches a point op that drifted within tolerance, recording drift", () => {
    const r = scoreOps([point("InnerDimple", 17.0)], [point("InnerDimple", 16.5)], { toleranceMm: 1.5 });
    expect(r.matched.length).toBe(1);
    expect(r.matched[0].drift).toBeCloseTo(0.5, 5);
  });

  it("does NOT match a point op drifted beyond tolerance", () => {
    const r = scoreOps([point("InnerDimple", 20.0)], [point("InnerDimple", 16.5)], { toleranceMm: 1.5 });
    expect(r.matched.length).toBe(0);
    expect(r.extras.length).toBe(1);
    expect(r.missing.length).toBe(1);
  });

  it("matches start/end edge ops by type ignoring position", () => {
    const r = scoreOps([edge("Chamfer", "start")], [edge("Chamfer", "start")]);
    expect(r.matched.length).toBe(1);
    expect(r.matched[0].drift).toBe(0);
  });

  it("tiered tolerance: a 0.5mm drift matches at 1.5mm but not at 0.01mm", () => {
    const ours = [point("Swage", 27.5)];
    const ref = [point("Swage", 28.0)];
    expect(scoreOps(ours, ref, { toleranceMm: 1.5 }).matched.length).toBe(1);
    expect(scoreOps(ours, ref, { toleranceMm: 0.01 }).matched.length).toBe(0);
  });

  it("parity is matched/refTotal; empty-vs-empty is 1", () => {
    expect(scoreOps([], []).parity).toBe(1);
    expect(scoreOps([point("Swage", 5)], []).parity).toBe(1); // refTotal 0, nothing to match → 1 by convention
    const r = scoreOps([point("Swage", 5)], [point("Swage", 5), point("Swage", 100)]);
    expect(r.parity).toBeCloseTo(0.5, 5);
  });
});

describe("scoreOps — gap classification", () => {
  it("flags a same-type spanned op drifted beyond tolerance as position-drift", () => {
    const ours = [span("Swage", 0, 39)];
    const ref = [span("Swage", 5, 44)]; // +5mm, within 25mm window, > 1.5 tol
    const r = scoreOps(ours, ref, { toleranceMm: 1.5 });
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0].kind).toBe("position-drift");
    expect(r.gaps[0].partner).toBeDefined();
    expect(r.gaps[0].distanceMm).toBeCloseTo(5, 5);
  });

  it("flags a different-type op at the same spot as wrong-gate", () => {
    const ours = [point("Swage", 16.5)];
    const ref = [point("LipNotch", 16.5)]; // same pos+kind, different type
    const r = scoreOps(ours, ref, { toleranceMm: 1.5 });
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0].kind).toBe("wrong-gate");
  });

  it("flags an isolated extra as over-emission", () => {
    const ours = [point("InnerDimple", 500)];
    const ref: RfyToolingOp[] = [];
    const r = scoreOps(ours, ref);
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0].kind).toBe("over-emission");
    expect(r.gaps[0].side).toBe("ours");
  });

  it("flags an unproduced reference op as missing-rule", () => {
    const ours: RfyToolingOp[] = [];
    const ref = [point("Web", 8)];
    const r = scoreOps(ours, ref);
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0].kind).toBe("missing-rule");
    expect(r.gaps[0].side).toBe("ref");
  });

  it("a clean match produces no gaps", () => {
    const ops = [point("Swage", 10)];
    expect(scoreOps(structuredClone(ops), structuredClone(ops)).gaps).toHaveLength(0);
  });
});
