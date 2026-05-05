# Manual-Derived Implementation Priorities

**Source:** `docs/manual-coverage-full.md` (Agent U, 2026-05-05)
**Approach:** rank documented-but-not-implemented behaviours by parity impact × risk × cross-corpus generality.

The aggregate audit reaches a sobering conclusion: **most of the manual is
either irrelevant to the codec (drawing UI), already implemented, or relevant
only to machine/frame-type configurations HYTEK doesn't use.** Of the 130-page
manual, the remaining manual-derived parity to be claimed lives in 4 candidate
areas, ranked below.

---

## Ranked priorities

### Priority 1 — Door-Sill Web Notch on B-plates near openings (Section 7.10.3)
**Manual quote:** *"Notch Door Sill — Add or remove web notches in the bottom plate either side of a door opening. This notch aids in the easy removal of the sill on site."*

**Why high priority:**
- Real, physical, observable in HG260001/HG260044/HG260023 reference RFYs.
- Currently we only emit `Web@8` for slab attachment on ground-floor LBW B-plates. A *separate* set of `Web` ops sits at door openings on the B-plate and we're missing them all.
- The XML carries the opening positions (Jamb studs are present and can be detected in `frame-context`).
- Cross-corpus generic — applies to LBW + NLBW.

**Hypothesis where to detect:** In `src/rules/frame-context.ts`, when iterating B-plate crossings, detect "door opening" by finding paired jamb studs with no studs between them spanning more than ~600mm. Emit `Web@<jamb_x ± 8mm>` on the B-plate at each side of the gap.

**Implementation complexity:** medium (~50–100 LOC). Risk: regression if every gap >600mm is treated as a door (windows would also match). Mitigation: only fire on B-plates inside LBW/NLBW plans; only if the gap matches a specific Jamb-stud pair pattern.

**Estimated parity impact:** **0.3–0.6pp** per corpus.

---

### Priority 2 — Bolt → Web tool substitution at the rules layer (Section 7.10.2 / 12.1.1)
**Manual quote:** *"If your machine doesn't have a bolt hole, but has a web hole, a web hole will be placed instead of a bolt hole."*
And: *"Go to the 'Explicit Tool Transforms' tab... For example, if a machine only has a triple web hole punch and no bolt hole punch, the bolt holes from the imported job can be transformed into web holes."*

**Why this priority:** the rules engine emits `Bolt` for slab anchors; if the active machine setup's tool catalog includes only `Web` (no `Bolt`), Detailer would substitute. We need to verify HYTEK's setups.

**Verification (already done):** All HYTEK F300i/F325iT setups include both Web Hole and Bolt Hole tools. So this transform is **not active** for HYTEK.

**Estimated parity impact:** 0pp for HYTEK corpora. Skip.

---

### Priority 3 — Minimum Tag Length: notch merging (Section 4.2.3)
**Manual quote:** *"The tag is the piece of steel left between two notches that are close together. When this tag length drops below the designated length, the notch tool will punch it out to create one large hole."*

**Why low priority:** the codec emits each notch separately. Detailer's CSV output would show one merged notch where two would be. We have a `minimumTagLength` value (90mm in HYTEK setups) that's currently unused.

**Cross-corpus generality:** rare — only fires when two LipNotch/InnerNotch ops on the same stick are < 90mm apart. Most observed pairs are >100mm apart already (header crossings, etc.).

**Implementation complexity:** medium (post-process per-stick op list, merge spans). Risk: low if tested; could over-merge legitimate separate notches.

**Estimated parity impact:** **0.05–0.15pp** per corpus. Below the bar.

---

### Priority 4 — Service Hole (Vertical) per stud (Section 7.10.2)
**Manual quote:** *"Service Hole (Vertical) — Turn option on to place vertical service holes next to each stud."*

**Why uncertain:** this is a **per-frame option** in Detailer. We can't observe it in the XML (it's a script variable, not a stick property). HG260001 InnerService gap on T-plates was investigated by an earlier agent and the rule disabled (see `src/rules/table.ts:253`) because a fixed 600mm spacing produced 256 extras vs 14 misses.

**Investigation:** if a future XML *did* carry the option, we could honour it. Currently no signal.

**Estimated parity impact:** unknown until we have ground truth on which frames/sticks the option is set for. Below the bar without evidence.

---

### Priority 5 — Suppress Fasteners flag (Section 4.2.3)

**Manual quote:** *"Suppress Fasteners — Turns off all fastener holes."*

**Codec status:** `MachineSetup.suppressFasteners` field exists but no code consumes it.

**HYTEK status:** all setups have it false. Skip.

**Estimated parity impact:** 0pp.

---

### Priority 6 — Tool-Action × Frame-Type matrix (Section 4.4)

**Manual quote (effective):** Standard / Reversed / Plate over Stud / No Boxing Swages / No Tooling / Truss tooling.

**HYTEK reality:** `HYTEK-FRAME-TYPES.json` shows only `On flat - Standard tooling` (37/38) and `B2B - Standard` (1/38). Reversed Tooling, Plate over Stud, etc., are *not selected for any HYTEK Frame Type*.

The codec already does:
- Standard Tooling everywhere by default.
- B2B Standard via `simplify-tb2b-truss.ts` (TB2B plans).
- Reversed Tooling opportunistically for RP plans via `simplify-rp.ts` — even though HYTEK's frame-type doesn't request Reversed, the RP reference output behaves like Reversed in practice (verified empirically).

**Estimated parity impact:** 0pp from new manual work — covered.

---

## Decision: what to implement this session

Of the 6 priorities, only **Priority 1 (Door-Sill Web Notch)** has non-zero parity impact AND is implementable from manual + XML alone. The others are either:
- 0pp because HYTEK doesn't use the feature, or
- below 0.2pp (tag merging) and high-risk for tiny upside, or
- not implementable without per-frame state we can't observe.

### Plan
1. Implement door-sill Web-notch detection on B-plates in LBW/NLBW plans.
2. Diff against all 3 corpora.
3. If the rule produces a net positive across all 3, ship.
4. If it regresses any corpus, narrow the predicate or revert.

### Out of scope (manual references existing data we don't have)
- Service Hole (Vertical) per-frame — XML doesn't carry it.
- Plate over Stud / No Boxing Swages / On Edge — HYTEK frame types don't request.
- Notch merging — net impact too small.

---

## Final note on agent coordination
- **Agent T (Frida-derived rules):** owns the much larger gap. Manual coverage tops out around the door-sill rule (~0.5pp). Frida data has 4–10pp+ available depending on which clusters T mines.
- **Agent S (Service z-line):** owns InnerService — separate axis from the manual Service Hole option.

This document is the manual-derived ceiling; the rest is data territory.
