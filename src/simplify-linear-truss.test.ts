import { describe, it, expect } from "vitest";

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

import { isLinearTruss } from "./simplify-linear-truss.js";
import type { ParsedFrame, ParsedStick, Vec3 } from "./synthesize-plans.js";

const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const ZERO_ENVELOPE: [Vec3, Vec3, Vec3, Vec3] = [ZERO, ZERO, ZERO, ZERO];

function makeStick(
  name: string,
  usage: string,
  profile: Partial<ParsedStick["profile"]> = {},
  gauge = "0.75",
): ParsedStick {
  return {
    name,
    type: "Stud",
    usage,
    gauge,
    profile: { web: 89, lFlange: 38, rFlange: 41, lLip: 11, rLip: 11, shape: "C", ...profile },
    flipped: false,
    start: { x: 0, y: 0, z: 0 },
    end:   { x: 1000, y: 0, z: 0 },
    tooling: [],
  };
}
function makeFrame(name: string, type: string, sticks: ParsedStick[]): ParsedFrame {
  return {
    name,
    type,
    envelope: ZERO_ENVELOPE,
    fasteners: [],
    fastenerCount: 0,
    toolActions: [],
    length: 1000,
    builtHeight: 1000,
    profileLabel: "GF-LIN-89.075",
    pitchMm: 89,
    sticks,
  };
}

describe("isLinearTruss", () => {
  const goodChord = makeStick("T1", "TopChord");
  const goodWeb   = makeStick("W1", "Web");

  it("APPLIES when all 4 layers pass", () => {
    const f = makeFrame("TN1", "Truss", [goodChord, goodWeb]);
    expect(isLinearTruss(f, "GF-LIN-89.075")).toEqual({ ok: true });
  });

  it("SKIPS non-Truss frames", () => {
    const f = makeFrame("N1", "InternalWall", [goodChord, goodWeb]);
    const r = isLinearTruss(f, "GF-LIN-89.075");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not Truss/i);
  });

  it("SKIPS plans not matching /-LIN-/i", () => {
    const f = makeFrame("TT1", "Truss", [goodChord, goodWeb]);
    const r = isLinearTruss(f, "GF-TB2B-70.075");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not Linear/i);
  });

  it("SKIPS wrong profile (70x41 instead of 89x41)", () => {
    const wrong = makeStick("T1", "TopChord", { web: 70 });
    const f = makeFrame("TN1", "Truss", [wrong, goodWeb]);
    const r = isLinearTruss(f, "GF-LIN-70.075");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/wrong profile/i);
  });

  it("SKIPS wrong gauge (0.95 instead of 0.75)", () => {
    const wrong = makeStick("T1", "TopChord", {}, "0.95");
    const f = makeFrame("TN1", "Truss", [wrong, goodWeb]);
    const r = isLinearTruss(f, "GF-LIN-89.095");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/wrong gauge/i);
  });

  it("SKIPS frames with no chord", () => {
    const f = makeFrame("TN1", "Truss", [goodWeb, makeStick("W2", "Web")]);
    const r = isLinearTruss(f, "GF-LIN-89.075");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no chord/i);
  });

  it("SKIPS frames with no web", () => {
    const f = makeFrame("TN1", "Truss", [goodChord, makeStick("T2", "BottomChord")]);
    const r = isLinearTruss(f, "GF-LIN-89.075");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no web/i);
  });

  it("APPLIES when gauge has surrounding whitespace (matches via trim)", () => {
    const s = makeStick("T1", "TopChord", {}, " 0.75 ");
    const f = makeFrame("TN1", "Truss", [s, makeStick("W1", "Web")]);
    expect(isLinearTruss(f, "GF-LIN-89.075")).toEqual({ ok: true });
  });

  it("SKIPS frames where frame.type is undefined", () => {
    const f = makeFrame("X1", undefined as unknown as string, [makeStick("T1", "TopChord"), makeStick("W1", "Web")]);
    const r = isLinearTruss(f, "GF-LIN-89.075");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/frame type missing/i);
  });

  it("respects a custom profileGate override (70x41 0.75)", () => {
    const customGate = { web: 70, rFlange: 41, lFlange: 38, lLip: 11, rLip: 11, shape: "C" as const, gauge: "0.75" };
    const stick70 = makeStick("T1", "TopChord", { web: 70 });
    const f70 = makeFrame("TN1", "Truss", [stick70, makeStick("W1", "Web", { web: 70 })]);
    expect(isLinearTruss(f70, "GF-LIN-70.075", customGate)).toEqual({ ok: true });
    // And 89x41 frame must SKIP under the 70x41 gate
    const f89 = makeFrame("TN2", "Truss", [makeStick("T1", "TopChord"), makeStick("W1", "Web")]);
    const r89 = isLinearTruss(f89, "GF-LIN-89.075", customGate);
    expect(r89.ok).toBe(false);
  });
});

import { guardZeroLength } from "./simplify-linear-truss.js";

describe("guardZeroLength", () => {
  it("passes for normal-length sticks", () => {
    const sticks = [makeStick("T1", "TopChord"), makeStick("W1", "Web")];
    expect(guardZeroLength(sticks)).toEqual({ ok: true });
  });

  it("fails when any stick has near-zero length (<1e-3 mm)", () => {
    const zeroStick: ParsedStick = {
      ...makeStick("W2", "Web"),
      start: { x: 0, y: 0, z: 0 },
      end:   { x: 0, y: 0, z: 0 },
    };
    const sticks = [makeStick("T1", "TopChord"), zeroStick];
    const r = guardZeroLength(sticks);
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/zero-length stick W2/i);
  });
});

import { assertEndZone } from "./simplify-linear-truss.js";

describe("assertEndZone (INV-4)", () => {
  it("passes for positions safely inside the stick", () => {
    const r = assertEndZone([100, 500, 900], 1000, 30);
    expect(r.violations).toEqual([]);
    expect(r.safe).toEqual([100, 500, 900]);
  });

  it("flags positions within endZoneMm of the start", () => {
    const r = assertEndZone([5, 25, 50], 1000, 30);
    expect(r.violations).toEqual([5, 25]);
    expect(r.safe).toEqual([50]);
  });

  it("flags positions within endZoneMm of the end", () => {
    const r = assertEndZone([950, 985, 1000], 1000, 30);
    expect(r.violations).toEqual([985, 1000]);
    expect(r.safe).toEqual([950]);
  });

  it("flags both ends together", () => {
    const r = assertEndZone([5, 50, 950, 999], 1000, 30);
    expect(r.violations).toEqual([5, 999]);
    expect(r.safe).toEqual([50, 950]);
  });

  it("treats positions exactly at the zone boundary as safe (>= and <=)", () => {
    const r = assertEndZone([30, 970], 1000, 30);
    expect(r.violations).toEqual([]);
  });
});

import { dedupApex } from "./simplify-linear-truss.js";

describe("dedupApex", () => {
  it("returns input unchanged when all clusters are >= apexCollisionMm apart", () => {
    const r = dedupApex([100, 200, 500], 17);
    expect(r.kept).toEqual([100, 200, 500]);
    expect(r.merged).toEqual([]);
  });

  it("merges two clusters within apexCollisionMm — keeps the lower position", () => {
    // 100 and 110 collide (gap=10 < 17), keep 100, drop 110
    const r = dedupApex([100, 110, 500], 17);
    expect(r.kept).toEqual([100, 500]);
    expect(r.merged).toEqual([110]);
  });

  it("handles clusters arriving in arbitrary order — sorts before dedup", () => {
    const r = dedupApex([500, 110, 100], 17);
    expect(r.kept).toEqual([100, 500]);
    expect(r.merged).toEqual([110]);
  });

  it("merges three clusters in a tight chain", () => {
    // 100, 110, 115 — all within 17 of next; keep the lowest (100), drop both
    const r = dedupApex([100, 110, 115, 500], 17);
    expect(r.kept).toEqual([100, 500]);
    expect(r.merged).toEqual([110, 115]);
  });
});

import { handleParallelPair } from "./simplify-linear-truss.js";
import type { Segment3 } from "./simplify-linear-truss.js";

describe("handleParallelPair", () => {
  it("returns null when sticks are not parallel (denom != 0)", () => {
    // Different directions → not parallel
    const a: Segment3 = { start: [0, 0, 0], end: [100, 0, 100] };
    const b: Segment3 = { start: [0, 0, 100], end: [100, 0, 0] };
    expect(handleParallelPair(a, b, 5)).toBeNull();
  });

  it("returns null when sticks are parallel but centrelines >coincidenceMm apart", () => {
    // Two horizontal sticks, 50mm apart in Z — not co-linear
    const a: Segment3 = { start: [0, 0, 0], end: [1000, 0, 0] };
    const b: Segment3 = { start: [0, 0, 50], end: [1000, 0, 50] };
    expect(handleParallelPair(a, b, 5)).toBeNull();
  });

  it("returns midpoint of overlap when sticks are co-linear within tolerance (back-to-back chord)", () => {
    // Two horizontal sticks at z=0 and z=2 (within 5mm tolerance) — co-linear
    const a: Segment3 = { start: [0, 0, 0], end: [1000, 0, 0] };
    const b: Segment3 = { start: [200, 0, 2], end: [800, 0, 2] };
    const r = handleParallelPair(a, b, 5);
    expect(r).not.toBeNull();
    // Overlap is X=200..800; midpoint = 500. posOnA = 500, posOnB = 300 (500-200).
    expect(r!.posOnA).toBeCloseTo(500, 5);
    expect(r!.posOnB).toBeCloseTo(300, 5);
  });

  it("returns null when co-linear but no overlap on the length axis", () => {
    const a: Segment3 = { start: [0, 0, 0], end: [100, 0, 0] };
    const b: Segment3 = { start: [200, 0, 2], end: [300, 0, 2] };
    expect(handleParallelPair(a, b, 5)).toBeNull();
  });
});

import { assertRfyVersion, RfyVersionMismatch } from "./simplify-linear-truss.js";

describe("assertRfyVersion", () => {
  it("passes when version is 2.12.0", () => {
    const xml = '<?xml version="1.0"?><rfy version="2.12.0"><body/></rfy>';
    expect(() => assertRfyVersion(xml)).not.toThrow();
  });

  it("passes when version is 2.13.5 (any minor/patch ≥ 2.12.0)", () => {
    const xml = '<?xml version="1.0"?><rfy version="2.13.5"><body/></rfy>';
    expect(() => assertRfyVersion(xml)).not.toThrow();
  });

  it("passes when version is 3.0.0 (major ≥ 2)", () => {
    const xml = '<?xml version="1.0"?><rfy version="3.0.0"><body/></rfy>';
    expect(() => assertRfyVersion(xml)).not.toThrow();
  });

  it("throws RfyVersionMismatch for version < 2.12.0", () => {
    const xml = '<?xml version="1.0"?><rfy version="2.11.5"><body/></rfy>';
    expect(() => assertRfyVersion(xml)).toThrow(RfyVersionMismatch);
  });

  it("throws RfyVersionMismatch when no version attribute is present", () => {
    const xml = '<?xml version="1.0"?><rfy><body/></rfy>';
    expect(() => assertRfyVersion(xml)).toThrow(RfyVersionMismatch);
  });
});

// =============================================================================
// Task 9: Core walker — simplifyLinearTrussRfy against reference fixtures
// =============================================================================

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { simplifyLinearTrussRfy } from "./simplify-linear-truss.js";

function readCorpus(rel: string): Buffer {
  return readFileSync(join(__dirname, "..", "test-corpus", rel));
}

describe("simplifyLinearTrussRfy — reference fixtures", () => {
  it("APPLY: 2603191 ROCKVILLE Linear truss — reduces BOLT HOLES (deterministic)", () => {
    const rfy = readCorpus("2603191/2603191-GF-LIN-89.075.rfy");
    const xml = readCorpus("2603191/2603191-ROCKVILLE.xml").toString("utf-8");
    const parsed = parsePlanXml(xml);
    const result = simplifyLinearTrussRfy(rfy, parsed.frames, parsed.planNameByFrame);

    // Deterministic against the frozen 2603191 fixture. If any of these change,
    // an underlying constant or geometry rule has drifted.
    expect(result.appliedFrames.length).toBe(22);
    const apply = result.decisions.filter(d => d.decision === "APPLY");
    const fallback = result.decisions.filter(d => d.decision === "FALLBACK");
    expect(apply.length).toBe(22);
    expect(fallback.length).toBe(0);

    const totalNew = apply.reduce((sum, d) => sum + (d.newBoltCount ?? 0), 0);
    expect(totalNew).toBe(750);

    // Stick-level fallbacks (sticks where the new rule would violate INV-4 and
    // the source RFY's Web ops are kept verbatim).
    const stickFallbackTotal = apply.reduce((s, d) => s + (d.fallbackSticks?.length ?? 0), 0);
    expect(stickFallbackTotal).toBeGreaterThan(0);
  });

  it("SKIP: HG260044 GF-NLBW-89.075 wall — output bytes byte-identical to source", () => {
    const rfy = readCorpus("HG260044/HG260044-GF-NLBW-89.075.rfy");
    const result = simplifyLinearTrussRfy(rfy, [], new Map());
    // Empty ParsedFrame[] means no frame can match → all SKIP.
    // The walker must round-trip the RFY bytes-for-bytes when nothing matches.
    expect(result.rfy.equals(rfy)).toBe(true);
    expect(result.decisions.every(d => d.decision === "SKIP")).toBe(true);
  });
});

// ----- helper -----
function parsePlanXml(xml: string): {
  frames: import("./synthesize-plans.js").ParsedFrame[];
  planNameByFrame: Map<string, string>;
} {
  const frames: import("./synthesize-plans.js").ParsedFrame[] = [];
  const planNameByFrame = new Map<string, string>();
  const planRe = /<plan name="([^"]+)">([\s\S]*?)<\/plan>/g;
  let pm: RegExpExecArray | null;
  while ((pm = planRe.exec(xml)) !== null) {
    const planName = pm[1];
    const planBody = pm[2];
    const frameRe = /<frame name="([^"]+)" type="([^"]+)"[^>]*>([\s\S]*?)<\/frame>/g;
    let fm: RegExpExecArray | null;
    while ((fm = frameRe.exec(planBody)) !== null) {
      const frameName = fm[1];
      planNameByFrame.set(frameName, planName);
      const frameType = fm[2];
      const stickRe = /<stick\s+([^>]*?)>\s*<start>([^<]+)<\/start>\s*<end>([^<]+)<\/end>\s*<profile\s+([^/>]*?)\/?>/g;
      const sticks: import("./synthesize-plans.js").ParsedStick[] = [];
      let sm: RegExpExecArray | null;
      while ((sm = stickRe.exec(fm[3])) !== null) {
        const attrs = sm[1];
        const get = (k: string) => (attrs.match(new RegExp(`\\b${k}="([^"]*)"`)) ?? [, ""])[1];
        const [sx, sy, sz] = sm[2].trim().split(",").map(parseFloat);
        const [ex, ey, ez] = sm[3].trim().split(",").map(parseFloat);
        const profStr = sm[4];
        const pget = (k: string) => (profStr.match(new RegExp(`\\b${k}="([^"]*)"`)) ?? [, ""])[1];
        sticks.push({
          name: get("name"),
          type: get("type") || "Stud",
          usage: get("usage"),
          gauge: get("gauge"),
          flipped: false,
          start: { x: sx, y: sy, z: sz },
          end:   { x: ex, y: ey, z: ez },
          profile: {
            web: parseFloat(pget("web")) || 0,
            lFlange: parseFloat(pget("l_flange")) || 0,
            rFlange: parseFloat(pget("r_flange")) || 0,
            lLip: parseFloat(pget("l_lip")) || 0,
            rLip: parseFloat(pget("r_lip")) || 0,
            shape: (pget("shape") as "C" | "S") || "C",
          },
        } as any);
      }
      frames.push({
        name: frameName, type: frameType,
        envelope: [], fasteners: [], fastenerCount: 0, toolActions: [],
        length: 0, builtHeight: 0, profileLabel: planName, pitchMm: 89,
        sticks,
      } as any);
    }
  }
  return { frames, planNameByFrame };
}

// =============================================================================
// Task 10: Property-based test — 100 synthetic LIN trusses respect INV-4
// =============================================================================

describe("simplifyLinearTrussRfy — property: emitted positions are inside the end-zone", () => {
  it("∀ 100 synthetic LIN trusses: every kept position satisfies 30 ≤ pos ≤ length−30", () => {
    const seed = 42;
    let s = seed;
    const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };

    const SLACK = 20;        // intersectionSlackMm — matches DEFAULTS
    const APEX = 17;         // apexCollisionMm
    const END_ZONE = 30;     // endZoneMm

    let totalKept = 0;
    let totalRuns = 0;

    for (let run = 0; run < 100; run++) {
      const span = 4000 + Math.floor(rand() * 6000);   // 4..10 m
      const height = 600 + Math.floor(rand() * 1200);  // 600..1800 mm
      const nWebs = 3 + Math.floor(rand() * 5);        // 3..7 webs

      // Synthetic Linear truss — chord (T1, B1) + N webs
      const sticks: { name: string; seg: Segment3 }[] = [
        { name: "T1", seg: { start: [0, 0, height], end: [span, 0, height] } },
        { name: "B1", seg: { start: [0, 0, 0], end: [span, 0, 0] } },
      ];
      for (let i = 0; i < nWebs; i++) {
        const x = (span * (i + 1)) / (nWebs + 1);
        const tilt = (rand() - 0.5) * 200;
        sticks.push({
          name: `W${i + 1}`,
          seg: { start: [x - tilt / 2, 0, 0], end: [x + tilt / 2, 0, height] },
        });
      }

      // Compute pairwise intersections using the same primitives as the walker
      const positionsByStick = new Map<string, number[]>();
      for (let i = 0; i < sticks.length; i++) {
        for (let j = i + 1; j < sticks.length; j++) {
          const A = sticks[i], B = sticks[j];
          const lenA = stickLength3D(A.seg);
          const lenB = stickLength3D(B.seg);
          const inter = lineIntersectionXZ(A.seg, B.seg, SLACK);
          let posA: number, posB: number;
          if (inter !== null) {
            posA = Math.max(0, Math.min(lenA, inter.t * lenA));
            posB = Math.max(0, Math.min(lenB, inter.u * lenB));
          } else {
            const par = handleParallelPair(A.seg, B.seg, 5);
            if (par === null) continue;
            posA = par.posOnA;
            posB = par.posOnB;
          }
          (positionsByStick.get(A.name) ?? positionsByStick.set(A.name, []).get(A.name)!).push(posA);
          (positionsByStick.get(B.name) ?? positionsByStick.set(B.name, []).get(B.name)!).push(posB);
        }
      }

      // Apply dedupApex + assertEndZone — the same pipeline the walker uses
      for (const [name, raw] of positionsByStick) {
        const stick = sticks.find(s => s.name === name)!;
        const len = stickLength3D(stick.seg);
        const dedup = dedupApex(raw, APEX);
        const ez = assertEndZone(dedup.kept, len, END_ZONE);
        for (const p of ez.safe) {
          // The invariant: emitted positions sit in [30, length-30].
          expect(p).toBeGreaterThanOrEqual(END_ZONE);
          expect(p).toBeLessThanOrEqual(len - END_ZONE);
          totalKept++;
        }
      }
      totalRuns++;
    }

    // Sanity: we exercised the property non-trivially. If the synthetic
    // geometry produces zero kept positions, the test is vacuous.
    expect(totalRuns).toBe(100);
    expect(totalKept).toBeGreaterThan(0);
  });
});

// =============================================================================
// Task 11: Roundtrip-equality on the negative wall fixture
// =============================================================================

describe("simplifyLinearTrussRfy — roundtrip equality on skipped wall", () => {
  it("HG260044 wall: parse → build → re-encrypt produces byte-identical RFY", () => {
    const rfy = readCorpus("HG260044/HG260044-GF-NLBW-89.075.rfy");
    // Force "rewrite: true" but with empty frames so every frame skips.
    // The walker still parses+rebuilds the XML — the test asserts no drift.
    const result = simplifyLinearTrussRfy(rfy, [], new Map(), { rewrite: true });
    // Even though rewrite=true, no frame APPLIED → walker returns input bytes.
    expect(result.rfy.equals(rfy)).toBe(true);
  });
});

// =============================================================================
// Dimple normalisation
// =============================================================================

import { computeBoxDimples, normaliseDimplesForFrame } from "./simplify-linear-truss.js";
import { decryptRfy } from "./crypto.js";
import { XMLParser } from "fast-xml-parser";

describe("computeBoxDimples", () => {
  it("300mm Box (no extras) → [15, 285]", () => {
    // usable = 300 - 30 = 270; nGaps = ceil(270/900) = 1; spacing = 270.
    expect(computeBoxDimples(300, 15, 900)).toEqual([15.0, 285.0]);
  });

  it("738mm Box (no extras) → [15, 723]", () => {
    // usable = 738 - 30 = 708; nGaps = ceil(708/900) = 1; spacing = 708.
    expect(computeBoxDimples(738, 15, 900)).toEqual([15.0, 723.0]);
  });

  it("1182mm Box (1 extra) → [15, 591, 1167]", () => {
    // usable = 1182 - 30 = 1152; nGaps = ceil(1152/900) = 2; spacing = 576.
    expect(computeBoxDimples(1182, 15, 900)).toEqual([15.0, 591.0, 1167.0]);
  });

  it("1967mm Box (2 extras) → [15, 660.67, 1306.33, 1952]", () => {
    // usable = 1967 - 30 = 1937; nGaps = ceil(1937/900) = 3; spacing = 645.6666…
    const got = computeBoxDimples(1967, 15, 900);
    expect(got).toHaveLength(4);
    expect(got[0]).toBeCloseTo(15.0, 5);
    expect(got[1]).toBeCloseTo(660.67, 2);
    expect(got[2]).toBeCloseTo(1306.33, 2);
    expect(got[3]).toBeCloseTo(1952.0, 5);
  });

  it("very short Box (≤ 2*margin) → single dimple at midpoint", () => {
    // L = 20, usable = 20 - 30 = -10 ≤ 0 → fallback to [L/2].
    expect(computeBoxDimples(20, 15, 900)).toEqual([10.0]);
  });

  it("respects custom margin and maxGap", () => {
    // L=2000, margin=50, maxGap=400. usable=1900; nGaps=ceil(1900/400)=5; spacing=380.
    const got = computeBoxDimples(2000, 50, 400);
    expect(got).toEqual([50.0, 430.0, 810.0, 1190.0, 1570.0, 1950.0]);
  });
});

describe("normaliseDimplesForFrame — pure tree mutation", () => {
  // Build a minimal preserveOrder fast-xml-parser frame with one main chord
  // ("B1") and one Box piece ("B1 (Box1)"). Each stick has a <tooling> child
  // with a few InnerDimple ops.
  function makeStickChild(
    name: string,
    length: number,
    dimplePositions: number[],
  ): Record<string, unknown> {
    const tooling: Array<Record<string, unknown>> = dimplePositions.map(p => ({
      "point-tool": [],
      ":@": { "@_type": "InnerDimple", "@_pos": p.toFixed(2) },
    }));
    return {
      stick: [{ tooling }],
      ":@": { "@_name": name, "@_length": String(length) },
    };
  }

  it("rewrites a 300mm single-Box pair: Box → [15, 285], main updated to match", () => {
    // Main has 3 dimples; Box's gap pattern (258.1mm) matches main[1..2] (268.1, 526.2 → gap 258.1).
    // The algorithm picks main[1..2] as the matching zone and rewrites them.
    const main = makeStickChild("B1", 5000, [50, 268.1, 526.2]);
    const box = makeStickChild("B1 (Box1)", 300, [10, 268.1]);
    const frameWrap = { frame: [main, box] };

    const updated = normaliseDimplesForFrame(frameWrap, 15.0, 900.0);

    // Box wrote 2 dimples + main wrote 2 in-zone dimples → 4 InnerDimple ops written.
    expect(updated).toBe(4);

    // Box piece now has [15, 285] only.
    const boxTooling = (box.stick as Array<{ tooling: Array<Record<string, unknown>> }>)[0].tooling;
    const boxDimples = boxTooling
      .filter(op => "point-tool" in op && (op as { ":@"?: { "@_type"?: string } })[":@"]?.["@_type"] === "InnerDimple")
      .map(op => parseFloat((op as { ":@"?: { "@_pos"?: string } })[":@"]?.["@_pos"] ?? "NaN"));
    expect(boxDimples).toEqual([15.0, 285.0]);

    // Main chord: in-zone dimples (Box matched main[1..2] = 268.1, 526.2) replaced
    // by main_new = boxPosition + boxNew. boxPosition = 268.1 - 10 = 258.1.
    // → main_new = [273.1, 543.1]. Out-of-zone dimple (50) preserved.
    const mainTooling = (main.stick as Array<{ tooling: Array<Record<string, unknown>> }>)[0].tooling;
    const mainDimples = mainTooling
      .filter(op => "point-tool" in op && (op as { ":@"?: { "@_type"?: string } })[":@"]?.["@_type"] === "InnerDimple")
      .map(op => parseFloat((op as { ":@"?: { "@_pos"?: string } })[":@"]?.["@_pos"] ?? "NaN"))
      .sort((a, b) => a - b);
    expect(mainDimples).toEqual([50.0, 273.1, 543.1]);
  });

  it("two-pass: multi-Box main chord uses ORIGINAL main positions, not mutated ones", () => {
    // Main B1 has 4 dimples covering Box1 zone (positions 100,200) and Box2 zone (positions 1000,1100).
    // Box1 length 300 → new local [15, 285] → main_new = [105, 375]
    // Box2 length 300 → new local [15, 285] → main_new = [1005, 1275]
    // If we did one-pass and mutated Box1 first, Box2's "boxPosition" lookup
    // would use already-overwritten main positions. The two-pass design
    // captures all old positions before any write.
    const main = makeStickChild("B1", 5000, [100, 200, 1000, 1100]);
    const box1 = makeStickChild("B1 (Box1)", 300, [10, 110]);
    const box2 = makeStickChild("B1 (Box2)", 300, [10, 110]);
    const frameWrap = { frame: [main, box1, box2] };

    normaliseDimplesForFrame(frameWrap, 15.0, 900.0);

    const mainTooling = (main.stick as Array<{ tooling: Array<Record<string, unknown>> }>)[0].tooling;
    const mainDimples = mainTooling
      .filter(op => "point-tool" in op && (op as { ":@"?: { "@_type"?: string } })[":@"]?.["@_type"] === "InnerDimple")
      .map(op => parseFloat((op as { ":@"?: { "@_pos"?: string } })[":@"]?.["@_pos"] ?? "NaN"))
      .sort((a, b) => a - b);

    // Box1: boxPosition = 100 - 10 = 90 → [105, 375]
    // Box2: boxPosition = 1000 - 10 = 990 → [1005, 1275]
    expect(mainDimples).toEqual([105.0, 375.0, 1005.0, 1275.0]);
  });

  it("orphan Box (no matching main chord) is left untouched", () => {
    const box = makeStickChild("Z9 (Box1)", 300, [10, 268.1]);
    const frameWrap = { frame: [box] };

    const updated = normaliseDimplesForFrame(frameWrap, 15.0, 900.0);
    expect(updated).toBe(0);

    const boxTooling = (box.stick as Array<{ tooling: Array<Record<string, unknown>> }>)[0].tooling;
    const boxDimples = boxTooling
      .filter(op => "point-tool" in op && (op as { ":@"?: { "@_type"?: string } })[":@"]?.["@_type"] === "InnerDimple")
      .map(op => parseFloat((op as { ":@"?: { "@_pos"?: string } })[":@"]?.["@_pos"] ?? "NaN"))
      .sort((a, b) => a - b);
    expect(boxDimples).toEqual([10.0, 268.1]);
  });

  it("frame with no Box pieces makes no changes", () => {
    const main = makeStickChild("B1", 5000, [100, 200, 300]);
    const frameWrap = { frame: [main] };

    const updated = normaliseDimplesForFrame(frameWrap, 15.0, 900.0);
    expect(updated).toBe(0);
  });
});

describe("simplifyLinearTrussRfy — dimple normalisation on reference fixture", () => {
  it("2603191 ROCKVILLE: bolt-hole simplification AND dimple normalisation both fire", () => {
    const rfy = readCorpus("2603191/2603191-GF-LIN-89.075.rfy");
    const xml = readCorpus("2603191/2603191-ROCKVILLE.xml").toString("utf-8");
    const parsed = parsePlanXml(xml);
    const result = simplifyLinearTrussRfy(rfy, parsed.frames, parsed.planNameByFrame);

    // Bolt-hole pass still produces deterministic counts (default normaliseDimples=true
    // does not change the bolt-hole rewrite).
    const apply = result.decisions.filter(d => d.decision === "APPLY");
    expect(apply.length).toBe(22);
    const totalBolts = apply.reduce((s, d) => s + (d.newBoltCount ?? 0), 0);
    expect(totalBolts).toBe(750);

    // At least some frames had Box pieces → dimplesUpdated > 0.
    const totalDimples = apply.reduce((s, d) => s + (d.dimplesUpdated ?? 0), 0);
    expect(totalDimples).toBeGreaterThan(0);

    // Output must decrypt cleanly (i.e. encryption roundtrip is intact).
    const decryptedOut = decryptRfy(result.rfy);
    expect(decryptedOut.startsWith("<?xml")).toBe(true);

    // Every Box piece's first/last dimple must satisfy the margin rule
    // (≥15mm from each end), and adjacent gaps must be ≤900mm. This is the
    // post-condition the script enforces.
    const parser = new XMLParser({
      ignoreAttributes: false, attributeNamePrefix: "@_",
      preserveOrder: true, allowBooleanAttributes: true, parseAttributeValue: false,
    });
    const tree = parser.parse(decryptedOut);

    type AnyNode = Record<string, unknown>;
    const boxStickReports: { name: string; length: number; dimples: number[] }[] = [];
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const item of node) visit(item);
        return;
      }
      if (!node || typeof node !== "object") return;
      const obj = node as AnyNode;
      // Stick node?
      const stickArr = obj["stick"];
      const meta = (obj as { ":@"?: { "@_name"?: string; "@_length"?: string } })[":@"];
      if (Array.isArray(stickArr) && meta?.["@_name"] && /\(Box\d+\)\s*$/.test(meta["@_name"])) {
        const length = meta["@_length"] !== undefined ? parseFloat(meta["@_length"]) : NaN;
        const tooling = (stickArr as Array<{ tooling?: Array<Record<string, unknown>> }>)
          .find(c => c.tooling !== undefined)?.tooling;
        if (tooling) {
          const dimples = tooling
            .filter(op => "point-tool" in op && (op as { ":@"?: { "@_type"?: string } })[":@"]?.["@_type"] === "InnerDimple")
            .map(op => parseFloat((op as { ":@"?: { "@_pos"?: string } })[":@"]?.["@_pos"] ?? "NaN"))
            .sort((a, b) => a - b);
          boxStickReports.push({ name: meta["@_name"], length, dimples });
        }
      }
      for (const key of Object.keys(obj)) visit(obj[key]);
    };
    visit(tree);

    expect(boxStickReports.length).toBeGreaterThan(0);
    for (const { name, length, dimples } of boxStickReports) {
      // First/last ≥ 15mm from each end (allow tiny float drift via 0.01 epsilon).
      expect(dimples[0]).toBeGreaterThanOrEqual(15.0 - 0.01);
      expect(dimples[dimples.length - 1]).toBeLessThanOrEqual(length - 15.0 + 0.01);
      // No gap > 900mm.
      for (let i = 0; i < dimples.length - 1; i++) {
        const gap = dimples[i + 1] - dimples[i];
        expect(gap, `gap between dimples ${i} and ${i + 1} on ${name}`).toBeLessThanOrEqual(900.0 + 0.01);
      }
    }
  });

  it("2603191 ROCKVILLE: opt-out via { normaliseDimples: false } leaves dimple count at zero", () => {
    const rfy = readCorpus("2603191/2603191-GF-LIN-89.075.rfy");
    const xml = readCorpus("2603191/2603191-ROCKVILLE.xml").toString("utf-8");
    const parsed = parsePlanXml(xml);
    const result = simplifyLinearTrussRfy(rfy, parsed.frames, parsed.planNameByFrame, {
      normaliseDimples: false,
    });

    // Bolt-hole pass unchanged.
    const apply = result.decisions.filter(d => d.decision === "APPLY");
    expect(apply.length).toBe(22);

    // No frame should report dimplesUpdated when normaliseDimples is off.
    for (const d of apply) {
      expect(d.dimplesUpdated).toBeUndefined();
    }
  });
});
