import type { RfyToolingOp } from "../format.js";

/** A successful pairing of one of our ops to a reference op. */
export interface MatchedPair {
  ours: RfyToolingOp;
  ref: RfyToolingOp;
  /** mm distance: max(|Δstart|,|Δend|) for spanned, |Δpos| for point, 0 for edge. */
  drift: number;
}

export interface ScoreOptions {
  /** Match radius in mm. T1a (machine-functional) = 1.5; T1b (geometry-faithful) = 0.01. */
  toleranceMm?: number;
}

export type GapKind = "missing-rule" | "over-emission" | "wrong-gate" | "position-drift";

export interface GapItem {
  kind: GapKind;
  side: "ours" | "ref";
  op: RfyToolingOp;
  partner?: RfyToolingOp;
  distanceMm?: number;
}

export interface OpDiffResult {
  refTotal: number;
  oursTotal: number;
  matched: MatchedPair[];
  /** Our ops with no reference match. */
  extras: RfyToolingOp[];
  /** Reference ops we failed to produce. */
  missing: RfyToolingOp[];
  /** matched / refTotal, in [0,1]. refTotal 0 → 1. */
  parity: number;
  /** Non-matches classified by cause. */
  gaps: GapItem[];
}

const DEFAULT_TOLERANCE_MM = 1.5;
const WRONG_GATE_WINDOW_MM = 8; // different op at ~same spot = a recipe swap
const DRIFT_WINDOW_MM = 25; // same op, drifted = geometry off

function opKey(op: RfyToolingOp): string {
  return `${op.type}@${op.kind}`;
}

/** Distance between two same-key ops; 0 for positionless edge ops. */
function opDistance(a: RfyToolingOp, b: RfyToolingOp): number {
  if (a.kind === "spanned" && b.kind === "spanned") {
    return Math.max(Math.abs(a.startPos - b.startPos), Math.abs(a.endPos - b.endPos));
  }
  if (a.kind === "point" && b.kind === "point") {
    return Math.abs(a.pos - b.pos);
  }
  return 0; // start/end singletons
}

/** Position of an op for gap-windowing; null for positionless edge ops. */
function opPosition(op: RfyToolingOp): number | null {
  if (op.kind === "spanned") return op.startPos;
  if (op.kind === "point") return op.pos;
  return null;
}

function matchOps(
  ours: RfyToolingOp[],
  ref: RfyToolingOp[],
  tol: number,
): { matched: MatchedPair[]; extras: RfyToolingOp[]; missing: RfyToolingOp[] } {
  const matched: MatchedPair[] = [];
  const extras: RfyToolingOp[] = [];
  const refUsed = new Set<number>();

  for (const o of ours) {
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < ref.length; i++) {
      if (refUsed.has(i)) continue;
      const r = ref[i];
      if (opKey(r) !== opKey(o)) continue;
      if (o.kind === "start" || o.kind === "end") {
        bestIdx = i;
        bestDist = 0;
        break; // singleton per stick — first same-key wins
      }
      const d = opDistance(o, r);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestDist <= tol) {
      matched.push({ ours: o, ref: ref[bestIdx], drift: bestDist });
      refUsed.add(bestIdx);
    } else {
      extras.push(o);
    }
  }

  const missing = ref.filter((_, i) => !refUsed.has(i));
  return { matched, extras, missing };
}

/** Bucket leftover extras + missing into the 4 gap kinds. Each missing is used once. */
export function classifyGaps(
  extras: RfyToolingOp[],
  missing: RfyToolingOp[],
  tol: number,
): GapItem[] {
  const gaps: GapItem[] = [];
  const missUsed = new Set<number>();

  const findPartner = (
    e: RfyToolingOp,
    predicate: (m: RfyToolingOp, d: number) => boolean,
  ): { idx: number; dist: number } | null => {
    const ep = opPosition(e);
    if (ep === null) return null;
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < missing.length; i++) {
      if (missUsed.has(i)) continue;
      const m = missing[i];
      if (m.kind !== e.kind) continue;
      const mp = opPosition(m);
      if (mp === null) continue;
      const d = Math.abs(ep - mp);
      if (predicate(m, d) && d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx >= 0 ? { idx: bestIdx, dist: bestDist } : null;
  };

  for (const e of extras) {
    // 1) same-type drift wins first (geometry)
    let hit = findPartner(e, (m, d) => m.type === e.type && d > tol && d <= DRIFT_WINDOW_MM);
    if (hit) {
      missUsed.add(hit.idx);
      gaps.push({
        kind: "position-drift",
        side: "ours",
        op: e,
        partner: missing[hit.idx],
        distanceMm: hit.dist,
      });
      continue;
    }
    // 2) different-type swap at ~same spot (wrong recipe)
    hit = findPartner(e, (m, d) => m.type !== e.type && d <= WRONG_GATE_WINDOW_MM);
    if (hit) {
      missUsed.add(hit.idx);
      gaps.push({
        kind: "wrong-gate",
        side: "ours",
        op: e,
        partner: missing[hit.idx],
        distanceMm: hit.dist,
      });
      continue;
    }
    // 3) nothing nearby → spurious
    gaps.push({ kind: "over-emission", side: "ours", op: e });
  }

  for (let i = 0; i < missing.length; i++) {
    if (!missUsed.has(i)) gaps.push({ kind: "missing-rule", side: "ref", op: missing[i] });
  }

  return gaps;
}

export function scoreOps(
  ours: RfyToolingOp[],
  ref: RfyToolingOp[],
  opts: ScoreOptions = {},
): OpDiffResult {
  const tol = opts.toleranceMm ?? DEFAULT_TOLERANCE_MM;
  const { matched, extras, missing } = matchOps(ours, ref, tol);
  const refTotal = ref.length;
  const parity = refTotal === 0 ? 1 : matched.length / refTotal;
  const gaps = classifyGaps(extras, missing, tol);
  return { refTotal, oursTotal: ours.length, matched, extras, missing, parity, gaps };
}
