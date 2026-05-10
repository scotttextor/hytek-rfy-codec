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
import { type MachineSetup } from "../machine-setups.js";
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
export declare function generateFrameContextOps(frame: RfyFrame, setup?: MachineSetup): Map<string, RfyToolingOp[]>;
/** Append ops from `addOps` (action-defs source) to `legacyOps` (already
 *  populated by the legacy crossings code), but skip any addOp that has a
 *  near-duplicate already in legacyOps.
 *
 *  Crucially: we do NOT dedup WITHIN legacyOps. Detailer reference RFYs
 *  often contain duplicate ops at the same position (e.g. paired
 *  InnerDimples on N nogs from multi-direction crossings). A global dedup
 *  would erroneously collapse them and regress matched count.
 *
 *  Tolerance 0.15mm — same as Detailer's geometry epsilon. Applies to
 *  pos for point ops, startPos+endPos for spanned ops.
 */
export declare function mergeActionDefsOps(legacyOps: RfyToolingOp[], addOps: RfyToolingOp[]): void;
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
/**
 * NLBW5 (2026-05-11): merge adjacent spanned-ops of a given type whose gap is
 * within `gap` mm. Generalises `joinAdjacentLipNotches` to other span types
 * (specifically Swage on NLBW studs, where Detailer fuses sub-panel-nog body
 * crossings — 3-4 nogs at 42mm spacing — into one continuous span).
 *
 * Mutates `stickOps` in-place.
 */
export declare function joinAdjacentSpannedOps(stickOps: RfyToolingOp[], opType: "Swage" | "LipNotch" | "InnerNotch", gap: number): void;
