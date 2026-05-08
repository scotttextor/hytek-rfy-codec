import { describe, it, expect } from "vitest";
import {
  evalCondition,
  evalConditions,
  packEdgeMask,
  unpackEdgeMask,
  type ConditionContext,
} from "./condition-eval.js";

function ctx(over: Partial<ConditionContext> = {}): ConditionContext {
  return {
    edges: { ll: false, lw: false, wl: false, ww: false },
    multiHit: false,
    ...over,
  };
}

describe("condition-eval — edge tokens", () => {
  it("ee fires when any of the 4 edges is set", () => {
    expect(evalCondition("ee", ctx())).toBe(false);
    expect(evalCondition("ee", ctx({ edges: { ll: true, lw: false, wl: false, ww: false } }))).toBe(true);
    expect(evalCondition("ee", ctx({ edges: { ll: false, lw: false, wl: false, ww: true } }))).toBe(true);
  });

  it("we fires when LW or WW is set", () => {
    expect(evalCondition("we", ctx({ edges: { ll: false, lw: true, wl: false, ww: false } }))).toBe(true);
    expect(evalCondition("we", ctx({ edges: { ll: false, lw: false, wl: false, ww: true } }))).toBe(true);
    expect(evalCondition("we", ctx({ edges: { ll: true, lw: false, wl: false, ww: false } }))).toBe(false);
  });

  it("le fires when LL is set", () => {
    expect(evalCondition("le", ctx({ edges: { ll: true, lw: false, wl: false, ww: false } }))).toBe(true);
    expect(evalCondition("le", ctx({ edges: { ll: false, lw: false, wl: true, ww: false } }))).toBe(false);
  });

  it("el fires when WL or el-bit is set", () => {
    expect(evalCondition("el", ctx({ edges: { ll: false, lw: false, wl: true, ww: false } }))).toBe(true);
    expect(evalCondition("el", ctx({ edges: { ll: false, lw: false, wl: false, ww: false, el: true } }))).toBe(true);
    expect(evalCondition("el", ctx())).toBe(false);
  });

  it("ew fires when ew-bit is set, falls back to LW", () => {
    expect(evalCondition("ew", ctx({ edges: { ll: false, lw: false, wl: false, ww: false, ew: true } }))).toBe(true);
    expect(evalCondition("ew", ctx({ edges: { ll: false, lw: true, wl: false, ww: false } }))).toBe(true);
    expect(evalCondition("ew", ctx())).toBe(false);
  });
});

describe("condition-eval — multi-hit", () => {
  it("mh fires when multiHit=true, nmh fires when false", () => {
    expect(evalCondition("mh", ctx({ multiHit: true }))).toBe(true);
    expect(evalCondition("mh", ctx({ multiHit: false }))).toBe(false);
    expect(evalCondition("nmh", ctx({ multiHit: false }))).toBe(true);
    expect(evalCondition("nmh", ctx({ multiHit: true }))).toBe(false);
  });
});

describe("condition-eval — web-angle", () => {
  it("is90 fires when angle within ±5° of 90", () => {
    expect(evalCondition("is90", ctx({ webAngleDeg: 90 }))).toBe(true);
    expect(evalCondition("is90", ctx({ webAngleDeg: 87 }))).toBe(true);
    expect(evalCondition("is90", ctx({ webAngleDeg: 80 }))).toBe(false);
  });
  it("lt90 fires when angle < 85°", () => {
    expect(evalCondition("lt90", ctx({ webAngleDeg: 80 }))).toBe(true);
    expect(evalCondition("lt90", ctx({ webAngleDeg: 90 }))).toBe(false);
    expect(evalCondition("lt90", ctx({ webAngleDeg: 100 }))).toBe(false);
  });
  it("gt90 fires when angle > 95°", () => {
    expect(evalCondition("gt90", ctx({ webAngleDeg: 100 }))).toBe(true);
    expect(evalCondition("gt90", ctx({ webAngleDeg: 90 }))).toBe(false);
  });
  it("missing webAngleDeg defaults all angle tokens to false", () => {
    expect(evalCondition("is90", ctx())).toBe(false);
    expect(evalCondition("lt90", ctx())).toBe(false);
    expect(evalCondition("gt90", ctx())).toBe(false);
  });
});

describe("condition-eval — box flags", () => {
  it("box_l + box_r read from BoxFlags", () => {
    expect(evalCondition("box_l", ctx({ box: { left: true, right: false } }))).toBe(true);
    expect(evalCondition("box_l", ctx({ box: { left: false, right: false } }))).toBe(false);
    expect(evalCondition("box_r", ctx({ box: { left: false, right: true } }))).toBe(true);
    expect(evalCondition("box_r", ctx())).toBe(false);
  });
});

describe("condition-eval — chord flags", () => {
  it("t_tchord/b_tchord/t_bchord read from ChordFlags", () => {
    expect(evalCondition("t_tchord", ctx({ chord: { t_tchord: true, b_tchord: false, t_bchord: false } }))).toBe(true);
    expect(evalCondition("b_tchord", ctx({ chord: { t_tchord: false, b_tchord: true, t_bchord: false } }))).toBe(true);
    expect(evalCondition("t_bchord", ctx({ chord: { t_tchord: false, b_tchord: false, t_bchord: true } }))).toBe(true);
    expect(evalCondition("t_tchord", ctx())).toBe(false);
  });
});

describe("condition-eval — lip-edge flags", () => {
  it("default to false when LipEdgeFlags not provided", () => {
    expect(evalCondition("rl_e", ctx())).toBe(false);
    expect(evalCondition("ll_lf", ctx())).toBe(false);
  });
  it("read flags from LipEdgeFlags when provided", () => {
    expect(evalCondition("rl_lf", ctx({ lipEdge: { rl_lf: true } }))).toBe(true);
    expect(evalCondition("ll_rf", ctx({ lipEdge: { ll_rf: true } }))).toBe(true);
  });
});

describe("condition-eval — conjunction", () => {
  it("evalConditions returns true for empty array (Detailer fallback)", () => {
    expect(evalConditions([], ctx())).toBe(true);
  });
  it("AND-semantics: all tokens must hold", () => {
    const c = ctx({
      edges: { ll: false, lw: true, wl: false, ww: true },
      multiHit: true,
      webAngleDeg: 90,
    });
    expect(evalConditions(["mh", "we"], c)).toBe(true);
    expect(evalConditions(["mh", "le"], c)).toBe(false);
    expect(evalConditions(["mh", "we", "is90"], c)).toBe(true);
  });
});

describe("packEdgeMask / unpackEdgeMask", () => {
  it("packs 0..15 from boolean fields", () => {
    expect(packEdgeMask({ ll: false, lw: false, wl: false, ww: false })).toBe(0);
    expect(packEdgeMask({ ll: true, lw: false, wl: false, ww: false })).toBe(1);
    expect(packEdgeMask({ ll: false, lw: true, wl: false, ww: false })).toBe(2);
    expect(packEdgeMask({ ll: false, lw: false, wl: true, ww: false })).toBe(4);
    expect(packEdgeMask({ ll: false, lw: false, wl: false, ww: true })).toBe(8);
    expect(packEdgeMask({ ll: true, lw: true, wl: true, ww: true })).toBe(15);
  });
  it("roundtrips packEdgeMask ∘ unpackEdgeMask = identity for 0..15", () => {
    for (let m = 0; m < 16; m++) {
      expect(packEdgeMask(unpackEdgeMask(m))).toBe(m);
    }
  });
});
