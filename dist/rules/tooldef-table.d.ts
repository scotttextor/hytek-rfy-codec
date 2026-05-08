/**
 * TToolDef table — per-verb opType + length data extracted from FrameCAD
 * Detailer's `Tooling.dll`.
 *
 * Source: `docs/cracked/tooldef-table.json` (extracted via PE-scan + 385-pair
 * empirical corpus mining, 134,858 ground-truth ops).
 *
 * Use: replaces the centred-span heuristic in action-emit.ts. For each verb
 * the action-defs pipeline produces, we now know:
 *   - opType: spanned vs point vs start/end
 *   - lengthMm: the empirically-modal width (nominal Lengthh1P) or "geometry"
 *     when the span is driven by source/destination token positions.
 *
 * Confidence levels:
 *   - "high":   ≥230 corpus samples and a clean mode (or geometry-driven)
 *   - "medium": present in PE table but no/few corpus samples
 *   - "skip":   sentinels or tools we deliberately don't emit
 *
 * Notes:
 *   - LipNotch length actually varies 48–75mm by profile. Use the existing
 *     `lipNotchToolLength(setup)` helper for a profile-aware length; this
 *     45mm modal is the corpus-wide fallback.
 *   - Side-aware lipnotch variants (rl_/ll_/rh_/lh_) all resolve to the same
 *     LipNotch ToolType — the corner identity (CopyType in Detailer) is
 *     not represented in our op shape.
 *   - Flange verbs are GEOMETRY-DRIVEN — span = src..dst token positions.
 *     A fixed-length emit there would be wrong.
 *   - Point ops (Bolt, InnerDimple, InnerService, ScrewHoles, Web) and
 *     Chamfer (otStartTool/otEndTool) are NOT in the action-defs verb set —
 *     they're emitted by other paths in frame-context.ts.
 */
export type ToolOpType = "otPointTool" | "otSpannedTool" | "otStartTool" | "otEndTool";
export interface ToolDef {
    /** Detailer's TToolDef.OperationType. */
    opType: ToolOpType;
    /** Nominal Lengthh1P in mm, or "geometry" when src..dst positions drive
     *  the span. */
    lengthMm: number | "geometry";
    /** Codec ToolType this verb maps to. */
    codecToolType: string;
    /** Mining confidence — "high" means ≥230 samples. */
    confidence: "high" | "medium" | "low";
    /** Corner-bias for side-aware variants — informational only (not consumed
     *  by the emitter today; reserved for when CopyType is represented in
     *  the op shape). */
    corner?: "RL" | "LL" | "RH" | "LH";
}
/**
 * Verb → ToolDef map.
 *
 * Verbs not present here (`tab`, `webtabholes`, `null`, `bad`,
 * `leftpartialflange`, `rightpartialflange`) are intentionally absent →
 * the emitter treats them as suppressed.
 *
 * `leftpartialflange` / `rightpartialflange` are present in the action-defs
 * dictionary but have 0 samples in the 385-pair MISSING corpus — meaning
 * either the codec already emits them identically (no gap to close) or
 * both sides skip. Kept off the table for now — the existing legacy emit
 * path in action-emit.ts handles them.
 */
export declare const TOOLDEFS: Record<string, ToolDef>;
/** Lookup helper — returns null for unknown / suppressed verbs. */
export declare function getToolDef(verb: string): ToolDef | null;
