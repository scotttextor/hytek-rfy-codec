/**
 * Frame-flag bitmask — `param_3` of Detailer's `MakeOperations` /
 * `FUN_00538b00` real-classifier dispatch.
 *
 * Source of truth: `docs/detailer-rule-decoded.md` §3 ("`param_3` — The flag
 * bitmask"). Detailer threads an 11-bit ushort through the joint classifier;
 * different bits flip whole classification branches (e.g. 0x200 = BackToBack
 * forces "None" / no ops emitted).
 *
 * This module exposes the bit map plus a `deriveFrameFlags()` derivation
 * function that maps plan / frame metadata onto bits where we can. Where the
 * decoded report is ambiguous or we don't yet have the signal, the bit
 * defaults to `false` with a TODO.
 *
 * Wiring this into the rules engine is intentionally NOT done here — that's
 * a downstream task once the per-classification recipes are recovered. For
 * now `deriveFrameFlags()` is callable + unit-tested in isolation.
 */
/** Bit positions for the 10 documented flags. `forSplicing` is held in
 *  `FrameFlags` but its bit is not pinned — see field doc-comment. */
export const FRAME_FLAG_BITS = {
    forReversed: 0x0001,
    forSuppressSwage: 0x0002,
    forLipNotchedCorners: 0x0004,
    forDualTrack: 0x0020,
    forAsymOverSwaged: 0x0040,
    forWebIntersection: 0x0080,
    forTabbed: 0x0100,
    forBackToBack: 0x0200,
    forLayer2: 0x0400,
    forBoxing: 0x0800,
};
/** All-false default — every bit cleared. Useful as a base for incremental
 *  derivation and as the safe fallback when no signal is available. */
export function emptyFrameFlags() {
    return {
        forReversed: false,
        forSuppressSwage: false,
        forLipNotchedCorners: false,
        forDualTrack: false,
        forAsymOverSwaged: false,
        forWebIntersection: false,
        forTabbed: false,
        forBackToBack: false,
        forLayer2: false,
        forBoxing: false,
        forSplicing: false,
    };
}
/** Pack a `FrameFlags` record into the 16-bit ushort that mirrors `param_3`
 *  of `FUN_00538b00`. `forSplicing` is omitted from the packing because its
 *  bit is not yet known. */
export function packFrameFlags(flags) {
    let v = 0;
    for (const [k, bit] of Object.entries(FRAME_FLAG_BITS)) {
        if (flags[k])
            v |= bit;
    }
    return v;
}
/** Plan-type extracted from the trailing `-XXX-` token of a HYTEK plan
 *  name. Examples: `GF-LIN-89.075` → `LIN`, `PK1-GF-TB2B-70.075` → `TB2B`,
 *  `GF-LBW-89.095` → `LBW`. Falls back to empty string when the regex
 *  doesn't match. */
function extractPlanType(planName) {
    const m = planName.match(/-([A-Z0-9]+)-\d/i);
    return m ? m[1].toUpperCase() : "";
}
/** Derive the `FrameFlags` for a frame from its plan / frame / plan-name
 *  metadata. Mirrors the role of Detailer's caller of `FUN_00538b00`,
 *  which builds the param_3 bitmask before invoking the classifier.
 *
 *  Currently confident-derivable mappings (per the decoded report and our
 *  plan naming convention):
 *
 *  - `forBackToBack` ← `plan_type === 'TB2B'` (HYTEK "Back-to-Back" trusses,
 *    where Detailer's classifier returns "None" on identical sticks pairs —
 *    matches the early-exit at FUN_00538b00 line 170).
 *
 *  Everything else stays `false` with a TODO until either:
 *  (a) the decoded report's bit positions are confirmed against the runtime
 *      `ActionDefsManager` dump, or
 *  (b) we have a clean plan-name / frame-shape signal for the bit.
 *
 *  Specific deferred mappings (see the decoded report §3 and §6 for context):
 *  - `forBoxing` (0x800) — FRAMA proprietary system. Per §6.1 the report
 *    notes "FRM / FRAMA plan suffix → set forBoxing (likely Frama)". HYTEK
 *    doesn't currently fab FRAMA jobs, so no reliable trigger; left false.
 *  - `forDualTrack` (0x20) — driven by `stick.SwageClearance` (per-stick
 *    section flag) rather than plan-level data; needs MachineSetup lookup
 *    that this scaffold deliberately skips.
 *  - `forLipNotchedCorners` (0x04) — inferred from joint-corner geometry,
 *    not plan name; needs the classifier replica to surface.
 *  - `forTabbed` (0x100) / `forTabHoles` (0x80) — header-cap joints; needs
 *    H-stick role + plan-name discrimination we don't have yet.
 *  - `forSplicing` — bit position not in the decoded report's table; needs
 *    a Frida hook to confirm.
 *  - `forReversed` (0x01) / `forSuppressSwage` (0x02) /
 *    `forOverSwagedAsymmetric` (0x40) / `forOnFlat2` (0x400) — geometric or
 *    runtime signals; not plan-level.
 */
export function deriveFrameFlags(planType, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for future signals
frameType, planName) {
    const flags = emptyFrameFlags();
    // forBackToBack — high-confidence: HYTEK TB2B plans are exactly Detailer's
    // back-to-back joint pattern. Setting this bit makes the classifier return
    // "None" on identical-back-to-back stick pairs, which suppresses the
    // bogus ops the codec currently emits on TB2B SS joints.
    const planTypeUpper = (planType || extractPlanType(planName)).toUpperCase();
    if (planTypeUpper === "TB2B") {
        flags.forBackToBack = true;
    }
    // forBoxing — TODO. Decoded report says 0x800 = FRAMA proprietary system,
    // not TB2B. We do not currently detect FRAMA plans (HYTEK-specific).
    // Leaving false until we have a plan-name signal (FRM/FRAMA suffix).
    // forDualTrack — TODO. Per §3 of the decoded report this is per-stick
    // SwageClearance, not a plan-level flag. Will be derived in the per-stick
    // classifier replica, not here.
    // forSplicing / forTabbed / forTabHoles / forLipNotchedCorners /
    // forReversed / forSuppressSwage / forOverSwagedAsymmetric / forOnFlat2 —
    // TODO: defer to follow-up agent that wires FrameFlags into the rules.
    return flags;
}
