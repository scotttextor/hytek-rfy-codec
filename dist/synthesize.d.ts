/**
 * Synthesize a minimal valid RFY from a Detailer-style Rollforming CSV alone
 * (no seed RFY required). The output contains only the tooling/profile data
 * the rollformer needs — graphics, 3D mesh, transformation matrices, and
 * design GUIDs are omitted.
 *
 * Caveats:
 *   - Detailer's UI may display the resulting file oddly (no 3D view).
 *   - Rollformer acceptance is expected but must be validated on a real
 *     machine during planned downtime.
 *
 * Source of truth is the apply-to-seed path for anything that must round-
 * trip through Detailer; this path is for CSV-only inputs.
 */
export interface SynthesizeOptions {
    /** Override the auto-derived project name (defaults to CSV's first job/project token). */
    projectName?: string;
    /** Override jobnum (defaults to the CSV's DETAILS first field). */
    jobNum?: string;
    /** Override client attribute. */
    client?: string;
    /** Override date (ISO YYYY-MM-DD); defaults to today. */
    date?: string;
}
export interface SynthesizeResult {
    rfy: Buffer;
    xml: string;
    planCount: number;
    frameCount: number;
    stickCount: number;
}
export declare function synthesizeRfyFromCsv(csv: string, options?: SynthesizeOptions): SynthesizeResult;
