/**
 * HYTEK FrameCAD Detailer machine setups — AUTO-GENERATED from
 * HYTEK MACHINE TYPES *.sups (master copy on Y:\\(08) DETAILING\\(13)
 * FRAMECAD\\FrameCAD DETAILER\\HYTEK MACHINE_FRAME TYPES\\).
 *
 * DO NOT EDIT BY HAND. Regenerate with:
 *   node scripts/generate-machine-setups.mjs <input-json>
 *
 * Source: HYTEK MACHINE TYPES 20260402.sups
 * Generated: 2026-04-30T05:42:09.245Z
 */
export interface ChamferPoint {
    x: number;
    y: number;
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
    chamferDetail: ChamferPoint[];
    trussChamferDetail: ChamferPoint[];
    webChamferDetail: ChamferPoint[];
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
