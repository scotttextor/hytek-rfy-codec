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

export interface ChamferPoint { x: number; y: number; }

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
  shapeClassification: string;  // "S"=simple, "C"=cee, etc.
  leftFlange: number;
  rightFlange: number;
  flangeLabel: string;
  web: number;
  leftLip: number;
  rightLip: number;
}

/** Material spec (BMT, coating, steel grade). */
export interface MaterialSpec {
  bmt?: { color: string; thickness: number };
  coating?: { displayLabel: string; minMass: number };
  steelSpec: string;
  strength?: { displayLabel: string; elongation: number; tensile: number; yield: number };
}

/** Per-profile section setup (one per profile-gauge combination). */
export interface SectionSetup {
  automaticallyDetermineExportSection: boolean;
  guid: string;
  name: string;                       // e.g. "70S41_0.75"
  manualRFYImperialLabel: string;
  manualRFYMetricLabel: string;
  manualSectionIDForRFX: number;
  profile?: ProfileGeometry;
  material?: MaterialSpec;
  sectionOptions?: SectionOptions;
}

/** Tool catalog: chamfer geometry + tool entries categorised by activation. */
export interface ToolSetup {
  chamferDetail: ChamferPoint[];        // standard chamfer triangle
  trussChamferDetail: ChamferPoint[];   // larger truss-end chamfer
  webChamferDetail: ChamferPoint[];     // web-crossing chamfer
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

  // Enum-style strings
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

  // Chamfer geometry (preserved at top level for backward compat — same data
  // is also in toolSetup.chamferDetail / trussChamferDetail / webChamferDetail)
  chamferDetail: ChamferPoint[];
  trussChamferDetail: ChamferPoint[];
  webChamferDetail: ChamferPoint[];

  // Nested rule structures (NEW 2026-05-04)
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
    "endClearanceReference": "ecrOutsideWeb",
    "extraFlangeHoles": "efhNone",
    "fB2BTooling": "b2bNone",
    "fastenerMating": "fmNone",
    "plateBoxingPieceType": "bptSelf",
    "studBoxingPieceType": "bptSelf",
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
    ],
    "defaultSectionOptions": {
      "boxable": true,
      "deflectionTrackEndClearance": 12.7,
      "deflectionTrackScrewHeight": 26.97,
      "dualFasteners": false,
      "fastener1": 20.5,
      "fastener1Name": "Dimple1",
      "fastener2": -1,
      "fastener2Name": "Fastener2",
      "flangeBoltHoleHeight": 20.5,
      "flangeHoleHeight": 27.5,
      "innerBendRadius": 2,
      "automaticChamfer": true,
      "automaticCruciform": false,
      "tripleHoleSpacing": 17
    },
    "sectionSetups": [
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{F5845536-8DD6-4B2F-97F2-D134F5948D76}",
        "name": "Demo Section Setup",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 38,
          "rightFlange": 41,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 10,
          "rightLip": 10
        },
        "material": {
          "bmt": {
            "color": "clFuchsia",
            "thickness": 0.75
          },
          "coating": {
            "displayLabel": "Z275",
            "minMass": 275
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G500",
            "elongation": 8,
            "tensile": 520,
            "yield": 500
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": 20.5,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      }
    ],
    "serviceHoleOptions": [
      "Service",
      "LongService"
    ],
    "fasteners": [
      {
        "toolName": "Dimple1",
        "condition": "d1d1"
      },
      {
        "toolName": "FlangeHole",
        "condition": "fh"
      },
      {
        "toolName": "Service",
        "condition": "sh"
      },
      {
        "toolName": "FlangeSlot",
        "condition": "slot"
      }
    ],
    "toolSetup": {
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
      ],
      "fixedTools": [
        {
          "fName": "Dimple1",
          "drawStyle": "dsDimpleHole",
          "id": 0,
          "length": 0,
          "size1": 10,
          "size2": 7
        },
        {
          "fName": "LipNotch",
          "drawStyle": "dsLipcut",
          "id": 6,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebNotch",
          "drawStyle": "dsCutout",
          "id": 5,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Bad",
          "drawStyle": "dsBad",
          "id": 254,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Swage",
          "drawStyle": "dsSwage",
          "id": 10,
          "length": 55,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Dummy",
          "drawStyle": "dsNull",
          "id": 255,
          "length": 0,
          "size1": 0,
          "size2": 0
        }
      ],
      "optionalOnTools": [
        {
          "fName": "Chamfer",
          "drawStyle": "dsUnknown",
          "id": 17,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Service",
          "drawStyle": "dsCenterLine",
          "id": 1,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "LeftFlange",
          "drawStyle": "dsLeftFlange",
          "id": 20,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "FlangeHole",
          "drawStyle": "dsFlangeHole",
          "id": 27,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "RightFlange",
          "drawStyle": "dsRightFlange",
          "id": 21,
          "length": 48,
          "size1": 0,
          "size2": 0
        }
      ],
      "optionalOffTools": [
        {
          "fName": "Tab",
          "drawStyle": "dsTab",
          "id": 26,
          "length": 0,
          "size1": 35,
          "size2": 0
        },
        {
          "fName": "Logo",
          "drawStyle": "dsLogo",
          "id": 51,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "LeftTab",
          "drawStyle": "dsLeftTab",
          "id": 44,
          "length": 0,
          "size1": 35,
          "size2": 0
        },
        {
          "fName": "RightTab",
          "drawStyle": "dsRightTab",
          "id": 45,
          "length": 0,
          "size1": 35,
          "size2": 0
        },
        {
          "fName": "WebSlot",
          "drawStyle": "dsSingleWebSlot",
          "id": 42,
          "length": 0,
          "size1": 101.6,
          "size2": 7.9
        },
        {
          "fName": "DoubleBolt",
          "drawStyle": "dsDoubleBolt",
          "id": 35,
          "length": 0,
          "size1": 12,
          "size2": 0
        },
        {
          "fName": "FlangeSlot",
          "drawStyle": "dsFlangeSlot",
          "id": 38,
          "length": 0,
          "size1": 20,
          "size2": 7
        },
        {
          "fName": "FlatDimple",
          "drawStyle": "dsFlangeHole",
          "id": 36,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "DoubleWebSlot",
          "drawStyle": "dsDoubleWebSlot",
          "id": 43,
          "length": 0,
          "size1": 101.6,
          "size2": 7.9
        },
        {
          "fName": "LeftFlangeBolt",
          "drawStyle": "dsLeftBolt",
          "id": 28,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "FlangeBoltHoles",
          "drawStyle": "dsFlangeBolt",
          "id": 33,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "BoltWithWebHoles",
          "drawStyle": "dsBoltWithWebHoles",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 3.8
        },
        {
          "fName": "DoubleFlangeHole",
          "drawStyle": "dsDoubleFlangeHole",
          "id": 53,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "LeftPartialFlange",
          "drawStyle": "dsLeftPartialFlange",
          "id": 48,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "LeftFlangeService",
          "drawStyle": "dsLeftFlangeService",
          "id": 40,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "BoltWithQuadWebHoles",
          "drawStyle": "dsBoltQuadWebHoles",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 3.8
        },
        {
          "fName": "SingleBoltHole",
          "drawStyle": "dsBoltLine",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "LongService",
          "drawStyle": "dsLongServiceHole",
          "id": 34,
          "length": 0,
          "size1": 82.55,
          "size2": 38.1
        },
        {
          "fName": "RightFlangeBolt",
          "drawStyle": "dsRightBolt",
          "id": 29,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "RightPartialFlange",
          "drawStyle": "dsRightPartialFlange",
          "id": 49,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "RightFlangeService",
          "drawStyle": "dsRightFlangeService",
          "id": 41,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "TrussChamfer",
          "drawStyle": "dsUnknown",
          "id": 47,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebChamfer",
          "drawStyle": "dsUnknown",
          "id": 39,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "DoubleWebHole",
          "drawStyle": "dsDoubleWebHole",
          "id": 50,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "SingleWebHole",
          "drawStyle": "dsSmallHole",
          "id": 15,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "TripleWebHole",
          "drawStyle": "dsTripleHole",
          "id": 15,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        }
      ]
    },
    "designChecks": [
      "Unassigned Configs"
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
    "endClearanceReference": "ecrOutsideWeb",
    "extraFlangeHoles": "efhNone",
    "fB2BTooling": "b2bWebHole",
    "fastenerMating": "fmNone",
    "plateBoxingPieceType": "bptSelf",
    "studBoxingPieceType": "bptSelf",
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
    ],
    "defaultSectionOptions": {
      "boxable": true,
      "deflectionTrackEndClearance": 12.7,
      "deflectionTrackScrewHeight": 26.97,
      "dualFasteners": false,
      "fastener1": 20.5,
      "fastener1Name": "Dimple1",
      "fastener2": -1,
      "fastener2Name": "Fastener2",
      "flangeBoltHoleHeight": -1,
      "flangeHoleHeight": 27.5,
      "innerBendRadius": 2,
      "automaticChamfer": true,
      "automaticCruciform": false,
      "tripleHoleSpacing": 17
    },
    "sectionSetups": [
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{0C8D7507-ADA6-4C0D-9C7C-D1695FE3BFB7}",
        "name": "104S51_0.55",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 47.5,
          "rightFlange": 51,
          "flangeLabel": "0",
          "web": 104,
          "leftLip": 13,
          "rightLip": 13
        },
        "material": {
          "bmt": {
            "color": "clBlack",
            "thickness": 0.55
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 25.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 25.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 26.5
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{123CBCEF-910C-4E8E-AEE2-07296DD40362}",
        "name": "104S51_0.95",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 47.5,
          "rightFlange": 51,
          "flangeLabel": "0",
          "web": 104,
          "leftLip": 13,
          "rightLip": 13
        },
        "material": {
          "bmt": {
            "color": "clWhite",
            "thickness": 0.95
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 25.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 25.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 26.5
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{00DD1928-6D74-4AF0-BF1C-7B6D542DEEDE}",
        "name": "104S51_1.5",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 47.5,
          "rightFlange": 51,
          "flangeLabel": "0",
          "web": 104,
          "leftLip": 13,
          "rightLip": 13
        },
        "material": {
          "bmt": {
            "color": "clGreen",
            "thickness": 1.5
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G450",
            "elongation": 10,
            "tensile": 480,
            "yield": 450
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 25.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 25.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 26.5
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{D1E78577-1C3B-4ADD-B2F9-199637A77538}",
        "name": "104S51_1.5_1",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 47.5,
          "rightFlange": 51,
          "flangeLabel": "0",
          "web": 104,
          "leftLip": 13,
          "rightLip": 13
        },
        "material": {
          "bmt": {
            "color": "clGreen",
            "thickness": 1.5
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G450",
            "elongation": 10,
            "tensile": 480,
            "yield": 450
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 25.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 25.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 26.5
        }
      }
    ],
    "serviceHoleOptions": [
      "Service",
      "LongService"
    ],
    "fasteners": [
      {
        "toolName": "Dimple1",
        "condition": "d1d1"
      },
      {
        "toolName": "FlangeHole",
        "condition": "fh"
      },
      {
        "toolName": "Service",
        "condition": "sh"
      },
      {
        "toolName": "FlangeSlot",
        "condition": "slot"
      }
    ],
    "toolSetup": {
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
      ],
      "fixedTools": [
        {
          "fName": "Dimple1",
          "drawStyle": "dsDimpleHole",
          "id": 0,
          "length": 0,
          "size1": 10,
          "size2": 7
        },
        {
          "fName": "LipNotch",
          "drawStyle": "dsLipcut",
          "id": 6,
          "length": 75,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebNotch",
          "drawStyle": "dsCutout",
          "id": 5,
          "length": 75,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Bad",
          "drawStyle": "dsBad",
          "id": 254,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Swage",
          "drawStyle": "dsSwage",
          "id": 10,
          "length": 60,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Dummy",
          "drawStyle": "dsNull",
          "id": 255,
          "length": 0,
          "size1": 0,
          "size2": 0
        }
      ],
      "optionalOnTools": [
        {
          "fName": "LeftFlangeService",
          "drawStyle": "dsLeftFlangeService",
          "id": 40,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "RightFlangeService",
          "drawStyle": "dsRightFlangeService",
          "id": 41,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "Chamfer",
          "drawStyle": "dsUnknown",
          "id": 17,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Service",
          "drawStyle": "dsCenterLine",
          "id": 1,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "LeftFlange",
          "drawStyle": "dsLeftFlange",
          "id": 20,
          "length": 54,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "RightFlange",
          "drawStyle": "dsRightFlange",
          "id": 21,
          "length": 54,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "FlangeHole",
          "drawStyle": "dsFlangeHole",
          "id": 27,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "TripleWebHole",
          "drawStyle": "dsTripleHole",
          "id": 15,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        }
      ],
      "optionalOffTools": [
        {
          "fName": "Tab",
          "drawStyle": "dsTab",
          "id": 26,
          "length": 0,
          "size1": 35,
          "size2": 0
        },
        {
          "fName": "Logo",
          "drawStyle": "dsLogo",
          "id": 51,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebSlot",
          "drawStyle": "dsSingleWebSlot",
          "id": 42,
          "length": 0,
          "size1": 101.6,
          "size2": 7.9
        },
        {
          "fName": "LeftTab",
          "drawStyle": "dsLeftTab",
          "id": 44,
          "length": 0,
          "size1": 50,
          "size2": 0
        },
        {
          "fName": "RightTab",
          "drawStyle": "dsRightTab",
          "id": 45,
          "length": 0,
          "size1": 50,
          "size2": 0
        },
        {
          "fName": "DoubleBolt",
          "drawStyle": "dsDoubleBolt",
          "id": 35,
          "length": 0,
          "size1": 12,
          "size2": 0
        },
        {
          "fName": "FlangeSlot",
          "drawStyle": "dsFlangeSlot",
          "id": 38,
          "length": 0,
          "size1": 20,
          "size2": 7
        },
        {
          "fName": "LongService",
          "drawStyle": "dsLongServiceHole",
          "id": 34,
          "length": 0,
          "size1": 82.55,
          "size2": 38.1
        },
        {
          "fName": "WebChamfer",
          "drawStyle": "dsUnknown",
          "id": 39,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "LeftFlangeBolt",
          "drawStyle": "dsLeftBolt",
          "id": 28,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "SingleBoltHole",
          "drawStyle": "dsBoltLine",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "BoltWithWebHoles",
          "drawStyle": "dsBoltWithWebHoles",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 3.8
        },
        {
          "fName": "DoubleWebSlot",
          "drawStyle": "dsDoubleWebSlot",
          "id": 43,
          "length": 0,
          "size1": 101.6,
          "size2": 7.9
        },
        {
          "fName": "SingleWebHole",
          "drawStyle": "dsSmallHole",
          "id": 15,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "FlangeBoltHoles",
          "drawStyle": "dsFlangeBolt",
          "id": 33,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "RightPartialFlange",
          "drawStyle": "dsRightPartialFlange",
          "id": 49,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "LeftPartialFlange",
          "drawStyle": "dsLeftPartialFlange",
          "id": 48,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "RightFlangeBolt",
          "drawStyle": "dsRightBolt",
          "id": 29,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "TrussChamfer",
          "drawStyle": "dsUnknown",
          "id": 47,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "DoubleWebHole",
          "drawStyle": "dsDoubleWebHole",
          "id": 50,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "BoltWithQuadWebHoles",
          "drawStyle": "dsBoltQuadWebHoles",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 3.8
        },
        {
          "fName": "DoubleFlangeHole",
          "drawStyle": "dsDoubleFlangeHole",
          "id": 53,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "FlatDimple",
          "drawStyle": "dsFlangeHole",
          "id": 36,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        }
      ]
    },
    "designChecks": [
      "Unassigned Configs"
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
    "endClearanceReference": "ecrOutsideWeb",
    "extraFlangeHoles": "efhNone",
    "fB2BTooling": "b2bWebHole",
    "fastenerMating": "fmNone",
    "plateBoxingPieceType": "bptSelf",
    "studBoxingPieceType": "bptSelf",
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
    ],
    "defaultSectionOptions": {
      "boxable": true,
      "deflectionTrackEndClearance": 12.7,
      "deflectionTrackScrewHeight": 26.97,
      "dualFasteners": false,
      "fastener1": 20.5,
      "fastener1Name": "Dimple1",
      "fastener2": -1,
      "fastener2Name": "Fastener2",
      "flangeBoltHoleHeight": -1,
      "flangeHoleHeight": 27.5,
      "innerBendRadius": 2,
      "automaticChamfer": true,
      "automaticCruciform": false,
      "tripleHoleSpacing": 17
    },
    "sectionSetups": [
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{70330511-93B9-4F49-A672-D478ACD07329}",
        "name": "70S41_0.55",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 70,
          "leftLip": 12,
          "rightLip": 12
        },
        "material": {
          "bmt": {
            "color": "clBlack",
            "thickness": 0.55
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 15
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{7D617F0C-917C-434A-A774-0AF35E7213F6}",
        "name": "70S41_0.75",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 70,
          "leftLip": 12,
          "rightLip": 12
        },
        "material": {
          "bmt": {
            "color": "clFuchsia",
            "thickness": 0.75
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 15
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{3B6D99AB-DB5F-43C1-BB56-42D86AA2B881}",
        "name": "70S41_0.95",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 70,
          "leftLip": 12,
          "rightLip": 12
        },
        "material": {
          "bmt": {
            "color": "clWhite",
            "thickness": 0.95
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 15
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{866A01F7-0693-4D06-801F-521F647CADE1}",
        "name": "70S41_1.15",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 70,
          "leftLip": 12,
          "rightLip": 12
        },
        "material": {
          "bmt": {
            "color": "clYellow",
            "thickness": 1.15
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G500",
            "elongation": 8,
            "tensile": 520,
            "yield": 500
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 15
        }
      }
    ],
    "serviceHoleOptions": [
      "Service",
      "LongService"
    ],
    "fasteners": [
      {
        "toolName": "Dimple1",
        "condition": "d1d1"
      },
      {
        "toolName": "FlangeHole",
        "condition": "fh"
      },
      {
        "toolName": "Service",
        "condition": "sh"
      },
      {
        "toolName": "FlangeSlot",
        "condition": "slot"
      }
    ],
    "toolSetup": {
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
      ],
      "fixedTools": [
        {
          "fName": "Dimple1",
          "drawStyle": "dsDimpleHole",
          "id": 0,
          "length": 0,
          "size1": 10,
          "size2": 7
        },
        {
          "fName": "LipNotch",
          "drawStyle": "dsLipcut",
          "id": 6,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebNotch",
          "drawStyle": "dsCutout",
          "id": 5,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Bad",
          "drawStyle": "dsBad",
          "id": 254,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Swage",
          "drawStyle": "dsSwage",
          "id": 10,
          "length": 55,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Dummy",
          "drawStyle": "dsNull",
          "id": 255,
          "length": 0,
          "size1": 0,
          "size2": 0
        }
      ],
      "optionalOnTools": [
        {
          "fName": "SingleBoltHole",
          "drawStyle": "dsBoltLine",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "Chamfer",
          "drawStyle": "dsUnknown",
          "id": 17,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Service",
          "drawStyle": "dsCenterLine",
          "id": 1,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "FlangeHole",
          "drawStyle": "dsFlangeHole",
          "id": 27,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "LeftFlange",
          "drawStyle": "dsLeftFlange",
          "id": 20,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebChamfer",
          "drawStyle": "dsUnknown",
          "id": 39,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "RightFlange",
          "drawStyle": "dsRightFlange",
          "id": 21,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "TripleWebHole",
          "drawStyle": "dsTripleHole",
          "id": 15,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        }
      ],
      "optionalOffTools": [
        {
          "fName": "Tab",
          "drawStyle": "dsTab",
          "id": 26,
          "length": 0,
          "size1": 35,
          "size2": 0
        },
        {
          "fName": "Logo",
          "drawStyle": "dsLogo",
          "id": 51,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebSlot",
          "drawStyle": "dsSingleWebSlot",
          "id": 42,
          "length": 0,
          "size1": 101.6,
          "size2": 7.9
        },
        {
          "fName": "LeftTab",
          "drawStyle": "dsLeftTab",
          "id": 44,
          "length": 0,
          "size1": 50,
          "size2": 0
        },
        {
          "fName": "RightTab",
          "drawStyle": "dsRightTab",
          "id": 45,
          "length": 0,
          "size1": 50,
          "size2": 0
        },
        {
          "fName": "FlangeSlot",
          "drawStyle": "dsFlangeSlot",
          "id": 38,
          "length": 0,
          "size1": 20,
          "size2": 7
        },
        {
          "fName": "LongService",
          "drawStyle": "dsLongServiceHole",
          "id": 34,
          "length": 0,
          "size1": 82.55,
          "size2": 38.1
        },
        {
          "fName": "DoubleBolt",
          "drawStyle": "dsDoubleBolt",
          "id": 35,
          "length": 0,
          "size1": 12,
          "size2": 0
        },
        {
          "fName": "DoubleWebSlot",
          "drawStyle": "dsDoubleWebSlot",
          "id": 43,
          "length": 0,
          "size1": 101.6,
          "size2": 7.9
        },
        {
          "fName": "SingleWebHole",
          "drawStyle": "dsSmallHole",
          "id": 15,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "LeftFlangeBolt",
          "drawStyle": "dsLeftBolt",
          "id": 28,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "BoltWithWebHoles",
          "drawStyle": "dsBoltWithWebHoles",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 3.8
        },
        {
          "fName": "LeftFlangeService",
          "drawStyle": "dsLeftFlangeService",
          "id": 40,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "RightFlangeService",
          "drawStyle": "dsRightFlangeService",
          "id": 41,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "FlangeBoltHoles",
          "drawStyle": "dsFlangeBolt",
          "id": 33,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "RightPartialFlange",
          "drawStyle": "dsRightPartialFlange",
          "id": 49,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "LeftPartialFlange",
          "drawStyle": "dsLeftPartialFlange",
          "id": 48,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "RightFlangeBolt",
          "drawStyle": "dsRightBolt",
          "id": 29,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "TrussChamfer",
          "drawStyle": "dsUnknown",
          "id": 47,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "DoubleWebHole",
          "drawStyle": "dsDoubleWebHole",
          "id": 50,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "BoltWithQuadWebHoles",
          "drawStyle": "dsBoltQuadWebHoles",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 3.8
        },
        {
          "fName": "DoubleFlangeHole",
          "drawStyle": "dsDoubleFlangeHole",
          "id": 53,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "FlatDimple",
          "drawStyle": "dsFlangeHole",
          "id": 36,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        }
      ]
    },
    "designChecks": [
      "Unassigned Configs"
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
    "endClearanceReference": "ecrOutsideWeb",
    "extraFlangeHoles": "efhNone",
    "fB2BTooling": "b2bWebHole",
    "fastenerMating": "fmNone",
    "plateBoxingPieceType": "bptSelf",
    "studBoxingPieceType": "bptSelf",
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
    ],
    "defaultSectionOptions": {
      "boxable": true,
      "deflectionTrackEndClearance": 12.7,
      "deflectionTrackScrewHeight": 26.97,
      "dualFasteners": false,
      "fastener1": 20.5,
      "fastener1Name": "Dimple1",
      "fastener2": -1,
      "fastener2Name": "Fastener2",
      "flangeBoltHoleHeight": -1,
      "flangeHoleHeight": 27.5,
      "innerBendRadius": 2,
      "automaticChamfer": true,
      "automaticCruciform": false,
      "tripleHoleSpacing": 17
    },
    "sectionSetups": [
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{A3610114-CAA8-410C-8BE7-0CB85A4B5B3C}",
        "name": "70S41_0.55",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 70,
          "leftLip": 12,
          "rightLip": 12
        },
        "material": {
          "bmt": {
            "color": "clBlack",
            "thickness": 0.55
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 15
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{B7EF3CBB-B485-4A18-9618-E11C98FA0251}",
        "name": "70S41_0.75",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 70,
          "leftLip": 12,
          "rightLip": 12
        },
        "material": {
          "bmt": {
            "color": "clFuchsia",
            "thickness": 0.75
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 15
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{ED969F5D-E656-43E5-B321-BDD9526F3715}",
        "name": "70S41_0.95",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 70,
          "leftLip": 12,
          "rightLip": 12
        },
        "material": {
          "bmt": {
            "color": "clWhite",
            "thickness": 0.95
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 15
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{48394826-43A4-4A7A-AEAC-2485E603D8B2}",
        "name": "70S41_1.15",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 70,
          "leftLip": 12,
          "rightLip": 12
        },
        "material": {
          "bmt": {
            "color": "clYellow",
            "thickness": 1.15
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G500",
            "elongation": 8,
            "tensile": 520,
            "yield": 500
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 15
        }
      }
    ],
    "serviceHoleOptions": [
      "Service",
      "LongService"
    ],
    "fasteners": [
      {
        "toolName": "Dimple1",
        "condition": "d1d1"
      },
      {
        "toolName": "FlangeHole",
        "condition": "fh"
      },
      {
        "toolName": "Service",
        "condition": "sh"
      },
      {
        "toolName": "FlangeSlot",
        "condition": "slot"
      }
    ],
    "toolSetup": {
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
      ],
      "fixedTools": [
        {
          "fName": "Dimple1",
          "drawStyle": "dsDimpleHole",
          "id": 0,
          "length": 0,
          "size1": 10,
          "size2": 7
        },
        {
          "fName": "LipNotch",
          "drawStyle": "dsLipcut",
          "id": 6,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebNotch",
          "drawStyle": "dsCutout",
          "id": 5,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Bad",
          "drawStyle": "dsBad",
          "id": 254,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Swage",
          "drawStyle": "dsSwage",
          "id": 10,
          "length": 55,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Dummy",
          "drawStyle": "dsNull",
          "id": 255,
          "length": 0,
          "size1": 0,
          "size2": 0
        }
      ],
      "optionalOnTools": [
        {
          "fName": "SingleBoltHole",
          "drawStyle": "dsBoltLine",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "Chamfer",
          "drawStyle": "dsUnknown",
          "id": 17,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Service",
          "drawStyle": "dsCenterLine",
          "id": 1,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "FlangeHole",
          "drawStyle": "dsFlangeHole",
          "id": 27,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "LeftFlange",
          "drawStyle": "dsLeftFlange",
          "id": 20,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebChamfer",
          "drawStyle": "dsUnknown",
          "id": 39,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "RightFlange",
          "drawStyle": "dsRightFlange",
          "id": 21,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "TripleWebHole",
          "drawStyle": "dsTripleHole",
          "id": 15,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        }
      ],
      "optionalOffTools": [
        {
          "fName": "Tab",
          "drawStyle": "dsTab",
          "id": 26,
          "length": 0,
          "size1": 35,
          "size2": 0
        },
        {
          "fName": "Logo",
          "drawStyle": "dsLogo",
          "id": 51,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebSlot",
          "drawStyle": "dsSingleWebSlot",
          "id": 42,
          "length": 0,
          "size1": 101.6,
          "size2": 7.9
        },
        {
          "fName": "LeftTab",
          "drawStyle": "dsLeftTab",
          "id": 44,
          "length": 0,
          "size1": 50,
          "size2": 0
        },
        {
          "fName": "RightTab",
          "drawStyle": "dsRightTab",
          "id": 45,
          "length": 0,
          "size1": 50,
          "size2": 0
        },
        {
          "fName": "FlangeSlot",
          "drawStyle": "dsFlangeSlot",
          "id": 38,
          "length": 0,
          "size1": 20,
          "size2": 7
        },
        {
          "fName": "LongService",
          "drawStyle": "dsLongServiceHole",
          "id": 34,
          "length": 0,
          "size1": 82.55,
          "size2": 38.1
        },
        {
          "fName": "DoubleBolt",
          "drawStyle": "dsDoubleBolt",
          "id": 35,
          "length": 0,
          "size1": 12,
          "size2": 0
        },
        {
          "fName": "SingleWebHole",
          "drawStyle": "dsSmallHole",
          "id": 15,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "LeftFlangeBolt",
          "drawStyle": "dsLeftBolt",
          "id": 28,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "DoubleWebSlot",
          "drawStyle": "dsDoubleWebSlot",
          "id": 43,
          "length": 0,
          "size1": 101.6,
          "size2": 7.9
        },
        {
          "fName": "BoltWithWebHoles",
          "drawStyle": "dsBoltWithWebHoles",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 3.8
        },
        {
          "fName": "LeftFlangeService",
          "drawStyle": "dsLeftFlangeService",
          "id": 40,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "RightFlangeService",
          "drawStyle": "dsRightFlangeService",
          "id": 41,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "FlangeBoltHoles",
          "drawStyle": "dsFlangeBolt",
          "id": 33,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "RightPartialFlange",
          "drawStyle": "dsRightPartialFlange",
          "id": 49,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "LeftPartialFlange",
          "drawStyle": "dsLeftPartialFlange",
          "id": 48,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "RightFlangeBolt",
          "drawStyle": "dsRightBolt",
          "id": 29,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "TrussChamfer",
          "drawStyle": "dsUnknown",
          "id": 47,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "DoubleWebHole",
          "drawStyle": "dsDoubleWebHole",
          "id": 50,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "BoltWithQuadWebHoles",
          "drawStyle": "dsBoltQuadWebHoles",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 3.8
        },
        {
          "fName": "DoubleFlangeHole",
          "drawStyle": "dsDoubleFlangeHole",
          "id": 53,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "FlatDimple",
          "drawStyle": "dsFlangeHole",
          "id": 36,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        }
      ]
    },
    "designChecks": [
      "Unassigned Configs"
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
    "endClearanceReference": "ecrOutsideWeb",
    "extraFlangeHoles": "efhNone",
    "fB2BTooling": "b2bWebHole",
    "fastenerMating": "fmNone",
    "plateBoxingPieceType": "bptSelf",
    "studBoxingPieceType": "bptSelf",
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
    ],
    "defaultSectionOptions": {
      "boxable": true,
      "deflectionTrackEndClearance": 12.7,
      "deflectionTrackScrewHeight": 26.97,
      "dualFasteners": false,
      "fastener1": 20.5,
      "fastener1Name": "Dimple1",
      "fastener2": -1,
      "fastener2Name": "Fastener2",
      "flangeBoltHoleHeight": -1,
      "flangeHoleHeight": 27.5,
      "innerBendRadius": 2,
      "automaticChamfer": true,
      "automaticCruciform": false,
      "tripleHoleSpacing": 17
    },
    "sectionSetups": [
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{8ED69F04-2F27-4C4F-BB05-12715BE4AA0D}",
        "name": "75S44_0.55",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 44,
          "rightFlange": 41,
          "flangeLabel": "0",
          "web": 75,
          "leftLip": 11,
          "rightLip": 11
        },
        "material": {
          "bmt": {
            "color": "clBlack",
            "thickness": 0.55
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 22,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{74B4EB52-E666-43A6-8696-78D4FC5957F0}",
        "name": "75S44_0.75",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 44,
          "rightFlange": 41,
          "flangeLabel": "0",
          "web": 75,
          "leftLip": 11,
          "rightLip": 11
        },
        "material": {
          "bmt": {
            "color": "clFuchsia",
            "thickness": 0.75
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 22,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{5454DFF6-17A8-4128-8F85-60F6813E0805}",
        "name": "75S44_0.95",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 44,
          "rightFlange": 41,
          "flangeLabel": "0",
          "web": 75,
          "leftLip": 11,
          "rightLip": 11
        },
        "material": {
          "bmt": {
            "color": "clWhite",
            "thickness": 0.95
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 22,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{EC164DD7-08C2-46E0-BEF6-BBA56325ED93}",
        "name": "75S44_1.15",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 44,
          "rightFlange": 41,
          "flangeLabel": "0",
          "web": 75,
          "leftLip": 11,
          "rightLip": 11
        },
        "material": {
          "bmt": {
            "color": "clYellow",
            "thickness": 1.15
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G500",
            "elongation": 8,
            "tensile": 520,
            "yield": 500
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 22,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{965AD2AD-9B9A-427F-BA63-2D09F110FEE2}",
        "name": "75S44_0.95_1",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 44,
          "rightFlange": 41,
          "flangeLabel": "0",
          "web": 75,
          "leftLip": 11,
          "rightLip": 11
        },
        "material": {
          "bmt": {
            "color": "clWhite",
            "thickness": 0.95
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 22,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      }
    ],
    "serviceHoleOptions": [
      "Service",
      "LongService"
    ],
    "fasteners": [
      {
        "toolName": "Dimple1",
        "condition": "d1d1"
      },
      {
        "toolName": "FlangeHole",
        "condition": "fh"
      },
      {
        "toolName": "Service",
        "condition": "sh"
      },
      {
        "toolName": "FlangeSlot",
        "condition": "slot"
      }
    ],
    "toolSetup": {
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
      ],
      "fixedTools": [
        {
          "fName": "Dimple1",
          "drawStyle": "dsDimpleHole",
          "id": 0,
          "length": 0,
          "size1": 10,
          "size2": 7
        },
        {
          "fName": "LipNotch",
          "drawStyle": "dsLipcut",
          "id": 6,
          "length": 60,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebNotch",
          "drawStyle": "dsCutout",
          "id": 5,
          "length": 60,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Bad",
          "drawStyle": "dsBad",
          "id": 254,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Swage",
          "drawStyle": "dsSwage",
          "id": 10,
          "length": 60,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Dummy",
          "drawStyle": "dsNull",
          "id": 255,
          "length": 0,
          "size1": 0,
          "size2": 0
        }
      ],
      "optionalOnTools": [
        {
          "fName": "Service",
          "drawStyle": "dsCenterLine",
          "id": 1,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "Chamfer",
          "drawStyle": "dsUnknown",
          "id": 17,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "FlangeHole",
          "drawStyle": "dsFlangeHole",
          "id": 27,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "TripleWebHole",
          "drawStyle": "dsTripleHole",
          "id": 15,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        }
      ],
      "optionalOffTools": [
        {
          "fName": "Tab",
          "drawStyle": "dsTab",
          "id": 26,
          "length": 0,
          "size1": 35,
          "size2": 0
        },
        {
          "fName": "Logo",
          "drawStyle": "dsLogo",
          "id": 51,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebSlot",
          "drawStyle": "dsSingleWebSlot",
          "id": 42,
          "length": 0,
          "size1": 101.6,
          "size2": 7.9
        },
        {
          "fName": "LeftTab",
          "drawStyle": "dsLeftTab",
          "id": 44,
          "length": 0,
          "size1": 50,
          "size2": 0
        },
        {
          "fName": "RightTab",
          "drawStyle": "dsRightTab",
          "id": 45,
          "length": 0,
          "size1": 50,
          "size2": 0
        },
        {
          "fName": "WebChamfer",
          "drawStyle": "dsUnknown",
          "id": 39,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "RightFlange",
          "drawStyle": "dsRightFlange",
          "id": 21,
          "length": 45,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "LongService",
          "drawStyle": "dsLongServiceHole",
          "id": 34,
          "length": 0,
          "size1": 82.55,
          "size2": 38.1
        },
        {
          "fName": "FlangeSlot",
          "drawStyle": "dsFlangeSlot",
          "id": 38,
          "length": 0,
          "size1": 20,
          "size2": 7
        },
        {
          "fName": "DoubleBolt",
          "drawStyle": "dsDoubleBolt",
          "id": 35,
          "length": 0,
          "size1": 12,
          "size2": 0
        },
        {
          "fName": "SingleWebHole",
          "drawStyle": "dsSmallHole",
          "id": 15,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "BoltWithWebHoles",
          "drawStyle": "dsBoltWithWebHoles",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 3.8
        },
        {
          "fName": "LeftFlange",
          "drawStyle": "dsLeftFlange",
          "id": 20,
          "length": 45,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "DoubleWebSlot",
          "drawStyle": "dsDoubleWebSlot",
          "id": 43,
          "length": 0,
          "size1": 101.6,
          "size2": 7.9
        },
        {
          "fName": "LeftFlangeBolt",
          "drawStyle": "dsLeftBolt",
          "id": 28,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "FlangeBoltHoles",
          "drawStyle": "dsFlangeBolt",
          "id": 33,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "RightPartialFlange",
          "drawStyle": "dsRightPartialFlange",
          "id": 49,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "LeftPartialFlange",
          "drawStyle": "dsLeftPartialFlange",
          "id": 48,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "RightFlangeBolt",
          "drawStyle": "dsRightBolt",
          "id": 29,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "TrussChamfer",
          "drawStyle": "dsUnknown",
          "id": 47,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "DoubleWebHole",
          "drawStyle": "dsDoubleWebHole",
          "id": 50,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "LeftFlangeService",
          "drawStyle": "dsLeftFlangeService",
          "id": 40,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "RightFlangeService",
          "drawStyle": "dsRightFlangeService",
          "id": 41,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "BoltWithQuadWebHoles",
          "drawStyle": "dsBoltQuadWebHoles",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 3.8
        },
        {
          "fName": "DoubleFlangeHole",
          "drawStyle": "dsDoubleFlangeHole",
          "id": 53,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "FlatDimple",
          "drawStyle": "dsFlangeHole",
          "id": 36,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "SingleBoltHole",
          "drawStyle": "dsBoltLine",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        }
      ]
    },
    "designChecks": [
      "Unassigned Configs"
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
    "endClearanceReference": "ecrOutsideWeb",
    "extraFlangeHoles": "efhNone",
    "fB2BTooling": "b2bWebHole",
    "fastenerMating": "fmNone",
    "plateBoxingPieceType": "bptSelf",
    "studBoxingPieceType": "bptSelf",
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
    ],
    "defaultSectionOptions": {
      "boxable": true,
      "deflectionTrackEndClearance": 12.7,
      "deflectionTrackScrewHeight": 26.97,
      "dualFasteners": false,
      "fastener1": 20.5,
      "fastener1Name": "Dimple1",
      "fastener2": -1,
      "fastener2Name": "Fastener2",
      "flangeBoltHoleHeight": -1,
      "flangeHoleHeight": 27.5,
      "innerBendRadius": 2,
      "automaticChamfer": true,
      "automaticCruciform": false,
      "tripleHoleSpacing": 17
    },
    "sectionSetups": [
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{EC268DAD-DF1F-41E9-AADE-62209C1C3E77}",
        "name": "78S44_0.55",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 44,
          "rightFlange": 41,
          "flangeLabel": "0",
          "web": 78,
          "leftLip": 11,
          "rightLip": 11
        },
        "material": {
          "bmt": {
            "color": "clBlack",
            "thickness": 0.55
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 22,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{40922FA0-0D69-407A-BBAA-69862140D126}",
        "name": "78S44_0.75",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 44,
          "rightFlange": 41,
          "flangeLabel": "0",
          "web": 78,
          "leftLip": 11,
          "rightLip": 11
        },
        "material": {
          "bmt": {
            "color": "clFuchsia",
            "thickness": 0.75
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 22,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{5FC39458-294B-45DA-8B2D-743630C3247F}",
        "name": "78S44_0.95",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 44,
          "rightFlange": 41,
          "flangeLabel": "0",
          "web": 78,
          "leftLip": 11,
          "rightLip": 11
        },
        "material": {
          "bmt": {
            "color": "clWhite",
            "thickness": 0.95
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 22,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{8374573E-D5E6-4088-BF81-8C513E748C23}",
        "name": "78S44_1.15",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 44,
          "rightFlange": 41,
          "flangeLabel": "0",
          "web": 78,
          "leftLip": 11,
          "rightLip": 11
        },
        "material": {
          "bmt": {
            "color": "clYellow",
            "thickness": 1.15
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G500",
            "elongation": 8,
            "tensile": 520,
            "yield": 500
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 22,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{CE0D2BAB-0496-49C5-846E-0B898E80890C}",
        "name": "78S44_0.95_1",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 44,
          "rightFlange": 41,
          "flangeLabel": "0",
          "web": 78,
          "leftLip": 11,
          "rightLip": 11
        },
        "material": {
          "bmt": {
            "color": "clWhite",
            "thickness": 0.95
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 22,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{9C27BB14-BBBA-4BF4-A007-4F0B902720B8}",
        "name": "78S44_1.15_1",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 44,
          "rightFlange": 41,
          "flangeLabel": "0",
          "web": 78,
          "leftLip": 11,
          "rightLip": 11
        },
        "material": {
          "bmt": {
            "color": "clYellow",
            "thickness": 1.15
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G500",
            "elongation": 8,
            "tensile": 520,
            "yield": 500
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 22,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      }
    ],
    "serviceHoleOptions": [
      "Service",
      "LongService"
    ],
    "fasteners": [
      {
        "toolName": "Dimple1",
        "condition": "d1d1"
      },
      {
        "toolName": "FlangeHole",
        "condition": "fh"
      },
      {
        "toolName": "Service",
        "condition": "sh"
      },
      {
        "toolName": "FlangeSlot",
        "condition": "slot"
      }
    ],
    "toolSetup": {
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
      ],
      "fixedTools": [
        {
          "fName": "Dimple1",
          "drawStyle": "dsDimpleHole",
          "id": 0,
          "length": 0,
          "size1": 10,
          "size2": 7
        },
        {
          "fName": "LipNotch",
          "drawStyle": "dsLipcut",
          "id": 6,
          "length": 60,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebNotch",
          "drawStyle": "dsCutout",
          "id": 5,
          "length": 60,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Bad",
          "drawStyle": "dsBad",
          "id": 254,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Swage",
          "drawStyle": "dsSwage",
          "id": 10,
          "length": 60,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Dummy",
          "drawStyle": "dsNull",
          "id": 255,
          "length": 0,
          "size1": 0,
          "size2": 0
        }
      ],
      "optionalOnTools": [
        {
          "fName": "TripleWebHole",
          "drawStyle": "dsTripleHole",
          "id": 15,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "SingleBoltHole",
          "drawStyle": "dsBoltLine",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "LeftFlangeService",
          "drawStyle": "dsLeftFlangeService",
          "id": 40,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "RightFlangeService",
          "drawStyle": "dsRightFlangeService",
          "id": 41,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "Service",
          "drawStyle": "dsCenterLine",
          "id": 1,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "Chamfer",
          "drawStyle": "dsUnknown",
          "id": 17,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebChamfer",
          "drawStyle": "dsUnknown",
          "id": 39,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "RightFlange",
          "drawStyle": "dsRightFlange",
          "id": 21,
          "length": 45,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "LeftFlange",
          "drawStyle": "dsLeftFlange",
          "id": 20,
          "length": 45,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "LongService",
          "drawStyle": "dsLongServiceHole",
          "id": 34,
          "length": 0,
          "size1": 82.55,
          "size2": 38.1
        },
        {
          "fName": "FlangeHole",
          "drawStyle": "dsFlangeHole",
          "id": 27,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        }
      ],
      "optionalOffTools": [
        {
          "fName": "Tab",
          "drawStyle": "dsTab",
          "id": 26,
          "length": 0,
          "size1": 35,
          "size2": 0
        },
        {
          "fName": "Logo",
          "drawStyle": "dsLogo",
          "id": 51,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebSlot",
          "drawStyle": "dsSingleWebSlot",
          "id": 42,
          "length": 0,
          "size1": 101.6,
          "size2": 7.9
        },
        {
          "fName": "LeftTab",
          "drawStyle": "dsLeftTab",
          "id": 44,
          "length": 0,
          "size1": 50,
          "size2": 0
        },
        {
          "fName": "RightTab",
          "drawStyle": "dsRightTab",
          "id": 45,
          "length": 0,
          "size1": 50,
          "size2": 0
        },
        {
          "fName": "FlangeSlot",
          "drawStyle": "dsFlangeSlot",
          "id": 38,
          "length": 0,
          "size1": 20,
          "size2": 7
        },
        {
          "fName": "DoubleBolt",
          "drawStyle": "dsDoubleBolt",
          "id": 35,
          "length": 0,
          "size1": 12,
          "size2": 0
        },
        {
          "fName": "TrussChamfer",
          "drawStyle": "dsUnknown",
          "id": 47,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "DoubleWebSlot",
          "drawStyle": "dsDoubleWebSlot",
          "id": 43,
          "length": 0,
          "size1": 101.6,
          "size2": 7.9
        },
        {
          "fName": "LeftFlangeBolt",
          "drawStyle": "dsLeftBolt",
          "id": 28,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "FlangeBoltHoles",
          "drawStyle": "dsFlangeBolt",
          "id": 33,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "BoltWithWebHoles",
          "drawStyle": "dsBoltWithWebHoles",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 3.8
        },
        {
          "fName": "SingleWebHole",
          "drawStyle": "dsSmallHole",
          "id": 15,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "RightPartialFlange",
          "drawStyle": "dsRightPartialFlange",
          "id": 49,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "LeftPartialFlange",
          "drawStyle": "dsLeftPartialFlange",
          "id": 48,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "RightFlangeBolt",
          "drawStyle": "dsRightBolt",
          "id": 29,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "DoubleWebHole",
          "drawStyle": "dsDoubleWebHole",
          "id": 50,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "BoltWithQuadWebHoles",
          "drawStyle": "dsBoltQuadWebHoles",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 3.8
        },
        {
          "fName": "DoubleFlangeHole",
          "drawStyle": "dsDoubleFlangeHole",
          "id": 53,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "FlatDimple",
          "drawStyle": "dsFlangeHole",
          "id": 36,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        }
      ]
    },
    "designChecks": [
      "Unassigned Configs"
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
    "endClearanceReference": "ecrOutsideWeb",
    "extraFlangeHoles": "efhNone",
    "fB2BTooling": "b2bWebHole",
    "fastenerMating": "fmNone",
    "plateBoxingPieceType": "bptSelf",
    "studBoxingPieceType": "bptSelf",
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
    ],
    "defaultSectionOptions": {
      "boxable": true,
      "deflectionTrackEndClearance": 12.7,
      "deflectionTrackScrewHeight": 26.97,
      "dualFasteners": false,
      "fastener1": 20.5,
      "fastener1Name": "Dimple1",
      "fastener2": -1,
      "fastener2Name": "Fastener2",
      "flangeBoltHoleHeight": -1,
      "flangeHoleHeight": 27.5,
      "innerBendRadius": 2,
      "automaticChamfer": true,
      "automaticCruciform": false,
      "tripleHoleSpacing": 17
    },
    "sectionSetups": [
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{A4944E86-B5B1-424A-B4D3-3DC3B49A1078}",
        "name": "89S41_0.55",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 12,
          "rightLip": 12
        },
        "material": {
          "bmt": {
            "color": "clBlack",
            "thickness": 0.55
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{F755B54A-E5B7-4C71-BA5F-021F7FA1FE08}",
        "name": "89S41_0.95",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 10,
          "rightLip": 10
        },
        "material": {
          "bmt": {
            "color": "clWhite",
            "thickness": 0.95
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{3193F334-8232-4C5F-8C16-3BD0FECB7F9F}",
        "name": "89S41_0.75",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 10,
          "rightLip": 10
        },
        "material": {
          "bmt": {
            "color": "clFuchsia",
            "thickness": 0.75
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{9D1A047B-1186-4E99-9FEB-A7A34881D851}",
        "name": "89S41_1.15",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 10,
          "rightLip": 10
        },
        "material": {
          "bmt": {
            "color": "clYellow",
            "thickness": 1.15
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G500",
            "elongation": 8,
            "tensile": 520,
            "yield": 500
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{C64A59D2-B5F4-4D20-90D9-36695A23E6CE}",
        "name": "89S41_0.95_1",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 10,
          "rightLip": 10
        },
        "material": {
          "bmt": {
            "color": "clWhite",
            "thickness": 0.95
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{7CD93EA2-CC84-4A3D-9715-0DBED585FEEF}",
        "name": "89S41_1.15_1",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 10,
          "rightLip": 10
        },
        "material": {
          "bmt": {
            "color": "clYellow",
            "thickness": 1.15
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G500",
            "elongation": 8,
            "tensile": 520,
            "yield": 500
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      }
    ],
    "serviceHoleOptions": [
      "Service",
      "LongService"
    ],
    "fasteners": [
      {
        "toolName": "Dimple1",
        "condition": "d1d1"
      },
      {
        "toolName": "FlangeHole",
        "condition": "fh"
      },
      {
        "toolName": "Service",
        "condition": "sh"
      },
      {
        "toolName": "FlangeSlot",
        "condition": "slot"
      }
    ],
    "toolSetup": {
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
      ],
      "fixedTools": [
        {
          "fName": "Dimple1",
          "drawStyle": "dsDimpleHole",
          "id": 0,
          "length": 0,
          "size1": 10,
          "size2": 7
        },
        {
          "fName": "LipNotch",
          "drawStyle": "dsLipcut",
          "id": 6,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebNotch",
          "drawStyle": "dsCutout",
          "id": 5,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Bad",
          "drawStyle": "dsBad",
          "id": 254,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Swage",
          "drawStyle": "dsSwage",
          "id": 10,
          "length": 55,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Dummy",
          "drawStyle": "dsNull",
          "id": 255,
          "length": 0,
          "size1": 0,
          "size2": 0
        }
      ],
      "optionalOnTools": [
        {
          "fName": "TripleWebHole",
          "drawStyle": "dsTripleHole",
          "id": 15,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "Chamfer",
          "drawStyle": "dsUnknown",
          "id": 17,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Service",
          "drawStyle": "dsCenterLine",
          "id": 1,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "WebChamfer",
          "drawStyle": "dsUnknown",
          "id": 39,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "RightFlange",
          "drawStyle": "dsRightFlange",
          "id": 21,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "FlangeHole",
          "drawStyle": "dsFlangeHole",
          "id": 27,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "LeftFlange",
          "drawStyle": "dsLeftFlange",
          "id": 20,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "SingleBoltHole",
          "drawStyle": "dsBoltLine",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        }
      ],
      "optionalOffTools": [
        {
          "fName": "Tab",
          "drawStyle": "dsTab",
          "id": 26,
          "length": 0,
          "size1": 35,
          "size2": 0
        },
        {
          "fName": "Logo",
          "drawStyle": "dsLogo",
          "id": 51,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebSlot",
          "drawStyle": "dsSingleWebSlot",
          "id": 42,
          "length": 0,
          "size1": 101.6,
          "size2": 7.9
        },
        {
          "fName": "LeftTab",
          "drawStyle": "dsLeftTab",
          "id": 44,
          "length": 0,
          "size1": 50,
          "size2": 0
        },
        {
          "fName": "RightTab",
          "drawStyle": "dsRightTab",
          "id": 45,
          "length": 0,
          "size1": 50,
          "size2": 0
        },
        {
          "fName": "FlangeSlot",
          "drawStyle": "dsFlangeSlot",
          "id": 38,
          "length": 0,
          "size1": 20,
          "size2": 7
        },
        {
          "fName": "LongService",
          "drawStyle": "dsLongServiceHole",
          "id": 34,
          "length": 0,
          "size1": 82.55,
          "size2": 38.1
        },
        {
          "fName": "DoubleBolt",
          "drawStyle": "dsDoubleBolt",
          "id": 35,
          "length": 0,
          "size1": 12,
          "size2": 0
        },
        {
          "fName": "DoubleWebSlot",
          "drawStyle": "dsDoubleWebSlot",
          "id": 43,
          "length": 0,
          "size1": 101.6,
          "size2": 7.9
        },
        {
          "fName": "LeftFlangeBolt",
          "drawStyle": "dsLeftBolt",
          "id": 28,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "SingleWebHole",
          "drawStyle": "dsSmallHole",
          "id": 15,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "BoltWithWebHoles",
          "drawStyle": "dsBoltWithWebHoles",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 3.8
        },
        {
          "fName": "LeftFlangeService",
          "drawStyle": "dsLeftFlangeService",
          "id": 40,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "RightFlangeService",
          "drawStyle": "dsRightFlangeService",
          "id": 41,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "FlangeBoltHoles",
          "drawStyle": "dsFlangeBolt",
          "id": 33,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "RightPartialFlange",
          "drawStyle": "dsRightPartialFlange",
          "id": 49,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "LeftPartialFlange",
          "drawStyle": "dsLeftPartialFlange",
          "id": 48,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "RightFlangeBolt",
          "drawStyle": "dsRightBolt",
          "id": 29,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "TrussChamfer",
          "drawStyle": "dsUnknown",
          "id": 47,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "DoubleWebHole",
          "drawStyle": "dsDoubleWebHole",
          "id": 50,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "BoltWithQuadWebHoles",
          "drawStyle": "dsBoltQuadWebHoles",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 3.8
        },
        {
          "fName": "DoubleFlangeHole",
          "drawStyle": "dsDoubleFlangeHole",
          "id": 53,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "FlatDimple",
          "drawStyle": "dsFlangeHole",
          "id": 36,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        }
      ]
    },
    "designChecks": [
      "Unassigned Configs"
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
    "endClearanceReference": "ecrOutsideWeb",
    "extraFlangeHoles": "efhNone",
    "fB2BTooling": "b2bWebHole",
    "fastenerMating": "fmNone",
    "plateBoxingPieceType": "bptSelf",
    "studBoxingPieceType": "bptSelf",
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
    ],
    "defaultSectionOptions": {
      "boxable": true,
      "deflectionTrackEndClearance": 12.7,
      "deflectionTrackScrewHeight": 26.97,
      "dualFasteners": false,
      "fastener1": 20.5,
      "fastener1Name": "Dimple1",
      "fastener2": -1,
      "fastener2Name": "Fastener2",
      "flangeBoltHoleHeight": -1,
      "flangeHoleHeight": 27.5,
      "innerBendRadius": 2,
      "automaticChamfer": true,
      "automaticCruciform": false,
      "tripleHoleSpacing": 17
    },
    "sectionSetups": [
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{A6D95498-81EE-49ED-AC73-95E43C7E75C1}",
        "name": "89S41_0.55",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 12,
          "rightLip": 12
        },
        "material": {
          "bmt": {
            "color": "clBlack",
            "thickness": 0.55
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{6D9D39DC-7D73-4CEF-8AF8-2784958DED1E}",
        "name": "89S41_0.95",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 10,
          "rightLip": 10
        },
        "material": {
          "bmt": {
            "color": "clWhite",
            "thickness": 0.95
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{67A74855-2688-4514-B97F-667BFCF47A53}",
        "name": "89S41_0.75",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 10,
          "rightLip": 10
        },
        "material": {
          "bmt": {
            "color": "clFuchsia",
            "thickness": 0.75
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{9944C230-9049-4BE5-BB1E-4ABD79848BBE}",
        "name": "89S41_1.15",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 10,
          "rightLip": 10
        },
        "material": {
          "bmt": {
            "color": "clYellow",
            "thickness": 1.15
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G500",
            "elongation": 8,
            "tensile": 520,
            "yield": 500
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      }
    ],
    "serviceHoleOptions": [
      "Service",
      "LongService"
    ],
    "fasteners": [
      {
        "toolName": "Dimple1",
        "condition": "d1d1"
      },
      {
        "toolName": "FlangeHole",
        "condition": "fh"
      },
      {
        "toolName": "Service",
        "condition": "sh"
      },
      {
        "toolName": "FlangeSlot",
        "condition": "slot"
      }
    ],
    "toolSetup": {
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
      ],
      "fixedTools": [
        {
          "fName": "Dimple1",
          "drawStyle": "dsDimpleHole",
          "id": 0,
          "length": 0,
          "size1": 10,
          "size2": 7
        },
        {
          "fName": "LipNotch",
          "drawStyle": "dsLipcut",
          "id": 6,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebNotch",
          "drawStyle": "dsCutout",
          "id": 5,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Bad",
          "drawStyle": "dsBad",
          "id": 254,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Swage",
          "drawStyle": "dsSwage",
          "id": 10,
          "length": 55,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Dummy",
          "drawStyle": "dsNull",
          "id": 255,
          "length": 0,
          "size1": 0,
          "size2": 0
        }
      ],
      "optionalOnTools": [
        {
          "fName": "SingleBoltHole",
          "drawStyle": "dsBoltLine",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "Chamfer",
          "drawStyle": "dsUnknown",
          "id": 17,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Service",
          "drawStyle": "dsCenterLine",
          "id": 1,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "FlangeHole",
          "drawStyle": "dsFlangeHole",
          "id": 27,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "LeftFlange",
          "drawStyle": "dsLeftFlange",
          "id": 20,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebChamfer",
          "drawStyle": "dsUnknown",
          "id": 39,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "RightFlange",
          "drawStyle": "dsRightFlange",
          "id": 21,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "TripleWebHole",
          "drawStyle": "dsTripleHole",
          "id": 15,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        }
      ],
      "optionalOffTools": [
        {
          "fName": "Tab",
          "drawStyle": "dsTab",
          "id": 26,
          "length": 0,
          "size1": 35,
          "size2": 0
        },
        {
          "fName": "Logo",
          "drawStyle": "dsLogo",
          "id": 51,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebSlot",
          "drawStyle": "dsSingleWebSlot",
          "id": 42,
          "length": 0,
          "size1": 101.6,
          "size2": 7.9
        },
        {
          "fName": "LeftTab",
          "drawStyle": "dsLeftTab",
          "id": 44,
          "length": 0,
          "size1": 50,
          "size2": 0
        },
        {
          "fName": "RightTab",
          "drawStyle": "dsRightTab",
          "id": 45,
          "length": 0,
          "size1": 50,
          "size2": 0
        },
        {
          "fName": "FlangeSlot",
          "drawStyle": "dsFlangeSlot",
          "id": 38,
          "length": 0,
          "size1": 20,
          "size2": 7
        },
        {
          "fName": "LongService",
          "drawStyle": "dsLongServiceHole",
          "id": 34,
          "length": 0,
          "size1": 82.55,
          "size2": 38.1
        },
        {
          "fName": "DoubleBolt",
          "drawStyle": "dsDoubleBolt",
          "id": 35,
          "length": 0,
          "size1": 12,
          "size2": 0
        },
        {
          "fName": "SingleWebHole",
          "drawStyle": "dsSmallHole",
          "id": 15,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "LeftFlangeBolt",
          "drawStyle": "dsLeftBolt",
          "id": 28,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "DoubleWebSlot",
          "drawStyle": "dsDoubleWebSlot",
          "id": 43,
          "length": 0,
          "size1": 101.6,
          "size2": 7.9
        },
        {
          "fName": "BoltWithWebHoles",
          "drawStyle": "dsBoltWithWebHoles",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 3.8
        },
        {
          "fName": "LeftFlangeService",
          "drawStyle": "dsLeftFlangeService",
          "id": 40,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "RightFlangeService",
          "drawStyle": "dsRightFlangeService",
          "id": 41,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "FlangeBoltHoles",
          "drawStyle": "dsFlangeBolt",
          "id": 33,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "RightPartialFlange",
          "drawStyle": "dsRightPartialFlange",
          "id": 49,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "LeftPartialFlange",
          "drawStyle": "dsLeftPartialFlange",
          "id": 48,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "RightFlangeBolt",
          "drawStyle": "dsRightBolt",
          "id": 29,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "TrussChamfer",
          "drawStyle": "dsUnknown",
          "id": 47,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "DoubleWebHole",
          "drawStyle": "dsDoubleWebHole",
          "id": 50,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "BoltWithQuadWebHoles",
          "drawStyle": "dsBoltQuadWebHoles",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 3.8
        },
        {
          "fName": "DoubleFlangeHole",
          "drawStyle": "dsDoubleFlangeHole",
          "id": 53,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "FlatDimple",
          "drawStyle": "dsFlangeHole",
          "id": 36,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        }
      ]
    },
    "designChecks": [
      "Unassigned Configs"
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
    "endClearanceReference": "ecrOutsideWeb",
    "extraFlangeHoles": "efhNone",
    "fB2BTooling": "b2bWebHole",
    "fastenerMating": "fmNone",
    "plateBoxingPieceType": "bptSelf",
    "studBoxingPieceType": "bptSelf",
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
    ],
    "defaultSectionOptions": {
      "boxable": true,
      "deflectionTrackEndClearance": 12.7,
      "deflectionTrackScrewHeight": 26.97,
      "dualFasteners": false,
      "fastener1": 20.5,
      "fastener1Name": "Dimple1",
      "fastener2": -1,
      "fastener2Name": "Fastener2",
      "flangeBoltHoleHeight": -1,
      "flangeHoleHeight": 27.5,
      "innerBendRadius": 2,
      "automaticChamfer": true,
      "automaticCruciform": false,
      "tripleHoleSpacing": 17
    },
    "sectionSetups": [
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{05C74D6A-C534-409E-B3C3-11B6B73FB08D}",
        "name": "89S41_0.55",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 12,
          "rightLip": 12
        },
        "material": {
          "bmt": {
            "color": "clBlack",
            "thickness": 0.55
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{76C3BE1E-54DC-4B84-A624-E5A3E1C2D99E}",
        "name": "89S41_0.95",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 10,
          "rightLip": 10
        },
        "material": {
          "bmt": {
            "color": "clWhite",
            "thickness": 0.95
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{A5E41D11-3A18-4079-89DD-68280FF91F93}",
        "name": "89S41_0.75",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 10,
          "rightLip": 10
        },
        "material": {
          "bmt": {
            "color": "clFuchsia",
            "thickness": 0.75
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{741EDF97-18B2-47E1-9A8D-5D41D0AA5518}",
        "name": "89S41_1.15",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 10,
          "rightLip": 10
        },
        "material": {
          "bmt": {
            "color": "clYellow",
            "thickness": 1.15
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G500",
            "elongation": 8,
            "tensile": 520,
            "yield": 500
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      }
    ],
    "serviceHoleOptions": [
      "Service",
      "LongService"
    ],
    "fasteners": [
      {
        "toolName": "Dimple1",
        "condition": "d1d1"
      },
      {
        "toolName": "FlangeHole",
        "condition": "fh"
      },
      {
        "toolName": "Service",
        "condition": "sh"
      },
      {
        "toolName": "FlangeSlot",
        "condition": "slot"
      }
    ],
    "toolSetup": {
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
      ],
      "fixedTools": [
        {
          "fName": "Dimple1",
          "drawStyle": "dsDimpleHole",
          "id": 0,
          "length": 0,
          "size1": 10,
          "size2": 7
        },
        {
          "fName": "LipNotch",
          "drawStyle": "dsLipcut",
          "id": 6,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebNotch",
          "drawStyle": "dsCutout",
          "id": 5,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Bad",
          "drawStyle": "dsBad",
          "id": 254,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Swage",
          "drawStyle": "dsSwage",
          "id": 10,
          "length": 55,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Dummy",
          "drawStyle": "dsNull",
          "id": 255,
          "length": 0,
          "size1": 0,
          "size2": 0
        }
      ],
      "optionalOnTools": [
        {
          "fName": "LeftFlange",
          "drawStyle": "dsLeftFlange",
          "id": 20,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "SingleBoltHole",
          "drawStyle": "dsBoltLine",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "LeftPartialFlange",
          "drawStyle": "dsLeftPartialFlange",
          "id": 48,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "RightPartialFlange",
          "drawStyle": "dsRightPartialFlange",
          "id": 49,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Chamfer",
          "drawStyle": "dsUnknown",
          "id": 17,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Service",
          "drawStyle": "dsCenterLine",
          "id": 1,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "WebChamfer",
          "drawStyle": "dsUnknown",
          "id": 39,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "FlangeHole",
          "drawStyle": "dsFlangeHole",
          "id": 27,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "RightFlange",
          "drawStyle": "dsRightFlange",
          "id": 21,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "TripleWebHole",
          "drawStyle": "dsTripleHole",
          "id": 15,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "TrussChamfer",
          "drawStyle": "dsUnknown",
          "id": 47,
          "length": 0,
          "size1": 0,
          "size2": 0
        }
      ],
      "optionalOffTools": [
        {
          "fName": "Tab",
          "drawStyle": "dsTab",
          "id": 26,
          "length": 0,
          "size1": 35,
          "size2": 0
        },
        {
          "fName": "Logo",
          "drawStyle": "dsLogo",
          "id": 51,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebSlot",
          "drawStyle": "dsSingleWebSlot",
          "id": 42,
          "length": 0,
          "size1": 101.6,
          "size2": 7.9
        },
        {
          "fName": "LeftTab",
          "drawStyle": "dsLeftTab",
          "id": 44,
          "length": 0,
          "size1": 50,
          "size2": 0
        },
        {
          "fName": "RightTab",
          "drawStyle": "dsRightTab",
          "id": 45,
          "length": 0,
          "size1": 50,
          "size2": 0
        },
        {
          "fName": "FlangeSlot",
          "drawStyle": "dsFlangeSlot",
          "id": 38,
          "length": 0,
          "size1": 20,
          "size2": 7
        },
        {
          "fName": "LongService",
          "drawStyle": "dsLongServiceHole",
          "id": 34,
          "length": 0,
          "size1": 82.55,
          "size2": 38.1
        },
        {
          "fName": "DoubleBolt",
          "drawStyle": "dsDoubleBolt",
          "id": 35,
          "length": 0,
          "size1": 12,
          "size2": 0
        },
        {
          "fName": "DoubleWebSlot",
          "drawStyle": "dsDoubleWebSlot",
          "id": 43,
          "length": 0,
          "size1": 101.6,
          "size2": 7.9
        },
        {
          "fName": "LeftFlangeBolt",
          "drawStyle": "dsLeftBolt",
          "id": 28,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "SingleWebHole",
          "drawStyle": "dsSmallHole",
          "id": 15,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "BoltWithWebHoles",
          "drawStyle": "dsBoltWithWebHoles",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 3.8
        },
        {
          "fName": "LeftFlangeService",
          "drawStyle": "dsLeftFlangeService",
          "id": 40,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "RightFlangeService",
          "drawStyle": "dsRightFlangeService",
          "id": 41,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "FlangeBoltHoles",
          "drawStyle": "dsFlangeBolt",
          "id": 33,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "RightFlangeBolt",
          "drawStyle": "dsRightBolt",
          "id": 29,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "DoubleWebHole",
          "drawStyle": "dsDoubleWebHole",
          "id": 50,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "BoltWithQuadWebHoles",
          "drawStyle": "dsBoltQuadWebHoles",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 3.8
        },
        {
          "fName": "DoubleFlangeHole",
          "drawStyle": "dsDoubleFlangeHole",
          "id": 53,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "FlatDimple",
          "drawStyle": "dsFlangeHole",
          "id": 36,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        }
      ]
    },
    "designChecks": [
      "Unassigned Configs"
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
    "endClearanceReference": "ecrOutsideWeb",
    "extraFlangeHoles": "efhNone",
    "fB2BTooling": "b2bWebHole",
    "fastenerMating": "fmNone",
    "plateBoxingPieceType": "bptSelf",
    "studBoxingPieceType": "bptSelf",
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
    ],
    "defaultSectionOptions": {
      "boxable": true,
      "deflectionTrackEndClearance": 12.7,
      "deflectionTrackScrewHeight": 26.97,
      "dualFasteners": false,
      "fastener1": 20.5,
      "fastener1Name": "Dimple1",
      "fastener2": -1,
      "fastener2Name": "Fastener2",
      "flangeBoltHoleHeight": -1,
      "flangeHoleHeight": 27.5,
      "innerBendRadius": 2,
      "automaticChamfer": true,
      "automaticCruciform": false,
      "tripleHoleSpacing": 17
    },
    "sectionSetups": [
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{A3B5E71F-A6FE-4F22-BABE-ADFBD7D742E0}",
        "name": "90S41_0.55",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 12,
          "rightLip": 12
        },
        "material": {
          "bmt": {
            "color": "clBlack",
            "thickness": 0.55
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{7C567C47-DFBE-4468-9A4C-B6F46DBB3731}",
        "name": "90S41_0.95",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 10,
          "rightLip": 10
        },
        "material": {
          "bmt": {
            "color": "clWhite",
            "thickness": 0.95
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{8DBEE9FB-F4AF-4847-82BC-48EF9FD87DAC}",
        "name": "90S41_0.75",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 10,
          "rightLip": 10
        },
        "material": {
          "bmt": {
            "color": "clFuchsia",
            "thickness": 0.75
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{5C27F329-FC74-4218-975E-27B0965FF138}",
        "name": "90S41_1.15",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 10,
          "rightLip": 10
        },
        "material": {
          "bmt": {
            "color": "clYellow",
            "thickness": 1.15
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G500",
            "elongation": 8,
            "tensile": 520,
            "yield": 500
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{D6E9EF95-D881-4780-95D2-9D005CCF277C}",
        "name": "90S41_0.95_1",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 10,
          "rightLip": 10
        },
        "material": {
          "bmt": {
            "color": "clWhite",
            "thickness": 0.95
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G550",
            "elongation": 2,
            "tensile": 550,
            "yield": 550
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      },
      {
        "automaticallyDetermineExportSection": true,
        "guid": "{E339F07C-0F4A-42B5-A03F-F44E34F034FE}",
        "name": "90S41_1.15_1",
        "manualRFYImperialLabel": "",
        "manualRFYMetricLabel": "",
        "manualSectionIDForRFX": -1,
        "profile": {
          "shapeClassification": "S",
          "leftFlange": 41,
          "rightFlange": 38,
          "flangeLabel": "0",
          "web": 89,
          "leftLip": 10,
          "rightLip": 10
        },
        "material": {
          "bmt": {
            "color": "clYellow",
            "thickness": 1.15
          },
          "coating": {
            "displayLabel": "AZ150",
            "minMass": 150
          },
          "steelSpec": "AS 1397",
          "strength": {
            "displayLabel": "G500",
            "elongation": 8,
            "tensile": 520,
            "yield": 500
          }
        },
        "sectionOptions": {
          "boxable": true,
          "deflectionTrackEndClearance": 12.7,
          "deflectionTrackScrewHeight": 26.97,
          "dualFasteners": false,
          "fastener1": 20.5,
          "fastener1Name": "Dimple1",
          "fastener2": -1,
          "fastener2Name": "Fastener2",
          "flangeBoltHoleHeight": -1,
          "flangeHoleHeight": 27.5,
          "innerBendRadius": 2,
          "automaticChamfer": true,
          "automaticCruciform": false,
          "tripleHoleSpacing": 17
        }
      }
    ],
    "serviceHoleOptions": [
      "Service",
      "LongService"
    ],
    "fasteners": [
      {
        "toolName": "Dimple1",
        "condition": "d1d1"
      },
      {
        "toolName": "FlangeHole",
        "condition": "fh"
      },
      {
        "toolName": "Service",
        "condition": "sh"
      },
      {
        "toolName": "FlangeSlot",
        "condition": "slot"
      }
    ],
    "toolSetup": {
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
      ],
      "fixedTools": [
        {
          "fName": "Dimple1",
          "drawStyle": "dsDimpleHole",
          "id": 0,
          "length": 0,
          "size1": 10,
          "size2": 7
        },
        {
          "fName": "LipNotch",
          "drawStyle": "dsLipcut",
          "id": 6,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebNotch",
          "drawStyle": "dsCutout",
          "id": 5,
          "length": 60,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Bad",
          "drawStyle": "dsBad",
          "id": 254,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Swage",
          "drawStyle": "dsSwage",
          "id": 10,
          "length": 60,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Dummy",
          "drawStyle": "dsNull",
          "id": 255,
          "length": 0,
          "size1": 0,
          "size2": 0
        }
      ],
      "optionalOnTools": [
        {
          "fName": "LeftFlange",
          "drawStyle": "dsLeftFlange",
          "id": 20,
          "length": 45,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "LeftFlangeService",
          "drawStyle": "dsLeftFlangeService",
          "id": 40,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "RightFlangeService",
          "drawStyle": "dsRightFlangeService",
          "id": 41,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "Chamfer",
          "drawStyle": "dsUnknown",
          "id": 17,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "Service",
          "drawStyle": "dsCenterLine",
          "id": 1,
          "length": 0,
          "size1": 34,
          "size2": 0
        },
        {
          "fName": "WebChamfer",
          "drawStyle": "dsUnknown",
          "id": 39,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "FlangeHole",
          "drawStyle": "dsFlangeHole",
          "id": 27,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "RightFlange",
          "drawStyle": "dsRightFlange",
          "id": 21,
          "length": 45,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "TripleWebHole",
          "drawStyle": "dsTripleHole",
          "id": 15,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "SingleBoltHole",
          "drawStyle": "dsBoltLine",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        }
      ],
      "optionalOffTools": [
        {
          "fName": "Tab",
          "drawStyle": "dsTab",
          "id": 26,
          "length": 0,
          "size1": 35,
          "size2": 0
        },
        {
          "fName": "Logo",
          "drawStyle": "dsLogo",
          "id": 51,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "WebSlot",
          "drawStyle": "dsSingleWebSlot",
          "id": 42,
          "length": 0,
          "size1": 101.6,
          "size2": 7.9
        },
        {
          "fName": "LeftTab",
          "drawStyle": "dsLeftTab",
          "id": 44,
          "length": 0,
          "size1": 50,
          "size2": 0
        },
        {
          "fName": "RightTab",
          "drawStyle": "dsRightTab",
          "id": 45,
          "length": 0,
          "size1": 50,
          "size2": 0
        },
        {
          "fName": "FlangeSlot",
          "drawStyle": "dsFlangeSlot",
          "id": 38,
          "length": 0,
          "size1": 20,
          "size2": 7
        },
        {
          "fName": "LongService",
          "drawStyle": "dsLongServiceHole",
          "id": 34,
          "length": 0,
          "size1": 82.55,
          "size2": 38.1
        },
        {
          "fName": "DoubleBolt",
          "drawStyle": "dsDoubleBolt",
          "id": 35,
          "length": 0,
          "size1": 12,
          "size2": 0
        },
        {
          "fName": "DoubleWebSlot",
          "drawStyle": "dsDoubleWebSlot",
          "id": 43,
          "length": 0,
          "size1": 101.6,
          "size2": 7.9
        },
        {
          "fName": "LeftFlangeBolt",
          "drawStyle": "dsLeftBolt",
          "id": 28,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "SingleWebHole",
          "drawStyle": "dsSmallHole",
          "id": 15,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "BoltWithWebHoles",
          "drawStyle": "dsBoltWithWebHoles",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 3.8
        },
        {
          "fName": "FlangeBoltHoles",
          "drawStyle": "dsFlangeBolt",
          "id": 33,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "RightPartialFlange",
          "drawStyle": "dsRightPartialFlange",
          "id": 49,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "LeftPartialFlange",
          "drawStyle": "dsLeftPartialFlange",
          "id": 48,
          "length": 48,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "RightFlangeBolt",
          "drawStyle": "dsRightBolt",
          "id": 29,
          "length": 0,
          "size1": 13.5,
          "size2": 0
        },
        {
          "fName": "TrussChamfer",
          "drawStyle": "dsUnknown",
          "id": 47,
          "length": 0,
          "size1": 0,
          "size2": 0
        },
        {
          "fName": "DoubleWebHole",
          "drawStyle": "dsDoubleWebHole",
          "id": 50,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "BoltWithQuadWebHoles",
          "drawStyle": "dsBoltQuadWebHoles",
          "id": 3,
          "length": 0,
          "size1": 13.5,
          "size2": 3.8
        },
        {
          "fName": "DoubleFlangeHole",
          "drawStyle": "dsDoubleFlangeHole",
          "id": 53,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        },
        {
          "fName": "FlatDimple",
          "drawStyle": "dsFlangeHole",
          "id": 36,
          "length": 0,
          "size1": 0,
          "size2": 3.8
        }
      ]
    },
    "designChecks": [
      "Unassigned Configs"
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
export function findSectionSetup(
  setup: MachineSetup, sectionName: string
): SectionSetup | undefined {
  return setup.sectionSetups.find(s => s.name === sectionName);
}

/**
 * Look up a tool entry in any of FixedTools / OptionalOnTools / OptionalOffTools
 * by FName. Returns the tool entry — gives access to size1/size2/length/id.
 *
 * @example
 *   const dimple = findTool(setup, "Dimple1");  // size1=10 (the dimple width)
 *   const lipNotch = findTool(setup, "LipNotch");  // length=48 (or 75 for 104mm)
 *   const tab = findTool(setup, "Tab");  // size1=35 (the start-tab clearance)
 */
export function findTool(setup: MachineSetup, fName: string): ToolEntry | undefined {
  const ts = setup.toolSetup;
  if (!ts) return undefined;
  for (const list of [ts.fixedTools, ts.optionalOnTools, ts.optionalOffTools]) {
    const found = list.find(t => t.fName === fName);
    if (found) return found;
  }
  return undefined;
}

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
export function endClearanceSpan(setup: MachineSetup): number {
  const tab = findTool(setup, "Tab");
  const tabSize = tab?.size1 ?? 35;
  return tabSize + setup.endClearance;
}

/**
 * Get the dimple longitudinal offset from a stick's end — the position along
 * the stick where the InnerDimple sits. Detailer's derivation:
 *
 *   offset = EndClearance + (TabSize - Dimple1.Size1) / 2
 *
 * For HYTEK F325iT 70/89mm setups this is 16.5mm (4 + (35-10)/2). For 104mm
 * setup (EndClearance=5) it's 17.5mm.
 */
export function dimpleEndOffset(setup: MachineSetup): number {
  const tab = findTool(setup, "Tab");
  const dimple = findTool(setup, "Dimple1");
  const tabSize = tab?.size1 ?? 35;
  const dimpleSize = dimple?.size1 ?? 10;
  return setup.endClearance + (tabSize - dimpleSize) / 2;
}

/**
 * Get the lip-notch tool length for the setup. Detailer uses different lip-notch
 * widths per profile (70=48mm, 75/78=60mm, 89=48mm, 104=75mm). Use this
 * instead of hardcoding the internal-lip-notch span in frame-context rules.
 */
export function lipNotchToolLength(setup: MachineSetup): number {
  const t = findTool(setup, "LipNotch");
  return t?.length ?? 48;
}
