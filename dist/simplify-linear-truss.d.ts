import type { ParsedFrame, ParsedStick } from "./synthesize-plans.js";
export interface Segment3 {
    readonly start: readonly [number, number, number];
    readonly end: readonly [number, number, number];
}
/** Intersect two segments projected to the XZ plane. Returns parametric `t`/`u`
 *  along each segment and the intersection point. `null` if the lines are
 *  parallel (denom < 1e-9) or the intersection falls outside both segments
 *  beyond the slack tolerance (in mm). */
export declare function lineIntersectionXZ(a: Segment3, b: Segment3, slackMm: number): {
    pt: [number, number];
    t: number;
    u: number;
} | null;
/** Euclidean length in the XZ plane. Y is ignored — Linear trusses are
 *  fabricated flat in the XZ wall plane and the truss-frame Y is constant. */
export declare function stickLength3D(s: Segment3): number;
export interface SimplifyLinearTrussOptions {
    rewrite?: boolean;
    excludeFrames?: ReadonlySet<string>;
    intersectionSlackMm?: number;
    endZoneMm?: number;
    apexCollisionMm?: number;
    profileGate?: ProfileGate;
}
export interface ProfileGate {
    web: number;
    rFlange: number;
    lFlange: number;
    lLip: number;
    rLip: number;
    shape: "C" | "S";
    gauge: string;
}
/** HYTEK Linear-truss default profile: 89×41 asymmetric C ("LC"), 0.75mm BMT.
 *  lFlange=38, rFlange=41 is intentional asymmetry; both lips are 11mm.
 *  These values gate every Linear-truss frame submitted to the simplifier. */
export declare const DEFAULT_PROFILE_GATE: ProfileGate;
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
type GateResult = {
    ok: true;
} | {
    ok: false;
    reason: string;
};
export declare function isLinearTruss(frame: ParsedFrame, planName: string, gate?: ProfileGate): GateResult;
export declare function guardZeroLength(sticks: readonly ParsedStick[]): GateResult;
export declare function assertEndZone(positions: readonly number[], stickLength: number, endZoneMm: number): {
    safe: number[];
    violations: number[];
};
/** Sort positions ascending and drop any that fall within `apexCollisionMm`
 *  of the previously-kept position. Caller provides the keep-priority by
 *  the array's natural ascending order — first-seen wins. */
export declare function dedupApex(positions: readonly number[], apexCollisionMm: number): {
    kept: number[];
    merged: number[];
};
/** When `lineIntersectionXZ` returns null because the centrelines are parallel,
 *  check whether they're actually co-linear-within-tolerance (= a back-to-back
 *  paired box member). If yes, emit a synthetic intersection at the midpoint
 *  of the overlap. If no overlap or truly distinct parallel sticks, returns null. */
export declare function handleParallelPair(a: Segment3, b: Segment3, coincidenceMm: number): {
    posOnA: number;
    posOnB: number;
} | null;
export declare class RfyVersionMismatch extends Error {
    readonly found: string | null;
    constructor(found: string | null);
}
export declare function assertRfyVersion(rfyXml: string): void;
export type { ParsedStick };
export declare function simplifyLinearTrussRfy(rfyBytes: Buffer, frames: readonly ParsedFrame[], planNameByFrame: ReadonlyMap<string, string>, opts?: SimplifyLinearTrussOptions): SimplifyResult;
