# FrameCAD Detailer Manual Audit — Findings vs Codec

**Source:** `Y:\(08) DETAILING\(13) FRAMECAD\FrameCAD DETAILER\framecad-detailer-user-manual-v50.pdf`
(October 2018, v5.0, 130 pages, 3,505 lines of extractable text)

**Audit date:** 2026-05-05
**Codec baseline at audit:** 81.91% on HG260001 (14,747 / 18,004 ops)

---

## Executive findings

The manual confirms the **central organising concept** we've been missing: every Frame Type has a
**Tool Action** that dictates which member is "continuous" and which gets "notched". Our codec
implicitly hard-codes Standard Tooling for every frame; Detailer actually offers six Tool Action variants:

| Tool Action | What it does |
|---|---|
| **Standard Tooling** | Vertical (stud) continuous, horizontal (plate) gets notched |
| **Reversed Tooling** | Horizontal (plate) continuous, vertical (stud) gets notched. Used in panel-roof situations |
| **No Boxing Swages** | Boxed/partially-boxed members are NOT swaged |
| **No Tooling** | No flange cuts on B2B members |
| **Plate over Stud** | Nog ends tabbed OVER the stud, not fitted INSIDE (walls) |
| **Truss tooling** | Boxed truss chords are notched to allow webs to fit inside |

Plus three **Frame Orientations**: On Flat (default for walls/joists/trusses), Back to Back (B2B), On Edge.

---

## What we already get RIGHT (verified against manual)

| Thing | Codec location | Manual section |
|---|---|---|
| Section Setup vocabulary (web / flange / lip / gauge) | `src/format.ts` `RfyProfile`, `src/machine-setups.ts` | 4.3 Section Setup |
| Most clearance values: `boxedEndLength` / `boxedFirstDimpleOffset` / `braceToDimple` / `braceToWebhole` | `src/machine-setups.ts` | 4.2.4 Clearances + 4.2.5 Boxing |
| `fB2BTooling` enum (`b2bNone` / `b2bWebHole` / `b2bBolt`) | `src/machine-setups.ts:170` | 4.2.3 General — Back To Back Tooling |
| `boxDimpleSpacing` (500 / 600 / 1200 mm) | `src/machine-setups.ts` | 4.2.5 Boxing — Boxing Max Dimple Spacing |
| Web (BOLT HOLES) vs Bolt (ANCHOR) op-type semantics | `src/csv.ts` TOOL_TO_CSV | "If your machine doesn't have a bolt hole, but has a web hole, a web hole will be placed instead of a bolt hole" |
| RFY length-tool format (range start/end, Factory expands punches) | `src/format.ts` RfySpannedTool | 12.3 RFY FILES |
| TIN/TB2B plan-name detection (regex) | `src/csv.ts:332` `isTrussPlan` | 4.4 — frame names use prefixes |
| Truss-tooling chord-notch (chords notched, webs continuous) | `src/rules/frame-context.ts` chord-cluster code | "boxed truss chords are notched to allow truss webs to fit inside" |

---

## What the manual DEFINES but we don't model

### High-impact gaps (likely behind significant pp)

**1. Frame Orientation × Tool Action matrix is not modelled at all.**
- Our rule code implicitly assumes "On Flat + Standard Tooling" everywhere.
- **TB2B is Back-to-Back orientation** — the manual explicitly states *"Truss chords are referred to as plates and truss webs are referred to as studs"*. So in TB2B:
  - **Webs are continuous** (play the "stud" role)
  - **Chords get notched** (play the "plate" role)
- Our existing TB2B logic in `scripts/diff-vs-detailer.mjs` is mostly post-decode patching — not first-class orientation modelling.
- **Recommendation:** Add `frameOrientation` ("OnFlat" | "B2B" | "OnEdge") and `toolAction` ("Standard" | "Reversed" | "PlateOverStud" | "TrussTooling" | "NoBoxingSwages" | "NoTooling") to `ParsedFrame`. Drive these from the `.sups` Frame Type defaults + plan-name detection.

**2. Reversed Tooling for panel-roof (RP) situations.**
- Manual: *"Reversed Tooling — The horizontal (plate) members are continuous and the vertical (stud) members get notched. This option would generally be used where ever the horizontal members are the structural members e.g. in certain `panel roof' situations."*
- Our RP frames sit at **22.4%** match (Phase 3 Agent I). This might be the cause: we're applying Standard rules where Detailer applies Reversed.
- **Recommendation:** Detect RP frames and switch the rule pass to Reversed (notch vertical members, leave horizontal continuous).

**3. Plate over Stud tooling for nogs in walls.**
- Manual: *"the ends of nog members (generally in wall frames) are tabbed over the stud that they terminate on instead of fitting inside the stud"*
- Our wall nogs end with the same notch pattern as stud-meeting plates. May be wrong for Plate-over-Stud frames.
- **Recommendation:** Check if our LBW/NLBW match gap (~10pp) hides a Plate-over-Stud assumption mismatch. Look for nog-end ops that ref has but we don't, or vice versa.

**4. Triple Stud Connection Detection.**
- Manual: *"when one wall intersects with another, triple studs (or junction studs) are automatically placed. If the walls have a gap between them, triples will be placed as long as the gap is within the tolerance distance indicated."*
- We don't auto-detect wall intersections. If the input XML already has the triple studs, fine. But if not, we'd be missing triples where Detailer adds them.
- **Recommendation:** Verify input XMLs already contain the triples. If yes, no codec change needed. If no, this is a structural rule we don't model.

**5. Bolt-pair vs Web-hole on B2B trusses.**
- Manual confirms `Back To Back Tooling = Web` or `Bolt` is per machine. Some machines emit Web holes; others emit Bolt holes. Our `fB2BTooling` field captures this.
- The Agent G Gap #1 hypothesis — "main diagonal vs secondary brace" — may actually be wrong. Per the manual, the choice is per-MACHINE not per-WEB. The variation we see may be from a different rule.
- **Recommendation:** Re-investigate Agent G Gap #1 by checking if the bolt vs web variation correlates with something other than apex direction (e.g., box-piece membership, stick orientation).

### Medium-impact gaps

**6. boxDimpleSpacing is in our data but not used in TB2B chord-dimple rule.**
- Manual: *"Boxing Max Dimple Spacing — Distance between dimples on boxed members."*
- Our setup data has `boxDimpleSpacing: 500/600/1200`.
- Agent G Gap #2 hypothesised "every 1000mm" — likely wrong. Should be `boxDimpleSpacing` from the active setup.
- **Recommendation:** Replace the hypothesised 1000mm with `setup.boxDimpleSpacing` lookup.

**7. Extra Fastenings (flange-hole pattern adjacent to dimples).**
- Manual: *"Places extra flange holes adjacent to dimples for double screwing members. Generally used for webbed joists. Only applicable if machine has flange hole tool available."*
- We don't emit Extra Fastenings on FJ joists.
- **Recommendation:** Read `extraFasteningDistance` from setup and emit FlangeBoltHole adjacent to InnerDimple on webbed joists.

**8. No Boxing Swages flag.**
- Manual: *"Any boxed or partially boxed members will not be swaged."*
- We may emit Swage on boxed members where Detailer suppresses them.
- **Recommendation:** When the Frame Type's tool action includes "No Boxing Swages", suppress Swage emission on boxed sticks (those with `(Box1)` suffix or similar marker).

### Low-impact / not-yet-in-scope

**9. Plate Width Differential (ST machines).**
- Only relevant to ST (stud-and-track) machines. HYTEK uses F300i/F325iT. Skip.

**10. FL650 machine specifics** (locator tabs, flange bolt holes).
- HYTEK uses F300i. Skip.

**11. Auto Extend tool, Auto Dimension.**
- Drawing-side features. Don't affect codec output.

---

## Insights that EXPLAIN our limits

**1. CSV emission ceiling has a fundamental cause.**
The manual confirms (12.3 RFY FILES):
> *"Length tools (e.g. Webnotch, Swage etc.) are given a range with start and end positions, rather than a series of individual punch operations… Factory then figures out where to place punches to give the right punched length on the stick"*

So when Detailer emits CSV, the per-position cells are computed by **FrameCAD Factory** (rollformer firmware), not Detailer's settings. Factory does:
- Combine operations across sticks
- Allow very short tool operations on the ends of sticks
- Prevent tools with long lead-in/lead-out from affecting neighbouring sticks
- Do scrap-cut optimisations

This means **CSV emission % can never reach 100% from the codec alone** — we'd need to model Factory's algorithm too. The RFY-level match (76.8% currently) is the cleaner target since RFY stores ranges, not expanded positions.

**2. Frame Type Setup is the hidden authoritative config.**
The manual's "Frame Types" (Edit | Frame Types) holds the per-frame-type Tool Action + Default Script + machine assignment. This data exists in `.sups` files we've parsed but aren't fully using. Specifically the `toolAction` field per frame type drives the rule choice — and our codec doesn't read it.

**3. Bolt vs Web for B2B trusses is per-machine not per-web.**
This contradicts Agent G's Gap #1 hypothesis. Apex-going vs heel-going webs probably don't change the bolt-pair behaviour. Re-investigate before implementing.

---

## Recommended next-action priority

1. **Read Frame Types from `.sups`** — extract `toolAction` per frame type. Add to `ParsedFrame` so rule code can switch behaviour. This is the foundational piece for items 2-4.
2. **RP Reversed Tooling** (highest ROI) — RP at 22.4% may jump 50+pp if Reversed is applied.
3. **Wire `boxDimpleSpacing`** into TB2B chord box-piece InnerDimple rule (replace Agent G's hypothesised 1000mm). +192 missing on TB2B.
4. **No Boxing Swages flag** — suppress Swage on boxed sticks where setup says.
5. **Plate over Stud** for wall nogs — investigate if LBW/NLBW gap improves.
6. **Re-investigate Bolt vs Web bolt-pair on B2B trusses** — discard Agent G's apex-direction hypothesis, look at orientation/box-membership instead.

---

## Frame Type → Tool Action mapping (suggested examples from manual section 4.4.1.9)

The manual gives these as suggested defaults (page 36-37):

| Frame Classification | Suggested Default Script |
|---|---|
| External Wall | Wall |
| Internal Wall | Wall |
| Truss | Truss-Full |
| Joist | Truss-Parallel |
| Miscellaneous | Manual |
| Ceiling | Auto Panel |
| Roof | Auto Panel |
| Floor | Auto Floor Panel |

These are SCRIPTS not Tool Actions — but they correlate. "Wall" frames are typically On Flat + Standard;
"Truss" frames are typically B2B + Truss-tooling.

---

## File anchors for follow-up agents

- `src/machine-setups.ts` — has the .sups data including `boxDimpleSpacing`, `boxedEndLength`, `boxedFirstDimpleOffset`, `braceToDimple`, `braceToWebhole`, `fB2BTooling`. Read these before adding new rules.
- `src/rules/frame-context.ts` — main per-frame stick rule logic. Add Tool Action switch here.
- `src/rules/table.ts` — per-stick rule registry. May need Tool-Action-aware variants.
- `scripts/diff-vs-detailer.mjs` — TB2B post-decode patches (architectural debt — should move to `src/simplify-tb2b-truss.ts`).
- `src/simplify-tin-truss.ts` — Phase 4 TIN truss vocabulary; model for migrating TB2B.

The manual itself is at `C:\Users\Scott\AppData\Local\Temp\detailer-manual.txt` (extracted text, 3,505 lines) — agents can grep it directly for any term.
