/**
 * HYTEK FrameCAD Detailer machine setups — AUTO-GENERATED from
 * HYTEK MACHINE TYPES *.sups (master copy on Y:\\(08) DETAILING\\(13)
 * FRAMECAD\\FrameCAD DETAILER\\HYTEK MACHINE_FRAME TYPES\\).
 *
 * DO NOT EDIT BY HAND. Regenerate with:
 *   node scripts/generate-machine-setups.mjs <input-.sups-or-json>
 *
 * Source: HYTEK MACHINE TYPES 20260402.sups
 * Generated: 2026-05-04T06:17:25.301Z
 */
export interface ChamferPoint {
    x: number;
    y: number;
}
/** A single Detailer tool entry — tool name, draw style, ID, dimensional sizes. */
export interface ToolEntry {
    /** Detailer's internal tool name, e.g. "Dimple1", "LipNotch", "Swage". */
    fName: string;
    /** Detailer's draw style enum, e.g. "dsDimpleHole", "dsLipcut". */
    drawStyle: string;
    /** Detailer's tool ID — referenced by RFY tool-code mapping. */
    id: number;
    /** Tool length (e.g. LipNotch=48mm or 75mm depending on profile width). */
    length: number;
    /** Primary tool dimension (varies — Dimple1=10mm, LeftTab=50mm, etc.). */
    size1: number;
    /** Secondary tool dimension (e.g. Dimple1.size2=7 = dimple radius). */
    size2: number;
}
/** A fastener-mating rule: which Detailer tool serves which CSV condition. */
export interface FastenerEntry {
    /** Tool name to emit (e.g. "Dimple1", "FlangeHole", "Service"). */
    toolName: string;
    /** CSV condition pattern (e.g. "d1d1", "fh", "sh", "slot"). */
    condition: string;
}
/** Per-profile section options — Y-positions of dimples and flange holes. */
export interface SectionOptions {
    /** Whether this profile can be boxed (back-to-back paired). */
    boxable: boolean;
    /** Mid-track end clearance for deflection tracks. */
    deflectionTrackEndClearance: number;
    /** Mid-track screw height for deflection tracks. */
    deflectionTrackScrewHeight: number;
    /** True if dimple operations come in pairs (one per flange). */
    dualFasteners: boolean;
    /** Y-position (mm from web edge) of primary dimple/fastener. */
    fastener1: number;
    /** Tool name for primary fastener (typically "Dimple1"). */
    fastener1Name: string;
    /** Y-position of secondary fastener; -1 = none. */
    fastener2: number;
    /** Tool name for secondary fastener. */
    fastener2Name: string;
    /** Y-position of flange-bolt hole; -1 = none. */
    flangeBoltHoleHeight: number;
    /** Y-position of flange hole. */
    flangeHoleHeight: number;
    /** Inner bend radius of the section profile. */
    innerBendRadius: number;
    /** Auto-emit chamfer at end? */
    automaticChamfer: boolean;
    /** Auto-emit cruciform pattern? */
    automaticCruciform: boolean;
    /** Pitch between triple-hole-pattern holes. */
    tripleHoleSpacing: number;
}
/** Profile geometry (web depth, flange widths, lip lengths). */
export interface ProfileGeometry {
    shapeClassification: string;
    leftFlange: number;
    rightFlange: number;
    flangeLabel: string;
    web: number;
    leftLip: number;
    rightLip: number;
}
/** Material spec (BMT, coating, steel grade). */
export interface MaterialSpec {
    bmt?: {
        color: string;
        thickness: number;
    };
    coating?: {
        displayLabel: string;
        minMass: number;
    };
    steelSpec: string;
    strength?: {
        displayLabel: string;
        elongation: number;
        tensile: number;
        yield: number;
    };
}
/** Per-profile section setup (one per profile-gauge combination). */
export interface SectionSetup {
    automaticallyDetermineExportSection: boolean;
    guid: string;
    name: string;
    manualRFYImperialLabel: string;
    manualRFYMetricLabel: string;
    manualSectionIDForRFX: number;
    profile?: ProfileGeometry;
    material?: MaterialSpec;
    sectionOptions?: SectionOptions;
}
/** Tool catalog: chamfer geometry + tool entries categorised by activation. */
export interface ToolSetup {
    chamferDetail: ChamferPoint[];
    trussChamferDetail: ChamferPoint[];
    webChamferDetail: ChamferPoint[];
    /** Tools always available (Dimple1, LipNotch, WebNotch, Bad, Swage, Dummy). */
    fixedTools: ToolEntry[];
    /** Tools enabled by default (Service, FlangeHole, TripleWebHole, etc.). */
    optionalOnTools: ToolEntry[];
    /** Tools available but not enabled by default (Tab, Logo, BoltHole, FlangeBolt, ...). */
    optionalOffTools: ToolEntry[];
}
export interface MachineSetup {
    id: string;
    name: string;
    machineModel: string;
    machineSeries: string;
    defaultGuid: string;
    instanceGuid: string;
    chamferTolerance: number;
    braceToDimple: number;
    braceToWebhole: number;
    toolClearance: number;
    dimpleToEnd: number;
    boltHoleToEnd: number;
    webHoleToEnd: number;
    b2BStickClearance: number;
    boxedEndLength: number;
    boxedFirstDimpleOffset: number;
    boxDimpleSpacing: number;
    doorSillNotchOffset: number;
    doubleBoltSpacing: number;
    endClearance: number;
    endToTabDistance: number;
    extraFlangeHoleOffset: number;
    extraFlangeHoleOffsetAt90: number;
    fPlateWidthDifferential: number;
    flangeSlotHeight: number;
    largeServiceToLeadingEdgeDistance: number;
    largeServiceToTrailingEdgeDistance: number;
    maxBoxToBoxHoleDelta: number;
    maxSplicingLength: number;
    minimumTagLength: number;
    splicingDimpleSpacing: number;
    tabToTabDistance: number;
    web2Web: number;
    braceAsStud: boolean;
    extraChamfers: boolean;
    endToEndChamfers: boolean;
    fDualSection: boolean;
    fixedWeb2Web: boolean;
    invertDimpleFlangeFastenings: boolean;
    onEdgeLipNotches: boolean;
    onFlySwage: boolean;
    suppressFasteners: boolean;
    useMaleFemaleDimples: boolean;
    /** End-clearance reference scheme — "ecrOutsideWeb" or other variants. */
    endClearanceReference: string;
    /** Extra flange-hole policy — "efhNone" / "efhSingle" / "efhDouble". */
    extraFlangeHoles: string;
    /** Back-to-back tooling mode — "b2bWebHole" enables B2B partner Web ops. */
    fB2BTooling: string;
    /** Fastener-mating mode — "fmNone" / "fmDimple" / "fmFlangeHole". */
    fastenerMating: string;
    /** Plate boxing piece type — "bptSelf" or "bptParent". */
    plateBoxingPieceType: string;
    /** Stud boxing piece type — "bptSelf" or "bptParent". */
    studBoxingPieceType: string;
    chamferDetail: ChamferPoint[];
    trussChamferDetail: ChamferPoint[];
    webChamferDetail: ChamferPoint[];
    /** Default section options — applied when a stick has no per-section override. */
    defaultSectionOptions?: SectionOptions;
    /** Per-profile-gauge section setups (e.g. 70S41_0.75 has its own options). */
    sectionSetups: SectionSetup[];
    /** Available service-hole tool names ("Service", "LongService"). */
    serviceHoleOptions: string[];
    /** Fastener-tool mapping: which tool serves which CSV condition. */
    fasteners: FastenerEntry[];
    /** Full tool catalog: chamfer geometry + FixedTools/OptionalOnTools/OptionalOffTools. */
    toolSetup?: ToolSetup;
    /** Design-check labels (e.g. "Unassigned Configs"). */
    designChecks: string[];
}
export declare const MACHINE_SETUPS: Record<string, MachineSetup>;
/**
 * Map profile web (in mm) to the simplest non-special HYTEK setup.
 * For 70S41 input, returns setup ID "2" (F325iT 70mm).
 */
export declare const SETUP_BY_PROFILE_WEB: Record<number, string>;
/**
 * Look up the appropriate machine setup for a stick's profile.
 *
 * @param profileWeb - Web depth in mm (e.g. 70 for 70S41 profile)
 * @returns MachineSetup or undefined if no match
 */
export declare function getMachineSetupForProfile(profileWeb: number): MachineSetup | undefined;
/**
 * Default fallback setup — used if the profile web doesn't match any HYTEK
 * configured machine. Returns the F325iT 70mm setup (most common LBW profile).
 */
export declare function getDefaultMachineSetup(): MachineSetup;
/**
 * Look up a per-profile SectionSetup for a stick — matches by metric label
 * (e.g. "70S41_0.75"). Each section provides per-profile dimple Y-positions
 * (Fastener1) and flange-hole heights — Detailer's actual values, not the
 * codec's empirical guesses.
 *
 * @param setup    The MachineSetup to search.
 * @param sectionName  Section name like "70S41_0.75" or "89S41_1.15".
 * @returns The matching SectionSetup or undefined.
 */
export declare function findSectionSetup(setup: MachineSetup, sectionName: string): SectionSetup | undefined;
/**
 * Look up a tool entry in any of FixedTools / OptionalOnTools / OptionalOffTools
 * by FName. Returns the tool entry — gives access to size1/size2/length/id.
 *
 * @example
 *   const dimple = findTool(setup, "Dimple1");  // size1=10 (the dimple width)
 *   const lipNotch = findTool(setup, "LipNotch");  // length=48 (or 75 for 104mm)
 *   const tab = findTool(setup, "Tab");  // size1=35 (the start-tab clearance)
 */
export declare function findTool(setup: MachineSetup, fName: string): ToolEntry | undefined;
/**
 * Get the "end-clearance span" — the distance from a stick's end where Detailer
 * places the start of the LipNotch / Swage / Tab cap. This is the canonical
 * derivation used throughout Detailer:
 *
 *   span = TabSize + EndClearance
 *
 * For HYTEK F325iT setups this is 39mm (Tab=35, EndClearance=4) for all
 * profiles except the Demo Setup (37mm) and 104mm (40mm).
 *
 * Use this in rules code instead of hardcoding 39.
 */
export declare function endClearanceSpan(setup: MachineSetup): number;
/**
 * Get the dimple longitudinal offset from a stick's end — the position along
 * the stick where the InnerDimple sits. Detailer's derivation:
 *
 *   offset = EndClearance + (TabSize - Dimple1.Size1) / 2
 *
 * For HYTEK F325iT 70/89mm setups this is 16.5mm (4 + (35-10)/2). For 104mm
 * setup (EndClearance=5) it's 17.5mm.
 */
export declare function dimpleEndOffset(setup: MachineSetup): number;
/**
 * Get the lip-notch tool length for the setup. Detailer uses different lip-notch
 * widths per profile (70=48mm, 75/78=60mm, 89=48mm, 104=75mm). Use this
 * instead of hardcoding the internal-lip-notch span in frame-context rules.
 */
export declare function lipNotchToolLength(setup: MachineSetup): number;
