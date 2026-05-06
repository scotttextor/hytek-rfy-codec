// FC_Textor_Qld.dat consumer module — exposes the truss-geometry rule
// constants from FrameCAD Detailer's Structure-side config file as a typed
// API. The .dat is the third config file FrameCAD uses (alongside the two
// .sups files already wired in `machine-setups.ts` + `frame-setups.ts`),
// confirmed authoritative by FrameCAD support 2026-05-05.
//
// Cipher: 4-byte XOR `08 01 09 05`, reset per CRLF, leading literal ',' byte
// per plaintext line. Solved 2026-05-01 (decoder lives at
// `../../hytek-budget/scripts/decode_dat_final.py`). Decoded source:
// `../../hytek-budget/scripts/FC_Textor_Qld.decoded.dat`.
//
// This module embeds a STATIC subset of the parsed data — only the truss-
// geometry section, since that's the codec-relevant slice. The full parsed
// JSON lives at `scripts/fc-dat-parsed.json` for ad-hoc inspection.
//
// Audit trail: see `docs/fc-dat-wirings.md` (Agent FINAL, 2026-05-05) for
// the field decode + ranking by codec relevance.
/** Compose a rule key from the type + side + profile index. */
function makeKey(type, side, profile) {
    return `GEOMETRY_${type}${side}${profile}`;
}
// =============================================================================
// Embedded data — extracted from scripts/fc-dat-parsed.json on 2026-05-05.
// To regenerate, run `node scripts/parse-fc-dat.mjs` then re-extract this
// table. Active rules only (commented-out 70S35 / 90S40 rules omitted).
//
// Ordering: type prefix (STD/SAD/TRU/EAV/NST/RAF/HAL) × side (E/C) × profile.
// Each row carries all 12 codec-relevant fields.
// =============================================================================
const RULES = {
    // ---- E-side (English/legacy profiles 70S35/75S44/90S40/89S41) ----
    GEOMETRY_STDE0: { profile: 1, bcDistCenHole: 20, tcDistCenHole: 20, horizChdCenHole: 20, railCenHole: 11, webIncrements: 20, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_SADE0: { profile: 1, bcDistCenHole: 20, tcDistCenHole: 20, horizChdCenHole: 20, railCenHole: 11, webIncrements: 20, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_TRUE0: { profile: 1, bcDistCenHole: 20, tcDistCenHole: 20, horizChdCenHole: 20, railCenHole: 11, webIncrements: 20, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 50 },
    GEOMETRY_EAVE0: { profile: 1, bcDistCenHole: 20, tcDistCenHole: 20, horizChdCenHole: 20, railCenHole: 11, webIncrements: 20, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_NSTE0: { profile: 1, bcDistCenHole: 20, tcDistCenHole: 20, horizChdCenHole: 20, railCenHole: 11, webIncrements: 20, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_RAFE0: { profile: 1, bcDistCenHole: 20, tcDistCenHole: 20, horizChdCenHole: 20, railCenHole: 11, webIncrements: 20, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_STDE1: { profile: 1, bcDistCenHole: 22.0, tcDistCenHole: 22.0, horizChdCenHole: 22.0, railCenHole: 11, webIncrements: 22.0, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_SADE1: { profile: 1, bcDistCenHole: 22.0, tcDistCenHole: 22.0, horizChdCenHole: 22.0, railCenHole: 11, webIncrements: 22.0, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_TRUE1: { profile: 1, bcDistCenHole: 22.0, tcDistCenHole: 22.0, horizChdCenHole: 22.0, railCenHole: 11, webIncrements: 22.0, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 50 },
    GEOMETRY_EAVE1: { profile: 1, bcDistCenHole: 22.0, tcDistCenHole: 22.0, horizChdCenHole: 22.0, railCenHole: 11, webIncrements: 22.0, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_NSTE1: { profile: 1, bcDistCenHole: 22.0, tcDistCenHole: 22.0, horizChdCenHole: 22.0, railCenHole: 11, webIncrements: 22.0, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_RAFE1: { profile: 1, bcDistCenHole: 22.0, tcDistCenHole: 22.0, horizChdCenHole: 22.0, railCenHole: 11, webIncrements: 22.0, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_STDE2: { profile: 1, bcDistCenHole: 17.5, tcDistCenHole: 17.5, horizChdCenHole: 17.5, railCenHole: 11, webIncrements: 17.5, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_SADE2: { profile: 1, bcDistCenHole: 17.5, tcDistCenHole: 17.5, horizChdCenHole: 17.5, railCenHole: 11, webIncrements: 17.5, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_TRUE2: { profile: 1, bcDistCenHole: 17.5, tcDistCenHole: 17.5, horizChdCenHole: 17.5, railCenHole: 11, webIncrements: 17.5, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 50 },
    GEOMETRY_EAVE2: { profile: 1, bcDistCenHole: 17.5, tcDistCenHole: 17.5, horizChdCenHole: 17.5, railCenHole: 11, webIncrements: 17.5, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_NSTE2: { profile: 1, bcDistCenHole: 17.5, tcDistCenHole: 17.5, horizChdCenHole: 17.5, railCenHole: 11, webIncrements: 17.5, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_STDE3: { profile: 1, bcDistCenHole: 20.5, tcDistCenHole: 20.5, horizChdCenHole: 20.5, railCenHole: 11, webIncrements: 20.5, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_SADE3: { profile: 1, bcDistCenHole: 20.5, tcDistCenHole: 20.5, horizChdCenHole: 20.5, railCenHole: 11, webIncrements: 20.5, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_TRUE3: { profile: 1, bcDistCenHole: 20.5, tcDistCenHole: 20.5, horizChdCenHole: 20.5, railCenHole: 11, webIncrements: 20.5, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 50 },
    GEOMETRY_EAVE3: { profile: 1, bcDistCenHole: 20.5, tcDistCenHole: 20.5, horizChdCenHole: 20.5, railCenHole: 11, webIncrements: 20.5, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_NSTE3: { profile: 1, bcDistCenHole: 20.5, tcDistCenHole: 20.5, horizChdCenHole: 20.5, railCenHole: 11, webIncrements: 20.5, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_RAFE3: { profile: 1, bcDistCenHole: 20.5, tcDistCenHole: 20.5, horizChdCenHole: 20.5, railCenHole: 11, webIncrements: 20.5, cenCenWbHole: 50, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    // ---- C-side (Centre-hole / current HYTEK profiles) ----
    // 89/90mm normal-axis
    GEOMETRY_STDC0: { profile: 0, bcDistCenHole: 61.5, tcDistCenHole: 61.5, horizChdCenHole: 61.5, railCenHole: 45.0, webIncrements: 45.0, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_SADC0: { profile: 0, bcDistCenHole: 61.5, tcDistCenHole: 61.5, horizChdCenHole: 61.5, railCenHole: 45.0, webIncrements: 45.0, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_TRUC0: { profile: 0, bcDistCenHole: 61.5, tcDistCenHole: 61.5, horizChdCenHole: 61.5, railCenHole: 45.0, webIncrements: 45.0, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 50 },
    GEOMETRY_EAVC0: { profile: 0, bcDistCenHole: 61.5, tcDistCenHole: 61.5, horizChdCenHole: 61.5, railCenHole: 45.0, webIncrements: 45.0, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_RAFC0: { profile: 0, bcDistCenHole: 61.5, tcDistCenHole: 61.5, horizChdCenHole: 61.5, railCenHole: 44.5, webIncrements: 44.5, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    // 75mm
    GEOMETRY_STDC1: { profile: 0, bcDistCenHole: 54.5, tcDistCenHole: 54.5, horizChdCenHole: 54.5, railCenHole: 37.5, webIncrements: 37.5, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_SADC1: { profile: 0, bcDistCenHole: 54.5, tcDistCenHole: 54.5, horizChdCenHole: 54.5, railCenHole: 37.5, webIncrements: 37.5, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_TRUC1: { profile: 0, bcDistCenHole: 54.5, tcDistCenHole: 54.5, horizChdCenHole: 54.5, railCenHole: 37.5, webIncrements: 37.5, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 50 },
    GEOMETRY_EAVC1: { profile: 0, bcDistCenHole: 54.5, tcDistCenHole: 54.5, horizChdCenHole: 54.5, railCenHole: 37.5, webIncrements: 37.5, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_RAFC1: { profile: 0, bcDistCenHole: 54.5, tcDistCenHole: 54.5, horizChdCenHole: 54.5, railCenHole: 37.5, webIncrements: 37.5, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    // 70mm normal-axis
    GEOMETRY_STDC2: { profile: 0, bcDistCenHole: 50.0, tcDistCenHole: 50.0, horizChdCenHole: 50.0, railCenHole: 35.0, webIncrements: 35.0, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_SADC2: { profile: 0, bcDistCenHole: 50.0, tcDistCenHole: 50.0, horizChdCenHole: 50.0, railCenHole: 35.0, webIncrements: 35.0, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_TRUC2: { profile: 0, bcDistCenHole: 50.0, tcDistCenHole: 50.0, horizChdCenHole: 50.0, railCenHole: 35.0, webIncrements: 35.0, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 50 },
    GEOMETRY_EAVC2: { profile: 0, bcDistCenHole: 50.0, tcDistCenHole: 50.0, horizChdCenHole: 50.0, railCenHole: 35.0, webIncrements: 35.0, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_RAFC2: { profile: 0, bcDistCenHole: 50.0, tcDistCenHole: 50.0, horizChdCenHole: 50.0, railCenHole: 35.0, webIncrements: 35.0, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    // 89mm centre-hole (B2B Deep Axis)
    GEOMETRY_STDC3: { profile: 0, bcDistCenHole: 44.5, tcDistCenHole: 44.5, horizChdCenHole: 44.5, railCenHole: 44.5, webIncrements: 44.5, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_SADC3: { profile: 0, bcDistCenHole: 44.5, tcDistCenHole: 44.5, horizChdCenHole: 44.5, railCenHole: 44.5, webIncrements: 44.5, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_TRUC3: { profile: 0, bcDistCenHole: 44.5, tcDistCenHole: 44.5, horizChdCenHole: 44.5, railCenHole: 44.5, webIncrements: 44.5, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 50 },
    GEOMETRY_EAVC3: { profile: 0, bcDistCenHole: 44.5, tcDistCenHole: 44.5, horizChdCenHole: 44.5, railCenHole: 44.5, webIncrements: 44.5, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_RAFC3: { profile: 0, bcDistCenHole: 44.5, tcDistCenHole: 44.5, horizChdCenHole: 44.5, railCenHole: 44.5, webIncrements: 44.5, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    // 70mm centre-hole (B2B Deep Axis)
    GEOMETRY_STDC4: { profile: 0, bcDistCenHole: 35.0, tcDistCenHole: 35.0, horizChdCenHole: 35.0, railCenHole: 35.0, webIncrements: 35.0, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_SADC4: { profile: 0, bcDistCenHole: 35.0, tcDistCenHole: 35.0, horizChdCenHole: 35.0, railCenHole: 35.0, webIncrements: 35.0, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_TRUC4: { profile: 0, bcDistCenHole: 35.0, tcDistCenHole: 35.0, horizChdCenHole: 35.0, railCenHole: 35.0, webIncrements: 35.0, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 50 },
    GEOMETRY_EAVC4: { profile: 0, bcDistCenHole: 35.0, tcDistCenHole: 35.0, horizChdCenHole: 35.0, railCenHole: 35.0, webIncrements: 35.0, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    GEOMETRY_RAFC4: { profile: 0, bcDistCenHole: 35.0, tcDistCenHole: 35.0, horizChdCenHole: 35.0, railCenHole: 35.0, webIncrements: 35.0, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: 50, endWbSetback: 0, kpTruncated: 0 },
    // 89mm Linear Truss (special construction_type=2 — sign flip on shortenDblesWb,
    // 50mm endWbSetback, 90mm kpTruncated)
    GEOMETRY_STDC5: { profile: 2, bcDistCenHole: 44.5, tcDistCenHole: 44.5, horizChdCenHole: 44.5, railCenHole: 44.5, webIncrements: 44.5, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: -50, endWbSetback: 50, kpTruncated: 0 },
    GEOMETRY_HALC5: { profile: 2, bcDistCenHole: 44.5, tcDistCenHole: 44.5, horizChdCenHole: 44.5, railCenHole: 44.5, webIncrements: 44.5, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: -50, endWbSetback: 50, kpTruncated: 0 },
    GEOMETRY_TRUC5: { profile: 2, bcDistCenHole: 44.5, tcDistCenHole: 44.5, horizChdCenHole: 44.5, railCenHole: 44.5, webIncrements: 44.5, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: -50, endWbSetback: 50, kpTruncated: 90 },
    GEOMETRY_SADC5: { profile: 2, bcDistCenHole: 44.5, tcDistCenHole: 44.5, horizChdCenHole: 44.5, railCenHole: 44.5, webIncrements: 44.5, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: -50, endWbSetback: 50, kpTruncated: 0 },
    GEOMETRY_RAFC5: { profile: 2, bcDistCenHole: 44.5, tcDistCenHole: 44.5, horizChdCenHole: 44.5, railCenHole: 44.5, webIncrements: 44.5, cenCenWbHole: 120, minimumLength: 0, apexNominalWeb: 0, shortenDblesWb: -50, endWbSetback: 50, kpTruncated: 0 },
};
/** Look up a truss geometry rule by type, side, and profile index. Returns
 *  `undefined` when the rule combo doesn't exist (e.g. RAFE2 — 70mm rafter
 *  is not defined in the .dat). */
export function getTrussGeometry(type, side, profile) {
    return RULES[makeKey(type, side, profile)];
}
/** Convenience: resolve the C-side TRU profile by HYTEK profile-web (mm). */
export function getCSideTruProfileForWeb(webMm, centreHole = false, linear = false) {
    if (linear && webMm === 89)
        return 5;
    if (centreHole) {
        if (webMm === 89 || webMm === 70)
            return webMm === 89 ? 3 : 4;
        return null;
    }
    if (webMm === 89 || webMm === 90)
        return 0;
    if (webMm === 75)
        return 1;
    if (webMm === 70)
        return 2;
    return null;
}
/** Defensive: assert a rule's web-hole min-separation matches the canonical
 *  HYTEK value. Used by callers that hardcode `120` as a sanity-check that
 *  the .dat hasn't drifted from expectation. */
export const HYTEK_WEB_HOLE_MIN_SEPARATION_MM = 120;
/** Defensive: the chord-doubles web-hole near-end suppression, 50mm for
 *  every C-profile non-Linear truss (same value across 89, 75, 70mm). The
 *  TB2B simplifier's `boxA + 50` / `boxB - 50` literal is grounded in this. */
export const HYTEK_SHORTEN_DBLES_WB_MM = 50;
/** Direct accessor for the full embedded ruleset (read-only). For ad-hoc
 *  inspection / future wirings. */
export function getAllRules() {
    return RULES;
}
