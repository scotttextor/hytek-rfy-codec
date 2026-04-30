const STUD_ROLES = /^(S|J)$/; // S=full stud, J=jack stud (door/window jamb)
const CRIPPLE_ROLES = /^Kb$/; // Kb=king brace/cripple stud
const HEADER_ROLES = /^H$/; // H=header/headplate (separate rules — paired dimples)
const PLATE_ROLES = /^(T|B|Tp|Bp)$/; // T/Tp=top plate, B/Bp=bottom plate
const NOG_ROLES = /^(N|Nog)$/;
const BRACE_ROLES = /^(Br|W|R|L)$/; // W=web brace, R=ribbon, L=lintel — sticks-as-bracing
// 70S41 profile constants (most common — derived empirically from fixture)
const SPAN_70 = 39; // start/end spanned-tool length
const DIMPLE_OFFSET_70 = 16.5; // INNER DIMPLE offset from each end
const BOLT_OFFSET_70 = 62; // BOLT HOLE offset on bottom plates from each end
// 89S41 profile constants. Values verified 2026-05-01 against HG260044
// GF-NLBW-89.075 reference: Detailer uses the SAME end-anchored offsets
// for 89mm sticks as 70mm sticks (Dimple @16.5, Swage span 39). The
// previous values (20.5, 44) were wrong — they came from a tentative
// fixture with limited samples.
const SPAN_89 = 39;
const DIMPLE_OFFSET_89 = 16.5;
export const RULE_TABLE = [
    // ----------- STUDS on 70S41 (any length) -----------
    {
        rolePattern: STUD_ROLES,
        profilePattern: /^70S41$/,
        lengthRange: [0, Infinity],
        rules: [
            {
                toolType: "Swage", kind: "spanned",
                anchor: { kind: "startAnchored", offset: 0 },
                spanLength: SPAN_70,
                confidence: "high",
                notes: "100% of S sticks; fixture: 521/523 in S|70S41|1500-3000",
            },
            {
                toolType: "InnerDimple", kind: "point",
                anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 },
                confidence: "high",
                notes: "100% of S sticks; pos hotspot 17mm × 492",
            },
            {
                toolType: "Swage", kind: "spanned",
                anchor: { kind: "endAnchored", offset: SPAN_70 },
                spanLength: SPAN_70,
                confidence: "high",
                notes: "End swage span [length-39 .. length]",
            },
            {
                toolType: "InnerDimple", kind: "point",
                anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 },
                confidence: "high",
                notes: "End dimple at length-16.5",
            },
            // Service holes — only on wall studs (LBW or NLBW plans) with length >= ~500
            {
                toolType: "InnerService", kind: "point",
                anchor: { kind: "startAnchored", offset: 296 },
                confidence: "medium",
                predicate: (ctx) => isWallPlan(ctx) && ctx.length >= 500 && ctx.length >= 296 + 200,
                notes: "Electrical service hole at ~300mm from start (outlet height)",
            },
            {
                toolType: "InnerService", kind: "point",
                anchor: { kind: "startAnchored", offset: 446 },
                confidence: "medium",
                predicate: (ctx) => isWallPlan(ctx) && ctx.length >= 500 && ctx.length >= 446 + 200,
                notes: "Electrical service hole at ~450mm from start (paired with 296mm)",
            },
            // Web holes are emitted in framecad-import.ts as a post-processing step
            // (the rules engine emits one op per rule entry, but we need N evenly-
            // spaced holes per stud which can't be expressed as fixed offsets).
        ],
    },
    // ----------- STUDS on 89S41 -----------
    {
        rolePattern: STUD_ROLES,
        profilePattern: /^89S41$/,
        lengthRange: [0, Infinity],
        rules: [
            { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "medium", notes: "Pending 89-profile corpus refinement" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
            { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "medium" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
            // Service holes — same as 70mm pattern (electrical outlet/switch heights).
            {
                toolType: "InnerService", kind: "point",
                anchor: { kind: "startAnchored", offset: 296 },
                confidence: "medium",
                predicate: (ctx) => isWallPlan(ctx) && ctx.length >= 500 && ctx.length >= 296 + 200,
                notes: "89mm stud: electrical outlet hole at 296mm",
            },
            {
                toolType: "InnerService", kind: "point",
                anchor: { kind: "startAnchored", offset: 446 },
                confidence: "medium",
                predicate: (ctx) => isWallPlan(ctx) && ctx.length >= 500 && ctx.length >= 446 + 200,
                notes: "89mm stud: paired service hole at 446mm",
            },
        ],
    },
    // ----------- CRIPPLE STUDS / HEADERS (Kb / H) on 70S41 -----------
    // Observed pattern (fixture HG260001):
    //   START: Chamfer-start  (no Chamfer-end)
    //   START: Swage spanned with VARIABLE span ~115-125mm (skipped — can't predict)
    //   START: InnerDimple @ 10mm
    //   END:   Swage spanned (length-43)..length
    //   END:   InnerDimple @ length-10
    {
        rolePattern: CRIPPLE_ROLES,
        profilePattern: /^70S41$/,
        lengthRange: [0, Infinity],
        rules: [
            { toolType: "Chamfer", kind: "start", anchor: { kind: "startAnchored", offset: 0 }, confidence: "high", notes: "Kb/H sticks: Chamfer at START only (no Chamfer-end observed)" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 10 }, confidence: "high", notes: "Kb dimple at 10mm (not 16.5mm)" },
            { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: 43 }, spanLength: 43, confidence: "medium", notes: "End swage span 43mm (slightly different from S stud 39mm)" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: 10 }, confidence: "high" },
        ],
    },
    // ----------- CRIPPLE STUDS on 89S41 -----------
    {
        rolePattern: CRIPPLE_ROLES,
        profilePattern: /^89S41$/,
        lengthRange: [0, Infinity],
        rules: [
            { toolType: "Chamfer", kind: "start", anchor: { kind: "startAnchored", offset: 0 }, confidence: "medium" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 10 }, confidence: "medium" },
            { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: 50 }, spanLength: 50, confidence: "low" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: 10 }, confidence: "medium" },
        ],
    },
    // ----------- TOP PLATES on 70S41 -----------
    {
        rolePattern: /^(T|Tp)$/,
        profilePattern: /^70S41$/,
        lengthRange: [0, Infinity],
        rules: [
            { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high", notes: "100% of T plates have lip notch span at start" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
            { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
            // InnerNotch on T plates is SELECTIVE (some short T sub-plates have it,
            // some don't — pattern not yet derivable from sample). Skipping to avoid
            // over-emission (100 extras vs 12 matches when emitted unconditionally).
            // Service holes for power-feed drops moved to frame-context.ts —
            // they belong at midpoints between adjacent studs (panel-point grid),
            // not on a fixed every-600 schedule. Verified 2026-05-01 against
            // HG260044 LBW: positions 285.8, 780.5, 1286.5, 1726, 2186, 2751 are
            // all stud-pair midpoints derived from the plate's stud crossings.
        ],
    },
    // ----------- BOTTOM PLATES on 70S41 -----------
    // Same as top plates PLUS anchor bolts at 62mm offsets for slab attachment
    // PLUS Web notch point at 8mm (web access slot for sub-floor wiring).
    {
        rolePattern: /^(B|Bp)$/,
        profilePattern: /^70S41$/,
        lengthRange: [0, Infinity],
        rules: [
            { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
            { toolType: "Web", kind: "point", anchor: { kind: "startAnchored", offset: 8 }, confidence: "high", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord", notes: "Wall B plates only; truss BottomChord doesn't get Web@8" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
            { toolType: "Bolt", kind: "point", anchor: { kind: "startAnchored", offset: BOLT_OFFSET_70 }, confidence: "medium", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord", notes: "Anchor bolt for slab attachment — wall B plates only" },
            { toolType: "Bolt", kind: "point", anchor: { kind: "endAnchored", offset: BOLT_OFFSET_70 }, confidence: "medium", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord", notes: "Anchor bolt for slab attachment — wall B plates only" },
            { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
            // InnerNotch on B plates is SELECTIVE — same as T (some sticks have it,
            // some don't). Skipping to avoid over-emission (96 extras vs 12 matches).
        ],
    },
    // ----------- TOP PLATES on 89S41 -----------
    {
        rolePattern: /^(T|Tp)$/,
        profilePattern: /^89S41$/,
        lengthRange: [0, Infinity],
        rules: [
            { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "medium" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
            { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "medium" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
        ],
    },
    // ----------- BOTTOM PLATES on 89S41 -----------
    // Same as top plates PLUS Web@8 + Bolt@~50mm for slab attachment.
    // Verified 2026-05-01 against HG260044 GF-NLBW-89.075: B1 has
    // BOLT HOLES @8, ANCHOR @53.7. B3 has ANCHOR @48.
    // Wall B plates only — truss BottomChord doesn't get these.
    {
        rolePattern: /^(B|Bp)$/,
        profilePattern: /^89S41$/,
        lengthRange: [0, Infinity],
        rules: [
            { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "medium" },
            { toolType: "Web", kind: "point", anchor: { kind: "startAnchored", offset: 8 }, confidence: "medium", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord", notes: "89mm wall B plates: Web access slot for sub-floor wiring" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
            { toolType: "Bolt", kind: "point", anchor: { kind: "startAnchored", offset: 51 }, confidence: "medium", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord", notes: "89mm anchor bolt at ~51mm (between observed 48 and 53.7)" },
            { toolType: "Bolt", kind: "point", anchor: { kind: "endAnchored", offset: 51 }, confidence: "medium", predicate: (ctx) => ctx.usage?.toLowerCase() !== "bottomchord", notes: "89mm anchor bolt at length-51mm" },
            { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "medium" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
        ],
    },
    // ----------- NOGS on 70S41 -----------
    {
        rolePattern: NOG_ROLES,
        profilePattern: /^70S41$/,
        lengthRange: [0, Infinity],
        rules: [
            { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
            { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
        ],
    },
    // ----------- NOGS on 89S41 -----------
    {
        rolePattern: NOG_ROLES,
        profilePattern: /^89S41$/,
        lengthRange: [0, Infinity],
        rules: [
            { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "medium" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
            { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "medium" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
        ],
    },
    // ----------- HEADERS (H) on 70S41 -----------
    // Headers are horizontal members above doors/windows. Detailer's pattern:
    //   - Swage 0..39 + Dimple @16.5 + Dimple @58.5 at start
    //   - Each stud crossing: LipNotch + 2 paired Dimples (at notch endpoints)
    //   - Dimple @length-58.5 + Dimple @length-16.5 + Swage end at end
    //
    // Paired dimples (16.5 + 58.5 = 42mm spacing) at each end is the
    // distinctive header pattern (vs 1 dimple for studs).
    //
    // Verified 2026-04-30 against HG260044 LBW reference: L6/H2, L6/H3,
    // L35/H1 all show this pattern.
    {
        rolePattern: HEADER_ROLES,
        profilePattern: /^70S41$/,
        lengthRange: [0, Infinity],
        rules: [
            { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high", notes: "H header: InnerNotch span 39 at start (verified HG260044 L6/H1)" },
            { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high", notes: "Header dimple #1 at 16.5 (matches stud pattern)" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 58.5 }, confidence: "high", notes: "Header paired dimple at 58.5 (= 16.5 + 42mm)" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: 58.5 }, confidence: "high" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
            { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
            { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high", notes: "H header: InnerNotch span 39 at end" },
        ],
    },
    // ----------- HEADERS (H) on 89S41 -----------
    // Same pattern as 70mm headers but with 89mm dimensions.
    // Verified 2026-05-01 against HG260044 GF-NLBW-89.075: H1 has 12 InnerDimples
    // at panel-point spacings.
    {
        rolePattern: HEADER_ROLES,
        profilePattern: /^89S41$/,
        lengthRange: [0, Infinity],
        rules: [
            { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "medium" },
            { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "medium" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium", notes: "89mm header dimple #1 at 16.5" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 58.5 }, confidence: "medium", notes: "89mm header paired dimple at 58.5" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: 58.5 }, confidence: "medium" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
            { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "medium" },
            { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_89 }, spanLength: SPAN_89, confidence: "medium" },
        ],
    },
    // ----------- TRUSS WEBS (W) on 70S41 -----------
    // Truss web members get the SAME end-anchored pattern as full studs:
    // Swage span 39mm + Dimple at 16.5 from each end.
    //
    // Chamfer is added in framecad-import.ts post-processing (NOT here),
    // because Detailer's rule is angle-dependent: vertical webs (angle=0
    // from vertical) get NO chamfer, diagonal webs (angle > 0) get BOTH
    // start AND end chamfer. Verified 2026-04-30 against HG260044 GF-TIN
    // reference: 100% correlation between non-zero angle and chamfer-both-ends.
    //
    // Sample W3 (length 617): Swage 0..39, Dimple @16.5, Swage 578..617, Dimple @600.5
    {
        rolePattern: /^W$/,
        profilePattern: /^70S41$/,
        lengthRange: [0, Infinity],
        rules: [
            { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
            { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
        ],
    },
    // ----------- LINTELS (L) on 70S41 -----------
    // Lintels are horizontal members above doors/windows (similar role to
    // headers H, but distinct in Detailer's classification). They get
    // end-anchored InnerNotch + stud-pattern Swage + Dimples at each end.
    //
    // Verified 2026-05-01 against HG260044 LBW reference: L sticks have
    // InnerNotch span 39 at both start and end (32 missing on LBW with 0
    // extras when emitted from /^L$/ pattern alone).
    {
        rolePattern: /^L$/,
        profilePattern: /^70S41$/,
        lengthRange: [0, Infinity],
        rules: [
            { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
            { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
            { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
            { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
        ],
    },
    // ----------- BRACE / Ribbon sticks on 70S41 (NOT truss webs, NOT lintels) -----------
    // Brace dimple offset 11mm (vs 16.5 for studs); span 41mm (vs 39 for studs).
    // Pulled from W|70S41|500-1500 sample data — note this is for wall braces,
    // truss webs (W) and lintels (L) are handled in dedicated rules above.
    {
        rolePattern: /^(Br|R)$/,
        profilePattern: /^70S41$/,
        lengthRange: [0, Infinity],
        rules: [
            { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: 41, confidence: "medium" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 11 }, confidence: "medium", notes: "Brace dimple at 11mm" },
            { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: 41 }, spanLength: 41, confidence: "medium" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: 11 }, confidence: "medium" },
        ],
    },
];
/** Wall plans contain studs that need electrical service holes. */
export function isWallPlan(ctx) {
    if (!ctx.planName)
        return false;
    return /(LBW|NLBW|LOAD-BEARING|NON-LOAD)/i.test(ctx.planName);
}
/** Look up profile-specific span/dimple offsets. */
export function profileOffsets(profileFamily) {
    if (/^89/.test(profileFamily))
        return { span: SPAN_89, dimpleOffset: DIMPLE_OFFSET_89, boltOffset: 62 };
    if (/^150/.test(profileFamily))
        return { span: 50, dimpleOffset: 25, boltOffset: 62 }; // best guess
    return { span: SPAN_70, dimpleOffset: DIMPLE_OFFSET_70, boltOffset: BOLT_OFFSET_70 };
}
