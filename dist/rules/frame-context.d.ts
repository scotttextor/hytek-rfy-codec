/**
 * Frame-context tooling generator.
 *
 * Per-stick rules in src/rules/table.ts only cover universal end-anchored ops.
 * The biggest remaining ops are at "crossings" — where two sticks intersect
 * in the frame:
 *
 *   - Top/bottom plate gets LIP NOTCH + DIMPLE pair at every stud's x-coord
 *   - Stud gets LIP NOTCH + DIMPLE pair at every nog's y-coord
 *   - Nog gets WEB+LIP NOTCH + DIMPLE pair at every stud's x-coord
 *
 * Crossings are detected from the sticks' outlineCorners (elevation-graphics).
 * Each stick is approximately a rectangle in 2D frame coords; intersections
 * are where the rectangles overlap.
 */
import type { RfyToolingOp, RfyFrame, RfyStick } from "../format.js";
export interface BoundingBox {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    cx: number;
    cy: number;
}
export interface StickWithBox {
    stick: RfyStick;
    role: string;
    box: BoundingBox;
    /** True if stick is laid horizontally in the frame (plates, nogs, lintels). */
    horizontal: boolean;
}
/** Compute a stick's bounding box in 2D frame coords. */
export declare function computeBox(stick: RfyStick): BoundingBox | null;
/** Stick role = name prefix (e.g. "S", "T", "B", "N", "Kb"). */
export declare function roleFromName(name: string): string;
/** Layout a frame: assign each stick a bounding box and orientation. */
export declare function layoutFrame(frame: RfyFrame): StickWithBox[];
/**
 * Generate frame-context tooling ops for every stick in the frame.
 * Returns: Map<stickName, RfyToolingOp[]>
 *
 * The per-stick base rules (table.ts) handle end-anchored ops. Frame-context
 * rules add LIP NOTCH + DIMPLE pairs at crossings.
 */
export declare function generateFrameContextOps(frame: RfyFrame): Map<string, RfyToolingOp[]>;
/**
 * Mutates `stickOps` in-place: merges any LipNotch ops whose endPos is within
 * `gap` mm of the next LipNotch's startPos into a single wider notch.
 *
 * Detailer's behaviour (verified 2026-05-01 against HG260044 GF-TIN PC7-1/B1):
 * adjacent W crossings on a chord get joined into one continuous notch rather
 * than multiple narrow notches. E.g. 3 webs at x=70, 130, 190 with 45mm
 * individual spans → one 156mm-wide notch from 47..213 instead of 3 separate.
 *
 * Other op types (Dimple, Swage, etc.) are untouched.
 */
export declare function joinAdjacentLipNotches(stickOps: RfyToolingOp[], gap: number): void;
