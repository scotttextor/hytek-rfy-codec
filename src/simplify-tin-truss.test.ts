import { describe, it, expect } from "vitest";

import { simplifyTinTrussFramesInProject } from "./simplify-tin-truss.js";
import type { ParsedFrame, ParsedStick, Vec3 } from "./synthesize-plans.js";
import type { RfyToolingOp } from "./format.js";

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const ZERO_ENVELOPE: [Vec3, Vec3, Vec3, Vec3] = [ZERO, ZERO, ZERO, ZERO];

function makeHeaderStick(
  name: string,
  length: number,
  tooling: RfyToolingOp[],
): ParsedStick {
  return {
    name,
    type: "Plate",
    usage: "TopChord",
    profile: { web: 70, lFlange: 41, rFlange: 41, lLip: 11, rLip: 11, shape: "C", gauge: "0.75" },
    start: { x: 0, y: 0, z: 0 },
    end: { x: length, y: 0, z: 0 },
    flipped: false,
    tooling,
  };
}

function makeFrame(name: string, sticks: ParsedStick[]): ParsedFrame {
  return { name, envelope: ZERO_ENVELOPE, sticks };
}

describe("substituteHeaderEndSwages (via simplifyTinTrussFramesInProject)", () => {
  it("substitutes start- and end-anchored LipNotch with Swage on TIN H stick when no InnerNotch shares the anchor", () => {
    const stick = makeHeaderStick("H3", 2487, [
      { kind: "spanned", type: "LipNotch", startPos: 0, endPos: 39 },
      { kind: "point", type: "InnerDimple", pos: 100 },
      { kind: "spanned", type: "LipNotch", startPos: 2448, endPos: 2487 },
    ]);
    const plans = [{ name: "GF-TIN-70.075", frames: [makeFrame("PC31-1", [stick])] }];

    simplifyTinTrussFramesInProject(plans);

    expect(stick.tooling[0]).toEqual({ kind: "spanned", type: "Swage", startPos: 0, endPos: 39 });
    expect(stick.tooling[2]).toEqual({ kind: "spanned", type: "Swage", startPos: 2448, endPos: 2487 });
  });

  it("preserves LipNotch when an InnerNotch shares the start anchor", () => {
    const stick = makeHeaderStick("H8", 331, [
      { kind: "spanned", type: "InnerNotch", startPos: 0, endPos: 39 },
      { kind: "spanned", type: "LipNotch", startPos: 0, endPos: 39 },
    ]);
    const plans = [{ name: "GF-TIN-70.075", frames: [makeFrame("PC7-1", [stick])] }];

    simplifyTinTrussFramesInProject(plans);

    expect(stick.tooling[0]).toEqual({ kind: "spanned", type: "InnerNotch", startPos: 0, endPos: 39 });
    expect(stick.tooling[1]).toEqual({ kind: "spanned", type: "LipNotch", startPos: 0, endPos: 39 });
  });

  it("does not fire on non-TIN plans", () => {
    const stick = makeHeaderStick("H3", 2487, [
      { kind: "spanned", type: "LipNotch", startPos: 0, endPos: 39 },
    ]);
    const plans = [{ name: "GF-LBW-70.075", frames: [makeFrame("PC1-1", [stick])] }];

    simplifyTinTrussFramesInProject(plans);

    expect(stick.tooling[0]).toEqual({ kind: "spanned", type: "LipNotch", startPos: 0, endPos: 39 });
  });

  it("does not fire on non-H sticks even within TIN plans", () => {
    const stick = makeHeaderStick("T2", 2487, [
      { kind: "spanned", type: "LipNotch", startPos: 0, endPos: 39 },
    ]);
    // Override to TopChord T-named stick
    stick.name = "T2";
    const plans = [{ name: "GF-TIN-70.075", frames: [makeFrame("PC1-1", [stick])] }];

    simplifyTinTrussFramesInProject(plans);

    expect(stick.tooling[0]).toEqual({ kind: "spanned", type: "LipNotch", startPos: 0, endPos: 39 });
  });

  it("substitutes only the start-anchored LipNotch when only it lacks an InnerNotch", () => {
    const stick = makeHeaderStick("H3", 2487, [
      { kind: "spanned", type: "LipNotch", startPos: 0, endPos: 39 },
      { kind: "spanned", type: "InnerNotch", startPos: 2448, endPos: 2487 },
      { kind: "spanned", type: "LipNotch", startPos: 2448, endPos: 2487 },
    ]);
    const plans = [{ name: "GF-TIN-70.075", frames: [makeFrame("PC31-1", [stick])] }];

    simplifyTinTrussFramesInProject(plans);

    // Start anchor: was LipNotch, no IN nearby → becomes Swage
    expect(stick.tooling[0]).toEqual({ kind: "spanned", type: "Swage", startPos: 0, endPos: 39 });
    // End anchor: shares anchor with InnerNotch → preserved
    expect(stick.tooling[1]).toEqual({ kind: "spanned", type: "InnerNotch", startPos: 2448, endPos: 2487 });
    expect(stick.tooling[2]).toEqual({ kind: "spanned", type: "LipNotch", startPos: 2448, endPos: 2487 });
  });

  it("ignores mid-stick LipNotches (not at start or end anchor)", () => {
    const stick = makeHeaderStick("H4", 1000, [
      { kind: "spanned", type: "LipNotch", startPos: 400, endPos: 460 },
    ]);
    const plans = [{ name: "GF-TIN-70.075", frames: [makeFrame("TN1-1", [stick])] }];

    simplifyTinTrussFramesInProject(plans);

    expect(stick.tooling[0]).toEqual({ kind: "spanned", type: "LipNotch", startPos: 400, endPos: 460 });
  });
});
