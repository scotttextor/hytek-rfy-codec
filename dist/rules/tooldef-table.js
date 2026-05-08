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
export const TOOLDEFS = {
    // High-confidence spanned, fixed length 45mm modal
    lipnotch: {
        opType: "otSpannedTool",
        lengthMm: 45,
        codecToolType: "LipNotch",
        confidence: "high",
    },
    rl_lipnotch: {
        opType: "otSpannedTool",
        lengthMm: 45,
        codecToolType: "LipNotch",
        confidence: "high",
        corner: "RL",
    },
    ll_lipnotch: {
        opType: "otSpannedTool",
        lengthMm: 45,
        codecToolType: "LipNotch",
        confidence: "high",
        corner: "LL",
    },
    rh_lipnotch: {
        opType: "otSpannedTool",
        lengthMm: 45,
        codecToolType: "LipNotch",
        confidence: "high",
        corner: "RH",
    },
    lh_lipnotch: {
        opType: "otSpannedTool",
        lengthMm: 45,
        codecToolType: "LipNotch",
        confidence: "high",
        corner: "LH",
    },
    // Web-notch — codec ToolType InnerNotch, modal 45mm
    webnotch: {
        opType: "otSpannedTool",
        lengthMm: 45,
        codecToolType: "InnerNotch",
        confidence: "high",
    },
    // Swage — modal 39mm but bucket-2 is 45mm; we keep 45mm as the nominal
    // Lengthh1P (matching the lipNotchToolLength path) and rely on the
    // swage-clearance-trim rules in frame-context.ts to emit the 39mm variant
    // when adjacent to caps. 39mm here would over-shrink the standard cases.
    swage: {
        opType: "otSpannedTool",
        lengthMm: 45,
        codecToolType: "Swage",
        confidence: "high",
    },
    // Geometry-driven flanges — span = src..dst, NEVER use a fixed length
    leftflange: {
        opType: "otSpannedTool",
        lengthMm: "geometry",
        codecToolType: "LeftFlange",
        confidence: "high",
    },
    rightflange: {
        opType: "otSpannedTool",
        lengthMm: "geometry",
        codecToolType: "RightFlange",
        confidence: "high",
    },
};
/** Lookup helper — returns null for unknown / suppressed verbs. */
export function getToolDef(verb) {
    return TOOLDEFS[verb] ?? null;
}
