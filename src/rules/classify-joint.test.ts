import { describe, it, expect } from "vitest";

import {
  classifyJoint,
  unpackJointFlags,
  NO_FLAGS,
  type StickProps,
  type JointFlags,
} from "./classify-joint.js";

// ----------------------------------------------------------------------------
// Test-only helpers
// ----------------------------------------------------------------------------

/** A typical stud (C-section, non-chord, no outer flange, no swage clearance). */
function stud(): StickProps {
  return {
    isCSection: true,
    secondaryFlag: 0,
    swageClearance: false,
    isHybridFlange: false,
    isTrussChord: false,
    isBoxing: 0,
    hasOuterFlange: false,
  };
}

/** A typical plate (non-C-section, non-chord, has outer flange). */
function plate(): StickProps {
  return {
    isCSection: false,
    secondaryFlag: 0,
    swageClearance: false,
    isHybridFlange: false,
    isTrussChord: false,
    isBoxing: 0,
    hasOuterFlange: true,
  };
}

/** A typical truss chord (C-section, IsTrussChord=true). */
function chord(secondary = 0, hasOuterFlange = false): StickProps {
  return {
    isCSection: true,
    secondaryFlag: secondary,
    swageClearance: false,
    isHybridFlange: false,
    isTrussChord: true,
    isBoxing: 0,
    hasOuterFlange,
  };
}

const flags = (over?: Partial<JointFlags>): JointFlags => ({ ...NO_FLAGS, ...over });

// ----------------------------------------------------------------------------
// Top-level dispatch (FUN_00538b00)
// ----------------------------------------------------------------------------

describe("classifyJoint — top-level dispatch (FUN_00538b00)", () => {
  it("returns None when forBackToBack is set, regardless of stick props", () => {
    expect(
      classifyJoint(stud(), plate(), flags({ forBackToBack: true })),
    ).toBe("None");
  });

  it("dispatches non-chord × non-chord to OnFlat", () => {
    // Plate × stud — most common joint. Both isTrussChord=false → OnFlat path.
    const result = classifyJoint(plate(), stud(), NO_FLAGS);
    expect(result.startsWith("OnFlat")).toBe(true);
  });

  it("dispatches chord × chord to OnEdge", () => {
    const result = classifyJoint(chord(), chord(), NO_FLAGS);
    expect(result.startsWith("OnEdge")).toBe(true);
  });

  it("dispatches mixed (chord × non-chord) via FUN_00538bb8", () => {
    // Chord vs plate — IsTrussChord differs → mixed path.
    const result = classifyJoint(chord(), plate(), NO_FLAGS);
    // Could be "OnFlat - Over" / "OnFlat - Swaged" / "None" depending on
    // ordering. Verify it lands in the mixed family at least.
    expect([
      "OnFlat - Over",
      "OnFlat - Swaged",
      "None",
      "OnFlat - Omega",
    ]).toContain(result);
  });
});

// ----------------------------------------------------------------------------
// OnFlat dispatcher (FUN_00539258)
// ----------------------------------------------------------------------------

describe("classifyOnFlat — non-chord × non-chord (FUN_00539258)", () => {
  it("plate (non-C) × stud (C), no flags → OnFlat - Over", () => {
    // Plate (non-C, hasOuter=true) × stud (C, hasOuter=false).
    // Outer: !aC=true → enters. !DualTrack/!Boxing/!WebIntersection.
    // Standard sub-group: !aC → first sub-branch. bC=true → not "both non-C".
    // Falls to line 98567: !forLayer2 → returns "OnFlat - Over".
    expect(classifyJoint(plate(), stud(), NO_FLAGS)).toBe("OnFlat - Over");
  });

  it("stud (C) × plate (non-C), no flags → OnFlat - Swaged", () => {
    // Mirror of above with sticks swapped. Outer: !bC=true → enters.
    // aC=true → !aC false → goes into the "A is C, B is non-C" branch
    // (line 98577). !forLayer2 + !forSuppressSwage → "OnFlat - Swaged".
    expect(classifyJoint(stud(), plate(), NO_FLAGS)).toBe("OnFlat - Swaged");
  });

  it("two non-C plates (both !isCSection) → OnFlat - Standard", () => {
    // Both plates are non-C → enters the both-non-C "OnFlat - Standard"
    // sub-branch (line 98545).
    const a = plate();
    const b = plate();
    expect(classifyJoint(a, b, NO_FLAGS)).toBe("OnFlat - Standard");
  });

  it("two non-C plates with forReversed → OnFlat - Reversed", () => {
    expect(classifyJoint(plate(), plate(), flags({ forReversed: true }))).toBe(
      "OnFlat - Reversed",
    );
  });

  it("two non-C plates with forLipNotchedCorners → OnFlat - LipNotchedCorners", () => {
    expect(
      classifyJoint(plate(), plate(), flags({ forLipNotchedCorners: true })),
    ).toBe("OnFlat - LipNotchedCorners");
  });

  it("two non-C plates with forReversed + forLipNotchedCorners → LipNotchedCorners Reversed", () => {
    // _DAT_00539828 inferred = 0x0005 → all required bits = forReversed +
    // forLipNotchedCorners.
    expect(
      classifyJoint(
        plate(),
        plate(),
        flags({ forReversed: true, forLipNotchedCorners: true }),
      ),
    ).toBe("OnFlat - LipNotchedCorners Reversed");
  });

  it("two non-C plates with forTabbed → OnFlat - Tabbed", () => {
    expect(classifyJoint(plate(), plate(), flags({ forTabbed: true }))).toBe(
      "OnFlat - Tabbed",
    );
  });

  it("forAsymOverSwaged + HasOuterFlange-asymmetric (A=true) → OnFlat - Over", () => {
    const a = plate();              // hasOuterFlange = true, !isCSection
    const b = plate();
    b.hasOuterFlange = false;       // asymmetric
    expect(classifyJoint(a, b, flags({ forAsymOverSwaged: true }))).toBe(
      "OnFlat - Over",
    );
  });

  it("forAsymOverSwaged + HasOuterFlange-asymmetric (A=false) → OnFlat - Swaged", () => {
    const a = plate();
    a.hasOuterFlange = false;
    const b = plate();              // hasOuterFlange = true
    expect(classifyJoint(a, b, flags({ forAsymOverSwaged: true }))).toBe(
      "OnFlat - Swaged",
    );
  });

  it("DualTrack: plate × stud with HasOuterFlange asymmetry → DualTrack PlateToStud", () => {
    // A=plate (non-C, hasOuterFlange=true), B=stud (C, hasOuterFlange=false)
    // Path: outer non-C condition true (A is non-C). DualTrack flag set.
    // Inner: (A.isC || B.isC) = (false || true) = true → enters
    // line 98623-98637. !aC, so falls into the second branch (B is C).
    // Tests A.HasOuterFlange==1 && B.HasOuterFlange==0 → PlateToStud.
    expect(
      classifyJoint(plate(), stud(), flags({ forDualTrack: true })),
    ).toBe("OnFlat - DualTrack PlateToStud");
  });

  it("Boxing/Frama: two non-C plates with forBoxing → OnFlat - Frama", () => {
    expect(
      classifyJoint(plate(), plate(), flags({ forBoxing: true })),
    ).toBe("OnFlat - Frama");
  });

  it("WebIntersection + Tabbed + HasOuterFlange-asymmetric (A=true) → OnFlat - Tabs", () => {
    const a = plate();              // hasOuterFlange=true
    const b = plate();
    b.hasOuterFlange = false;
    expect(
      classifyJoint(a, b, flags({ forWebIntersection: true, forTabbed: true })),
    ).toBe("OnFlat - Tabs");
  });

  it("WebIntersection + Tabbed + HasOuterFlange-asymmetric (A=false) → OnFlat - TabHoles", () => {
    const a = plate();
    a.hasOuterFlange = false;
    const b = plate();
    expect(
      classifyJoint(a, b, flags({ forWebIntersection: true, forTabbed: true })),
    ).toBe("OnFlat - TabHoles");
  });

  it("WebIntersection without Tabbed + HasOuterFlange-asymmetric (A=false) → WebIntersections Bad", () => {
    const a = plate();
    a.hasOuterFlange = false;
    const b = plate();
    expect(
      classifyJoint(a, b, flags({ forWebIntersection: true })),
    ).toBe("OnFlat - WebIntersections Bad");
  });

  it("forLayer2 + A non-C, B C, B.HasOuterFlange=true → OnFlat - Swaged2", () => {
    const a = plate();
    const b = stud();
    b.hasOuterFlange = true;
    expect(classifyJoint(a, b, flags({ forLayer2: true }))).toBe(
      "OnFlat - Swaged2",
    );
  });

  it("forLayer2 + A C with HasOuterFlange=true, B non-C → OnFlat - TrussBoxed", () => {
    const a = stud();
    a.hasOuterFlange = true;
    const b = plate();
    expect(classifyJoint(a, b, flags({ forLayer2: true }))).toBe(
      "OnFlat - TrussBoxed",
    );
  });
});

// ----------------------------------------------------------------------------
// OnEdge dispatcher (FUN_00538e70)
// ----------------------------------------------------------------------------

describe("classifyOnEdge — chord × chord (FUN_00538e70)", () => {
  it("two chords with both HasOuterFlange=true (symmetric) → OnEdge - LipNotchedStandard", () => {
    expect(
      classifyJoint(chord(0, true), chord(0, true), NO_FLAGS),
    ).toBe("OnEdge - LipNotchedStandard");
  });

  it("A.HasOuterFlange=true, B.HasOuterFlange=false, secondaryFlag differs → OnEdge - LipNotches", () => {
    // A=chord(secondary=0, hasOuter=true), B=chord(secondary=1, hasOuter=false)
    // Hits FUN_00538e70:98487-98494. secondaryFlag differs and A.isCSection=true
    // → "OnEdge - LipNotches".
    expect(
      classifyJoint(chord(0, true), chord(1, false), NO_FLAGS),
    ).toBe("OnEdge - LipNotches");
  });

  it("A.HasOuterFlange=false, B.HasOuterFlange=true → OnEdge - Over", () => {
    expect(
      classifyJoint(chord(0, false), chord(0, true), NO_FLAGS),
    ).toBe("OnEdge - Over");
  });

  it("A.HasOuterFlange=true, B.HasOuterFlange=false, secondaryFlag equal → None", () => {
    expect(
      classifyJoint(chord(7, true), chord(7, false), NO_FLAGS),
    ).toBe("None");
  });

  it("non-C chord × C chord → OnEdge - LipNotchedStandard3 when secondaryFlag differs", () => {
    // A=non-C chord, B=C chord, secondary differs.
    // Path: line 98498 — !B.isCSection || !A.isCSection → enter.
    //       line 98499 — A.isCSection || B.isCSection → enter.
    //       line 98500 — A.isCSection==false (we set it that way) → else → "OnEdge - Standard".
    // To hit LipNotchedStandard3: need A.isCSection=true and secondary differs.
    const a = chord(0, false);     // A.isC=true, hasOuterFlange=false
    const b = chord(1, false);     // B.isC=true, hasOuterFlange=false
    b.isCSection = false;          // make B non-C
    // Path: 98487 false (A.hasOuter=false). 98495 false. 98498 true (B.isC=false).
    //       98499 true (A.isC=true). 98500 true (A.isC=true). 98501 secondary differs → 3.
    expect(classifyJoint(a, b, NO_FLAGS)).toBe(
      "OnEdge - LipNotchedStandard3",
    );
  });

  it("non-C chord × C chord, secondaryFlag equal → OnEdge - LipNotchedStandard2", () => {
    const a = chord(5, false);
    const b = chord(5, false);
    b.isCSection = false;
    expect(classifyJoint(a, b, NO_FLAGS)).toBe(
      "OnEdge - LipNotchedStandard2",
    );
  });

  it("both chords non-C → OnEdge - Standard", () => {
    const a = chord(0, false);
    const b = chord(0, false);
    a.isCSection = false;
    b.isCSection = false;
    expect(classifyJoint(a, b, NO_FLAGS)).toBe("OnEdge - Standard");
  });
});

// ----------------------------------------------------------------------------
// Mixed dispatcher (FUN_00538bb8)
// ----------------------------------------------------------------------------

describe("classifyMixed — truss-chord × non-truss-chord (FUN_00538bb8)", () => {
  it("chord (B is chord) × plate, OnFlat subgroup → OnFlat - Over", () => {
    // A=plate (non-chord), B=chord (truss). combinedBoxing & 4 == 0.
    // B.isTrussChord=true → line 98390 path → "OnFlat - Over".
    expect(classifyJoint(plate(), chord(), NO_FLAGS)).toBe("OnFlat - Over");
  });

  it("chord (A is chord) × plate, OnFlat subgroup → OnFlat - Swaged", () => {
    // A=chord, B=plate. combinedBoxing & 4 == 0. A.isTrussChord=true →
    // line 98401 / fallback path → "OnFlat - Swaged" (DAT_00538da8 inferred).
    expect(classifyJoint(chord(), plate(), NO_FLAGS)).toBe("OnFlat - Swaged");
  });

  it("chord × plate where IsBoxing & 4 set → OnFlat - Omega when boxing flags equal", () => {
    // Force the OnEdge subgroup via isBoxing bit 4. Both sticks isBoxing=4.
    // A.isC=true, A.isBoxing=4 (!= 2). B.isC=false → first branch entered.
    // B.isC=false → enter inner branch. A.isBoxing===B.isBoxing → "OnFlat - Omega".
    const a = chord();
    a.isBoxing = 4;
    const b = plate();
    b.isBoxing = 4;
    expect(classifyJoint(a, b, NO_FLAGS)).toBe("OnFlat - Omega");
  });
});

// ----------------------------------------------------------------------------
// Flag bit-mask packing
// ----------------------------------------------------------------------------

describe("unpackJointFlags", () => {
  it("packs all-zero ushort to all-false flags", () => {
    const f = unpackJointFlags(0);
    expect(f.forBackToBack).toBe(false);
    expect(f.forDualTrack).toBe(false);
  });

  it("0x0200 → forBackToBack only", () => {
    const f = unpackJointFlags(0x0200);
    expect(f.forBackToBack).toBe(true);
    expect(f.forDualTrack).toBe(false);
    expect(f.forBoxing).toBe(false);
  });

  it("0x0820 → forBoxing + forDualTrack", () => {
    const f = unpackJointFlags(0x0820);
    expect(f.forBoxing).toBe(true);
    expect(f.forDualTrack).toBe(true);
    expect(f.forReversed).toBe(false);
  });

  it("0x0FFF roundtrip touches every documented bit", () => {
    const f = unpackJointFlags(0x0fff);
    expect(f.forReversed).toBe(true);
    expect(f.forSuppressSwage).toBe(true);
    expect(f.forLipNotchedCorners).toBe(true);
    expect(f.forDualTrack).toBe(true);
    expect(f.forAsymOverSwaged).toBe(true);
    expect(f.forWebIntersection).toBe(true);
    expect(f.forTabbed).toBe(true);
    expect(f.forBackToBack).toBe(true);
    expect(f.forLayer2).toBe(true);
    expect(f.forBoxing).toBe(true);
  });
});
