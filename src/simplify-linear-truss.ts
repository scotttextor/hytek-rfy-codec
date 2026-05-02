// Linear-truss RFY simplifier — replaces FrameCAD's BOLT HOLES on -LIN- truss
// web members with a centreline-intersection rule (3 holes per stick at every
// pairwise crossing). See spec at docs/superpowers/specs/2026-05-02-...
import { decryptRfy, encryptRfy } from "./crypto.js";
import type { ParsedFrame } from "./synthesize-plans.js";
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
