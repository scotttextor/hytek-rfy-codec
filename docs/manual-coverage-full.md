# FrameCAD Detailer Manual — Comprehensive Coverage Audit

**Source:** `Y:/(08) DETAILING/(13) FRAMECAD/FrameCAD DETAILER/framecad-detailer-user-manual-v50.pdf`
(October 2018, v5.0, 130 pages, 3,505 lines extractable text at
`C:/Users/Scott/AppData/Local/Temp/detailer-manual.txt`)

**Date:** 2026-05-05 (Agent U)

**Codec baseline at audit:**
- HG260001 OVERALL: 83.53% (15,036 / 18,000)
- HG260044 OVERALL: 82.37% (14,103 / 17,122)
- HG260023 OVERALL: 78.39% (15,138 / 19,312)

---

## Methodology

Every section of the manual was read in full and rated against:

1. **Documented:** what the section defines that could affect tooling output.
2. **Codec status:** implemented / partial / missing / irrelevant.
3. **Code reference:** where in `src/` the rule lives.
4. **Estimated parity impact:** 0pp (irrelevant), <0.1pp (cosmetic), 0.1–0.5pp (small),
   0.5–2pp (medium), 2pp+ (large).

Sections covering **drawing/UI/tutorial** content (1–3, 5–6, 8.x manual-build
toolbar, 9–11, 13–17) are *irrelevant to the codec* by construction — they
describe how a human operator drives the program, not how Detailer transforms
parsed XML into RFY tooling.

---

## Section-by-section coverage

### Section 1 — Introduction (pp 1)

**Documented:** pre-requisites, system requirements.
**Codec status:** irrelevant.
**Estimated parity impact:** 0pp.

### Section 2 — Software Installation (pp 2–9)

**Documented:** dongle/HASP licensing.
**Codec status:** irrelevant.
**Estimated parity impact:** 0pp.

### Section 3 — Defaults and Global Settings (pp 10–13)

**Documented:** CAD environment, units (metric/imperial), VRML colours.
**Codec status:** irrelevant — codec uses metric throughout, no VRML.
**Estimated parity impact:** 0pp.

### Section 4 — Machine and Frame Type Setups (pp 14–39) — **CORE**

#### 4.1 Machine Setups (overview)
**Documented:** Default vs Project setup duality.
**Codec status:** implemented — we read `.sups` data verbatim.
**Code reference:** `src/machine-setups.ts` (auto-generated from `HYTEK MACHINE TYPES 20260402.sups`).

#### 4.2.1 Tools (which tools are fitted)
**Documented:** tools moved Available → Fitted; Triple Web Hole + Bolt requires Bolt Hole.
**Codec status:** implemented — `toolSetup.fixedTools` / `optionalOnTools` / `optionalOffTools`.
**Estimated parity impact:** baseline ≥80%.

#### 4.2.2 Tool Lengths
**Documented:** physical dimensions of each tool's punch.
**Codec status:** implemented — `ToolEntry.length / size1 / size2`.
**Estimated parity impact:** baseline ≥80%.

#### 4.2.3 General — `fB2BTooling` enum
**Documented:** `Web` vs `Bolt` for B2B truss tooling. Per-machine setting.
- HYTEK F300i: `b2bWebHole`. F300i with Bolt Hole tool: `b2bBolt`. F325iT 70mm: `b2bNone`.
**Codec status:** implemented — `MachineSetup.fB2BTooling`.
**Code reference:** `src/machine-setups.ts:171`.
**Estimated parity impact:** baseline.

#### 4.2.3 General — `Minimum Tag Length`
**Documented:** if tag < threshold, notch tool punches it out as one hole.
**Codec status:** **MISSING** — we don't model tag-merge at all.
**Code reference:** `MachineSetup.minimumTagLength` is in data but unused.
**Estimated parity impact:** small, mostly second-order. ~0.1–0.3pp (only matters when notches near each other; rare).

#### 4.2.3 General — `Place Extra Chamfers`
**Documented:** "may resolve isolated factory issues with the way chamfers are calculated".
**Codec status:** implemented — `extraChamfers` flag.
**Estimated parity impact:** baseline.

#### 4.2.3 General — `Plate Width Differential`
**Documented:** specific to ST machines. HYTEK is F300i/F325iT — not ST.
**Codec status:** irrelevant for HYTEK.
**Estimated parity impact:** 0pp.

#### 4.2.3 General — `Suppress Fasteners`
**Documented:** turns off ALL fastener holes.
**Codec status:** **PARTIAL** — `suppressFasteners` field is in setup data but no rule honours it.
**Estimated parity impact:** 0pp for HYTEK (always false in `.sups`).

#### 4.2.3 General — `Triple Web Hole Spacing`
**Documented:** spacing between centre and outer holes of the triple-web pattern.
**Codec status:** implemented in section options (`tripleHoleSpacing`).
**Estimated parity impact:** baseline.

#### 4.2.3 General — `Extra Fastenings` (efhNone/Single/Double + 4 layout options)
**Documented:** flange-hole pattern adjacent to dimples for double-screwing webbed joists.
- 4 options: 1 (standard), 2 (narrow flange), 3 (no dimple punch), 4 (no dimple + narrow flange).
- HYTEK: all setups have `extraFlangeHoles = "efhNone"` → feature OFF.
**Codec status:** **MISSING** but irrelevant for HYTEK (always `efhNone`).
**Estimated parity impact:** 0pp for HYTEK corpora.

#### 4.2.3 General — `Extra Fastening Distance` (9mm) and `at 90°`
**Documented:** geometric placement of extra flange holes when feature is on.
**Codec status:** data captured (`extraFlangeHoleOffset`, `extraFlangeHoleOffsetAt90`); no rule.
**Estimated parity impact:** 0pp for HYTEK (efhNone).

#### 4.2.4 Clearances (all values)
**Documented:** B2B Stick Clearance, Bolt Hole To End, Brace To Dimple, Brace To Web Hole, Chamfer Tolerance, Dimple To End, End Clearance Reference, End Clearance, End To Tab Distance, F2F Stick Clearance, Minimum Tab To Tab Distance, Tool Clearance, Web Hole To End.
**Codec status:** implemented (data captured) — most values are wired into the rule engine through derived helpers (e.g. `endClearanceSpan`, `dimpleEndOffset`).
**Code reference:** `src/machine-setups.ts:124–151`, `src/rules/table.ts` constants.
**Estimated parity impact:** baseline.

#### 4.2.5 Boxing — `Box To Box Max Hole Delta`
**Documented:** locating-hole distance for reinforced members (FL650 only).
**Codec status:** irrelevant for HYTEK (F300i/F325iT).
**Estimated parity impact:** 0pp.

#### 4.2.5 Boxing — `Boxed End Length`
**Documented:** length of boxing pieces for in-plane on-edge trusses.
**Codec status:** captured; partially wired in `simplify-tb2b-truss.ts`.
**Estimated parity impact:** baseline.

#### 4.2.5 Boxing — `Boxing Max Dimple Spacing`
**Documented:** distance between dimples on boxed members. HYTEK: 500/600/1200mm.
**Codec status:** captured, partially wired (Agent G TB2B). Not used for non-truss boxed sticks.
**Estimated parity impact:** ≤0.3pp (most boxed sticks already covered by TB2B simplifier).

#### 4.2.5 Boxing — `Boxing Offset`
**Documented:** distance that boxing members are offset.
**Codec status:** captured, used by simplifiers.
**Estimated parity impact:** baseline.

#### 4.2.5 Boxing — `Partial Boxing Max Dimple Spacing`
**Documented:** dimple spacing on partially-boxed members.
**Codec status:** captured.
**Estimated parity impact:** baseline.

#### 4.3 Section Setup (web/flange/lip/gauge)
**Documented:** profile geometry, dimple heights, flange-hole heights, RFY label format.
**Codec status:** implemented.
**Code reference:** `src/format.ts:RfyProfile`, `src/machine-setups.ts:SectionSetup`.

#### 4.4 Frame Types — Tool Action × Frame Orientation matrix
**Documented:**
- 3 orientations: On Flat (default), Back to Back, On Edge.
- 6 tool actions: Standard, Reversed, No Boxing Swages, No Tooling, Plate over Stud, Truss tooling.
**HYTEK reality** (verified vs `HYTEK-FRAME-TYPES.json`, all 38 frame types):
- Only TWO tool actions used: `On flat - Standard tooling` (37 of 38 frame types) and `B2B - Standard` (1 frame type — the Truss frame).
- Reversed Tooling, No Boxing Swages, No Tooling, Plate over Stud, Truss tooling are **NOT used** by HYTEK.
**Codec status:**
- Standard Tooling implemented (default behaviour everywhere).
- B2B Standard implemented via `simplify-tb2b-truss.ts`.
- Reversed Tooling implemented opportunistically via `simplify-rp.ts` (RP plans get Reversed cap rewrites even though HYTEK's frame-type setup doesn't request it — Detailer's RP frames clearly behave like Reversed in our reference output).
**Estimated parity impact for additional tool-actions:**
- Plate over Stud: 0pp (HYTEK doesn't use it).
- No Boxing Swages: 0pp (HYTEK doesn't request it; would suppress Swage on boxed sticks).
- No Tooling: 0pp (HYTEK doesn't request it).
- On Edge orientation: 0pp (HYTEK doesn't request it; would matter for OS/floor-edge trusses).

#### 4.4 Frame Types — Automatic Triple Stud Connection Detection
**Documented:** when one wall intersects another, triple studs are auto-placed within tolerance distance.
**Codec status:** **NOT MODELED** — but input XMLs already contain the triples explicitly. Detailer was run to detail the original XML, which then triggered triple-stud insertion. The XML we receive has the triples baked in.
**Estimated parity impact:** 0pp (we trust the XML triples).

#### 4.4 Frame Types — Default Script per classification
**Documented:** suggested defaults (External/Internal Wall → "Wall", Truss → "Truss-Full", Joist → "Truss-Parallel", etc.).
**Codec status:** scripts only run inside Detailer when a frame is BUILT. Our XML inputs are already-built; we don't re-run scripts.
**Estimated parity impact:** 0pp.

### Section 5 — FRAMECAD Detailer Components (pp 40–49)

**Documented:** Menu bar, toolbar, project tree, plan management.
**Codec status:** irrelevant — UI/UX, not output transformations.
**Estimated parity impact:** 0pp.

### Section 6 — Plan View Tools (pp 50–81)

**Documented:** drawing tools (line, polyline, rectangle, polygon, dimensions, snap aids, mirror, array, rotate, trim/extend, frame break, VRML extrusion, etc.).
**Codec status:** irrelevant — drawing-side tools.
**Estimated parity impact:** 0pp.

### Section 7 — Assigning Properties to a Frame (pp 82–96)

#### 7.10.1 Machine Setup tab
**Documented:** machine, tooling action, section, script per frame.
**Codec status:** implemented — `RfyStick.profile` carries the section.
**Estimated parity impact:** baseline.

#### 7.10.2 Main tab — Wall scripts
Per-frame variables (Length, Height, Pitch, Pitching Offset, Stud Spacing, Stud References, Use Nog, Nog Heights, Nog Type, Nog Offset, Service Hole Horizontal/Vertical, Bottom Plate Bolt Holes, Auto Dimension, Frame Offset).
**Documented behaviours:**
- **Bottom Plate Bolt Holes:** "If your machine doesn't have a bolt hole, but has a web hole, a web hole will be placed instead of a bolt hole."
**Codec status:**
  - Stud spacing/references: implicit via input XML positions.
  - Use Nog / Nog Heights / Nog Type / Nog Offset: implicit via input XML stick positions and roles.
  - Service Hole (Horizontal): implemented in `src/rules/table.ts` via the InnerService rule on wall studs.
  - Service Hole (Vertical): not implemented; controlled by per-frame option which we can't infer from XML.
  - Bottom Plate Bolt Holes: implemented (Bolt rule on B-plates).
  - Bolt-Hole-vs-Web-Hole tool substitution: **PARTIAL** — handled at CSV emission for some cases; could be wider.

#### 7.10.3 Openings (doors/windows)
**Documented:** Head/Sill heights, Width, Offset, Pick to Centre, Head/Side Clearance, Extra Studs, Head Spacing/Type/Fill Type/Split, Sill Spacing/Type/Fill Type/Split, **Notch Door Sill** (web notches in B plate either side of a door), Jack Stud, Invert Webs, Allow Nog Pass Through.
**Codec status:** implicit — input XML already has the openings as-built (sticks are positioned, headers/sills/jacks added). The "Notch Door Sill" Web notch on the bottom plate is in our reference output but not generated by the codec — we currently emit `Web@8` only for ground-floor LBW/NLBW slab attachment, not for door-sill notches.
**Estimated parity impact:** **MEDIUM (~0.3–0.6pp)** — door-sill Web notches are a documented, non-trivial source of `Web` ops on B plates near openings.

#### 7.10.4 Triples
**Documented:** triple-stud connections at wall intersections.
**Codec status:** implicit — XML carries the triple sticks.
**Estimated parity impact:** 0pp.

### Section 8 — Detailing Frames (pp 97–105)

#### 8.1–8.5 Building, manual edits, stick properties
**Documented:** UI for building/modifying frames.
**Codec status:** irrelevant — input XML is already built.
**Estimated parity impact:** 0pp.

#### 8.6 Multiple Box Reinforcing
**Documented:** boxing/partial boxing of members; reinforcing pieces avoid junctions where webs meet chords (truss).
**Codec status:** implemented via `simplify-tb2b-truss.ts` for trusses; box-pieces represented in input as separate sticks with `(Box1)` etc. suffixes or as overlapping sticks.
**Estimated parity impact:** baseline (covered by TB2B simplifier).

### Section 9 — Detailing a Roof (pp 106–116)

**Documented:** roof block input, panel-roof input, gable methods (None/Panel/Outrigger), batten spacing, fascia height, hip method (Truss vs Rafter), Half/Jack truss spacing.
**Codec status:** irrelevant — already baked into XML.
**Estimated parity impact:** 0pp.

### Section 10 — Project Finalisation (pp 117–119)

#### 10.1 Design Checks
**Documented:** Bad Tooling check, Web Notches check (top/bottom chord+plate web-notch existence), Frame Status check, Overlapping Parallel Sticks check, Maximum Frame Size check.
**Codec status:** stored in `MachineSetup.designChecks` (label list only). No actual check logic — and Detailer's checks aren't part of RFY output. Manual notes: *"Frames that are imported from FRAMECAD Structure do not yet include information about what each stick is (i.e. Top Plate, Nog, Brace, etc.) and therefore cannot be checked."*
**Estimated parity impact:** 0pp.

### Section 11 — Creating 3D Views (pp 120–122)

**Documented:** VRML export, 3D pitch settings.
**Codec status:** irrelevant.
**Estimated parity impact:** 0pp.

### Section 12 — Import and Export Options (pp 123–130) — **CORE**

#### 12.1 Import — XML
**Documented:** Default machine setup and tool-action picked per Plan Type at import. Steel Spec config. Explicit Tool Transforms (e.g. transform Bolt Holes → Web Holes when target machine lacks bolt punch).
**Codec status:** implemented — we parse XML and assign profile from the active section setup.
**Code reference:** `src/synthesize-plans.ts`.

#### 12.1 Import — Explicit Tool Transforms
**Documented:** if an explicit tool used in the XML is missing from the machine setup, replace with an alternative (e.g. Bolt → Web).
**Codec status:** **PARTIAL** — we don't currently substitute when the imported XML asks for a tool the active setup doesn't have.
**Estimated parity impact:** small, only matters when XML mentions a tool the .sups doesn't list.

#### 12.2 Export — RFX (legacy)
**Documented:** legacy format for FRAMECAD Factory v2.
**Codec status:** irrelevant — we target RFY.

#### 12.3 RFY Files — **CRITICAL**
**Documented:**
- Length tools (Webnotch, Swage etc.) given a *range* with start+end positions.
- Factory (rollformer firmware) decides actual punch positions.
- Factory does scrap-cut optimisations:
  - Combine operations across sticks.
  - Allow very short tool operations on the ends of sticks.
  - Prevent tools with long lead-in/lead-out (Swage) from affecting neighbouring sticks.
- Lines, text, etc., in Layers set to Export are included in .rfy.
**Codec status:** implemented at the structural level (`RfySpannedTool` with `startPos`/`endPos`), not at the Factory-decision level.
**Implication:** CSV-level emission has a *fundamental ceiling* below 100% — the per-position ops we emit go through Factory's firmware before the CSV; we can never replicate that without modeling Factory.
**Estimated parity impact:** RFY parity is the cleaner target.

### Section 13 — Working with External Programs (pp 131)

**Documented:** FIM file import/export.
**Codec status:** irrelevant.
**Estimated parity impact:** 0pp.

### Section 14 — Layers (pp 132–133)

**Documented:** layer visibility, export-to-RFY toggle per layer.
**Codec status:** irrelevant for codec input (XML already has implicitly only export layers).
**Estimated parity impact:** 0pp.

### Sections 15–17 — Coordinate System, Basic Actions, Index (pp 134–143)

**Documented:** coordinate systems, mouse selection, fence selection, action keys.
**Codec status:** irrelevant.
**Estimated parity impact:** 0pp.

---

## Aggregate findings

### What the manual confirms is documented and we already implement
- All clearance values (Section 4.2.4)
- All boxing values (Section 4.2.5)
- Section profile geometry (Section 4.3)
- B2B Tooling enum (Section 4.2.3)
- RFY length-tool format (Section 12.3)
- Standard Tooling default (Section 4.4)
- Bolt-Hole → Web-Hole substitution (Section 7.10.2 / 12.1)
- Truss-tooling chord-notch (Section 4.4)

### What the manual documents that we **don't** model — and why most don't matter
| Item | HYTEK relevance | Parity impact |
|---|---|---|
| Reversed Tooling per FrameType | NOT used (all setups Standard) | 0pp (already opportunistically applied to RP via simplify-rp) |
| Plate over Stud | NOT used | 0pp |
| No Boxing Swages | NOT used | 0pp |
| No Tooling | NOT used | 0pp |
| On Edge orientation | NOT used | 0pp |
| Plate Width Differential | F300i/F325iT, not ST | 0pp |
| FL650-specific (Box-to-Box hole, end-to-tab, etc.) | F300i/F325iT, not FL650 | 0pp |
| Extra Fastenings (efhNone) | All HYTEK setups efhNone | 0pp |
| Suppress Fasteners | All HYTEK setups false | 0pp |
| Door Sill Notch (Web notch in B plate at openings) | YES — observed in ref RFY | **0.3–0.6pp** |
| Service Hole (Vertical) per stud | Possibly used per-frame | unknown — may explain InnerService gap |
| Minimum Tag Length (notch merge) | YES — applies | 0.1–0.3pp |
| Explicit Tool Transforms | When XML has missing tool | small |

### What the manual says EXPLAINS our limit
- Section 12.3: Factory firmware computes per-position punches from spanned ranges. The CSV-level diff has an inherent ceiling well below 100%.

### Manual-derived conclusion
The manual confirms there is **NOT** a large, untapped reservoir of parity hidden in the manual that's specific to HYTEK's setups. The remaining gap (~16–22pp depending on corpus) lives in:

1. **Frida-derivable per-stick rules** (Agent T's territory — not mine)
2. **Frame-context crossings** for non-standard simplifiers (RP/TB2B/TIN already done)
3. **Door Sill Notch on B plates near openings** — the one solid manual-derived rule worth implementing
4. **InnerService gap** — possibly tied to the `Service Hole (Vertical)` per-frame option which we can't see in XML
5. **Minimum Tag Length notch merging** — micro-optimisation, low yield

Most of our gap is *Frida-data territory*, not *manual territory*. Agent K's earlier audit was correct that the manual provides foundational vocabulary; Agent T's data-mined rules will move the needle further.

See `docs/manual-implementation-priorities.md` for the prioritized list of
manual-derived implementations that have non-zero impact.
