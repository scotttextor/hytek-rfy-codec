import type { RfyToolingOp } from "./format.js";
import { type MachineSetup } from "./machine-setups.js";
export interface Vec3 {
    x: number;
    y: number;
    z: number;
}
export interface Vec2 {
    x: number;
    y: number;
}
export interface ParsedStickProfile {
    web: number;
    lFlange: number;
    rFlange: number;
    lLip: number;
    rLip: number;
    shape: string;
    gauge: string;
}
export interface ParsedStick {
    name: string;
    start: Vec3;
    end: Vec3;
    flipped: boolean;
    profile: ParsedStickProfile;
    usage: string;
    tooling: RfyToolingOp[];
    /** XML <stick type="..."> attribute, e.g. "Stud", "Plate". Optional — used by simplify-linear-truss gate. */
    type?: string;
    /** Sheet gauge as XML string, e.g. "0.75" / "0.95". Optional — used by simplify-linear-truss profile gate. */
    gauge?: string;
}
export interface ParsedFrame {
    name: string;
    envelope: [Vec3, Vec3, Vec3, Vec3];
    sticks: ParsedStick[];
    /** XML <frame type="..."> attribute, e.g. "Truss", "InternalWall". Optional — used by simplify-linear-truss gate. */
    type?: string;
    /** Optional fastener list — populated when frame is a downstream-augmented copy. */
    fasteners?: unknown[];
    /** Optional fastener count — populated when frame is a downstream-augmented copy. */
    fastenerCount?: number;
    /** Optional pre-computed tool actions — populated when frame is a downstream-augmented copy. */
    toolActions?: unknown[];
    /** Optional frame length (mm). */
    length?: number;
    /** Optional frame built height (mm). */
    builtHeight?: number;
    /** Plan profile label, e.g. "GF-LIN-89.075". Optional — used downstream when carrying plan context with the frame. */
    profileLabel?: string;
    /** Truss web-pitch (mm). */
    pitchMm?: number;
}
export interface ParsedPlan {
    name: string;
    frames: ParsedFrame[];
}
export interface ParsedProject {
    name: string;
    jobNum: string;
    client: string;
    date: string;
    plans: ParsedPlan[];
}
export interface SynthesizePlansOptions {
    /**
     * HYTEK machine setup to use for tooling rules (Chamfer Tolerance,
     * EndClearance, BraceToDimple, etc.). If not provided, auto-resolved
     * from the first stick's profile web. See `machine-setups.ts`.
     */
    machineSetup?: MachineSetup;
    /** Override project name. Defaults to project.name. */
    projectName?: string;
    /** Override jobnum. Defaults to project.jobNum. */
    jobNum?: string;
    /** Override client attribute. */
    client?: string;
    /** Override date. */
    date?: string;
    /** If true, log warnings instead of throwing on stick out-of-plane / non-rectangular envelope. */
    lenient?: boolean;
}
export interface SynthesizePlansResult {
    rfy: Buffer;
    xml: string;
    planCount: number;
    frameCount: number;
    stickCount: number;
}
export interface FrameBasis {
    origin: Vec3;
    right: Vec3;
    up: Vec3;
    normal: Vec3;
    width: number;
    height: number;
}
/**
 * Derive the frame's local 2D basis from its 4-vertex envelope.
 *
 * Steps:
 *   right = (V1 - V0).normalised
 *   up    = (V3 - V0) Gram-Schmidt'd against right, normalised
 *   normal = right × up  (right-handed)
 *
 * Validations (throw unless options.lenient):
 *   - V1 != V0, V3 != V0 (degenerate envelope)
 *   - V3 - V0 not parallel to right (would zero out 'up')
 *   - V2 ≈ V1 + (V3 - V0) within 1mm (envelope must be a planar parallelogram;
 *     in practice every Detailer envelope is a true rectangle with ‖right ⊥ up)
 */
export declare function deriveFrameBasis(envelope: [Vec3, Vec3, Vec3, Vec3], lenient?: boolean): FrameBasis;
/** Project a world-3D point into the frame's local 2D elevation coordinates. */
export declare function projectToFrameLocal(p: Vec3, basis: FrameBasis): Vec2;
/**
 * Build the transformationmatrix string for a frame's basis.
 *
 * Convention (row-vector / DirectX, verified against Detailer L32 reference):
 *   row1 = (right.x, right.y, right.z, 0)     ← local +X axis in world
 *   row2 = (up.x,    up.y,    up.z,    0)     ← local +Y axis in world
 *   row3 = (normal.x,normal.y,normal.z,0)     ← local +Z axis in world
 *   row4 = (origin.x,origin.y,origin.z,1)     ← translation
 *
 * This is the matrix M such that  world = local · M  (row-vector multiplication).
 * Verified by decomposing Detailer's L32 matrix:
 *   right=(0,-1,0)  up=(0,0,1)  normal=(-1,0,0)  origin=(59147.54,20557.25,0)
 * → up is vertical (correct). Column form would give up=(-1,0,0) (wrong).
 */
export declare function transformationMatrixString(basis: FrameBasis): string;
/**
 * Coerce an arbitrary polygon envelope (3+ vertices, possibly non-planar) into
 * a 4-vertex parallelogram suitable for `deriveFrameBasis`.
 *
 * Used by Roof Panel (RP) frames whose envelopes can be 5/6-vertex hip/gable
 * polygons or 4-vertex trapezoids in 3D, neither of which satisfies the
 * V2 ≈ V1 + (V3-V0) parallelogram invariant.
 *
 * Strategy:
 *   1. Pick V0 = first input vertex (preserves Detailer's local origin choice).
 *   2. Pick the dominant horizontal direction in the polygon as `right`:
 *        right = (V[1] - V[0]) normalised
 *   3. Determine `up` by Gram-Schmidt against the diagonal V[N-1] - V[0]
 *      (last vertex relative to first — typically the "top" edge in CCW order).
 *   4. Compute axis-aligned bounding box in the (right, up) basis over ALL
 *      input vertices, then emit the rectangle's 4 corners as V0..V3.
 *
 * The resulting rectangle envelope encloses every original vertex, so any
 * stick that lies inside the original polygon also lies inside the rectangle.
 * Stick projection still uses the same `right`/`up` axes, so 2D positions
 * are preserved up to a translation by `(uMin, vMin)`.
 *
 * Returns null if the polygon is degenerate (<3 vertices, or all vertices
 * coincident along one axis).
 */
export declare function coerceEnvelopeToRect(vertices: Vec3[]): [Vec3, Vec3, Vec3, Vec3] | null;
export declare function synthesizeRfyFromPlans(project: ParsedProject, options?: SynthesizePlansOptions): SynthesizePlansResult;
