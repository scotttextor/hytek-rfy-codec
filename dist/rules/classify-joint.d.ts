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
/**
 * The 28 classification name strings Detailer dispatches on. These are the
 * exact `ActionDefsManager` keys — emitting any other string from
 * classifyJoint() means we drift from Detailer parity.
 *
 * Verified against the wide-string literals in FUN_00538bb8 / FUN_00538e70 /
 * FUN_00539258 and the strings table mined in detailer-rule-decoded.md §2.
 */
export type JointClassification = "None" | "OnEdge - Standard" | "OnEdge - LipNotchedStandard" | "OnEdge - LipNotchedStandard2" | "OnEdge - LipNotchedStandard3" | "OnEdge - LipNotches" | "OnEdge - Over" | "OnEdge - PartialFlanges" | "OnFlat - Standard" | "OnFlat - Reversed" | "OnFlat - LipNotchedCorners" | "OnFlat - LipNotchedCorners Reversed" | "OnFlat - Tabbed" | "OnFlat - Tabs" | "OnFlat - TabHoles" | "OnFlat - WebIntersections Bad" | "OnFlat - Over" | "OnFlat - Over2" | "OnFlat - Swaged" | "OnFlat - Swaged2" | "OnFlat - Swaged3" | "OnFlat - TrussBoxed" | "OnFlat - Omega" | "OnFlat - Frama" | "OnFlat - DualTrack Standard" | "OnFlat - DualTrack PlateToStud" | "OnFlat - DualTrack StudToPlate";
/**
 * The 11-bit `param_3` flag mask passed to `MakeOperations`. Each bit gates a
 * different classifier branch — see decoder report §2 "param_3 — The flag
 * bitmask".
 *
 * In Detailer this is a `ushort` packed via the `TRelationship` enum
 * (line 10210-10222 of the strings dump). The bit positions here are the
 * actual masks used by FUN_00539258 / FUN_00538bb8.
 */
export interface JointFlags {
    /** 0x0001 — "Reversed" branch (OnFlat - Reversed). */
    forReversed: boolean;
    /** 0x0002 — Suppress-swage (returns "None" instead of OnFlat - Swaged). */
    forSuppressSwage: boolean;
    /** 0x0004 — Lip-notched-corner cuts (OnFlat - LipNotchedCorners). */
    forLipNotchedCorners: boolean;
    /** 0x0020 — Double-plate joint (track over track). */
    forDualTrack: boolean;
    /** 0x0040 — Asymmetric Over-vs-Swaged selector (used with HasOuterFlange). */
    forAsymOverSwaged: boolean;
    /** 0x0080 — Web-intersection / Tabs flag (controls OnFlat-Tabs/TabHoles/WebIntersectionsBad). */
    forWebIntersection: boolean;
    /** 0x0100 — Tabbed cap (truss chord at endgable etc.). */
    forTabbed: boolean;
    /** 0x0200 — Back-to-back. Forces "None" early (no ops). */
    forBackToBack: boolean;
    /** 0x0400 — "Layer 2" Over/Swaged variants (Over2 / Swaged2 / Swaged3). */
    forLayer2: boolean;
    /** 0x0800 — Boxing / FRAMA proprietary system. */
    forBoxing: boolean;
    /** Splicing flag — present in the enum but does not gate the branches we
     *  could verify in the decompile. Reserved for future use; included so the
     *  flag derivation site (frame-context.ts) can stash the bit. */
    forSplicing: boolean;
}
/**
 * Per-stick "classifier props" record. In Detailer, FUN_005456bc builds a
 * 0x14-byte struct for each stick before calling FUN_00538b00. We expose
 * named booleans/numbers — the actual byte offsets don't matter to the port,
 * only the logical fields.
 *
 * Field provenance (decoder report §2):
 *   isCSection      ← FUN_00545fb4 (0=OnEdge, 1=OnFlat orientation)
 *   secondaryFlag   ← byte at offset 0x01 of the record (likely IsHybridFlange-sub
 *                     used in OnEdge LipNotchedStandard 2/3 selection — see
 *                     port-notes.md "Ambiguous offsets")
 *   swageClearance  ← *(section + 0x4c) — section's swage-clearance flag
 *   isHybridFlange  ← FUN_0054eba4 (section.flangeType == onEdge)
 *   isTrussChord    ← *(stick.section.vtable[0x1c] + 8) (BChord/TChord)
 *   isBoxing        ← *(section + 0x5e) (Box/Brace marker — bit-flagged: 0/1/2,
 *                     bit2 = "OnEdge subgroup", value 2 = Omega sentinel)
 *   hasOuterFlange  ← FUN_0054e310 (section has Pre-cut flange flag)
 *   length          ← stick length (mm) — present for completeness, not
 *                     consumed by the classifier branches we ported. The
 *                     overlap test FUN_00539950 uses geometry doubles which
 *                     we assume the caller has already established (i.e. only
 *                     call classifyJoint() for sticks that geometrically
 *                     overlap).
 */
export interface StickProps {
    isCSection: boolean;
    /** Byte at record offset 0x01 — semantics ambiguous in decompile; used only
     *  in OnEdge LipNotchedStandard variant 2/3 selection. Treat as opaque
     *  match flag (compare with partner's secondaryFlag for equality). */
    secondaryFlag: number;
    swageClearance: boolean;
    isHybridFlange: boolean;
    isTrussChord: boolean;
    /** 0=non-boxed, 1=boxed, 2=omega-sentinel, bit 0x4 = "OnEdge subgroup". */
    isBoxing: number;
    hasOuterFlange: boolean;
    /** Optional — length in mm. Reserved for the geometry-overlap test, which
     *  callers should run before invoking classifyJoint(). */
    length?: number;
}
export declare enum SectionUsage {
    Unknown = 0,
    TopPlate = 1,
    BottomPlate = 2,
    HeadPlate = 3,
    Plate = 4,
    Sill = 5,
    TopChord = 6,
    BottomChord = 7,
    Brace = 8,
    Stud = 9,
    TrimStud = 10,
    JackStud = 11,
    Rail = 12,
    EndStud = 13
}
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
export declare function classifyJoint(stickA: StickProps, stickB: StickProps, flags: JointFlags): JointClassification;
export declare function unpackJointFlags(param3: number): JointFlags;
/** All-zero flags — sensible default for "plain Standard joint, no overrides". */
export declare const NO_FLAGS: JointFlags;
