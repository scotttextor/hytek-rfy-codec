import { describe, it, expect } from "vitest";

import {
  deriveFrameFlags,
  emptyFrameFlags,
  packFrameFlags,
  FRAME_FLAG_BITS,
  type FrameFlags,
} from "./frame-flags.js";

describe("emptyFrameFlags", () => {
  it("returns every bit cleared", () => {
    const f = emptyFrameFlags();
    expect(f.forReversed).toBe(false);
    expect(f.forSuppressSwage).toBe(false);
    expect(f.forLipNotchedCorners).toBe(false);
    expect(f.forDualTrack).toBe(false);
    expect(f.forAsymOverSwaged).toBe(false);
    expect(f.forWebIntersection).toBe(false);
    expect(f.forTabbed).toBe(false);
    expect(f.forBackToBack).toBe(false);
    expect(f.forLayer2).toBe(false);
    expect(f.forBoxing).toBe(false);
    expect(f.forSplicing).toBe(false);
    expect(packFrameFlags(f)).toBe(0);
  });
});

describe("FRAME_FLAG_BITS", () => {
  it("matches the decoded-report bit map (docs/detailer-rule-decoded.md §3)", () => {
    expect(FRAME_FLAG_BITS.forReversed).toBe(0x0001);
    expect(FRAME_FLAG_BITS.forSuppressSwage).toBe(0x0002);
    expect(FRAME_FLAG_BITS.forLipNotchedCorners).toBe(0x0004);
    expect(FRAME_FLAG_BITS.forDualTrack).toBe(0x0020);
    expect(FRAME_FLAG_BITS.forAsymOverSwaged).toBe(0x0040);
    expect(FRAME_FLAG_BITS.forWebIntersection).toBe(0x0080);
    expect(FRAME_FLAG_BITS.forTabbed).toBe(0x0100);
    expect(FRAME_FLAG_BITS.forBackToBack).toBe(0x0200);
    expect(FRAME_FLAG_BITS.forLayer2).toBe(0x0400);
    expect(FRAME_FLAG_BITS.forBoxing).toBe(0x0800);
  });
});

describe("packFrameFlags", () => {
  it("ORs the bit positions of every set flag", () => {
    const f = emptyFrameFlags();
    f.forBackToBack = true;
    expect(packFrameFlags(f)).toBe(0x0200);

    f.forBoxing = true;
    expect(packFrameFlags(f)).toBe(0x0200 | 0x0800);

    f.forReversed = true;
    expect(packFrameFlags(f)).toBe(0x0001 | 0x0200 | 0x0800);
  });

  it("does not include forSplicing (bit position unknown)", () => {
    const f = emptyFrameFlags();
    f.forSplicing = true;
    expect(packFrameFlags(f)).toBe(0);
  });
});

describe("deriveFrameFlags", () => {
  // ---------------------------------------------------------------------------
  // KNOWN MAPPING #1 — forBackToBack  (high confidence, plan-name signal)
  // ---------------------------------------------------------------------------

  it("sets forBackToBack on TB2B plans (planType arg)", () => {
    const f = deriveFrameFlags("TB2B", "Truss", "PK1-GF-TB2B-70.075");
    expect(f.forBackToBack).toBe(true);
  });

  it("sets forBackToBack on TB2B plans (lowercase planType arg)", () => {
    const f = deriveFrameFlags("tb2b", "Truss", "PK1-GF-TB2B-70.075");
    expect(f.forBackToBack).toBe(true);
  });

  it("sets forBackToBack on TB2B plans inferred from planName when planType is empty", () => {
    const f = deriveFrameFlags("", "Truss", "PK1-GF-TB2B-70.075");
    expect(f.forBackToBack).toBe(true);
  });

  it("does NOT set forBackToBack on LIN plans", () => {
    const f = deriveFrameFlags("LIN", "Truss", "GF-LIN-89.075");
    expect(f.forBackToBack).toBe(false);
  });

  it("does NOT set forBackToBack on LBW plans", () => {
    const f = deriveFrameFlags("LBW", "Wall", "GF-LBW-70.075");
    expect(f.forBackToBack).toBe(false);
  });

  it("does NOT set forBackToBack on TIN plans", () => {
    const f = deriveFrameFlags("TIN", "Truss", "GF-TIN-70.075");
    expect(f.forBackToBack).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // DEFERRED MAPPINGS — should default false until a follow-up agent wires
  // them. These tests pin the current behaviour so a future change that
  // accidentally trips the bits gets surfaced.
  // ---------------------------------------------------------------------------

  it("leaves forBoxing false on TB2B plans (decoded report says 0x800 is FRAMA, not TB2B)", () => {
    const f = deriveFrameFlags("TB2B", "Truss", "PK1-GF-TB2B-70.075");
    expect(f.forBoxing).toBe(false);
  });

  it("leaves forDualTrack false on 89-profile plans (per-stick SwageClearance, not plan-level)", () => {
    const f = deriveFrameFlags("LBW", "Wall", "GF-LBW-89.075");
    expect(f.forDualTrack).toBe(false);
  });

  it("leaves forSplicing false (bit position unknown)", () => {
    const f = deriveFrameFlags("LBW", "Wall", "GF-LBW-70.075");
    expect(f.forSplicing).toBe(false);
  });

  it("leaves forTabbed false on every plan (defer to runtime classifier)", () => {
    const lbw = deriveFrameFlags("LBW", "Wall", "GF-LBW-70.075");
    const lin = deriveFrameFlags("LIN", "Truss", "GF-LIN-89.075");
    expect(lbw.forTabbed).toBe(false);
    expect(lin.forTabbed).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Defensive — empty / odd inputs return all-false flags.
  // ---------------------------------------------------------------------------

  it("returns all-false flags on empty inputs", () => {
    const f = deriveFrameFlags("", "", "");
    expect(packFrameFlags(f)).toBe(0);
  });

  it("returns all-false flags on a plan name with no recognised type token", () => {
    const f = deriveFrameFlags("", "Wall", "junk-name");
    expect(packFrameFlags(f)).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Type-shape sanity — every documented flag is present on the returned object.
  // ---------------------------------------------------------------------------

  it("returns a complete FrameFlags record (every bit populated)", () => {
    const f: FrameFlags = deriveFrameFlags("TB2B", "Truss", "GF-TB2B-70.075");
    const allKeys: Array<keyof FrameFlags> = [
      "forReversed",
      "forSuppressSwage",
      "forLipNotchedCorners",
      "forDualTrack",
      "forAsymOverSwaged",
      "forWebIntersection",
      "forTabbed",
      "forBackToBack",
      "forLayer2",
      "forBoxing",
      "forSplicing",
    ];
    for (const k of allKeys) {
      expect(typeof f[k]).toBe("boolean");
    }
  });
});
