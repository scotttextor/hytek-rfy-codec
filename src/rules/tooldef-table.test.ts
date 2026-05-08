import { describe, it, expect } from "vitest";
import { TOOLDEFS, getToolDef } from "./tooldef-table.js";

describe("TOOLDEFS — TToolDef extraction lookup table", () => {
  it("maps lipnotch to a fixed-length spanned tool", () => {
    const td = getToolDef("lipnotch");
    expect(td).not.toBeNull();
    expect(td!.opType).toBe("otSpannedTool");
    expect(td!.lengthMm).toBe(45);
    expect(td!.codecToolType).toBe("LipNotch");
    expect(td!.confidence).toBe("high");
  });

  it("preserves all 4 corner-aware lipnotch variants", () => {
    expect(getToolDef("rl_lipnotch")?.corner).toBe("RL");
    expect(getToolDef("ll_lipnotch")?.corner).toBe("LL");
    expect(getToolDef("rh_lipnotch")?.corner).toBe("RH");
    expect(getToolDef("lh_lipnotch")?.corner).toBe("LH");
  });

  it("maps webnotch to InnerNotch (not WebNotch)", () => {
    const td = getToolDef("webnotch");
    expect(td!.codecToolType).toBe("InnerNotch");
    expect(td!.lengthMm).toBe(45);
  });

  it("maps swage to Swage with fixed length", () => {
    const td = getToolDef("swage");
    expect(td!.codecToolType).toBe("Swage");
    expect(td!.opType).toBe("otSpannedTool");
    expect(td!.lengthMm).toBe(45);
  });

  it("flange verbs are GEOMETRY-driven, NOT fixed-length", () => {
    expect(getToolDef("leftflange")?.lengthMm).toBe("geometry");
    expect(getToolDef("rightflange")?.lengthMm).toBe("geometry");
  });

  it("returns null for verbs not in the empirical corpus", () => {
    expect(getToolDef("tab")).toBeNull();
    expect(getToolDef("webtabholes")).toBeNull();
    expect(getToolDef("null")).toBeNull();
    expect(getToolDef("bad")).toBeNull();
    expect(getToolDef("leftpartialflange")).toBeNull();
    expect(getToolDef("rightpartialflange")).toBeNull();
  });

  it("contains exactly the 9 verbs the action-defs path uses", () => {
    const expected = new Set([
      "lipnotch", "rl_lipnotch", "ll_lipnotch", "rh_lipnotch", "lh_lipnotch",
      "webnotch", "swage", "leftflange", "rightflange",
    ]);
    expect(new Set(Object.keys(TOOLDEFS))).toEqual(expected);
  });
});
