# Rules Coverage — FrameCAD Detailer .sups vs Codec

Audit of which fields from FrameCAD Detailer's catalog `.sups` files are
captured by the codec's `src/machine-setups.ts`.

**Last verified**: 2026-05-04 (Setup count: 10, Section count per setup: 4-6,
Coverage: 100%).

**Run regression check**:
```
npm run build
node scripts/verify-rules-coverage.mjs
```

## Source Files

| File | Path | Purpose |
|---|---|---|
| MACHINE TYPES | `Y:/(08) DETAILING/(13) FRAMECAD/FrameCAD DETAILER/HYTEK MACHINE_FRAME TYPES/HYTEK MACHINE TYPES 20260402.sups` | 10 machine setups (codec's authoritative input). |
| FRAME TYPES | `Y:/(08) DETAILING/(13) FRAMECAD/FrameCAD DETAILER/HYTEK MACHINE_FRAME TYPES/HYTEK FRAME TYPES 20260428.sups` | 38 frame types + 7 machine setups (subset of above; values agree). |

Both files are UTF-8-BOM JSON; load with `fs.readFileSync(p,"utf-8").replace(/^﻿/,"")`.

## Setup Coverage (10 / 10)

| ID | Name | Captured? |
|---|---|---|
| 0 | Demo Machine Setup | Y |
| 1 | F325iT 104mm | Y |
| 2 | F325iT 70mm | Y |
| 3 | F325iT 70mm B2B Centre Hole | Y |
| 4 | F325iT 75mm | Y |
| 5 | F325iT 78mm | Y |
| 6 | F325iT 89mm | Y |
| 7 | F325iT 89mm B2B Centre Hole | Y |
| 8 | F325iT 89mm LINEAR | Y |
| 9 | F325iT 90mm (PERTH) | Y |

## Scalar Field Coverage (43 / 43 per setup)

Every primitive (number/bool/string) field in MachineSetup is captured.

### Numbers (27 fields, all captured)
| .sups field | codec field | machine-setups.ts |
|---|---|---|
| `ChamferTolerance` | `chamferTolerance` | line 81 |
| `BraceToDimple` | `braceToDimple` | line 82 |
| `BraceToWebhole` | `braceToWebhole` | line 83 |
| `ToolClearance` | `toolClearance` | line 84 |
| `DimpleToEnd` | `dimpleToEnd` | line 85 |
| `BoltHoleToEnd` | `boltHoleToEnd` | line 86 |
| `WebHoleToEnd` | `webHoleToEnd` | line 87 |
| `B2BStickClearance` | `b2BStickClearance` | line 88 |
| `BoxedEndLength` | `boxedEndLength` | line 89 |
| `BoxedFirstDimpleOffset` | `boxedFirstDimpleOffset` | line 90 |
| `BoxDimpleSpacing` | `boxDimpleSpacing` | line 91 |
| `DoorSillNotchOffset` | `doorSillNotchOffset` | line 92 |
| `DoubleBoltSpacing` | `doubleBoltSpacing` | line 93 |
| `EndClearance` | `endClearance` | line 94 |
| `EndToTabDistance` | `endToTabDistance` | line 95 |
| `ExtraFlangeHoleOffset` | `extraFlangeHoleOffset` | line 96 |
| `ExtraFlangeHoleOffsetAt90` | `extraFlangeHoleOffsetAt90` | line 97 |
| `FPlateWidthDifferential` | `fPlateWidthDifferential` | line 98 |
| `FlangeSlotHeight` | `flangeSlotHeight` | line 99 |
| `LargeServiceToLeadingEdgeDistance` | `largeServiceToLeadingEdgeDistance` | line 100 |
| `LargeServiceToTrailingEdgeDistance` | `largeServiceToTrailingEdgeDistance` | line 101 |
| `MaxBoxToBoxHoleDelta` | `maxBoxToBoxHoleDelta` | line 102 |
| `MaxSplicingLength` | `maxSplicingLength` | line 103 |
| `MinimumTagLength` | `minimumTagLength` | line 104 |
| `SplicingDimpleSpacing` | `splicingDimpleSpacing` | line 105 |
| `TabToTabDistance` | `tabToTabDistance` | line 106 |
| `Web2Web` | `web2Web` | line 107 |

### Booleans (10 fields, all captured)
| .sups field | codec field |
|---|---|
| `BraceAsStud` | `braceAsStud` |
| `ExtraChamfers` | `extraChamfers` |
| `EndToEndChamfers` | `endToEndChamfers` |
| `FDualSection` | `fDualSection` |
| `FixedWeb2Web` | `fixedWeb2Web` |
| `InvertDimpleFlangeFastenings` | `invertDimpleFlangeFastenings` |
| `OnEdgeLipNotches` | `onEdgeLipNotches` |
| `OnFlySwage` | `onFlySwage` |
| `SuppressFasteners` | `suppressFasteners` |
| `UseMaleFemaleDimples` | `useMaleFemaleDimples` |

### Enum-style Strings (6 fields — NEW 2026-05-04)
| .sups field | codec field | Sample value | Codec usage |
|---|---|---|---|
| `EndClearanceReference` | `endClearanceReference` | `"ecrOutsideWeb"` | Not yet read by rules |
| `ExtraFlangeHoles` | `extraFlangeHoles` | `"efhNone"` | Not yet read by rules |
| `FB2BTooling` | `fB2BTooling` | `"b2bWebHole"` | **Should gate B2B partner-stud Web ops** in `frame-context.ts:b2bStudNames` block (currently disabled because empirically wrong on HG260001 — but the gate may unlock it). |
| `FastenerMating` | `fastenerMating` | `"fmNone"` | Not yet read by rules |
| `PlateBoxingPieceType` | `plateBoxingPieceType` | `"bptSelf"` | Not yet read by rules |
| `StudBoxingPieceType` | `studBoxingPieceType` | `"bptSelf"` | Not yet read by rules |

## Nested Struct Coverage (6 / 6 — NEW 2026-05-04)

| .sups struct | codec field | Type | Notes |
|---|---|---|---|
| `DefaultSectionOptions` | `defaultSectionOptions` | `SectionOptions` | Per-profile dimple Y-positions / flange-hole heights / triple-hole spacing. |
| `SectionSetups` | `sectionSetups[]` | `SectionSetup[]` | One per profile-gauge combo (e.g. `70S41_0.75`). Each has its own SectionOptions overriding the default. |
| `ServiceHoleOptions` | `serviceHoleOptions[]` | `string[]` | List of service-hole tool names (`["Service", "LongService"]`). |
| `Fasteners` | `fasteners[]` | `FastenerEntry[]` | Tool-to-CSV-condition map: `{Dimple1→"d1d1", FlangeHole→"fh", Service→"sh", FlangeSlot→"slot"}`. |
| `ToolSetup` | `toolSetup` | `ToolSetup` | Tool catalog: chamfer geometry + FixedTools (6) + OptionalOnTools (8) + OptionalOffTools (23). |
| `DesignChecks` | `designChecks[]` | `string[]` | Design-check labels (typically `["Unassigned Configs"]`). |

### SectionSetup detail
Each `SectionSetup` exposes:
```
{
  guid: string,
  name: string,                   // "70S41_0.75" etc.
  profile: { web, leftFlange, rightFlange, leftLip, rightLip, ... },
  material: { bmt, coating, steelSpec, strength },
  sectionOptions: {
    fastener1,                    // Y-position of dimple from web edge (mm)
    fastener1Name,                // "Dimple1"
    flangeHoleHeight,             // Y-position of flange hole
    flangeBoltHoleHeight,         // -1 = none
    tripleHoleSpacing,            // pitch between triple-pattern holes
    boxable, dualFasteners, automaticChamfer, automaticCruciform,
    deflectionTrackEndClearance, deflectionTrackScrewHeight,
    innerBendRadius,
  }
}
```

### Per-profile `Fastener1` (dimple Y-position) — varies by profile

| Setup | Default Fastener1 | Per-profile section overrides |
|---|---|---|
| F325iT 70mm | 20.5 | All gauges = 20.5, TripleHS = 15 |
| F325iT 75mm | 20.5 | All gauges = **22**, TripleHS = 17 |
| F325iT 78mm | 20.5 | All gauges = **22**, TripleHS = 17 |
| F325iT 89mm | 20.5 | All gauges = 20.5, TripleHS = 17 |
| F325iT 90mm | 20.5 | All gauges = 20.5, TripleHS = 17 |
| F325iT 104mm | 20.5 | All gauges = **25.5**, TripleHS = **26.5** |

(70mm dimple Y is 20.5mm from the web edge; 75/78mm is 22mm; 104mm is 25.5mm.
TripleHoleSpacing pitch differs too — 15mm for 70mm vs 26.5mm for 104mm.)

### ToolSetup catalog — varies by profile

| Setup | LipNotch.length | WebNotch.length | Swage.length |
|---|---|---|---|
| F325iT 70mm | **48** | 48 | 55 |
| F325iT 75mm | **60** | 60 | 60 |
| F325iT 78mm | **60** | 60 | 60 |
| F325iT 89mm | 48 | 48 | 55 |
| F325iT 90mm | 48 | **60** | 60 |
| F325iT 104mm | **75** | 75 | 60 |

(Codec hardcodes 45mm for internal-lip-notch span, derived for 70/89mm only.
For 75/78/104mm the actual Detailer notch is wider — the codec's hardcoded
45mm is wrong on those profiles.)

## Frame-Type → Machine-Setup Linkage (38 frame types)

Each FrameType in HYTEK FRAME TYPES.sups has a `FrameOptions.DefaultMachineSetupGUID`
that resolves to one of the 7 setups in that file (subset of the 10 in MACHINE TYPES).

| Frame Name | Resolved Setup |
|---|---|
| 104 Joist / Roof Panel / Truss / 104055 Wall / 10410 Wall / 10415 * | F325iT 104mm |
| 70 Ceiling Panel / External Wall / Internal LBW / Internal NLBW / Roof Panel / Truss B2B / Truss Inline | F325iT 70mm |
| 75 Ceiling / External / Internal LBW / Internal NLBW / Joist / Roof Panel | F325iT 75mm |
| 78 Joist / Roof Panel / Truss / 7810 / 7812 | F325iT 78mm |
| 89 Ceiling / External Wall / Internal LBW / Internal NLBW / Roof Panel / Truss B2B | F325iT 89mm |
| 89 Joist | F325iT 89mm Joist (FRAME-TYPES file only — not in MACHINE-TYPES) |
| 9010 / 9012 (PERTH variants) | F325iT 90mm (PERTH) |

## Codec Helper Functions Added

The codec now exports these convenience helpers in `src/machine-setups.ts`:

```ts
findSectionSetup(setup, "70S41_0.75")  // SectionSetup with profile + materials + options
findTool(setup, "LipNotch")            // ToolEntry — returns {fName, drawStyle, id, length, size1, size2}
endClearanceSpan(setup)                // = TabSize + EndClearance (= 39 for 70/89mm setups)
dimpleEndOffset(setup)                 // = EndClearance + (TabSize - Dimple1.Size1)/2 (= 16.5)
lipNotchToolLength(setup)              // = LipNotch tool's length (48 for 70/89, 60 for 75/78, 75 for 104)
```

## TODO Sites in Rule Logic

The codec currently hardcodes values that are now derivable from machine-setup
data. Each call site is marked with `// TODO(rules-coverage):` and lists the
helper to use:

| File | Line | Hardcoded | Helper |
|---|---|---|---|
| `src/rules/table.ts` | ~46 | `SPAN_70 = 39` | `endClearanceSpan(setup)` |
| `src/rules/table.ts` | ~47 | `DIMPLE_OFFSET_70 = 16.5` | `dimpleEndOffset(setup)` |
| `src/rules/table.ts` | ~57 | `SPAN_89 = 39` | `endClearanceSpan(setup)` |
| `src/rules/table.ts` | ~58 | `DIMPLE_OFFSET_89 = 16.5` | `dimpleEndOffset(setup)` |
| `src/rules/table.ts` | ~190 | InnerService spacing 600 | `setup.largeServiceToLeadingEdgeDistance` |
| `src/rules/table.ts` | ~497 | `profileOffsets` switch on profile family | `endClearanceSpan(setup)` / `dimpleEndOffset(setup)` |
| `src/rules/frame-context.ts` | ~209 | `internalSpan = 45` | `lipNotchToolLength(setup) - 3` |

These remain hardcoded in this pass to avoid conflict with concurrent agents
working on TB2B truss rules and wall positioning rules. When those agents
adopt the new helpers, profile coverage automatically widens to 75/78/104mm.

## What's NOT in scope for this audit

The other concurrent agents own:
- TB2B truss Web ops generation (`scripts/diff-scope.mjs TB2B`)
- Wall positioning rules — InnerDimple/Swage/LipNotch/InnerService positions (`scripts/diff-scope.mjs NLBW/LBW`)

This pass enriches the **data layer** so their fixes land on a complete
schema. Rule-application logic was NOT modified — only annotated.
