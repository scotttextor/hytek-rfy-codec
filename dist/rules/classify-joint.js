/**
 * Detailer joint classifier — TS port of `Tooling.dll` `FUN_00538b00`
 * (the "real classifier" exported into `ActionDefsManager` lookup keys).
 *
 * Source: Ghidra decompile at `docs/ghidra-out/decompiled-all.txt`
 *   FUN_00538b00 (top-level dispatch by IsTrussChord parity, line 98311)
 *   FUN_00538bb8 (mixed truss × non-truss,                  line 98341)
 *   FUN_00538e70 (truss-chord × truss-chord,                line 98448)
 *   FUN_00539258 (non-chord × non-chord,                    line 98524)
 *
 * Companion notes: `docs/classify-joint-port-notes.md`
 *
 * NOT WIRED INTO frame-context.ts YET. This is a standalone module that the
 * crossing pipeline will eventually consume to gate per-recipe op emission.
 * See decoder report Section 7, "Top 3 Codec Changes", #1.
 */
// =============================================================================
// Section-usage enum (from Delphi RTTI — TSectionUsage, 14 values)
//
// Not used by the classifier itself (it works on byte flags), but exported so
// the caller derives those byte flags from a usage value.
// =============================================================================
export var SectionUsage;
(function (SectionUsage) {
    SectionUsage[SectionUsage["Unknown"] = 0] = "Unknown";
    SectionUsage[SectionUsage["TopPlate"] = 1] = "TopPlate";
    SectionUsage[SectionUsage["BottomPlate"] = 2] = "BottomPlate";
    SectionUsage[SectionUsage["HeadPlate"] = 3] = "HeadPlate";
    SectionUsage[SectionUsage["Plate"] = 4] = "Plate";
    SectionUsage[SectionUsage["Sill"] = 5] = "Sill";
    SectionUsage[SectionUsage["TopChord"] = 6] = "TopChord";
    SectionUsage[SectionUsage["BottomChord"] = 7] = "BottomChord";
    SectionUsage[SectionUsage["Brace"] = 8] = "Brace";
    SectionUsage[SectionUsage["Stud"] = 9] = "Stud";
    SectionUsage[SectionUsage["TrimStud"] = 10] = "TrimStud";
    SectionUsage[SectionUsage["JackStud"] = 11] = "JackStud";
    SectionUsage[SectionUsage["Rail"] = 12] = "Rail";
    SectionUsage[SectionUsage["EndStud"] = 13] = "EndStud";
})(SectionUsage || (SectionUsage = {}));
// =============================================================================
// Public API
// =============================================================================
/**
 * Top-level classifier. Mirrors FUN_00538b00.
 *
 * Decompile (line 98311):
 * ```
 *   if (param_3 & 0x200) != 0:           // forBackToBack
 *     return "None"
 *   if !FUN_00539950(stickA, stickB):    // overlap test
 *     return "None"
 *   if !stickA.IsTrussChord && !stickB.IsTrussChord:
 *     return classifyOnFlat(...)
 *   else if stickA.IsTrussChord == stickB.IsTrussChord:
 *     return classifyOnEdge(...)
 *   else:
 *     return classifyMixed(...)
 * ```
 *
 * NOTE: The caller is responsible for the geometry-overlap test
 * (FUN_00539950, ε-tolerance edge-overlap). If sticks don't overlap, the
 * caller should NOT invoke classifyJoint() at all — Detailer returns "None"
 * there but our crossing-detector already filters non-overlapping pairs.
 */
export function classifyJoint(stickA, stickB, flags) {
    // FUN_00538b00:98318 — forBackToBack short-circuits before anything else
    if (flags.forBackToBack)
        return "None";
    // FUN_00538b00:98323 — IsTrussChord parity dispatch
    const aIsChord = stickA.isTrussChord;
    const bIsChord = stickB.isTrussChord;
    if (!aIsChord && !bIsChord) {
        return classifyOnFlat(stickA, stickB, flags);
    }
    if (aIsChord === bIsChord) {
        return classifyOnEdge(stickA, stickB, flags);
    }
    return classifyMixed(stickA, stickB, flags);
}
// =============================================================================
// classifyOnFlat — port of FUN_00539258 (line 98524)
//
// This is the meatiest dispatcher (742 bytes). Top-level branches on
// IsCSection (both C-section vs. either-non-C), then on three flag bits:
// 0x0020 (DualTrack), 0x0800 (Boxing/Frama), 0x0080 (WebIntersection/Tabs).
// =============================================================================
function classifyOnFlat(stickA, stickB, flags) {
    const aC = stickA.isCSection;
    const bC = stickB.isCSection;
    // Line 98533: if (*param_1 == 0 || *param_2 == '\0')
    // i.e. EITHER is non-C-section (note: '== 0' on a byte tests "false")
    if (!aC || !bC) {
        // Line 98534: (param_3 & 0x20) == 0  — NOT DualTrack
        if (!flags.forDualTrack) {
            // Line 98535: (param_3 & 0x800) == 0  — NOT Boxing/Frama
            if (!flags.forBoxing) {
                // Line 98536: (param_3 & 0x80) == 0  — NOT WebIntersection/Tabs
                if (!flags.forWebIntersection) {
                    return classifyOnFlatStandardGroup(stickA, stickB, flags);
                }
                // Tabs / TabHoles / WebIntersectionsBad branch
                return classifyOnFlatTabsGroup(stickA, stickB, flags);
            }
            // Boxing/Frama branch — line 98616
            if (!aC && !bC) {
                return "OnFlat - Frama";
            }
            // Line 98620: fallback to "OnFlat - Standard" (DAT_0053954c)
            // TODO-DECOMPILE: DAT_0053954c is a runtime-string pointer we couldn't
            // resolve — inferred to be "OnFlat - Standard" from semantics
            // (decoder report §6.1). Verify via Frida hook on FUN_0040a118.
            return "OnFlat - Standard";
        }
        // DualTrack branch — line 98623
        return classifyOnFlatDualTrack(stickA, stickB);
    }
    // Both C-section, OnFlat — line 98650 fallback
    // TODO-DECOMPILE: DAT_0053954c — see above. "OnFlat - Standard" inferred.
    return "OnFlat - Standard";
}
/**
 * The "no DualTrack, no Boxing, no WebIntersection" sub-branch of OnFlat —
 * lines 98537-98590.
 *
 * Layered conditions:
 *   - if both isCSection==0 (i.e. neither is C-section):
 *       [LipNotched-Reversed all-bits, Reversed, LipNotchedCorners,
 *        Standard/Tabbed, Over/Swaged from 0x40+HasOuterFlange]
 *   - elif !aC (only A non-C):
 *       [Over, Over2, Swaged2 — gated by Layer2 + HasOuterFlange]
 *   - else (only B non-C, since outer condition required at-least-one non-C):
 *       [Swaged, None, TrussBoxed, Swaged3 — gated by Layer2 + HasOuterFlange]
 */
function classifyOnFlatStandardGroup(stickA, stickB, flags) {
    const aC = stickA.isCSection;
    const bC = stickB.isCSection;
    // Line 98537: if (*param_1 == 0)  — A is non-C
    if (!aC) {
        // Line 98538: if (*param_2 == '\0')  — B is also non-C (both non-C)
        if (!bC) {
            // Line 98539: if ((~param_3 & _DAT_00539828) == 0)  — "all required bits set"
            // _DAT_00539828 is a runtime-init mask. Decoder report §2 hypothesises
            // 0x0005 (forReversed | forLipNotchedCorners). We replicate that.
            // TODO-DECOMPILE: confirm _DAT_00539828 value at runtime via Frida.
            if (flags.forReversed && flags.forLipNotchedCorners) {
                return "OnFlat - LipNotchedCorners Reversed";
            }
            // Line 98542: (param_3 & 1) == 0  — NOT Reversed
            if (!flags.forReversed) {
                // Line 98543: (param_3 & 4) == 0  — NOT LipNotchedCorners
                if (!flags.forLipNotchedCorners) {
                    // Line 98544: ((param_3 & 0x40) == 0) || (HasOuterFlange-equal)
                    if (!flags.forAsymOverSwaged || stickA.hasOuterFlange === stickB.hasOuterFlange) {
                        // Line 98545: (param_3 & 0x100) == 0  — NOT Tabbed
                        if (!flags.forTabbed)
                            return "OnFlat - Standard";
                        return "OnFlat - Tabbed";
                    }
                    // 0x40 set AND HasOuterFlange differ
                    // Line 98552: A.HasOuterFlange == 1
                    if (stickA.hasOuterFlange)
                        return "OnFlat - Over";
                    return "OnFlat - Swaged";
                }
                return "OnFlat - LipNotchedCorners";
            }
            return "OnFlat - Reversed";
        }
        // A non-C, B is C
        // Line 98567: (param_3 & 0x400) == 0 — NOT Layer2
        if (!flags.forLayer2)
            return "OnFlat - Over";
        // Line 98570: B.HasOuterFlange == 1
        if (stickB.hasOuterFlange)
            return "OnFlat - Swaged2";
        return "OnFlat - Over2";
    }
    // A is C, so B must be non-C (outer condition guarantees one non-C)
    // Line 98577: (param_3 & 0x400) == 0 — NOT Layer2
    if (!flags.forLayer2) {
        // Line 98578: (param_3 & 2) == 0 — NOT SuppressSwage
        if (!flags.forSuppressSwage)
            return "OnFlat - Swaged";
        return "None";
    }
    // Line 98585: A.HasOuterFlange == 1
    if (stickA.hasOuterFlange)
        return "OnFlat - TrussBoxed";
    return "OnFlat - Swaged3";
}
/**
 * The Tabs / TabHoles / WebIntersectionsBad sub-branch of OnFlat —
 * lines 98592-98613.
 *
 * Only fires when forWebIntersection (0x80) is set AND we're not in DualTrack
 * or Boxing modes.
 */
function classifyOnFlatTabsGroup(stickA, stickB, flags) {
    // Line 98592: (*param_1 == 0) && (*param_2 == '\0')  — both non-C
    if (!stickA.isCSection && !stickB.isCSection) {
        // Line 98594: HasOuterFlange-equal
        if (stickA.hasOuterFlange === stickB.hasOuterFlange) {
            // TODO-DECOMPILE: DAT_0053954c — inferred "OnFlat - Standard"
            return "OnFlat - Standard";
        }
        // Line 98597: NOT Tabbed
        if (!flags.forTabbed) {
            // Line 98598: A.HasOuterFlange == 1
            if (stickA.hasOuterFlange)
                return "None";
            return "OnFlat - WebIntersections Bad";
        }
        // Tabbed + HasOuterFlange-asymmetric
        if (stickA.hasOuterFlange)
            return "OnFlat - Tabs";
        return "OnFlat - TabHoles";
    }
    // Mixed C / non-C with WebIntersection — falls through to default
    return "OnFlat - Standard";
}
/**
 * DualTrack OnFlat sub-branch — lines 98623-98647.
 *
 * Forced by flag 0x20 (forDualTrack). Names the joint by which side has
 * HasOuterFlange (i.e. which side is plate-vs-stud).
 */
function classifyOnFlatDualTrack(stickA, stickB) {
    const aC = stickA.isCSection;
    const bC = stickB.isCSection;
    // Line 98623: ((*param_1 ^ 1) == 0) || (*param_2 != '\0')
    //   = (A is C) || (B is C)
    // The decompile XORs the byte then compares to 0 — equivalent to "byte == 1".
    if (aC || bC) {
        // Line 98624: (*param_1 ^ 1) == 0  — A is C
        if (aC) {
            // Line 98625: A.HasOuterFlange==0 && B.HasOuterFlange==1
            if (!stickA.hasOuterFlange && stickB.hasOuterFlange) {
                return "OnFlat - DualTrack StudToPlate";
            }
            return "OnFlat - Standard"; // TODO-DECOMPILE: DAT_0053954c
        }
        // B is C
        // Line 98632: A.HasOuterFlange==1 && B.HasOuterFlange==0
        if (stickA.hasOuterFlange && !stickB.hasOuterFlange) {
            return "OnFlat - DualTrack PlateToStud";
        }
        return "OnFlat - Standard"; // TODO-DECOMPILE: DAT_0053954c
    }
    // Both non-C
    // Line 98639: HasOuterFlange equal
    if (stickA.hasOuterFlange === stickB.hasOuterFlange) {
        return "OnFlat - DualTrack Standard";
    }
    // Line 98642: A.HasOuterFlange==1
    if (stickA.hasOuterFlange)
        return "OnFlat - DualTrack PlateToStud";
    return "OnFlat - DualTrack StudToPlate";
}
// =============================================================================
// classifyOnEdge — port of FUN_00538e70 (line 98448)
//
// Truss-chord × truss-chord. Calls the (decompiled-as-empty)
// FUN_00539998/FUN_005399d0/FUN_00538aa0 helpers; we treat those as opaque
// flag-byte readers.
// =============================================================================
function classifyOnEdge(stickA, stickB, _flags) {
    // FUN_00538aa0 is decompiled as a 56-byte stub returning a tested byte.
    // Its three calls in FUN_00538e70 are gated 1/2/3 successful in sequence.
    // We can't see what byte FUN_00538aa0 reads from `param_1` — Ghidra has
    // optimised it away. From context, the three calls likely test:
    //   1. HasOuterFlange (or some "this is the simple case" flag)
    //   2. IsHybridFlange
    //   3. some other section property
    // We approximate using the visible field semantics.
    //
    // TODO-DECOMPILE: the three FUN_00538aa0 calls test bytes we couldn't
    // resolve. Approximation below is best-effort. Verify via Frida.
    // Line 98487: (param_1[0x14] == 1) && (param_2[0x14] == '\0')
    //   = A.HasOuterFlange && !B.HasOuterFlange
    if (stickA.hasOuterFlange && !stickB.hasOuterFlange) {
        // Line 98488: (param_1[1] == param_2[1]) || (*param_1 == 0)
        if (stickA.secondaryFlag === stickB.secondaryFlag || !stickA.isCSection) {
            return "None";
        }
        return "OnEdge - LipNotches";
    }
    // Line 98495: (param_1[0x14] == 0) && (param_2[0x14] == '\x01')
    //   = !A.HasOuterFlange && B.HasOuterFlange
    if (!stickA.hasOuterFlange && stickB.hasOuterFlange) {
        return "OnEdge - Over";
    }
    // Line 98498: (*param_2 == '\0') || (*param_1 == 0)
    if (!stickB.isCSection || !stickA.isCSection) {
        // Line 98499: (((*param_1 ^ 1) == 0) || (*param_2 != '\0'))
        // i.e. (A.IsCSection==1) || (B.IsCSection)
        if (stickA.isCSection || stickB.isCSection) {
            // Line 98500: ((*param_1 ^ 1) == 0)  — A.IsCSection==1
            if (stickA.isCSection) {
                // Line 98501: param_1[1] == param_2[1] (secondaryFlag equal)
                if (stickA.secondaryFlag === stickB.secondaryFlag) {
                    return "OnEdge - LipNotchedStandard2";
                }
                return "OnEdge - LipNotchedStandard3";
            }
            return "OnEdge - Standard";
        }
        return "OnEdge - Standard";
    }
    // Both C-section, both HasOuterFlange equal (neither asymmetric).
    // Line 98517: fallback "OnEdge - LipNotchedStandard"
    return "OnEdge - LipNotchedStandard";
}
// =============================================================================
// classifyMixed — port of FUN_00538bb8 (line 98341)
//
// One side is truss-chord, the other isn't. Combines the IsBoxing bit-flag
// bytes and dispatches on bit 4 (OnEdge subgroup) and the truss-chord side.
// =============================================================================
function classifyMixed(stickA, stickB, flags) {
    // Line 98367-98370: combine = byteA.IsBoxing | byteB.IsBoxing
    // (FUN_00407910 is a byte-extend; effective: combine = a | b)
    const combinedBoxing = stickA.isBoxing | stickB.isBoxing;
    // Line 98371: (combinedBoxing & 4) == 0 — NOT in OnEdge subgroup
    if ((combinedBoxing & 0x4) === 0) {
        // Line 98372-98378: geometry overlap tests (FUN_0042eae8 sequence).
        // We ASSUME the caller has filtered to overlapping crossings; if so the
        // result is true here, mirroring the decompile's "if all overlap tests
        // pass" path.
        //
        // TODO-DECOMPILE: in the original, the geometry tests can short-circuit
        // to the chord-on-chord ordering branches (line 98381-98403). Without
        // geometry coordinates we approximate:
        // Line 98381: param_2.IsTrussChord != 0   — B is the truss chord
        if (stickB.isTrussChord) {
            // Line 98390: "OnFlat - Over" — connector (B) chord ordering passes
            // The full decompile does two `FUN_0042eae8` pairs; if both indicate
            // ordering ⇒ Over, else fallthrough to default. Since we don't have
            // geometry here we default to Over (the dominant case).
            // TODO-DECOMPILE: needs caller-supplied ordering hint to disambiguate
            // Over vs. None (the rare opposite ordering).
            return "OnFlat - Over";
        }
        // Line 98393: param_1.IsTrussChord != 0  — A is the truss chord
        if (stickA.isTrussChord) {
            // Line 98401: "None" path requires a specific anti-ordering — we
            // default to the fallback "OnFlat - Swaged" (DAT_00538da8 inferred
            // from decoder report §6.3 default).
            // TODO-DECOMPILE: DAT_00538da8 — string-pointer not resolved.
            // "OnFlat - Swaged" inferred (decoder §6.3).
            return "OnFlat - Swaged";
        }
        // Default fallthrough — DAT_00538da8 ⇒ "OnFlat - Swaged" (inferred).
        return "OnFlat - Swaged";
    }
    // (combinedBoxing & 4) != 0 — OnEdge subgroup
    // Line 98427: (*param_1 == '\0') || (param_1[0x13] != '\x02')
    //   = !A.IsCSection || A.IsBoxing != 2
    if (!stickA.isCSection || stickA.isBoxing !== 2) {
        // Line 98428: (*param_2 == '\0') || (param_2[0x13] != '\x02')
        if (!stickB.isCSection || stickB.isBoxing !== 2) {
            // Line 98429: A.IsBoxing == B.IsBoxing
            if (stickA.isBoxing === stickB.isBoxing) {
                return "OnFlat - Omega";
            }
            return "None";
        }
    }
    // TODO-DECOMPILE: DAT_00538da8 fallback path. "OnFlat - Swaged" inferred.
    return "OnFlat - Swaged";
}
// =============================================================================
// Helper: pack a JointFlags from a raw param_3 ushort
//
// Useful for tests + for future frame-context.ts plumbing where we'll derive
// the raw bitmask from frame name / plan name / stick patterns and feed it
// straight in.
// =============================================================================
export function unpackJointFlags(param3) {
    return {
        forReversed: (param3 & 0x0001) !== 0,
        forSuppressSwage: (param3 & 0x0002) !== 0,
        forLipNotchedCorners: (param3 & 0x0004) !== 0,
        forDualTrack: (param3 & 0x0020) !== 0,
        forAsymOverSwaged: (param3 & 0x0040) !== 0,
        forWebIntersection: (param3 & 0x0080) !== 0,
        forTabbed: (param3 & 0x0100) !== 0,
        forBackToBack: (param3 & 0x0200) !== 0,
        forLayer2: (param3 & 0x0400) !== 0,
        forBoxing: (param3 & 0x0800) !== 0,
        // forSplicing's bit position is unconfirmed — set to false unconditionally.
        // TODO-DECOMPILE: identify forSplicing's bit from the TRelationship enum
        // dump (line 10210-10222 of strings) and wire it here.
        forSplicing: false,
    };
}
/** All-zero flags — sensible default for "plain Standard joint, no overrides". */
export const NO_FLAGS = {
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
