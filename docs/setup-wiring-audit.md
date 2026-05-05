# Setup-data wiring audit (read-only)

**Author:** audit agent (READ-ONLY pass), 2026-05-05
**Output target:** drives a follow-up implementation agent
**Inputs reviewed:**
- `memory/reference_data/HYTEK-MACHINE-TYPES.json` (10 setups, ground-truth)
- `src/machine-setups.ts` (data layer, ~7,500 lines)
- `src/rules/table.ts`, `src/rules/frame-context.ts` (rule logic)
- `src/synthesize-plans.ts` (top-level dispatcher + setup resolver)
- `src/simplify-tin-truss.ts`, `src/simplify-rp.ts`, `src/simplify-tb2b-truss.ts`, `src/simplify-wall-service.ts` (per-plan simplifiers)
- `docs/rules-coverage.md` (prior agent's TODO inventory)
- `docs/manual-coverage-full.md`, `C:/Users/Scott/AppData/Local/Temp/detailer-manual.txt` (Detailer manual)

## TL;DR

The codec already parses every primitive on the `MachineSetup` type. **It is, however, almost entirely DEAD DATA.** `synthesize-plans.ts:397` resolves a `setup` variable from the first stick's profile web, then never uses it. Every numeric the rule engine produces is hardcoded against an empirically-derived 70mm/89mm value.

There are exactly **two real consumers** of any setup field today (Demo, F325iT 70mm, F325iT 89mm B2B Centre Hole) — and both are TODO comments that say "do this later":
- `src/rules/table.ts:46-66` — comments listing helpers to use
- `src/rules/frame-context.ts:225-233` — `internalSpan = 45` hardcode w/ TODO

The same lesson surfaced twice already (Agents O on TB2B, V on InnerService): when the rule layer hardcodes data, behaviour drifts from Detailer's truth across machines/profiles. The 75mm/78mm/104mm setups are, today, simply broken — they fall back to 70mm constants because the rule layer never reads the setup the encoder selected.

This audit ranks the wirings by parity impact. The Top 10 list (Section 4) is the dispatch brief.

---

## Section 1: Available setup fields (cross-setup variance)

The 10 HYTEK setups loaded in `MACHINE_SETUPS`:

| Index | Name |
|---|---|
| 0 | Demo Machine Setup |
| 1 | F325iT 104mm |
| 2 | **F325iT 70mm** (default — used for 70S41) |
| 3 | F325iT 70mm B2B Centre Hole |
| 4 | F325iT 75mm |
| 5 | F325iT 78mm |
| 6 | **F325iT 89mm** (used for 89S41) |
| 7 | F325iT 89mm B2B Centre Hole |
| 8 | F325iT 89mm LINEAR |
| 9 | F325iT 90mm (PERTH) |

### Top-level numeric fields — variance across setups

Excluding Demo. **VARY** = differs across HYTEK setups; **SAME** = identical across all HYTEK setups.

| Field | 70mm | 89mm | 104mm | 75/78mm | 70mm B2B | 89mm B2B | 89 LINEAR | 90mm PERTH | Variance |
|---|---|---|---|---|---|---|---|---|---|
| `chamferTolerance` | 4 | 4 | 4 | 4 / 4 | 2 | 2 | 4 | 4 | VARY (B2B = 2) |
| `braceToDimple` | 50 | 50 | 60 | 55 / 55 | 50 | 50 | 50 | 50 | VARY (104=60, 75/78=55) |
| `braceToWebhole` | 100 | 100 | 120 | 100 / 100 | 100 | 100 | 100 | 100 | VARY (104=120) |
| `toolClearance` | 2 | 2 | 8 | 6 / 6 | 2 | 2 | 2 | 2 | VARY (104=8, 75/78=6) |
| `dimpleToEnd` | 10 | 10 | 10 | 10 / 10 | 10 | 10 | 10 | 10 | SAME |
| `boltHoleToEnd` | 20 | 20 | 20 | **5** / **5** | 20 | 20 | 20 | 20 | VARY (75/78=5) |
| `webHoleToEnd` | 16 | 16 | **10** | 16 / 16 | 16 | 16 | 16 | 16 | VARY (104=10) |
| `b2BStickClearance` | 2 | 2 | 2 | 2 / 2 | 2 | 2 | 2 | 2 | SAME |
| `boxedEndLength` | 70 | 70 | 70 | 70 / 70 | 70 | 70 | 70 | 70 | SAME (Demo=200) |
| `boxedFirstDimpleOffset` | **50** | 10 | 10 | 10 / 10 | **50** | 10 | 10 | 10 | VARY (70mm + 70mm B2B = 50) |
| `boxDimpleSpacing` | **1200** | 1200 | 600 | 1200 / 600 | 1200 | 1200 | 1200 | 1200 | VARY (104 + 78 = 600) |
| `doorSillNotchOffset` | 0 | 0 | 0 | 0 / 0 | 0 | 0 | 0 | 0 | SAME |
| `doubleBoltSpacing` | 30 | 30 | 30 | 30 / 30 | 30 | 30 | 30 | 30 | SAME |
| `endClearance` | **4** | **4** | 5 | 4 / 4 | 4 | 4 | 4 | 4 | VARY (104=5; Demo=2) |
| `endToTabDistance` | 400 | 400 | 400 | 400 / 400 | 400 | 400 | 400 | 400 | SAME |
| `extraFlangeHoleOffset` | 9 | 9 | 9 | 9 / 9 | 9 | 9 | 9 | 9 | SAME |
| `extraFlangeHoleOffsetAt90` | 15 | 15 | 15 | 15 / 15 | 15 | 15 | 15 | 15 | SAME |
| `fPlateWidthDifferential` | 3 | 3 | 3 | 3 / 3 | 3 | 3 | 3 | 3 | SAME |
| `flangeSlotHeight` | 11.1 | 11.1 | 11.1 | 11.1 / 11.1 | 11.1 | 11.1 | 11.1 | 11.1 | SAME |
| `largeServiceToLeadingEdgeDistance` | 600 | 600 | 600 | 600 / 600 | 600 | 600 | 600 | 600 | SAME |
| `largeServiceToTrailingEdgeDistance` | 700 | 700 | 700 | 700 / 700 | 700 | 700 | 700 | 700 | SAME |
| `maxBoxToBoxHoleDelta` | 2 | 2 | 2 | 2 / 2 | 2 | 2 | 2 | 2 | SAME |
| `maxSplicingLength` | 500 | 500 | 500 | 500 / 500 | 500 | 500 | 500 | 500 | SAME |
| `minimumTagLength` | 20 | 20 | 20 | 20 / 20 | 20 | 20 | 20 | 20 | SAME |
| `splicingDimpleSpacing` | 100 | 100 | 100 | 100 / 100 | 100 | 100 | 100 | 100 | SAME |
| `tabToTabDistance` | 295 | 295 | 295 | 295 / 295 | 295 | 295 | 295 | 295 | SAME |
| `web2Web` | **50.4** | **50.4** | 58 | 58 / 58 | 50.4 | 50.4 | 50.4 | 50.4 | VARY (104+75+78 = 58) |

### Top-level enums

| Field | 70mm | 89mm | All HYTEK setups |
|---|---|---|---|
| `endClearanceReference` | `ecrOutsideWeb` | `ecrOutsideWeb` | All `ecrOutsideWeb`. Demo also `ecrOutsideWeb`. **Other enum values not yet seen.** |
| `extraFlangeHoles` | `efhNone` | `efhNone` | All `efhNone` |
| `fB2BTooling` | `b2bWebHole` | `b2bWebHole` | 70mm + 89mm + B2B variants + LINEAR + PERTH = `b2bWebHole`; 104/75/78 = `b2bWebHole`; Demo = `b2bNone` |
| `fastenerMating` | `fmNone` | `fmNone` | All `fmNone` |
| `plateBoxingPieceType` | `bptSelf` | `bptSelf` | All `bptSelf` |
| `studBoxingPieceType` | `bptSelf` | `bptSelf` | All `bptSelf` |

### Top-level booleans

All HYTEK setups (excluding Demo): `braceAsStud=false`, `extraChamfers=false`, `endToEndChamfers=false`, `fDualSection=false`, `fixedWeb2Web=false`, `invertDimpleFlangeFastenings=false`, `onEdgeLipNotches=true`, `onFlySwage=false`, `suppressFasteners=false`, `useMaleFemaleDimples=false`. **No variance.**

### Per-section nested fields (`defaultSectionOptions`, `sectionSetups[].sectionOptions`)

| Field | 70mm default | 89mm default | Notes |
|---|---|---|---|
| `boxable` | `true` | `true` | All HYTEK setups true |
| `deflectionTrackEndClearance` | 12.7 | 12.7 | Identical across all HYTEK |
| `deflectionTrackScrewHeight` | 26.97 | 26.97 | Identical across all HYTEK |
| `dualFasteners` | `false` | `false` | All false |
| `fastener1` | **20.5** | **20.5** | Identical (default); per-section may differ — need check |
| `fastener1Name` | `Dimple1` | `Dimple1` | All same |
| `fastener2` | -1 | -1 | All -1 (no secondary) |
| `flangeBoltHoleHeight` | -1 | -1 | All -1 |
| `flangeHoleHeight` | 27.5 | 27.5 | Identical |
| `innerBendRadius` | 2 | 2 | Identical |
| `automaticChamfer` | `true` | `true` | All true |
| `automaticCruciform` | `false` | `false` | All false |
| `tripleHoleSpacing` | **17** (default), 15 (70S41_0.55 section), 17 (70S41_0.75) | 17 | Per-section variation seen on 70mm 0.55 |

### Tool catalog (per-setup `toolSetup.fixedTools`/`optionalOnTools`/`optionalOffTools`)

| Tool | 70mm | 89mm | 104mm | Variance |
|---|---|---|---|---|
| `Dimple1.size1` | 10 | 10 | 10 | SAME (=DimpleWidth) |
| `Dimple1.size2` | 7 | 7 | 7 | SAME (=DimpleRadius) |
| `LipNotch.length` | **48** | 48 | **75** | VARY (75/78mm = 60) |
| `WebNotch.length` | 48 | 48 | 75 | VARY (mirrors LipNotch) |
| `Swage.length` | 55 | 55 | 60 | VARY (104=60) |
| `Tab.size1` | **35** | 35 | 35 | SAME (= start-tab clearance — used by `endClearanceSpan` helper) |
| `Service.size1` | 34 | 34 | 34 | SAME (= service-hole tool width) |
| `LeftFlange.length` / `RightFlange.length` | 54 | 54 | 54 | SAME |
| `Chamfer.id` | 17 | 17 | 17 | SAME (no dimensional fields populated) |

### Material/profile per `sectionSetups`

| Field | Examples |
|---|---|
| `web` (web depth) | 70/75/78/89/104 |
| `leftFlange` / `rightFlange` | 38 / 41 (asymmetric C) |
| `leftLip` / `rightLip` | 10–12 (varies by profile + gauge) |
| `bmt.thickness` | 0.55 / 0.75 / 0.95 / 1.15 / 1.6 |
| `coating.displayLabel` | `AZ150` / `Z275` |
| `strength.yield` | 500 / 550 |

These are pure metadata and **already used by `synthesize-plans.ts`** for stick profile XML; they don't drive rule-engine offsets directly.

---

## Section 2: Per-field consumption status

Format: `parsed?` = field present in `MachineSetup` interface; `consumed?` = referenced by name (`setup.X` or via helper) anywhere in `src/rules/*` or `src/simplify-*.ts` or `src/synthesize-plans.ts` outside the data layer; `hardcode-match` = file:line where a numeric literal equals the field's value (HYTEK setup) and the surrounding code looks like it semantically computes the same thing.

The single setup variable in `synthesize-plans.ts:397` is **resolved but never read** (verified by grep — only references are the line that creates it). Helpers `endClearanceSpan`, `dimpleEndOffset`, `lipNotchToolLength` are exported from `machine-setups.ts` but **only mentioned in TODO comments**.

### Top-level fields

| Field | Value (70mm) | Value (89mm) | Parsed? | Consumed? | Hardcode-match locations |
|---|---|---|---|---|---|
| `chamferTolerance` | 4 | 4 | yes | **NO** | Not directly seen. May affect when chamfers fire; corpus has angle-based 28° threshold in `rules/table.ts:603,621,660,677` — geometric, not chamfer-tolerance based. **Likely indirect — may explain occasional chamfer drift.** |
| `braceToDimple` | 50 | 50 | yes | **NO** | `rules/table.ts:735-738` — Brace Swage span 41, dimple offset 11. The 50 isn't directly there; brace dimple-from-end offset is 11. **TODO: verify whether brace dimple-from-end should be 50 (the field) or 11 (corpus-fit).** Not the same axis. |
| `braceToWebhole` | 100 | 100 | yes | **NO** | Not seen in rules. May apply to TB2B web emission spacing. |
| `toolClearance` | 2 | 2 | yes | **NO** | `rules/frame-context.ts:359` `offsetMagnitudeBase = 2.0` (web/chord lip-notch clearance). **Strong match — `toolClearance=2` for HYTEK 70/89mm setups, =6 for 75/78, =8 for 104.** Hardcoding 2.0 means 75/78/104mm are wrong. |
| `dimpleToEnd` | 10 | 10 | yes | **NO** | `rules/table.ts:211,233,244,246` (Cripple Kb dimple at 10mm). Also `rules/table.ts:609,618,666,675` (wall-W dimple @10). **Direct match.** |
| `boltHoleToEnd` | 20 | 20 | yes | **NO** | `rules/table.ts:57` `BOLT_OFFSET_70 = 62` — comment explicitly notes `setup.boltHoleToEnd = 20 (NOT 62 — needs investigation)`. The 62 is a CORPUS-DERIVED value. The setup field's 20mm doesn't match observed Detailer behaviour. **Open question — see Section 5.** Maybe `boltHoleToEnd` applies only to TB2B truss bolts (where webHoleToEnd ≠ boltHoleToEnd makes sense), and slab-anchor `Bolt@62` is a different dimension entirely. |
| `webHoleToEnd` | 16 | 16 | yes | **NO** | Not directly seen. The slab-anchor `Web@8` (`rules/table.ts:321,358,406`) is a SEPARATE dimension. webHoleToEnd may apply to TB2B truss web holes. |
| `b2BStickClearance` | 2 | 2 | yes | **NO** | Not seen. May apply to B2B-truss web-vs-rail offset. `simplify-tb2b-truss.ts:149` has `WEB_VS_RAIL_OFFSET = 15` — much larger; not the same field. |
| `boxedEndLength` | 70 | 70 | yes | **NO** | Not seen. Demo=200, all HYTEK=70 — may not matter today. |
| `boxedFirstDimpleOffset` | 50 | 10 | yes | **NO** | Not seen. **Variance is meaningful** (70mm + 70mm B2B = 50; all others = 10). May apply to chord-on-chord box dimple positioning. |
| `boxDimpleSpacing` | 1200 | 1200 | yes | **NO** | `simplify-tb2b-truss.ts:437` `const BOX_DIMPLE_SPACING = 1200; // TODO: read from active machine setup`. **Direct hit + already-flagged TODO.** Wrong for 104mm + 78mm setups (=600). |
| `doorSillNotchOffset` | 0 | 0 | yes | **NO** | Not seen. All HYTEK = 0 — may be inactive. |
| `doubleBoltSpacing` | 30 | 30 | yes | **NO** | Not seen. May apply to apex-bolt or double-bolt-pair emission in TB2B. `simplify-tb2b-truss.ts:245` `APEX_PAIR_OFFSET = 153.4` — different magnitude. |
| `endClearance` | 4 | 4 | yes | **NO** | Foundational field. Drives `SPAN = TabSize + EndClearance` per Detailer. `rules/table.ts:55` `SPAN_70 = 39` (= 35 + 4); `rules/table.ts:68` `SPAN_89 = 39`. **Hardcoded everywhere** — see Section 4 #1. |
| `endToTabDistance` | 400 | 400 | yes | **NO** | Not seen. FL650-only per manual; HYTEK F325iT may not use. |
| `extraFlangeHoleOffset` | 9 | 9 | yes | **NO** | Not seen. `extraFlangeHoles=efhNone` on every HYTEK setup so this field may never apply. |
| `extraFlangeHoleOffsetAt90` | 15 | 15 | yes | **NO** | Same as above. |
| `fPlateWidthDifferential` | 3 | 3 | yes | **NO** | Not seen. Plan-view-only per manual. |
| `flangeSlotHeight` | 11.1 | 11.1 | yes | **NO** | Not seen. Applies to FlangeSlot tool emission. |
| `largeServiceToLeadingEdgeDistance` | 600 | 600 | yes | **NO** | `rules/table.ts:301` TODO comment notes "InnerService spacing matches `setup.largeServiceToLeadingEdgeDistance`". `simplify-wall-service.ts` no longer hardcodes 296/446 (now dynamic from XML), but the OLD-rule comment in `rules/table.ts:147,154,178,185` still has @296 and @446 magic numbers (legacy). |
| `largeServiceToTrailingEdgeDistance` | 700 | 700 | yes | **NO** | Same; not used. |
| `maxBoxToBoxHoleDelta` | 2 | 2 | yes | **NO** | Not seen. |
| `maxSplicingLength` | 500 | 500 | yes | **NO** | Not seen. |
| `minimumTagLength` | 20 | 20 | yes | **NO** | Not seen. **Should drive `joinAdjacentLipNotches` merge gap?** Currently `frame-context.ts:534` uses 12 (wall) / 20 (truss chord) hardcoded; `synthesize-plans.ts:800` uses 20 hardcoded. The 20mm truss value matches `minimumTagLength=20` exactly. **Strong match for the truss-chord case; the wall-case 12 is below minimumTagLength which is suspicious.** |
| `splicingDimpleSpacing` | 100 | 100 | yes | **NO** | Not seen. |
| `tabToTabDistance` | 295 | 295 | yes | **NO** | Not seen. FL650-only per manual. |
| `web2Web` | 50.4 | 50.4 | yes | **NO** | Not seen. **Variance is meaningful** (70/89/B2B = 50.4; 104/75/78 = 58). May drive web-hole pitch in TB2B. |

### Top-level enums

| Field | Value | Parsed? | Consumed? | Notes |
|---|---|---|---|---|
| `endClearanceReference` | `ecrOutsideWeb` | yes | **NO** | Determines whether end-clearance is measured from outer or inner web face. Codec implicitly assumes outside. **No `ecrInsideWeb` examples seen yet** — see Section 5. |
| `fB2BTooling` | `b2bWebHole` | yes | **NO** | Should gate B2B web-hole emission. `simplify-tb2b-truss.ts` is plan-name-driven (`/-TB2B-/i`) — could ALSO key off this enum. Demo=`b2bNone`. |
| `fastenerMating` | `fmNone` | yes | **NO** | `fmDimple`/`fmFlangeHole` would change which fastener tool gets emitted at crossings. All HYTEK = `fmNone` so no immediate parity gain. |
| `extraFlangeHoles` | `efhNone` | yes | **NO** | All HYTEK = `efhNone` so inactive. |
| `plateBoxingPieceType` | `bptSelf` | yes | **NO** | All HYTEK = `bptSelf`. |
| `studBoxingPieceType` | `bptSelf` | yes | **NO** | All HYTEK = `bptSelf`. |

### Booleans

All identical across HYTEK setups → no immediate wiring opportunity (would only matter once a non-HYTEK setup is introduced). `onEdgeLipNotches=true` is implicit in the codec's behaviour.

### Section options (per-section / default)

| Field | Value | Parsed? | Consumed? | Hardcode-match locations |
|---|---|---|---|---|
| `fastener1` | 20.5 | yes | **NO** | Y-position of dimple in cross-section. Used in elevation graphics, NOT in axial offset rules. **Likely irrelevant for the axial-position parity gap.** |
| `flangeHoleHeight` | 27.5 | yes | **NO** | Y-position. Cross-section, not axial. |
| `tripleHoleSpacing` | 17 (default), 15 (70S41_0.55) | yes | **NO** | TripleWebHole pitch. **Hits a real op-type** (TripleWebHole). Codec's per-stud Web-hole emission may use this — currently checks `framecad-import.ts` legacy logic. |
| `innerBendRadius` | 2 | yes | **NO** | Cross-section geometry only. |
| `deflectionTrackEndClearance` | 12.7 | yes | **NO** | Mid-track only — likely only fires for `usage=DeflectionTrack`. None seen in current corpora. |
| `deflectionTrackScrewHeight` | 26.97 | yes | **NO** | Same. |

### Tool catalog (`findTool` results)

| Tool | Field | Value (70/89mm) | Value (104mm) | Parsed? | Consumed? | Hardcode-match |
|---|---|---|---|---|---|---|
| `Tab` | `size1` | 35 | 35 | yes | **NO** | The "35" appears nowhere literally in rules. Used inside `endClearanceSpan(setup) = TabSize + EndClearance = 35 + 4 = 39`. Helper exists; not called. |
| `LipNotch` | `length` | 48 | 75 | yes | **NO** | `frame-context.ts:233` `internalSpan = 45` (= 48 - 3 tool-clearance, per TODO comment at lines 225-232). **Strong match — direct TODO with explicit formula.** |
| `WebNotch` | `length` | 48 | 75 | yes | **NO** | Not seen as numeric literal but should mirror LipNotch's profile-dependent sizing. |
| `Dimple1` | `size1` | 10 | 10 | yes | **NO** | Used inside `dimpleEndOffset(setup) = EndClearance + (TabSize - Dimple1.Size1)/2 = 16.5`. Helper exists; not called. |
| `Swage` | `length` | 55 | 60 | yes | **NO** | `simplify-tin-truss.ts:58` `TIN_VERTICAL_END_SWAGE_SPAN_MM = 44.39` — likely a TIN-specific constant, NOT setup-derived. |
| `Service` | `size1` | 34 | 34 | yes | **NO** | Service-hole tool width. May factor into wall-W-brace stripping logic. |

---

## Section 3: Magic-number audit (sorted by estimated parity impact)

Excluded as structural noise: `0`, `1`, `2`, `3`, `4`, `5`, `0.5`, `1e-6`, `1e-9`, indices, error tolerances, `Math.PI`, dedup precision multipliers, GUID-byte counts, character ranges, percentage/ratio constants `0.05/0.1/0.8/0.99`.

### TIER 1 — Foundational, repeats 100+ times, drives every stick

| Constant | File:line | Context | Likely setup source | Estimated impact |
|---|---|---|---|---|
| `39` | `rules/table.ts:55,68,116-...` (every "spanned" rule) | End-clearance span: Swage / LipNotch / InnerNotch start cap, end cap, header notches, etc. ~80 occurrences | `endClearanceSpan(setup)` = `Tab.size1 + setup.endClearance` = 35 + 4 = 39 (HYTEK 70/89), 35 + 5 = 40 (104), 35 + 2 = 37 (Demo) | **HIGH** — every stick has 2 end-cap spans. ~6,000+ ops in HG260001 corpus depend on this value. 104mm setup is 1mm off on every cap. |
| `16.5` | `rules/table.ts:56,69,127,...` | InnerDimple offset from each end | `dimpleEndOffset(setup)` = `endClearance + (Tab.size1 - Dimple1.size1)/2` = 4 + (35-10)/2 = 16.5; for 104 = 5 + (35-10)/2 = 17.5 | **HIGH** — paired with above, fires on every stick. |
| `45` | `rules/frame-context.ts:233,683,749,1001` | `internalSpan` for stud/web/nog crossings on plates+studs+nogs | `lipNotchToolLength(setup) - 3` = 48 - 3 = 45 (70/89), 75 - 3 = 72 (104), 60 - 3 = 57 (75/78) | **HIGH** — fires on every stud crossing. ~1,500 ops in corpus. 75/78/104mm broken. |
| `22.5` | `rules/frame-context.ts:234,720,758,934` | InnerDimple offset INSIDE a 45mm internal lip notch (= `internalSpan/2`) | `lipNotchToolLength(setup) / 2 - 1.5` (or `internalSpan/2`) | **HIGH** — paired with above. |
| `35` | (implicit in 39) | `Tab.size1` | `findTool(setup,"Tab").size1` | **HIGH** — drives `39` derivation |
| `4` | (implicit in 39) | `setup.endClearance` | `setup.endClearance` | **HIGH** — drives `39` derivation; clear 1mm-per-cap drift on 104mm |
| `2.0` | `rules/frame-context.ts:359` | `offsetMagnitudeBase` — clearance for chord/Kb-edge truss-web LipNotches (`±2/sin(θ)`) | `setup.toolClearance` (= 2 for 70/89, 6 for 75/78, 8 for 104) | **HIGH** — fires on every truss-web crossing. **104mm web crossings will be 6mm off** if/when 104mm setups appear. |
| `1200` | `simplify-tb2b-truss.ts:437` | Box-piece InnerDimple max spacing on chord-on-chord overlap. **Already TODO-marked** | `setup.boxDimpleSpacing` (= 1200 for 70/89, 600 for 78+104) | **HIGH on TB2B trusses** — every chord-on-chord overlap. Currently right for 70/89, wrong for 78mm + 104mm. |

### TIER 2 — Plan-name / role-specific, ~10–100 occurrences

| Constant | File:line | Context | Likely setup source | Estimated impact |
|---|---|---|---|---|
| `62` | `rules/table.ts:57,360,361,409,412,787` | Bottom-plate slab-anchor Bolt offset | **NOT `setup.boltHoleToEnd`** (=20). Needs research — see Section 5. Possibly a hardcoded HYTEK construction-detail offset that has no corresponding setup field. | LOW for setup-wiring (likely no field maps); HIGH for parity (correct value but may need profile branching) |
| `8` | `rules/table.ts:321,358,406,765` | Bottom-plate slab-anchor Web offset (`Web@8`) | Possibly `setup.webHoleToEnd` (=16, 89; =10, 104), but value mismatch. Possibly slab-detail constant (no setup field). | Similar to above |
| `41` | `rules/frame-context.ts:207,211; rules/table.ts:606-735` | Wall-brace W start-Swage span; cripple-Kb virtual-edge width; brace Swage span | NOT directly a setup field. Possibly `Tab.size1 + setup.toolClearance` (35+2=37? Doesn't match) — likely tied to flange dimension `41mm` of asymmetric C-section. **Profile-dependent**, not setup-dependent. | MEDIUM — but profile-based, not setup-based |
| `42` | `simplify-tin-truss.ts:208,330` (Kb-related) | Kb start-Swage span | Same as above | MEDIUM |
| `48` | `rules/frame-context.ts:729` (`innerSpan`) | B2B partner stud InnerNotch width | `lipNotchToolLength(setup)` (= 48 for 70/89, 75 for 104, 60 for 75/78) | MEDIUM — fires on B2B paired studs only |
| `12` / `20` | `rules/frame-context.ts:534`; `synthesize-plans.ts:800` | LipNotch merge gap thresholds (wall=12, truss-chord=20) | `setup.minimumTagLength` (=20). **Truss-chord matches exactly.** Wall=12 is suspicious — below `minimumTagLength`, which the manual defines as the minimum tag steel before two notches merge. Likely both should = 20, but corpus-tuned. | MEDIUM — affects plate-cluster merging |
| `15` | `rules/frame-context.ts:485` `CHORD_CLUSTER_GAP` | Truss-web cluster merge gap | Possibly `setup.minimumTagLength - setup.toolClearance*2.5`? Heuristic; likely no clean setup field. | MEDIUM |
| `22` | `rules/frame-context.ts:865` `HEADER_JOIN_GAP` | Header LipNotch cluster merge | `setup.minimumTagLength + 2`? No clean match. | MEDIUM |
| `100` (`braceToWebhole`) | not yet in rules — potential | Brace web-hole pitch | `setup.braceToWebhole` (= 100 for 70/89, 120 for 104) | LOW today (TB2B-specific) |
| `50` (`braceToDimple`) | not directly literal in rules | Brace-vs-stud-dimple separation | `setup.braceToDimple` (= 50 for 70/89, 55 for 75/78, 60 for 104) | LOW today |
| `28` | `rules/table.ts:603,621,660,677` | Wall-brace W chamfer threshold (deg from vertical) | NOT a setup field. Geometric threshold. | LOW for setup-wiring |
| `153.4` | `simplify-tb2b-truss.ts:245` `APEX_PAIR_OFFSET` | Truss top-chord apex bolt-pair offset | NOT in setup. Geometric (chord depth × 2). | LOW |
| `98` | `simplify-tb2b-truss.ts:282` `PAIR_OFFSET` | Panel-point bolt-pair offset | Possibly `2 × (setup.endClearance + Dimple1.size1) + something`? Not a clean match. | LOW |
| `35` (W_END_ANCHOR) | `simplify-tb2b-truss.ts:324` | Web end-anchor offset in TB2B | = `Tab.size1`? = 35 exactly. **Possible match.** | MEDIUM |
| `15` (WEB_VS_RAIL_OFFSET) | `simplify-tb2b-truss.ts:149` | Web-vs-rail bolt offset | NOT in setup. | LOW |

### TIER 3 — Specific TB2B cap-stack constants

`simplify-tb2b-truss.ts:540-632` is full of literal numbers from corpus-fitting (e.g. `LIP_NOTCH_SPAN = 22.7`, `LEFT_FLANGE_SPAN = 147.1`, `RAIL_BOLT_OFFSET = 52.2`, `APEX_BOLT = 91.21`, `HEEL_BOLT = 53.90`, `STUB_BOLT = 59.98`, etc.). These are **frame-type-specific cap-stack patterns**, not setup-derivable. Out of scope for setup wiring; could be candidate for FrameType-derived rules later.

### TIER 4 — Service-hole legacy magic numbers

| Constant | File:line | Context | Likely source |
|---|---|---|---|
| `296` / `446` | `rules/table.ts:147,154,178,185` | Wall-stud InnerService default offsets | LEGACY — superseded by `simplify-wall-service.ts` dynamic z-line projection. Static rule still fires but is post-stripped. **Cleanup candidate**, not setup-wiring. |
| `600` (largeServiceToLeadingEdge) | TODO at `rules/table.ts:301` | T-plate InnerService spacing | `setup.largeServiceToLeadingEdgeDistance` (= 600 for all HYTEK). Currently inactive (T-plate Service rule disabled). |

---

## Section 4: Top 10 wirings to implement

Ranked by parity-impact × confidence × ease-of-test.

### #1 — `endClearanceSpan(setup)` for SPAN_70 / SPAN_89

- **Field:** derived: `findTool(setup,"Tab").size1 + setup.endClearance` = 39 (70/89), 40 (104), 37 (Demo)
- **Code locations:** `rules/table.ts:55,68` + every reference (`SPAN_70`, `SPAN_89`, ~80 sites)
- **Test plan:** Run cross-corpus diff harness against HG260001 + HG260044. Should be no-op for those (HYTEK 70mm/89mm both = 39). When a 104mm corpus appears, all 6,000+ end caps shift by 1mm.
- **Risk:** Refactor must thread `setup` into `StickContext` (currently context only carries plan/role/length). Plumbing change. Bug risk: forgetting to forward setup at call sites. Low parity risk on existing corpora.
- **Pre-requisite:** make rules engine accept `setup` per call. Helpers already exist (`endClearanceSpan`, `dimpleEndOffset`).

### #2 — `dimpleEndOffset(setup)` for DIMPLE_OFFSET_70 / DIMPLE_OFFSET_89

- **Field:** derived: `setup.endClearance + (Tab.size1 - Dimple1.size1)/2` = 16.5 (70/89), 17.5 (104), 14.5 (Demo)
- **Code locations:** `rules/table.ts:56,69,127,...` (~50 sites) — paired with #1
- **Test plan:** Same as #1 — no-op on current corpora, fixes 104mm InnerDimple by 1mm.
- **Risk:** Same plumbing as #1. **Land #1 + #2 in the same patch** — they share the threading.

### #3 — `lipNotchToolLength(setup) - 3` for `internalSpan = 45`

- **Field:** `lipNotchToolLength(setup) - 3` = 45 (70/89), 72 (104), 57 (75/78)
- **Code locations:** `rules/frame-context.ts:233`, `rules/frame-context.ts:683` (`Math.max(45, …)`), `rules/frame-context.ts:749` (same), `rules/frame-context.ts:1001` (same)
- **Test plan:** Cross-corpus parity should be flat on HG260001/HG260044 (70/89mm). When 104mm-profile corpus appears, every internal LipNotch widens 27mm — major parity gain. **Flag a potential 75/78mm regression** if HG260023 has 75/78mm members; check before/after.
- **Risk:** Only the centred-on-stud `Math.max(45, studWidth+4)` calls. Threading: add `setup` param to `generateFrameContextOps`.
- **Why land:** Documented TODO with explicit formula. Same threading as #1.

### #4 — `setup.toolClearance` for `offsetMagnitudeBase = 2.0`

- **Field:** `setup.toolClearance` = 2 (70/89), 6 (75/78), 8 (104)
- **Code locations:** `rules/frame-context.ts:359`
- **Test plan:** No-op on 70/89mm corpora. Future-proofs for 104mm where Detailer expands web-cluster lip notches by `±8/sin(θ)` not `±2/sin(θ)`.
- **Risk:** Single literal, single function. Easy. The `simplify-tb2b-truss.ts:437` BOX_DIMPLE_SPACING fix is comparable scope.

### #5 — `setup.boxDimpleSpacing` for `BOX_DIMPLE_SPACING = 1200`

- **Field:** `setup.boxDimpleSpacing` = 1200 (70/89), 600 (78/104)
- **Code locations:** `simplify-tb2b-truss.ts:437` — **already TODO-flagged in code**
- **Test plan:** Add a TB2B truss test with 104mm or 78mm profile — chord-on-chord overlap dimples should halve in spacing.
- **Risk:** Trivial. The simplifier already has frame-level metadata; just thread `setup` through.

### #6 — `setup.minimumTagLength` for LipNotch merge gaps

- **Field:** `setup.minimumTagLength` = 20 (all HYTEK)
- **Code locations:** `rules/frame-context.ts:534` (truss = 20 — exact match; wall = 12 — below `minimumTagLength`); `synthesize-plans.ts:800` (= 20 — exact match)
- **Test plan:** Wall case: change 12 → 20 will MERGE more LipNotches on wall plates. Run parity test — may regress wall corpus where Detailer keeps notches separate. **Hypothesis:** 12 is corpus-tuned because Detailer's actual rule may be tag-length-specific to a tool-clearance-modified value (e.g. `minimumTagLength - toolClearance*4`). Investigate before flipping.
- **Risk:** **Active regression risk.** Verify against wall corpus parity before landing. Wall=12 is already empirically tuned; "fixing" it to 20 may worsen wall parity even though it matches the documented setup field.

### #7 — `simplify-tb2b-truss.ts` `W_END_ANCHOR = 35` ↔ `Tab.size1`

- **Field:** `findTool(setup, "Tab").size1` = 35 (all HYTEK)
- **Code locations:** `simplify-tb2b-truss.ts:324`
- **Test plan:** No-op everywhere (Tab.size1 = 35 across all HYTEK setups). Future-proofs for non-HYTEK setup with different Tab.
- **Risk:** Low. Same value across all HYTEK; pure rename.

### #8 — Encode `endClearanceReference` enum semantically

- **Field:** `setup.endClearanceReference` = `ecrOutsideWeb` (all HYTEK)
- **Code locations:** Wherever the codec measures from a stick edge. Currently implicit. Search would not find — it's a missing axis.
- **Test plan:** No-op (all HYTEK = `ecrOutsideWeb`). Add an assertion `setup.endClearanceReference === "ecrOutsideWeb"` and throw otherwise to flag any future setup that flips this.
- **Risk:** Defensive-only. Buys safety against future setup imports.

### #9 — `setup.fB2BTooling` gate for TB2B simplifier

- **Field:** `setup.fB2BTooling` = `b2bWebHole` (all HYTEK), `b2bNone` (Demo)
- **Code locations:** `simplify-tb2b-truss.ts:29` `isTb2bPlanName` (plan-name only)
- **Test plan:** Make TB2B rewrite require BOTH plan name AND `setup.fB2BTooling !== "b2bNone"`. Defensive. No-op on real HYTEK jobs.
- **Risk:** Could spuriously skip TB2B rewrite if a Demo-tagged job appears; rare.

### #10 — Profile-keyed setup resolution per-stick (not per-project)

- **Field:** `getMachineSetupForProfile(stick.profile.web)` — currently called once on the FIRST stick of the FIRST plan
- **Code locations:** `synthesize-plans.ts:396-400` resolves project-wide; passes nothing downstream
- **Test plan:** Mixed-profile project (70mm + 89mm in same project). Currently uses ONE setup. Each stick should resolve its own setup based on profile.
- **Risk:** Is this case real today? If every project has a single profile, no impact. Worth checking corpus for mixed-profile projects. Mostly enabling work for #1–#5 to be correct on per-stick basis.

---

## Section 5: Open questions

### A. `boltHoleToEnd` (=20) vs slab-anchor `Bolt@62`

`rules/table.ts:50` comment explicitly notes `setup.boltHoleToEnd = 20 (NOT 62 — needs investigation)`. The `Bolt@62` constant on bottom plates is corpus-derived (HG260001 + HG260044 ref). The setup field `boltHoleToEnd=20` may apply to a different op type (TB2B truss BOLTS, where the manual says "Applicable to back-to-back trusses only"). The slab-anchor 62mm offset for bottom plates is likely a HYTEK construction-detail constant with **no corresponding setup field**.

**Action for follow-up agent:** Don't try to wire `Bolt@62` to any setup field. Document it as a HYTEK construction constant. Look at whether `setup.boltHoleToEnd` SHOULD be wired into `simplify-tb2b-truss.ts` for B2B web-bolt holes.

### B. Web@8 (slab-anchor) vs `webHoleToEnd` (=16) and `b2BStickClearance` (=2)

Same shape as A. The 8mm slab-anchor Web offset doesn't match any setup field directly. `webHoleToEnd=16` may apply to TB2B-truss web holes (back-to-back specific per the manual).

### C. `Web2Web` field — what is it?

Variance: 70/89/B2B = 50.4mm; 104/75/78 = 58mm. Web depth - 2*flange? 70 - 2*9.8? 89 - 2*19.3? Not obvious. Possibly the LATERAL gap between two B2B partner studs' webs (matches `b2BStickClearance` orientation). **Not currently consumed** — verify in TB2B Frida traces.

### D. `LargeService*` distances (=600/=700)

`largeServiceToLeadingEdgeDistance=600`, `largeServiceToTrailingEdgeDistance=700`. The codec's static `InnerService @296/@446` magic numbers in `rules/table.ts` are now superseded by `simplify-wall-service.ts` dynamic z-line projection. The `600/700` distances may apply to LARGER service holes (`LongService` tool — listed in `serviceHoleOptions: ["Service", "LongService"]`). **Not yet observed in corpus.** Cross-check whether HG260001 + HG260044 wall corpora ever emit `LongService` ops.

### E. `EndClearanceReference` enum

Only `ecrOutsideWeb` observed. The enum name suggests `ecrInsideWeb` is at least a potential value. If a future setup uses `ecrInsideWeb`, end-clearance is measured from the INSIDE face of the connecting member rather than the outside, shifting every end-anchor offset by the connecting member's wall-thickness. **No HYTEK setup uses this today.** Flag as defensive assertion (#8 above).

### F. Tool-catalog tools that vary across setups but might affect rules

Beyond LipNotch.length, WebNotch.length, and Swage.length — all systematically wider on 104mm — **the `Service.size1=34`** field is identical across HYTEK setups but hardcoded as `34` nowhere in the codec today. Service-hole tool width may matter when the simplifier needs to compute clearance around an InnerService op.

### G. `tripleHoleSpacing` per-section variance

Default = 17, but `70S41_0.55` section overrides to 15. This means a 0.55-gauge stick on the 70mm setup has different TripleWebHole pitch than a 0.75-gauge stick on the same setup. The codec doesn't currently consume `tripleHoleSpacing` at all (TripleWebHole emission lives in `framecad-import.ts`). When that's wired up, **section-level lookup is needed**, not just setup-level.

### H. Per-stick `setup` resolution — single or per-stick?

`synthesize-plans.ts:396-400` resolves a single setup from the first stick's profile web. If a project has mixed 70mm+89mm sticks, only the first profile's setup applies. **Verify this is current real-world behaviour** — Detailer uses per-stick section setup, not project-wide. The codec needs to either:
1. Resolve per-stick (in `mergeStickTooling` or earlier).
2. Confirm projects are never multi-profile (allow current behaviour).

### I. The `setup` variable in `synthesize-plans.ts` is dead code

Verified by grep: line 397 declares `setup`, no further reference. The variable is allocated and discarded. This means **even the resolution work is wasted** — a plumbing-only refactor cleanup, regardless of whether the rule layer wires up.

---

## Appendix A — Files & line-numbers summary

For implementation agent's quick reference. All files at `C:/Users/Scott/CLAUDE CODE/hytek-rfy-codec/`.

**Hardcodes that should become setup-driven (Tier 1):**
- `src/rules/table.ts:55,68` — `SPAN_70 = 39`, `SPAN_89 = 39`
- `src/rules/table.ts:56,69` — `DIMPLE_OFFSET_70 = 16.5`, `DIMPLE_OFFSET_89 = 16.5`
- `src/rules/frame-context.ts:233` — `internalSpan = 45`
- `src/rules/frame-context.ts:234` — `internalDimpleOffset = 22.5`
- `src/rules/frame-context.ts:359` — `offsetMagnitudeBase = 2.0`
- `src/rules/frame-context.ts:683,749,1001` — `Math.max(45, …)` (3 sites)
- `src/rules/frame-context.ts:720,758` — `startPos + 22.5` (dimple-inside-internal-LipNotch)
- `src/simplify-tb2b-truss.ts:437` — `BOX_DIMPLE_SPACING = 1200` (already TODO-flagged)
- `src/simplify-tb2b-truss.ts:324` — `W_END_ANCHOR = 35`
- `src/synthesize-plans.ts:800` + `src/rules/frame-context.ts:534` — LipNotch merge gap

**Helpers already available (`src/machine-setups.ts`):**
- `getMachineSetupForProfile(profileWeb)` — line 7402
- `getDefaultMachineSetup()` — line 7411
- `findSectionSetup(setup, sectionName)` — line 7425
- `findTool(setup, fName)` — line 7440
- `endClearanceSpan(setup)` — line 7462
- `dimpleEndOffset(setup)` — line 7477
- `lipNotchToolLength(setup)` — line 7490

**Existing TODO comments to remove on landing:**
- `src/rules/table.ts:46-66` — TODO with explicit formulas
- `src/rules/table.ts:300-303` — InnerService TODO
- `src/rules/table.ts:776-784` — `profileOffsets` TODO
- `src/rules/frame-context.ts:225-232` — `internalSpan` TODO
- `src/simplify-tb2b-truss.ts:437` — BOX_DIMPLE_SPACING TODO

**Prior agent's audit doc to update on landing:**
- `docs/rules-coverage.md:186-204` — "TODO Sites in Rule Logic" table.
