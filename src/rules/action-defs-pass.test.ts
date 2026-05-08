import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isActionDefsPassEnabled,
  runActionDefsPass,
  emptyActionDefsPass,
} from "./action-defs-pass.js";
import { getDefaultMachineSetup } from "../machine-setups.js";
import type { StickWithBox } from "./frame-context.js";
import type { RfyStick } from "../format.js";

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
