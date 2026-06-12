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
/** Bucket leftover extras + missing into the 4 gap kinds. Each missing is used once. */
export declare function classifyGaps(extras: RfyToolingOp[], missing: RfyToolingOp[], tol: number): GapItem[];
export declare function scoreOps(ours: RfyToolingOp[], ref: RfyToolingOp[], opts?: ScoreOptions): OpDiffResult;
