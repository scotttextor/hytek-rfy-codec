/** Truss-type prefix in the GEOMETRY_<TYPE><PROFILE> rule keys.
 *  - STD = Standard (regular truss)
 *  - TRU = Truss (the principal truss type — what TB2B uses)
 *  - EAV = Eave truss
 *  - RAF = Rafter truss
 *  - SAD = Saddle truss
 *  - NST = Nested truss
 *  - HAL = Half truss (Linear-only) */
export type TrussType = "STD" | "TRU" | "EAV" | "RAF" | "SAD" | "NST" | "HAL";
/** Whether the rule is for an Eaves/English profile (E suffix) or a
 *  Centre-hole/B2B profile (C suffix). The C-profile family is what the
 *  HYTEK truss systems use; E was 70S35/90S40 (now decommissioned). */
export type GeometrySide = "E" | "C";
/** Profile index within a side. For C-side (current HYTEK):
 *    0 = 89mm/90mm normal-axis
 *    1 = 75mm
 *    2 = 70mm normal-axis
 *    3 = 89mm + 70mm centre-hole (B2B Deep Axis)
 *    4 = 70mm centre-hole (B2B Deep Axis)
 *    5 = 89mm Linear Truss (special construction_type=2) */
export type ProfileIndex = 0 | 1 | 2 | 3 | 4 | 5;
/** All truss-geometry fields the codec cares about. Names match the .dat
 *  field labels at lines 754-757 of FC_Textor_Qld.decoded.dat. */
export interface TrussGeometryRule {
    /** `0` = chord profile (English C-section family); `1` = original 90/75/70
     *  profile family; `2` = Linear construction. */
    profile: number;
    /** Distance from chord end to first centre-hole on bottom-chord. */
    bcDistCenHole: number;
    /** Same for top-chord. */
    tcDistCenHole: number;
    /** Horizontal chord centre-hole offset. */
    horizChdCenHole: number;
    /** Rail (header rail) centre-hole offset. */
    railCenHole: number;
    /** Web spacing increment along chord (Detailer rounds web positions to
     *  multiples of this — the codec uses XML-supplied positions and does not
     *  round, so this is documented but not consumed). */
    webIncrements: number;
    /** **Centre-to-centre minimum web-hole separation on chords.** 120mm for
     *  all C-profiles (89/90, 75, 70 + B2B variants). 50mm for E-profiles.
     *  Detailer enforces this when emitting Web@pt at panel-point crossings;
     *  if two crossings are <120mm apart the second is suppressed. The codec
     *  doesn't currently enforce this constraint — see W1 in the wirings doc. */
    cenCenWbHole: number;
    /** Minimum stick length to apply the rule (always 0 in HYTEK config
     *  = always-on). */
    minimumLength: number;
    /** Apex stub-web nominal length. Always 0 = computed from geometry. */
    apexNominalWeb: number;
    /** Web-hole setback near doubled-chord ends. 50 for all C-types except
     *  Linear (where it's −50). The TB2B simplifier's `boxA + 50` /
     *  `boxB - 50` box-piece InnerDimple range cites this constant. */
    shortenDblesWb: number;
    /** End-clearance for web-holes ON CHORDS. 0 for all standard truss types,
     *  **50** for Linear Truss only (TRUC5/STDC5). */
    endWbSetback: number;
    /** King-post truncation length at apex. 50 for TRU types, 0 for STD,
     *  90 for Linear (TRUC5). */
    kpTruncated: number;
}
/** Look up a truss geometry rule by type, side, and profile index. Returns
 *  `undefined` when the rule combo doesn't exist (e.g. RAFE2 — 70mm rafter
 *  is not defined in the .dat). */
export declare function getTrussGeometry(type: TrussType, side: GeometrySide, profile: ProfileIndex): TrussGeometryRule | undefined;
/** Convenience: resolve the C-side TRU profile by HYTEK profile-web (mm). */
export declare function getCSideTruProfileForWeb(webMm: number, centreHole?: boolean, linear?: boolean): ProfileIndex | null;
/** Defensive: assert a rule's web-hole min-separation matches the canonical
 *  HYTEK value. Used by callers that hardcode `120` as a sanity-check that
 *  the .dat hasn't drifted from expectation. */
export declare const HYTEK_WEB_HOLE_MIN_SEPARATION_MM = 120;
/** Defensive: the chord-doubles web-hole near-end suppression, 50mm for
 *  every C-profile non-Linear truss (same value across 89, 75, 70mm). The
 *  TB2B simplifier's `boxA + 50` / `boxB - 50` literal is grounded in this. */
export declare const HYTEK_SHORTEN_DBLES_WB_MM = 50;
/** Direct accessor for the full embedded ruleset (read-only). For ad-hoc
 *  inspection / future wirings. */
export declare function getAllRules(): Readonly<Record<string, TrussGeometryRule>>;
