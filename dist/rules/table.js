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
            // Service holes for power-feed drops, spaced ~600mm starting from 306mm.
            // Fires on T plates in WALL plans (LBW/NLBW) regardless of length —
            // even short top plates above doors get them. Truss/roof/TB2B plans
            // never get service holes on T plates.
            {
                toolType: "InnerService", kind: "point",
                anchor: { kind: "spaced", firstOffset: 306, spacing: 600, lastOffset: 306 },
                confidence: "medium",
                predicate: (ctx) => isWallPlan(ctx) && ctx.length >= 600,
                notes: "T plates: power-feed drops at ~600mm intervals from offset 306mm",
            },
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
            { toolType: "Web", kind: "point", anchor: { kind: "startAnchored", offset: 8 }, confidence: "high", notes: "100% of B plates have Web point at 8mm" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
            { toolType: "Bolt", kind: "point", anchor: { kind: "startAnchored", offset: BOLT_OFFSET_70 }, confidence: "medium", notes: "Anchor bolt at 62mm from start (slab attachment)" },
            { toolType: "Bolt", kind: "point", anchor: { kind: "endAnchored", offset: BOLT_OFFSET_70 }, confidence: "medium", notes: "Anchor bolt at length-62mm (slab attachment)" },
            { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
        ],
    },
    // ----------- TOP/BOTTOM PLATES on 89S41 -----------
    {
        rolePattern: PLATE_ROLES,
        profilePattern: /^89S41$/,
        lengthRange: [0, Infinity],
        rules: [
            { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_89, confidence: "medium" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_89 }, confidence: "medium" },
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
            { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high", notes: "Header dimple #1 at 16.5 (matches stud pattern)" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: 58.5 }, confidence: "high", notes: "Header paired dimple at 58.5 (= 16.5 + 42mm)" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: 58.5 }, confidence: "high" },
            { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
            { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
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
    // ----------- BRACE / Ribbon / Lintel sticks on 70S41 (NOT truss webs) -----------
    // Brace dimple offset 11mm (vs 16.5 for studs); span 41mm (vs 39 for studs).
    // Pulled from W|70S41|500-1500 sample data — note this is for wall braces,
    // truss webs (W) are handled in the dedicated rule above.
    {
        rolePattern: /^(Br|R|L)$/,
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
