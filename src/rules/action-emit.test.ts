import { describe, it, expect } from "vitest";
import {
  emitAction,
  emitActions,
  resolvePosition,
  verbToToolType,
  type EmitContext,
} from "./action-emit.js";
import type { ActionOp } from "./action-defs.js";

const EC: EmitContext = {
  length: 2700,
  intersectionPos: 1350,
  lipNotchSpan: 45,
  webNotchSpan: 45,
  swageClearance: 4,
};

function op(action: string, src: string, dst: string, rel: "-" | ">" = "-"): ActionOp {
  return { action, src, rel, dst, raw: `${action}@${src}${rel}${dst}` };
}

describe("verbToToolType — direct map", () => {
  it("maps swage → Swage", () => {
    expect(verbToToolType("swage")).toBe("Swage");
  });
  it("maps lipnotch + r/l/h variants → LipNotch", () => {
    expect(verbToToolType("lipnotch")).toBe("LipNotch");
    expect(verbToToolType("rl_lipnotch")).toBe("LipNotch");
    expect(verbToToolType("ll_lipnotch")).toBe("LipNotch");
    expect(verbToToolType("rh_lipnotch")).toBe("LipNotch");
    expect(verbToToolType("lh_lipnotch")).toBe("LipNotch");
  });
  it("maps webnotch → InnerNotch", () => {
    expect(verbToToolType("webnotch")).toBe("InnerNotch");
  });
  it("maps flange verbs", () => {
    expect(verbToToolType("rightflange")).toBe("RightFlange");
    expect(verbToToolType("leftflange")).toBe("LeftFlange");
    expect(verbToToolType("rightpartialflange")).toBe("RightPartialFlange");
    expect(verbToToolType("leftpartialflange")).toBe("LeftPartialFlange");
  });
  it("returns null for null/bad/tab/WebTabHoles", () => {
    expect(verbToToolType("null")).toBeNull();
    expect(verbToToolType("bad")).toBeNull();
    expect(verbToToolType("tab")).toBeNull();
    expect(verbToToolType("WebTabHoles")).toBeNull();
  });
});

describe("resolvePosition", () => {
  it("wend / lend resolve to length", () => {
    expect(resolvePosition("wend", EC)).toBe(2700);
    expect(resolvePosition("lend", EC)).toBe(2700);
  });
  it("intersection-corner tokens resolve to intersectionPos", () => {
    expect(resolvePosition("ww", EC)).toBe(1350);
    expect(resolvePosition("wl", EC)).toBe(1350);
    expect(resolvePosition("le", EC)).toBe(1350);
    expect(resolvePosition("rl_rf", EC)).toBe(1350);
  });
  it("unknown tokens return null", () => {
    expect(resolvePosition("foobar", EC)).toBeNull();
  });
});

describe("emitAction — single ops", () => {
  it("null → suppressed (no ops)", () => {
    const r = emitAction(op("null", "wend", "wend"), EC);
    expect(r.ops).toEqual([]);
    expect(r.suppressed).toBe(true);
  });

  it("bad → suppressed", () => {
    const r = emitAction(op("bad", "ww", "ww"), EC);
    expect(r.ops).toEqual([]);
    expect(r.suppressed).toBe(true);
  });

  it("lipnotch@ww-ww → centred 45mm span at intersectionPos", () => {
    const r = emitAction(op("lipnotch", "ww", "ww"), EC);
    expect(r.ops.length).toBe(1);
    expect(r.ops[0]).toMatchObject({
      kind: "spanned",
      type: "LipNotch",
      startPos: 1327.5,
      endPos: 1372.5,
    });
  });

  it("swage@ww-wend → span from intersection to stick end", () => {
    const r = emitAction(op("swage", "ww", "wend"), EC);
    expect(r.ops.length).toBe(1);
    expect(r.ops[0]).toMatchObject({
      kind: "spanned",
      type: "Swage",
      startPos: 1350,
      endPos: 2700,
    });
  });

  it("rightflange@ww-wend → spanned RightFlange", () => {
    const r = emitAction(op("rightflange", "ww", "wend"), EC);
    expect(r.ops.length).toBe(1);
    expect(r.ops[0]).toMatchObject({
      kind: "spanned",
      type: "RightFlange",
      startPos: 1350,
      endPos: 2700,
    });
  });

  it("leftflange@lw-lend → spanned LeftFlange", () => {
    const r = emitAction(op("leftflange", "lw", "lend"), EC);
    expect(r.ops.length).toBe(1);
    expect(r.ops[0]).toMatchObject({ type: "LeftFlange" });
  });

  it("webnotch@ww-wend → spanned InnerNotch", () => {
    const r = emitAction(op("webnotch", "ww", "wend"), EC);
    expect(r.ops.length).toBe(1);
    expect(r.ops[0]).toMatchObject({ type: "InnerNotch" });
  });

  it("'>' relation also produces spans (lipnotch@rl_rf>ww)", () => {
    const r = emitAction(op("lipnotch", "rl_rf", "ww", ">"), EC);
    expect(r.ops.length).toBe(1);
    expect(r.ops[0]!.type).toBe("LipNotch");
  });

  it("tab/WebTabHoles → suppressed (TODO-AMBIGUOUS)", () => {
    expect(emitAction(op("tab", "tab", "tab"), EC).suppressed).toBe(true);
    expect(emitAction(op("WebTabHoles", "d2tab", "d2tab"), EC).suppressed).toBe(true);
  });

  it("clamps emit to stick bounds", () => {
    const ec2: EmitContext = { ...EC, length: 100, intersectionPos: 95 };
    // Centred 45mm span at pos=95 on a 100mm stick → start=72.5, end=100 (clamped)
    const r = emitAction(op("lipnotch", "ww", "ww"), ec2);
    expect(r.ops.length).toBe(1);
    expect(r.ops[0]).toMatchObject({
      type: "LipNotch",
      startPos: 72.5,
      endPos: 100,
    });
  });

  it("degenerate span at boundary returns no op", () => {
    // src and dst differ but resolve to the SAME position → not centred path,
    // produces a 0-mm span that the emitter rejects.
    const ec2: EmitContext = { ...EC, length: 50, intersectionPos: 50 };
    // swage@ww-wend with intersectionPos=length=50 → src=50, dst=50,
    // useCentred=true → centred 45mm span clamped to [27.5, 50] = 22.5mm.
    // Use rightflange@ww-wend instead — the flange branch goes through the
    // explicit src/dst path. With intersectionPos=length, lo=hi=50.
    const r = emitAction(op("rightflange", "ww", "wend"), ec2);
    expect(r.ops.length).toBe(0);
  });
});

describe("emitActions — list", () => {
  it("emits multiple ops and accumulates trace", () => {
    const ops = [
      op("rightflange", "ww", "wend"),
      op("lipnotch", "ll_rf", "lend", ">"),
    ];
    const r = emitActions(ops, EC);
    expect(r.ops.length).toBe(2);
    expect(r.ops[0]!.type).toBe("RightFlange");
    expect(r.ops[1]!.type).toBe("LipNotch");
  });

  it("suppressed=true when all ops are null/bad", () => {
    const r = emitActions([op("null", "wend", "wend")], EC);
    expect(r.ops).toEqual([]);
    expect(r.suppressed).toBe(true);
  });
});
