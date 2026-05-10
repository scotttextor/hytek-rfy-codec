/**
 * Tooling-rule engine — types.
 *
 * The rule engine takes a stick description (role, profile, length, frame
 * context) and produces the list of tooling operations Detailer would
 * place on it.
 *
 * Rules are derived statistically from real Detailer outputs (see
 * research/output/rules-derived.txt) and encoded as data here.
 */
import type { RfyToolingOp, ToolType } from "../format.js";
/**
 * Per-project Detailer configuration — a small set of switches that change
 * which rules fire depending on the source project's machine setup or
 * builder profile. Plumbed through `SynthesizePlansOptions.projectConfig`
 * (and synonymously via `StickContext.projectConfig`) so rule predicates
 * can read it.
 *
 * Rationale (2026-05-09): Two prior agents (C2 + SVC) hit the same wall —
 * the Chamfer @end and Kb-InnerService rules verified on HG260001 LBW
 * over-emit on HG260023 PK6 LBW (uniform-flipped Kbs) and under-emit on
 * HG260044 LBW + NLBW (also uniform-flipped Kbs). The discriminator is
 * **per-frame**: frames with all-Kbs-flipped-the-same-way emit BOTH
 * end-Chamfers regardless of `inputFlipped`, while frames with mixed-
 * flipped Kbs use the XNOR rule. We capture this as a `kbChamferMode`
 * that the diff harness sets per-frame from the simple "uniform-vs-mixed"
 * signal in the input XML.
 *
 * This config is **opt-in / backward-compat**. Un-configured projects
 * keep the existing XNOR @end Chamfer behaviour and the legacy 28°
 * W-Chamfer threshold — no regressions on HG260001/HG260023.
 */
export interface ProjectConfig {
    /**
     * How to emit Kb @end Chamfers on cripple-stud sticks.
     *
     *   "xnor-paired"        — fires when `inputFlipped === kbTopAttached`
     *                          (default; matches HG260001/HG260023 mixed-flipped
     *                          frames). Emits 1 chamfer per Kb.
     *   "uniform-both-ends"  — fires unconditionally on every Kb regardless of
     *                          flipped/topAttached. Use when the frame's Kbs
     *                          all share the same flipped value (HG260044 LBW
     *                          + NLBW). Emits 2 chamfers per Kb (start + end).
     *
     * The Chamfer @start rule fires unconditionally in BOTH modes — it is
     * the @end rule that varies. The diff harness picks the mode per-frame
     * by counting distinct `flipped` values among Kb sticks in the frame
     * (uniform = 1 distinct value; mixed = 2+).
     */
    kbChamferMode?: "xnor-paired" | "uniform-both-ends";
    /**
     * Minimum stick angle (degrees from vertical) for W (wall-brace) sticks
     * to receive `Chamfer @start` and `Chamfer @end`.
     *
     * Default: 28 (verified vs HG260001 LBW W's). HG260044 LBW frames have
     * shorter brace runs at ~23-24° that DO get chamfered in Detailer's
     * reference RFY — projects targeting HG260044 should set this to ~22 to
     * include them. The diff harness sets this per-jobnum heuristic.
     *
     * Set to a very high value (e.g. 1e9) to disable W-Chamfers entirely.
     */
    wChamferAngleThreshold?: number;
    /**
     * Per-project offset applied to Kb-on-horizontal-Service-crossing
     * `InnerService` positions. The base formula in the diff harness is
     *   pos = |zh - z_plate| / sinθ - 10
     * Empirically the `-10` term is project-dependent: HG260001 wants
     * approximately the default, HG260044 wants ~+9mm relative shift, and
     * HG260023 wants ~+16mm. Plumbed for completeness — the @end Chamfer
     * fix is the higher-leverage change.
     *
     * Default: 0 (no extra shift; preserves the existing -10 baseline).
     */
    kbInnerServiceOffsetExtra?: number;
    /**
     * NLBW3 (2026-05-10): How to decide which end of a sub-panel infill Nog
     * gets InnerNotch+LipNotch caps (instead of the default Swage caps).
     *
     *   "interior-notch"     — HG260044 polarity. Detailer caps every endpoint
     *                          that touches an INTERIOR regular Stud (not
     *                          TrimStud, not perimeter, not corner-cluster
     *                          within 100mm of perimeter), gated on a
     *                          frame-context signal (frame has any tight
     *                          stud-pair within 200mm OR this nog is part
     *                          of a >=2-stack of sub-panel nogs sharing the
     *                          same span studs). Length < 200mm short-
     *                          circuits to no-Notch (filler nog).
     *   "tight-cluster-notch" — HG260001 polarity. Detailer caps endpoints
     *                          that touch a stud with a TIGHT NEIGHBOUR
     *                          (<200mm centreline distance) sitting OUTSIDE
     *                          the nog span — i.e. the touched stud is the
     *                          boundary of a tight stud cluster (jamb /
     *                          opening edge / corner). Perimeter studs
     *                          always get Swage.
     *
     * Default: "interior-notch" (preserves NLBW2 behaviour).
     */
    nogAsymmetricCapMode?: "interior-notch" | "tight-cluster-notch";
    /**
     * Bolt B-plate (2026-05-11): Whether to emit slab anchor `Bolt @62` /
     * `Bolt @length-62` ops on B-plates of UPPER-STORY frames inside a
     * ground-floor wall plan (LBW/NLBW). Detailer's behaviour here is
     * project-specific:
     *
     *   true  — HG260001 polarity. Upper-floor B-plates inside a "GF-NLBW"
     *           plan still emit slab anchor bolts (verified vs HG260001
     *           PK1-GF-NLBW N9/N20/N25/N34 — all elevation 2355mm B1s have
     *           ANCHOR ops in Detailer's reference RFY).
     *   false — HG260044 polarity. Upper-floor B-plates inside "GF-NLBW"
     *           emit Web@8 + InnerDimple + LipNotch but NO slab anchors
     *           (verified vs HG260044 GF-NLBW N18/N21/N31/N36/N39/N41/N49
     *           — all elevation 2355mm B1s have BOLT HOLES + INNER DIMPLE
     *           + LIP NOTCH but NO ANCHOR ops in the reference RFY/CSV).
     *
     * "Upper-story" means `frameElevation > 100` — i.e. the frame's Z origin
     * is well above the slab. Standard ground-floor walls have
     * `frameElevation = 0` (or very small offsets like -45). The 100mm
     * threshold matches the existing pattern used elsewhere in table.ts
     * (see Service @300 / @450 elevation-shift formulas).
     *
     * Default: `true` — preserves the existing pre-2026-05-11 behaviour for
     * HG260001 and any unconfigured project. HG260044 explicitly sets it
     * `false`.
     */
    slabBoltOnUpperFloor?: boolean;
}
/** What we know about the stick when applying rules. */
export interface StickContext {
    /** Role inferred from stick name prefix (e.g. "S", "T", "B", "N", "Kb", "W"). */
    role: string;
    /** Stick length in mm. */
    length: number;
    /** Profile family — "70S41", "89S41", "150S41", etc. (gauge stripped). */
    profileFamily: string;
    /** Profile gauge (e.g. "0.75", "0.95"). */
    gauge: string;
    /** Whether the stick is flipped (LEFT in CSV). Affects which flange. */
    flipped: boolean;
    /** Optional: containing frame's length / height. */
    frameLength?: number;
    frameHeight?: number;
    /** Optional: containing frame's name (e.g. "N28"). */
    frameName?: string;
    /** Optional: usage from framecad_import.xml (e.g. "topplate"). */
    usage?: string;
    /** Optional: pack/plan name (e.g. "PK1-GF-NLBW-70.075") — useful for plan-type-specific rules. */
    planName?: string;
    /** Optional: full stick name (e.g. "B1", "B2", "Kb1"). Lets predicates
     *  distinguish primary plates (B1) from secondary plates (B2/B3). */
    stickName?: string;
    /** Optional: angle of the stick's axis from vertical (degrees). Used by
     *  W-stick rules to distinguish near-vertical wall studs from diagonal
     *  braces — Detailer chamfers diagonal W's (>=28°) but leaves near-vertical
     *  ones untouched. Verified 2026-05-04 vs HG260001 LBW corpus: transition
     *  in ref output between 25.5° (no chamfer) and 29.3° (chamfer). */
    angleFromVertical?: number;
    /** Optional: true if the containing frame has a paired/box header (H2 or
     *  H3 alongside H1). Detailer emits Web stiffeners on H1 only when paired
     *  — single-H frames (header without box) get no Webs. Verified 2026-05-04
     *  vs HG260001 LBW: L4/L8 single-H1 → 0 webs; L6/L41 paired-H → webs on H1. */
    framePairedHeader?: boolean;
    /** Optional: raw XML `<flipped>` attribute before framecad-import
     *  normalization. Required by Kb chamfer-end predicate which depends on
     *  the raw flipped state (the diff harness overrides flipped→false for
     *  diagonal braces). */
    inputFlipped?: boolean;
    /** Optional: for Kb sticks, true if the plate-attached end (end after
     *  Kb normalization) is at the TOP of the frame (end.z > start.z). Used
     *  by chamfer-end predicate combined with inputFlipped. */
    kbTopAttached?: boolean;
    /** Optional: world Z of the stick's start endpoint after trim. Lets
     *  Service-hole rules anchor on absolute world Z (electrical schedule
     *  e.g. 300/450 mm AFL) rather than stick-local offset. Required for
     *  walls whose B-plate sits below z=0 (the +45mm InnerService shift). */
    stickStartZ?: number;
    /** Optional: frame elevation (Z origin of the frame). InnerService rules
     *  anchor relative to frame elevation: stud_local_pos = (300 + elev) -
     *  stickStartZ. This handles both ground-floor walls (elev=0, B-plate
     *  at z<0 or z=0) and upper-story walls (elev=2355, stud at z=2357 etc.)
     *  with the same formula. */
    frameElevation?: number;
    /**
     * Optional: true if EVERY Kb stick in the containing frame has the same
     * `flipped` XML attribute. False if the frame has both flipped=true and
     * flipped=false Kbs side-by-side. Undefined if the caller hasn't computed
     * it.
     *
     * Used by the Kb @end Chamfer rule (when `projectConfig.kbChamferMode ===
     * "uniform-both-ends"` is unset) as an automatic discriminator: uniform-
     * flipped frames want both-end chamfers, mixed-flipped frames want the
     * XNOR(inputFlipped × kbTopAttached) rule. Verified 2026-05-09 against
     * HG260001 GF-LBW (12/12 frames mixed) and HG260044 GF-LBW (21/22 frames
     * uniform). When projectConfig overrides the mode, this flag is ignored.
     */
    kbFrameUniformFlipped?: boolean;
    /**
     * Optional: true if this Nog stick is a "sub-panel infill" — its z is NOT
     * at the canonical cross-noggin row (z != z-of-longest-Nog-in-frame) AND
     * BOTH endpoints terminate at INTERIOR regular Studs (NOT TrimStuds, NOT
     * frame perimeter, NOT corner-cluster studs within 100mm of perimeter).
     *
     * Set by the diff harness / framecad-import. NLBW2 agent (2026-05-10).
     * Used by the table.ts NLBW Nog rule which switches from Swage caps to
     * InnerNotch+LipNotch caps when this flag is true. Verified vs HG260044
     * GF-NLBW-70.075 N7/N24/N38 (12 nogs, 24 ops gained, 0 false positives).
     */
    nogIsSubPanelBothInterior?: boolean;
    /**
     * NLBW3 (2026-05-10): true if this Nog stick's START end should get
     * InnerNotch+LipNotch caps (instead of the default Swage caps). Extends
     * NLBW2's symmetric flag to support asymmetric sub-panel nogs where ONLY
     * ONE end takes Notch caps. Computed by the diff harness / framecad-
     * import based on `projectConfig.nogAsymmetricCapMode`. NLBW plans only.
     */
    nogStartCapIsNotch?: boolean;
    /** NLBW3 (2026-05-10): same as `nogStartCapIsNotch` but for the END
     *  endpoint. */
    nogEndCapIsNotch?: boolean;
    /**
     * Optional: per-project Detailer configuration. Resolved by the caller
     * (typically the diff harness or `hytek-rfy-tools`' framecad-import) and
     * passed down so rule predicates can dispatch on it without a global.
     *
     * When undefined, every config field falls back to its default — i.e.
     * the existing pre-2026-05-09 behaviour, so older callers don't have to
     * change anything.
     */
    projectConfig?: ProjectConfig;
}
/**
 * A position generator. Yields op positions for a given context.
 * - "endAnchored": pos = length - offset
 * - "startAnchored": pos = offset
 * - "centred": pos = length / 2 + offset
 * - "spaced": evenly spaced from start, with first at firstOffset and gap = spacing
 *   (yields max k positions where k*spacing + firstOffset <= length - lastOffset)
 */
export type Anchor = {
    kind: "startAnchored";
    offset: number;
    offsetFn?: (ctx: StickContext) => number;
} | {
    kind: "endAnchored";
    offset: number;
    offsetFn?: (ctx: StickContext) => number;
} | {
    kind: "centred";
    offset?: number;
} | {
    kind: "fraction";
    fraction: number;
} | {
    kind: "spaced";
    firstOffset: number;
    spacing: number;
    lastOffset: number;
} | {
    kind: "evenlyDistributed";
    firstOffset: number;
    lastOffset: number;
    maxSpacing: number;
};
/** A single op-placement rule. */
export interface OpRule {
    /** Tool type to emit. */
    toolType: ToolType;
    /** Tool kind: point / spanned / start / end. */
    kind: "point" | "spanned" | "start" | "end";
    /** Where to place it. For spanned, this is the start. */
    anchor: Anchor;
    /** For spanned tools: span length (added to start to get end). */
    spanLength?: number;
    /** For spanned tools: alternative to spanLength, computed from context.
     *  When provided, takes precedence over spanLength. Used for angle-dependent
     *  Kb/W Swage spans where span = 45/cos(angle). */
    spanLengthFn?: (ctx: StickContext) => number;
    /** Confidence of this rule from corpus analysis. */
    confidence: "high" | "medium" | "low";
    /** Optional predicate — rule only fires if this returns true. */
    predicate?: (ctx: StickContext) => boolean;
    /** Source observation: e.g. "S on 70S41 — 1500-3000  (fixture: 100% of 523 sticks)" */
    notes?: string;
}
/** Group of rules that apply to a particular stick group. */
export interface RuleGroup {
    /** Stick role pattern (regex on role prefix, e.g. /^S$/). */
    rolePattern: RegExp;
    /** Profile family pattern (e.g. /^70S41$/). */
    profilePattern: RegExp;
    /** Length range: [min, max] inclusive on min, exclusive on max. */
    lengthRange: [number, number];
    /** Rules to apply to sticks in this group. */
    rules: OpRule[];
}
/** Rule application result with debugging trace. */
export interface RuleApplicationResult {
    ops: RfyToolingOp[];
    matchedGroup?: RuleGroup;
    trace: string[];
}
