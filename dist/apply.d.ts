/**
 * Surgically apply CSV edits to a seed RFY file, preserving every
 * non-CSV detail (graphics, 3D, GUIDs, transformation matrices).
 *
 * Strategy:
 *  - Decrypt seed RFY to XML
 *  - Parse XML into preserve-order tree
 *  - For each <plan> whose name matches a CSV plan, for each <stick>
 *    whose name matches a CSV component, overwrite the stick's
 *    <profile> and <tooling> children with CSV-derived content.
 *  - Re-emit XML tree, deflate, encrypt with fresh (or provided) IV.
 *
 * Unmatched CSV entries (stick not in seed) are skipped and reported.
 * Unmatched tree sticks (in seed but not in CSV) are left untouched.
 */
export interface ApplyResult {
    rfy: Buffer;
    unmatchedComponents: string[];
    touched: number;
}
export declare function applyCsvToRfy(seedRfy: Buffer, csv: string, iv?: Buffer): ApplyResult;
