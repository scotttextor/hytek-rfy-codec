import { describe, it, expect, afterEach } from "vitest";
import {
  isActionDefsPassEnabled,
  runActionDefsPass,
  emptyActionDefsPass,
} from "./action-defs-pass.js";
import { mergeActionDefsOps, type StickWithBox } from "./frame-context.js";
import { getDefaultMachineSetup } from "../machine-setups.js";
import type { RfyStick, RfyToolingOp } from "../format.js";

function mkStick(over: Partial<RfyStick> = {}): RfyStick {
  return {
    name: "S1",
    length: 2700,
    type: "stud",
    flipped: false,
    profile: {
      metricLabel: "70 S 41",
      gauge: "0.75",
      shape: "S",
      web: 70,
      lFlange: 41,
      rFlange: 41,
      lip: 6,
    },
    tooling: [],
    outlineCorners: [
      { x: 0, y: 0 },
      { x: 0, y: 2700 },
      { x: 41, y: 2700 },
      { x: 41, y: 0 },
    ],
    ...over,
  } as RfyStick;
}

function mkLayoutEntry(role: string, x: number, y: number, w: number, h: number, over: Partial<RfyStick> = {}): StickWithBox {
  const stick = mkStick({
    name: `${role}1`,
    length: Math.max(w, h),
    outlineCorners: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    ...over,
  });
  return {
    stick,
    role,
    box: {
      xMin: x, xMax: x + w,
      yMin: y, yMax: y + h,
      cx: x + w / 2,
      cy: y + h / 2,
    },
    horizontal: w > h,
  };
}

describe("isActionDefsPassEnabled", () => {
  const old = process.env.CODEC_USE_ACTION_DEFS;
  afterEach(() => { process.env.CODEC_USE_ACTION_DEFS = old; });

  it("returns false when env var unset", () => {
    delete process.env.CODEC_USE_ACTION_DEFS;
    expect(isActionDefsPassEnabled()).toBe(false);
  });

  it("returns true when CODEC_USE_ACTION_DEFS=1", () => {
    process.env.CODEC_USE_ACTION_DEFS = "1";
    expect(isActionDefsPassEnabled()).toBe(true);
  });

  it("returns true when CODEC_USE_ACTION_DEFS=true", () => {
    process.env.CODEC_USE_ACTION_DEFS = "true";
    expect(isActionDefsPassEnabled()).toBe(true);
  });

  it("returns false when CODEC_USE_ACTION_DEFS=0", () => {
    process.env.CODEC_USE_ACTION_DEFS = "0";
    expect(isActionDefsPassEnabled()).toBe(false);
  });
});

describe("runActionDefsPass — disabled = no-op", () => {
  it("returns empty info when enabled=false", () => {
    const layout = [mkLayoutEntry("T", 0, 0, 3000, 41), mkLayoutEntry("S", 1000, 41, 41, 2700)];
    const r = runActionDefsPass(layout, { enabled: false, setup: getDefaultMachineSetup() });
    expect(r.size).toBe(2);
    for (const info of r.values()) {
      expect(info.handled).toBe(false);
      expect(info.ops).toEqual([]);
    }
  });
});

describe("emptyActionDefsPass", () => {
  it("returns one entry per stick, all handled=false", () => {
    const layout = [mkLayoutEntry("T", 0, 0, 3000, 41), mkLayoutEntry("S", 1000, 41, 41, 2700)];
    const r = emptyActionDefsPass(layout);
    expect(r.size).toBe(2);
    for (const info of r.values()) {
      expect(info.handled).toBe(false);
    }
  });
});

describe("mergeActionDefsOps — preserves legacy duplicates", () => {
  it("preserves duplicate legacy ops at the same position", () => {
    // Detailer's reference RFYs sometimes contain paired InnerDimples on N
    // nogs from multi-direction crossings. A naive global dedup would
    // collapse them to one and regress matched count.
    const legacy: RfyToolingOp[] = [
      { kind: "point", type: "InnerDimple", pos: 62.157 },
      { kind: "point", type: "InnerDimple", pos: 62.157 },
      { kind: "point", type: "InnerDimple", pos: 236.0 },
      { kind: "point", type: "InnerDimple", pos: 236.0 },
    ];
    const added: RfyToolingOp[] = [];  // action-defs adds nothing here
    mergeActionDefsOps(legacy, added);
    // Both legacy duplicates retained.
    expect(legacy.length).toBe(4);
  });

  it("skips action-defs ops with a near-duplicate already in legacy", () => {
    const legacy: RfyToolingOp[] = [
      { kind: "spanned", type: "LipNotch", startPos: 100, endPos: 145 },
    ];
    const added: RfyToolingOp[] = [
      { kind: "spanned", type: "LipNotch", startPos: 100.05, endPos: 144.95 },  // within 0.15mm tol
    ];
    mergeActionDefsOps(legacy, added);
    // The action-defs op is suppressed — only the legacy op remains.
    expect(legacy.length).toBe(1);
    expect(legacy[0]).toEqual({ kind: "spanned", type: "LipNotch", startPos: 100, endPos: 145 });
  });

  it("appends action-defs ops with no legacy match", () => {
    const legacy: RfyToolingOp[] = [
      { kind: "spanned", type: "LipNotch", startPos: 100, endPos: 145 },
    ];
    const added: RfyToolingOp[] = [
      { kind: "spanned", type: "LipNotch", startPos: 500, endPos: 545 },  // far away
    ];
    mergeActionDefsOps(legacy, added);
    expect(legacy.length).toBe(2);
  });

  it("treats different ToolTypes at the same position as distinct", () => {
    const legacy: RfyToolingOp[] = [
      { kind: "point", type: "InnerDimple", pos: 100 },
    ];
    const added: RfyToolingOp[] = [
      { kind: "point", type: "Bolt", pos: 100 },  // different type, same pos
    ];
    mergeActionDefsOps(legacy, added);
    expect(legacy.length).toBe(2);
  });
});

describe("runActionDefsPass — wall plate × stud crossing (suppressed cohort)", () => {
  it("does not handle OnFlat - Standard (currently suppressed)", () => {
    // Wall stud-on-plate is the dominant case; the pass currently suppresses
    // it because legacy frame-context.ts already handles it well.
    const layout = [
      mkLayoutEntry("T", 0, 0, 3000, 41, { name: "T1", usage: "topplate" }),
      mkLayoutEntry("S", 1000, 41, 41, 2700, { name: "S1", usage: "stud" }),
    ];
    const r = runActionDefsPass(layout, {
      enabled: true,
      setup: getDefaultMachineSetup(),
      planName: "GF-LBW-89.075",
    });
    // T1 should NOT be handled by the action-defs pass (legacy handles it).
    expect(r.get("T1")!.handled).toBe(false);
  });
});
