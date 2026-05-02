// Linear-truss RFY simplifier — replaces FrameCAD's BOLT HOLES on -LIN- truss
// web members with a centreline-intersection rule (3 holes per stick at every
// pairwise crossing). See spec at docs/superpowers/specs/2026-05-02-...
import { decryptRfy, encryptRfy } from "./crypto.js";
import type { ParsedFrame, ParsedStick } from "./synthesize-plans.js";
import { XMLParser, XMLBuilder } from "fast-xml-parser";

// ---------- Geometry ----------

export interface Segment3 {
  readonly start: readonly [number, number, number];
  readonly end:   readonly [number, number, number];
}

/** Intersect two segments projected to the XZ plane. Returns parametric `t`/`u`
 *  along each segment and the intersection point. `null` if the lines are
 *  parallel (denom < 1e-9) or the intersection falls outside both segments
 *  beyond the slack tolerance (in mm). */
export function lineIntersectionXZ(
  a: Segment3,
  b: Segment3,
  slackMm: number
): { pt: [number, number]; t: number; u: number } | null {
  const x1 = a.start[0], z1 = a.start[2];
  const x2 = a.end[0],   z2 = a.end[2];
  const x3 = b.start[0], z3 = b.start[2];
  const x4 = b.end[0],   z4 = b.end[2];
  const denom = (x1 - x2) * (z3 - z4) - (z1 - z2) * (x3 - x4);
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((x1 - x3) * (z3 - z4) - (z1 - z3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (z1 - z3) - (z1 - z2) * (x1 - x3)) / denom;
  const L1 = Math.hypot(x2 - x1, z2 - z1);
  const L2 = Math.hypot(x4 - x3, z4 - z3);
  const stA = L1 > 0 ? slackMm / L1 : 0;
  const stB = L2 > 0 ? slackMm / L2 : 0;
  if (t < -stA || t > 1 + stA) return null;
  if (u < -stB || u > 1 + stB) return null;
  return { pt: [x1 + t * (x2 - x1), z1 + t * (z2 - z1)], t, u };
}

/** Euclidean length in the XZ plane. Y is ignored — Linear trusses are
 *  fabricated flat in the XZ wall plane and the truss-frame Y is constant. */
export function stickLength3D(s: Segment3): number {
  return Math.hypot(s.end[0] - s.start[0], s.end[2] - s.start[2]);
}

// ---------- Types ----------

export interface SimplifyLinearTrussOptions {
  rewrite?: boolean;
  excludeFrames?: ReadonlySet<string>;
  intersectionSlackMm?: number;
  endZoneMm?: number;
  apexCollisionMm?: number;
  profileGate?: ProfileGate;
}

export interface ProfileGate {
  web: number; rFlange: number; lFlange: number; lLip: number; rLip: number;
  shape: "C" | "S"; gauge: string;
}

/** HYTEK Linear-truss default profile: 89×41 asymmetric C ("LC"), 0.75mm BMT.
 *  lFlange=38, rFlange=41 is intentional asymmetry; both lips are 11mm.
 *  These values gate every Linear-truss frame submitted to the simplifier. */
export const DEFAULT_PROFILE_GATE: ProfileGate = {
  web: 89, rFlange: 41, lFlange: 38, lLip: 11, rLip: 11, shape: "C", gauge: "0.75",
};

export interface SimplifyDecision {
  frame: string;
  decision: "APPLY" | "SKIP" | "FALLBACK";
  reason: string;
  modifiedSticks?: number;
  newBoltCount?: number;
  fallbackSticks?: string[];
}

export interface SimplifyResult {
  rfy: Buffer;
  decisions: SimplifyDecision[];
  appliedFrames: string[];
}

type GateResult = { ok: true } | { ok: false; reason: string };

// ---------- Profile gate (4-layer detection) ----------

export function isLinearTruss(
  frame: ParsedFrame,
  planName: string,
  gate: ProfileGate = DEFAULT_PROFILE_GATE,
): GateResult {
  if (frame.type === undefined) return { ok: false, reason: "frame type missing (parser did not populate frame.type)" };
  if (frame.type !== "Truss") return { ok: false, reason: `frame type "${frame.type}" not Truss` };
  if (!/-LIN-/i.test(planName)) return { ok: false, reason: `plan "${planName}" not Linear` };
  for (const s of frame.sticks) {
    const p = s.profile;
    const wrongProfile =
      p.web !== gate.web || p.rFlange !== gate.rFlange || p.lFlange !== gate.lFlange ||
      p.lLip !== gate.lLip || p.rLip !== gate.rLip || p.shape !== gate.shape;
    if (wrongProfile) {
      return { ok: false, reason: `${s.name} wrong profile (${p.web}x${p.rFlange} ${p.shape})` };
    }
    if ((s.gauge ?? "").trim() !== gate.gauge.trim()) {
      return { ok: false, reason: `${s.name} wrong gauge (${s.gauge ?? "missing"})` };
    }
  }
  const hasChord = frame.sticks.some(s => /chord/i.test(s.usage));
  const hasWeb   = frame.sticks.some(s => /web/i.test(s.usage));
  if (!hasChord) return { ok: false, reason: "no chord members" };
  if (!hasWeb)   return { ok: false, reason: "no web members" };
  return { ok: true };
}

// ---------- Validator: zero-length stick ----------

const ZERO_LENGTH_TOL_MM = 1e-3;

export function guardZeroLength(sticks: readonly ParsedStick[]): GateResult {
  for (const s of sticks) {
    const seg: Segment3 = {
      start: [s.start.x, s.start.y, s.start.z],
      end:   [s.end.x,   s.end.y,   s.end.z],
    };
    if (stickLength3D(seg) < ZERO_LENGTH_TOL_MM) {
      return { ok: false, reason: `zero-length stick ${s.name}` };
    }
  }
  return { ok: true };
}

// Re-export ParsedStick for convenience
export type { ParsedStick };
