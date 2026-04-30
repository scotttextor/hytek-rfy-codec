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

export interface ChamferPoint { x: number; y: number; }

export interface MachineSetup {
  id: string;
  name: string;
  machineModel: string;
  machineSeries: string;
  defaultGuid: string;
  instanceGuid: string;

  // Tolerances/clearances (mm)
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

  // Boolean flags
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

  // Chamfer geometry: (x,y) points defining the cut shape
  chamferDetail: ChamferPoint[];        // standard chamfer triangle
  trussChamferDetail: ChamferPoint[];   // larger truss-end chamfer
  webChamferDetail: ChamferPoint[];     // web-crossing chamfer
}

export const MACHINE_SETUPS: Record<string, MachineSetup> = {
  "0": {
    "id": "0",
    "name": "Demo Machine Setup",
    "machineModel": "F325iT",
    "machineSeries": "F300i",
    "defaultGuid": "{EBBA3ED7-F38C-460A-BFB7-02D02391B7FB}",
    "instanceGuid": "{F50377E4-F0AD-4660-B6E2-5B1F6FE572D4}",
    "chamferTolerance": 2,
    "braceToDimple": 50,
    "braceToWebhole": 100,
    "toolClearance": 2,
    "dimpleToEnd": 10,
    "boltHoleToEnd": 20,
    "webHoleToEnd": 16,
    "b2BStickClearance": 2,
    "boxedEndLength": 200,
    "boxedFirstDimpleOffset": 10,
    "boxDimpleSpacing": 500,
    "doorSillNotchOffset": 0,
    "doubleBoltSpacing": 30,
    "endClearance": 2,
    "endToTabDistance": 400,
    "extraFlangeHoleOffset": 9,
    "extraFlangeHoleOffsetAt90": 15,
    "fPlateWidthDifferential": 3,
    "flangeSlotHeight": 11.1,
    "largeServiceToLeadingEdgeDistance": 600,
    "largeServiceToTrailingEdgeDistance": 700,
    "maxBoxToBoxHoleDelta": 2,
    "maxSplicingLength": 500,
    "minimumTagLength": 20,
    "splicingDimpleSpacing": 100,
    "tabToTabDistance": 295,
    "web2Web": 58,
    "braceAsStud": false,
    "extraChamfers": false,
    "endToEndChamfers": false,
    "fDualSection": false,
    "fixedWeb2Web": false,
    "invertDimpleFlangeFastenings": false,
    "onEdgeLipNotches": true,
    "onFlySwage": false,
    "suppressFasteners": false,
    "useMaleFemaleDimples": false,
    "chamferDetail": [
      {
        "x": 14.5,
        "y": 0
      },
      {
        "x": 6.5,
        "y": 5
      },
      {
        "x": 0,
        "y": 11.5
      }
    ],
    "trussChamferDetail": [
      {
        "x": 21.9,
        "y": 0
      },
      {
        "x": 21.3,
        "y": 1.9
      },
      {
        "x": 10.4,
        "y": 6.1
      },
      {
        "x": 3.4,
        "y": 12.9
      },
      {
        "x": 0,
        "y": 21
      }
    ],
    "webChamferDetail": [
      {
        "x": 5,
        "y": 0
      },
      {
        "x": 1.4,
        "y": 1.4
      },
      {
        "x": 0,
        "y": 5
      }
    ]
  },
  "1": {
    "id": "1",
    "name": "F325iT 104mm",
    "machineModel": "F325iT",
    "machineSeries": "F300i",
    "defaultGuid": "{F37D7755-BCB8-4DC5-80E6-174692909A23}",
    "instanceGuid": "{563E46CA-1769-4BDA-B3A4-F44BEED3DA65}",
    "chamferTolerance": 4,
    "braceToDimple": 60,
    "braceToWebhole": 120,
    "toolClearance": 8,
    "dimpleToEnd": 10,
    "boltHoleToEnd": 20,
    "webHoleToEnd": 10,
    "b2BStickClearance": 2,
    "boxedEndLength": 70,
    "boxedFirstDimpleOffset": 10,
    "boxDimpleSpacing": 600,
    "doorSillNotchOffset": 0,
    "doubleBoltSpacing": 30,
    "endClearance": 5,
    "endToTabDistance": 400,
    "extraFlangeHoleOffset": 9,
    "extraFlangeHoleOffsetAt90": 15,
    "fPlateWidthDifferential": 3,
    "flangeSlotHeight": 11.1,
    "largeServiceToLeadingEdgeDistance": 600,
    "largeServiceToTrailingEdgeDistance": 700,
    "maxBoxToBoxHoleDelta": 2,
    "maxSplicingLength": 500,
    "minimumTagLength": 20,
    "splicingDimpleSpacing": 100,
    "tabToTabDistance": 295,
    "web2Web": 58,
    "braceAsStud": false,
    "extraChamfers": false,
    "endToEndChamfers": false,
    "fDualSection": false,
    "fixedWeb2Web": false,
    "invertDimpleFlangeFastenings": false,
    "onEdgeLipNotches": true,
    "onFlySwage": false,
    "suppressFasteners": false,
    "useMaleFemaleDimples": false,
    "chamferDetail": [
      {
        "x": 14.5,
        "y": 0
      },
      {
        "x": 6.5,
        "y": 5
      },
      {
        "x": 0,
        "y": 11.5
      }
    ],
    "trussChamferDetail": [
      {
        "x": 21.9,
        "y": 0
      },
      {
        "x": 21.3,
        "y": 1.9
      },
      {
        "x": 10.4,
        "y": 6.1
      },
      {
        "x": 3.4,
        "y": 12.9
      },
      {
        "x": 0,
        "y": 21
      }
    ],
    "webChamferDetail": [
      {
        "x": 5,
        "y": 0
      },
      {
        "x": 1.4,
        "y": 1.4
      },
      {
        "x": 0,
        "y": 5
      }
    ]
  },
  "2": {
    "id": "2",
    "name": "F325iT 70mm",
    "machineModel": "F325iT",
    "machineSeries": "F300i",
    "defaultGuid": "{49529AD2-E70F-4565-9DC5-9777AE5A7EC4}",
    "instanceGuid": "{D02D859F-4D4C-41E8-81AF-884E386FEEC9}",
    "chamferTolerance": 4,
    "braceToDimple": 50,
    "braceToWebhole": 100,
    "toolClearance": 2,
    "dimpleToEnd": 10,
    "boltHoleToEnd": 20,
    "webHoleToEnd": 16,
    "b2BStickClearance": 2,
    "boxedEndLength": 70,
    "boxedFirstDimpleOffset": 50,
    "boxDimpleSpacing": 1200,
    "doorSillNotchOffset": 0,
    "doubleBoltSpacing": 30,
    "endClearance": 4,
    "endToTabDistance": 400,
    "extraFlangeHoleOffset": 9,
    "extraFlangeHoleOffsetAt90": 15,
    "fPlateWidthDifferential": 3,
    "flangeSlotHeight": 11.1,
    "largeServiceToLeadingEdgeDistance": 600,
    "largeServiceToTrailingEdgeDistance": 700,
    "maxBoxToBoxHoleDelta": 2,
    "maxSplicingLength": 500,
    "minimumTagLength": 20,
    "splicingDimpleSpacing": 100,
    "tabToTabDistance": 295,
    "web2Web": 50.4000015258789,
    "braceAsStud": false,
    "extraChamfers": false,
    "endToEndChamfers": false,
    "fDualSection": false,
    "fixedWeb2Web": false,
    "invertDimpleFlangeFastenings": false,
    "onEdgeLipNotches": true,
    "onFlySwage": false,
    "suppressFasteners": false,
    "useMaleFemaleDimples": false,
    "chamferDetail": [
      {
        "x": 14.5,
        "y": 0
      },
      {
        "x": 6.5,
        "y": 5
      },
      {
        "x": 0,
        "y": 11.5
      }
    ],
    "trussChamferDetail": [
      {
        "x": 21.9,
        "y": 0
      },
      {
        "x": 21.3,
        "y": 1.9
      },
      {
        "x": 10.4,
        "y": 6.1
      },
      {
        "x": 3.4,
        "y": 12.9
      },
      {
        "x": 0,
        "y": 21
      }
    ],
    "webChamferDetail": [
      {
        "x": 5,
        "y": 0
      },
      {
        "x": 1.4,
        "y": 1.4
      },
      {
        "x": 0,
        "y": 5
      }
    ]
  },
  "3": {
    "id": "3",
    "name": "F325iT 70mm B2B Centre Hole",
    "machineModel": "F325iT",
    "machineSeries": "F300i",
    "defaultGuid": "{D3D0912C-0586-4627-9C29-E6E87C27E05D}",
    "instanceGuid": "{E021899C-3426-4C0E-A2A6-C67426D15E1F}",
    "chamferTolerance": 2,
    "braceToDimple": 50,
    "braceToWebhole": 100,
    "toolClearance": 2,
    "dimpleToEnd": 10,
    "boltHoleToEnd": 20,
    "webHoleToEnd": 16,
    "b2BStickClearance": 2,
    "boxedEndLength": 70,
    "boxedFirstDimpleOffset": 50,
    "boxDimpleSpacing": 1200,
    "doorSillNotchOffset": 0,
    "doubleBoltSpacing": 30,
    "endClearance": 4,
    "endToTabDistance": 400,
    "extraFlangeHoleOffset": 9,
    "extraFlangeHoleOffsetAt90": 15,
    "fPlateWidthDifferential": 3,
    "flangeSlotHeight": 11.1,
    "largeServiceToLeadingEdgeDistance": 600,
    "largeServiceToTrailingEdgeDistance": 700,
    "maxBoxToBoxHoleDelta": 2,
    "maxSplicingLength": 500,
    "minimumTagLength": 20,
    "splicingDimpleSpacing": 100,
    "tabToTabDistance": 295,
    "web2Web": 50.4000015258789,
    "braceAsStud": false,
    "extraChamfers": false,
    "endToEndChamfers": false,
    "fDualSection": false,
    "fixedWeb2Web": false,
    "invertDimpleFlangeFastenings": false,
    "onEdgeLipNotches": true,
    "onFlySwage": false,
    "suppressFasteners": false,
    "useMaleFemaleDimples": false,
    "chamferDetail": [
      {
        "x": 14.5,
        "y": 0
      },
      {
        "x": 6.5,
        "y": 5
      },
      {
        "x": 0,
        "y": 11.5
      }
    ],
    "trussChamferDetail": [
      {
        "x": 21.9,
        "y": 0
      },
      {
        "x": 21.3,
        "y": 1.9
      },
      {
        "x": 10.4,
        "y": 6.1
      },
      {
        "x": 3.4,
        "y": 12.9
      },
      {
        "x": 0,
        "y": 21
      }
    ],
    "webChamferDetail": [
      {
        "x": 5,
        "y": 0
      },
      {
        "x": 1.4,
        "y": 1.4
      },
      {
        "x": 0,
        "y": 5
      }
    ]
  },
  "4": {
    "id": "4",
    "name": "F325iT 75mm",
    "machineModel": "F325iT",
    "machineSeries": "F300i",
    "defaultGuid": "{3A955372-9B98-4BB7-9FC4-0D1FF685DE3A}",
    "instanceGuid": "{25A1EFC1-DD54-4119-86A1-B788E31F8ACA}",
    "chamferTolerance": 4,
    "braceToDimple": 55,
    "braceToWebhole": 100,
    "toolClearance": 6,
    "dimpleToEnd": 10,
    "boltHoleToEnd": 5,
    "webHoleToEnd": 16,
    "b2BStickClearance": 2,
    "boxedEndLength": 70,
    "boxedFirstDimpleOffset": 10,
    "boxDimpleSpacing": 1200,
    "doorSillNotchOffset": 0,
    "doubleBoltSpacing": 30,
    "endClearance": 4,
    "endToTabDistance": 400,
    "extraFlangeHoleOffset": 9,
    "extraFlangeHoleOffsetAt90": 15,
    "fPlateWidthDifferential": 3,
    "flangeSlotHeight": 11.1,
    "largeServiceToLeadingEdgeDistance": 600,
    "largeServiceToTrailingEdgeDistance": 700,
    "maxBoxToBoxHoleDelta": 2,
    "maxSplicingLength": 500,
    "minimumTagLength": 20,
    "splicingDimpleSpacing": 100,
    "tabToTabDistance": 295,
    "web2Web": 58,
    "braceAsStud": false,
    "extraChamfers": false,
    "endToEndChamfers": false,
    "fDualSection": false,
    "fixedWeb2Web": false,
    "invertDimpleFlangeFastenings": false,
    "onEdgeLipNotches": true,
    "onFlySwage": false,
    "suppressFasteners": false,
    "useMaleFemaleDimples": false,
    "chamferDetail": [
      {
        "x": 14.5,
        "y": 0
      },
      {
        "x": 6.5,
        "y": 5
      },
      {
        "x": 0,
        "y": 11.5
      }
    ],
    "trussChamferDetail": [
      {
        "x": 21.9,
        "y": 0
      },
      {
        "x": 21.3,
        "y": 1.9
      },
      {
        "x": 10.4,
        "y": 6.1
      },
      {
        "x": 3.4,
        "y": 12.9
      },
      {
        "x": 0,
        "y": 21
      }
    ],
    "webChamferDetail": [
      {
        "x": 5,
        "y": 0
      },
      {
        "x": 1.4,
        "y": 1.4
      },
      {
        "x": 0,
        "y": 5
      }
    ]
  },
  "5": {
    "id": "5",
    "name": "F325iT 78mm",
    "machineModel": "F325iT",
    "machineSeries": "F300i",
    "defaultGuid": "{30E6C50D-7A02-46C5-9158-D43177F11C64}",
    "instanceGuid": "{876F96C1-E085-4C9A-A4AB-BEFB9572B251}",
    "chamferTolerance": 4,
    "braceToDimple": 55,
    "braceToWebhole": 100,
    "toolClearance": 6,
    "dimpleToEnd": 10,
    "boltHoleToEnd": 5,
    "webHoleToEnd": 16,
    "b2BStickClearance": 2,
    "boxedEndLength": 70,
    "boxedFirstDimpleOffset": 10,
    "boxDimpleSpacing": 600,
    "doorSillNotchOffset": 0,
    "doubleBoltSpacing": 30,
    "endClearance": 4,
    "endToTabDistance": 400,
    "extraFlangeHoleOffset": 9,
    "extraFlangeHoleOffsetAt90": 15,
    "fPlateWidthDifferential": 3,
    "flangeSlotHeight": 11.1000003814697,
    "largeServiceToLeadingEdgeDistance": 600,
    "largeServiceToTrailingEdgeDistance": 700,
    "maxBoxToBoxHoleDelta": 2,
    "maxSplicingLength": 500,
    "minimumTagLength": 20,
    "splicingDimpleSpacing": 100,
    "tabToTabDistance": 295,
    "web2Web": 58,
    "braceAsStud": false,
    "extraChamfers": false,
    "endToEndChamfers": false,
    "fDualSection": false,
    "fixedWeb2Web": false,
    "invertDimpleFlangeFastenings": false,
    "onEdgeLipNotches": true,
    "onFlySwage": false,
    "suppressFasteners": false,
    "useMaleFemaleDimples": false,
    "chamferDetail": [
      {
        "x": 14.5,
        "y": 0
      },
      {
        "x": 6.5,
        "y": 5
      },
      {
        "x": 0,
        "y": 11.5
      }
    ],
    "trussChamferDetail": [
      {
        "x": 21.9,
        "y": 0
      },
      {
        "x": 21.3,
        "y": 1.9
      },
      {
        "x": 10.4,
        "y": 6.1
      },
      {
        "x": 3.4,
        "y": 12.9
      },
      {
        "x": 0,
        "y": 21
      }
    ],
    "webChamferDetail": [
      {
        "x": 5,
        "y": 0
      },
      {
        "x": 1.4,
        "y": 1.4
      },
      {
        "x": 0,
        "y": 5
      }
    ]
  },
  "6": {
    "id": "6",
    "name": "F325iT 89mm",
    "machineModel": "F325iT",
    "machineSeries": "F300i",
    "defaultGuid": "{EE849BCA-3DC1-4238-9E85-AECFA765842B}",
    "instanceGuid": "{4EB34B76-BE5F-4E6F-95F4-D246EF00D378}",
    "chamferTolerance": 4,
    "braceToDimple": 50,
    "braceToWebhole": 100,
    "toolClearance": 2,
    "dimpleToEnd": 10,
    "boltHoleToEnd": 20,
    "webHoleToEnd": 16,
    "b2BStickClearance": 2,
    "boxedEndLength": 70,
    "boxedFirstDimpleOffset": 10,
    "boxDimpleSpacing": 1200,
    "doorSillNotchOffset": 0,
    "doubleBoltSpacing": 30,
    "endClearance": 4,
    "endToTabDistance": 400,
    "extraFlangeHoleOffset": 9,
    "extraFlangeHoleOffsetAt90": 15,
    "fPlateWidthDifferential": 3,
    "flangeSlotHeight": 11.1,
    "largeServiceToLeadingEdgeDistance": 600,
    "largeServiceToTrailingEdgeDistance": 700,
    "maxBoxToBoxHoleDelta": 2,
    "maxSplicingLength": 500,
    "minimumTagLength": 20,
    "splicingDimpleSpacing": 100,
    "tabToTabDistance": 295,
    "web2Web": 50.4000015258789,
    "braceAsStud": false,
    "extraChamfers": false,
    "endToEndChamfers": false,
    "fDualSection": false,
    "fixedWeb2Web": false,
    "invertDimpleFlangeFastenings": false,
    "onEdgeLipNotches": true,
    "onFlySwage": false,
    "suppressFasteners": false,
    "useMaleFemaleDimples": false,
    "chamferDetail": [
      {
        "x": 14.5,
        "y": 0
      },
      {
        "x": 6.5,
        "y": 5
      },
      {
        "x": 0,
        "y": 11.5
      }
    ],
    "trussChamferDetail": [
      {
        "x": 21.9,
        "y": 0
      },
      {
        "x": 21.3,
        "y": 1.9
      },
      {
        "x": 10.4,
        "y": 6.1
      },
      {
        "x": 3.4,
        "y": 12.9
      },
      {
        "x": 0,
        "y": 21
      }
    ],
    "webChamferDetail": [
      {
        "x": 5,
        "y": 0
      },
      {
        "x": 1.4,
        "y": 1.4
      },
      {
        "x": 0,
        "y": 5
      }
    ]
  },
  "7": {
    "id": "7",
    "name": "F325iT 89mm B2B Centre Hole",
    "machineModel": "F325iT",
    "machineSeries": "F300i",
    "defaultGuid": "{AEA1DCB2-5762-4331-94B4-911AB5608468}",
    "instanceGuid": "{D60DB606-4B6F-4A21-A15C-F81D2C4414F1}",
    "chamferTolerance": 2,
    "braceToDimple": 50,
    "braceToWebhole": 100,
    "toolClearance": 2,
    "dimpleToEnd": 10,
    "boltHoleToEnd": 20,
    "webHoleToEnd": 16,
    "b2BStickClearance": 2,
    "boxedEndLength": 70,
    "boxedFirstDimpleOffset": 10,
    "boxDimpleSpacing": 1200,
    "doorSillNotchOffset": 0,
    "doubleBoltSpacing": 30,
    "endClearance": 4,
    "endToTabDistance": 400,
    "extraFlangeHoleOffset": 9,
    "extraFlangeHoleOffsetAt90": 15,
    "fPlateWidthDifferential": 3,
    "flangeSlotHeight": 11.1,
    "largeServiceToLeadingEdgeDistance": 600,
    "largeServiceToTrailingEdgeDistance": 700,
    "maxBoxToBoxHoleDelta": 2,
    "maxSplicingLength": 500,
    "minimumTagLength": 20,
    "splicingDimpleSpacing": 100,
    "tabToTabDistance": 295,
    "web2Web": 50.4000015258789,
    "braceAsStud": false,
    "extraChamfers": false,
    "endToEndChamfers": false,
    "fDualSection": false,
    "fixedWeb2Web": false,
    "invertDimpleFlangeFastenings": false,
    "onEdgeLipNotches": true,
    "onFlySwage": false,
    "suppressFasteners": false,
    "useMaleFemaleDimples": false,
    "chamferDetail": [
      {
        "x": 14.5,
        "y": 0
      },
      {
        "x": 6.5,
        "y": 5
      },
      {
        "x": 0,
        "y": 11.5
      }
    ],
    "trussChamferDetail": [
      {
        "x": 21.9,
        "y": 0
      },
      {
        "x": 21.3,
        "y": 1.9
      },
      {
        "x": 10.4,
        "y": 6.1
      },
      {
        "x": 3.4,
        "y": 12.9
      },
      {
        "x": 0,
        "y": 21
      }
    ],
    "webChamferDetail": [
      {
        "x": 5,
        "y": 0
      },
      {
        "x": 1.4,
        "y": 1.4
      },
      {
        "x": 0,
        "y": 5
      }
    ]
  },
  "8": {
    "id": "8",
    "name": "F325iT 89mm LINEAR",
    "machineModel": "F325iT",
    "machineSeries": "F300i",
    "defaultGuid": "{C5D63B05-EF10-4662-B13A-7F772565BC0A}",
    "instanceGuid": "{8E56329F-0346-4E5E-B61F-C6AE5C05DB0E}",
    "chamferTolerance": 4,
    "braceToDimple": 50,
    "braceToWebhole": 100,
    "toolClearance": 2,
    "dimpleToEnd": 10,
    "boltHoleToEnd": 20,
    "webHoleToEnd": 16,
    "b2BStickClearance": 2,
    "boxedEndLength": 70,
    "boxedFirstDimpleOffset": 10,
    "boxDimpleSpacing": 1200,
    "doorSillNotchOffset": 0,
    "doubleBoltSpacing": 30,
    "endClearance": 4,
    "endToTabDistance": 400,
    "extraFlangeHoleOffset": 9,
    "extraFlangeHoleOffsetAt90": 15,
    "fPlateWidthDifferential": 3,
    "flangeSlotHeight": 11.1,
    "largeServiceToLeadingEdgeDistance": 600,
    "largeServiceToTrailingEdgeDistance": 700,
    "maxBoxToBoxHoleDelta": 2,
    "maxSplicingLength": 500,
    "minimumTagLength": 20,
    "splicingDimpleSpacing": 100,
    "tabToTabDistance": 295,
    "web2Web": 50.4000015258789,
    "braceAsStud": false,
    "extraChamfers": false,
    "endToEndChamfers": false,
    "fDualSection": false,
    "fixedWeb2Web": false,
    "invertDimpleFlangeFastenings": false,
    "onEdgeLipNotches": true,
    "onFlySwage": false,
    "suppressFasteners": false,
    "useMaleFemaleDimples": false,
    "chamferDetail": [
      {
        "x": 14.5,
        "y": 0
      },
      {
        "x": 6.5,
        "y": 5
      },
      {
        "x": 0,
        "y": 11.5
      }
    ],
    "trussChamferDetail": [
      {
        "x": 21.9,
        "y": 0
      },
      {
        "x": 21.3,
        "y": 1.9
      },
      {
        "x": 10.4,
        "y": 6.1
      },
      {
        "x": 3.4,
        "y": 12.9
      },
      {
        "x": 0,
        "y": 21
      }
    ],
    "webChamferDetail": [
      {
        "x": 5,
        "y": 0
      },
      {
        "x": 1.4,
        "y": 1.4
      },
      {
        "x": 0,
        "y": 5
      }
    ]
  },
  "9": {
    "id": "9",
    "name": "F325iT 90mm (PERTH)",
    "machineModel": "F325iT",
    "machineSeries": "F300i",
    "defaultGuid": "{3B6C2073-D00B-48DD-926F-E15755F67B2F}",
    "instanceGuid": "{6BB82583-1F04-4348-AA3C-8CA943A0C206}",
    "chamferTolerance": 4,
    "braceToDimple": 50,
    "braceToWebhole": 100,
    "toolClearance": 2,
    "dimpleToEnd": 10,
    "boltHoleToEnd": 20,
    "webHoleToEnd": 16,
    "b2BStickClearance": 2,
    "boxedEndLength": 70,
    "boxedFirstDimpleOffset": 10,
    "boxDimpleSpacing": 1200,
    "doorSillNotchOffset": 0,
    "doubleBoltSpacing": 30,
    "endClearance": 4,
    "endToTabDistance": 400,
    "extraFlangeHoleOffset": 9,
    "extraFlangeHoleOffsetAt90": 15,
    "fPlateWidthDifferential": 3,
    "flangeSlotHeight": 11.1,
    "largeServiceToLeadingEdgeDistance": 600,
    "largeServiceToTrailingEdgeDistance": 700,
    "maxBoxToBoxHoleDelta": 2,
    "maxSplicingLength": 500,
    "minimumTagLength": 20,
    "splicingDimpleSpacing": 100,
    "tabToTabDistance": 295,
    "web2Web": 50.4000015258789,
    "braceAsStud": false,
    "extraChamfers": false,
    "endToEndChamfers": false,
    "fDualSection": false,
    "fixedWeb2Web": false,
    "invertDimpleFlangeFastenings": false,
    "onEdgeLipNotches": true,
    "onFlySwage": false,
    "suppressFasteners": false,
    "useMaleFemaleDimples": false,
    "chamferDetail": [
      {
        "x": 14.5,
        "y": 0
      },
      {
        "x": 6.5,
        "y": 5
      },
      {
        "x": 0,
        "y": 11.5
      }
    ],
    "trussChamferDetail": [
      {
        "x": 21.9,
        "y": 0
      },
      {
        "x": 21.3,
        "y": 1.9
      },
      {
        "x": 10.4,
        "y": 6.1
      },
      {
        "x": 3.4,
        "y": 12.9
      },
      {
        "x": 0,
        "y": 21
      }
    ],
    "webChamferDetail": [
      {
        "x": 5,
        "y": 0
      },
      {
        "x": 1.4,
        "y": 1.4
      },
      {
        "x": 0,
        "y": 5
      }
    ]
  }
};

/**
 * Map profile web (in mm) to the simplest non-special HYTEK setup.
 * For 70S41 input, returns setup ID "2" (F325iT 70mm).
 */
export const SETUP_BY_PROFILE_WEB: Record<number, string> = {
  "70": "2",
  "75": "4",
  "78": "5",
  "89": "6",
  "90": "9",
  "104": "1"
};

/**
 * Look up the appropriate machine setup for a stick's profile.
 *
 * @param profileWeb - Web depth in mm (e.g. 70 for 70S41 profile)
 * @returns MachineSetup or undefined if no match
 */
export function getMachineSetupForProfile(profileWeb: number): MachineSetup | undefined {
  const id = SETUP_BY_PROFILE_WEB[profileWeb];
  return id ? MACHINE_SETUPS[id] : undefined;
}

/**
 * Default fallback setup — used if the profile web doesn't match any HYTEK
 * configured machine. Returns the F325iT 70mm setup (most common LBW profile).
 */
export function getDefaultMachineSetup(): MachineSetup {
  return MACHINE_SETUPS["2"] ?? Object.values(MACHINE_SETUPS)[0];
}
