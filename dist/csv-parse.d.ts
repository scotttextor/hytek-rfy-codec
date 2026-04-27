import type { RfyToolingOp } from "./format.js";
export interface CsvComponent {
    frameId: string;
    frameName: string;
    stickName: string;
    profileCode: string;
    metricLabel: string;
    gauge: string;
    role: string;
    orientation: "LEFT" | "RIGHT";
    qty: number;
    lengthA: number;
    widthA: number;
    heightA: number;
    widthB: number;
    heightB: number;
    pitch: number;
    tooling: RfyToolingOp[];
}
export interface CsvPlan {
    jobId: string;
    jobNum: string;
    packId: string;
    components: CsvComponent[];
}
/** Split a CSV file into its DETAILS-delimited plan sections. */
export declare function parseCsv(csv: string): CsvPlan[];
/** Validate that all tool types in the CSV are recognised. */
export declare function validateCsv(csv: string): string[];
