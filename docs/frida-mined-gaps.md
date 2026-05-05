# Frida-Mined Gaps — Codec vs Detailer Truth

**Report date:** 2026-05-05
**Captures analysed:**
- `scripts/catalog/ops_by_frame.json` (HG260001 — 264 frames, 1,918 ops)
- `scripts/catalog-hg260044/ops_by_frame.json` (HG260044 — 215 frames, 2,008 ops)
- `scripts/catalog-hg260023/ops_by_frame.json` (HG260023 — 272 frames, 1,918 ops)

**Baselines used:**
- `scripts/baselines/hg260001-baseline.json` — 82.77% (14,899 / 18,000 ops)
- `scripts/baselines/hg260044/baseline.json` — 80.27% (13,740 / 17,117 ops)
- HG260023 — no baseline yet (no diff harness exists)

---

## 1 · Binary op format — partial decode

### 1.1 What I confirmed

Each `ops` array in `ops_by_frame.json` holds 16-byte hex chunks. `ops_meta.len`
counts logical operations; the chunks together form a **variable-length byte
stream** that encodes those ops. Chunks do **not** align to op boundaries.

For the smallest cases (`len <= 2`, 32 bytes total) the layout is clean:

```
Frame 125 (HG260001), len=2, 32 bytes:
  bytes  [0..7]   = 50.000           (LE double — start of spanned op A)
  bytes  [8..15]  = 4412.532         (LE double — end of spanned op A)
  bytes [16..23]  = 4575.940         (LE double — pos of point op B)
  bytes [24..31]  = 03 00 00 00 00 00 00 00   (8-byte type marker — op B type=3)
```

All six `len=2` frames I sampled fit a `[double][double] [double][marker]`
structure: i.e. one **spanned** op (start+end) followed by one **point** op
(pos + 8-byte type marker).

The "Swage 0..39" example in `scripts/FRIDA-CAPTURE-INSTRUCTIONS.md` shows a
DIFFERENT layout (`type:uint32 + start:uint32 + end:uint32`). That looks like
an older/different Detailer build — the captures we have here use **doubles
for positions** and **trailing 8-byte markers for type** (i.e. these came
from FrameCAD Detailer v5 with the catalog records observed 2026-04-24).

### 1.2 Recurring 8-byte type markers (counted across all 3 corpora)

| Marker (LE hex) | Count | Likely meaning |
|---|---:|---|
| `00 00 00 00 00 00 00 00` | 849 | Type 0 (Swage?) — most common |
| `0a 00 00 00 00 00 00 00` | 236 | Type 10 (InnerDimple?) |
| `01 00 00 00 00 00 00 00` | 221 | Type 1 |
| `07 01 00 00 00 00 00 00` | 220 | "Spanned of type 1" — sub-marker pair |
| `aa 0a 00 00 00 00 00 00` | 134 | (likely a chunk-boundary artefact, not a real marker — see note) |
| `40 01 00 00 00 00 00 00` | 99 | Type 0x140 / flags |
| `a7 0a 00 00 00 00 00 00` | 78 | (likely chunk-boundary artefact) |
| `0a 03 00 00 00 00 00 00` | 39 | Type 3 spanned variant |
| `07 02 00 00 00 00 00 00` | 33 | Spanned type 2 |

**Note on chunk-boundary artefacts:** Many "marker-shaped" patterns ending in
6 zeros are actually the high-byte tail of a `0x40NN` exponent in a position
double immediately followed by zero padding from the next op's high-order
double bytes. These should be excluded by anchoring the marker scan to even
8-byte offsets within decoded op streams (not by sliding-window scan).

### 1.3 Decoding rabbit hole — STOPPED

I did not finish reverse-engineering the full type→ToolType mapping or the
spanned/point distinction inside `len >= 3` frames where positional doubles
and markers interleave. **Per the brief's time-box, I stopped here.** The
higher-value Section 3 analysis is below.

A future agent who wants to finish the binary decode should:
1. Sample the 6 known `len=2` frames in `catalog/ops_by_frame.json` against
   reference RFY ops for the same `frame_id` (frame_id 125, 189, 190, 198,
   199, 3 in HG260001). The 8-byte markers for these are `0x03` (5 of 6) and
   `0x01` (1 of 6) — cross-reference with `RfyToolingOp` enum order in
   `src/format.ts:17` to nail the type ID table.
2. Build a stream-walker: read `[double][double]`, then if next 8 bytes look
   like a marker (high 6 bytes zero, byte 0/1 small) it's a spanned-op type;
   else next 8 bytes is another double (next op's pos1).

---

## 2 · Methodology — what I actually used to find gaps

Given the time-box and that the binary decoder is incomplete, I pivoted to
**baseline-driven gap analysis** which uses signal we already trust:

1. Per-tool aggregate divergence (`scripts/baselines/hg260001-baseline.json`
   `aggMissing` / `aggExtras`, ditto HG260044).
2. Per-plan + per-tool divergence — concentrates each tool's misses to the
   plans where the systematic rule is broken.
3. Cross-corpus consistency check — gaps that show up in **both** HG260001
   and HG260044 are codec gaps; gaps that show up in only one are likely
   data-specific or sampling noise.

The ops_by_frame.json captures **were** useful for confirming the binary
schema includes both spanned (start/end) and point (pos+type-marker) ops in
the same flat array — i.e. Detailer's in-memory model already distinguishes
them, so any rule we write should preserve that distinction.

Step 2 (Detailer in-memory vs RFY-serialised divergence) was skipped per the
brief's "if unsure, just skip the divergence analysis" guidance.

---

## 3 · Top systematic gaps — ranked by combined pp impact

Combined cross-corpus per-tool divergence (HG260001 + HG260044, total ref =
35,117 ops):

| Tool | Missing | Extras | Net we lack | Δpp if fixed |
|---|---:|---:|---:|---:|
| InnerDimple | 1,852 | 1,325 | +527 | ~+1.5pp |
| Swage | 983 | 1,318 | -335 | ~+0pp (rebalance only) |
| Web | 1,094 | 1,259 | -165 | ~+0pp (rebalance only) |
| LipNotch | 1,052 | 969 | +83 | ~+0.2pp |
| Chamfer | 488 | 37 | **+451** | **~+1.3pp** (almost pure miss) |
| InnerService | 494 | 568 | -74 | ~+0pp |
| InnerNotch | 335 | 316 | +19 | ~+0.05pp |
| ScrewHoles | 49 | 2 | +47 | ~+0.1pp (concentrated, see Gap #5) |
| RightFlange | 75 | 31 | +44 | ~+0.1pp |
| LeftFlange | 51 | 33 | +18 | ~+0.05pp |
| Bolt | 5 | 60 | -55 | ~+0pp |

**Headline:** ~6,478 missing ops + ~5,918 extras = ~12,396 wrong ops out of
35,117. Total parity ceiling assuming perfect rules = ~100%; current = 81.5%
average. Most of the wrong-ops budget is in **mis-placed** ops (extras pair
with missings of the same tool) rather than missing tool types entirely.

### Gap #1 — RP frames default-rule blowout (16.8% / 22.4% parity)

- **Pattern (Detailer):** RP (raking-panel / panel-roof) frames use
  **Reversed Tooling** per the v5.0 manual: horizontal plates are continuous,
  vertical studs get notched. Different Chamfer + LipNotch + InnerDimple
  vocabulary is used.
- **Codec behaviour:** No RP-specific path. RP frames hit the default
  Standard-Tooling rules and fail catastrophically — 17–22% match. Chamfer
  net miss is concentrated here (108 in HG260001, 157 in HG260044 = 265 of
  the 451 net Chamfer misses, **59% of all Chamfer missings**).
- **Affected sticks:** 997 ref ops in HG260001 GF-RP, 1,222 in HG260044
  GF-RP. Total RP ops across both corpora ≈ 2,219.
- **Estimated pp gain if fixed:** Even getting RP from ~20% to 80% would lift
  ~1,300 ops into matched. Across the 35,117-op cross-corpus base that's
  **~+3.7pp** combined. Of all gaps, this is by far the highest single ROI.
- **File pointer for fix:** No RP detection exists. Add `isRpPlanName()`
  helper alongside `isTinPlanName` at `src/simplify-tin-truss.ts:37` and a
  parallel `src/simplify-rp.ts` simplifier. Wire from `src/synthesize-plans.ts`
  near the existing TIN-plan branching. The Phase-3 Agent I "RP envelope
  crash fix" lives somewhere in `src/synthesize-plans.ts:268-395`.
- **Manual-audit cross-ref:** `docs/manual-audit.md` Gap #2 (Reversed
  Tooling) calls this out as the highest-ROI fix.

### Gap #2 — TB2B Web bolt-pair extras (HG260044)

- **Pattern (Detailer):** TB2B truss webs receive a single Web bolt-hole at
  each crossing on the chord side, NOT a pair.
- **Codec behaviour:** We emit ~2-3× too many Web ops on TB2B chords:
  - HG260044 PK4-TB2B: ref Web=66, our extras=207 → emitting ~3.1× too many
  - HG260044 PK2-TB2B: extras=129 vs ref Web ops in same plan
  - HG260044 PK3-TB2B: extras=112
  - HG260044 PK1-TB2B: extras=101
- **Root cause hypothesis (Agent G):** the `+98mm` bolt-pair fires
  unconditionally on every web crossing instead of only on apex-going main
  diagonals. The manual contradicts this hypothesis — bolt-vs-web is per-
  MACHINE, not per-WEB. Re-investigate orientation/box-membership.
- **Affected sticks:** ~549 extra Web ops across HG260044 TB2B plans alone.
- **Estimated pp gain if fixed:** Removing the spurious extras on HG260044
  TB2B plans alone moves ~500 ops out of "extras" — won't gain matched
  count directly but would unblock matching the genuine missing Web ops
  hidden underneath the extras. **~+1.4pp** combined corpus.
- **File pointer for fix:** TB2B logic in `scripts/diff-vs-detailer.mjs:84-280`
  (architectural debt — should move to `src/simplify-tb2b-truss.ts`). The
  bolt-pair generator is the line that emits a second `Web` op `+98mm` from
  the first.

### Gap #3 — LBW Chamfer misses (HG260044 GF-LBW)

- **Pattern (Detailer):** GF-LBW frames emit Chamfer ops (likely on Kb/H/L
  cripple-stud ends meeting raking plates).
- **Codec behaviour:** 168 Chamfer ops missing in HG260044 GF-LBW with
  **zero extras** — i.e. we just don't emit them, anywhere.
- **Affected sticks:** 168 in HG260044 GF-LBW, 18 across HG260001
  PK4/PK5-LBW (mostly already balanced by extras there). The HG260044
  cluster is the suspicious one — **why does the codec emit Chamfers on
  HG260001 LBW but not HG260044 LBW?**
- **Estimated pp gain if fixed:** ~+0.5pp combined.
- **File pointer for investigation:** `src/csv.ts:201-218` has Chamfer
  start/end logic; check rule predicates around `Chamfer` and `TrussChamfer`
  in `src/rules/table.ts` and `src/rules/frame-context.ts`. The 89.075 vs
  70.075 profile or some plan-name detail probably gates Chamfer emission.

### Gap #4 — InnerDimple over-emission across all wall plans

- **Pattern (Detailer):** Detailer places InnerDimple at specific
  pos+spacing tied to per-section `Fastener1` Y-offset, end-clearance, and
  box-dimple-spacing rules.
- **Codec behaviour:** 1,852 missing + 1,325 extras = lots of mis-positioned
  InnerDimples. Highest concentrations:
  - HG260044 GF-RP: 415 miss + 391 extras (RP-rule failure, see Gap #1)
  - HG260044 GF-LBW: 204 miss + 132 extras
  - HG260001 GF-RP: 317 miss + 306 extras (RP, again)
  - HG260001 GF-TIN: 136 miss + 110 extras
- **Root cause hypothesis:** profile-specific `Fastener1` Y-position is
  hardcoded for 70mm. Per the resume doc: 70mm=20.5, 75/78mm=22, 89mm=20.5,
  104mm=25.5. Codec uses a single value everywhere.
- **Estimated pp gain if fixed:** Excluding RP (counted under Gap #1),
  ~+0.8pp combined.
- **File pointer for fix:** `src/rules/table.ts:55-69` (DIMPLE_OFFSET_70 = 16.5
  hardcoded; TODO comment at line 50-54 points at the helper to use). Also
  `src/rules/frame-context.ts` — the resume doc confirms TODO markers exist.

### Gap #5 — TIN ScrewHoles missing (HG260001 GF-TIN-70.075)

- **Pattern (Detailer):** ScrewHoles ops on TIN trusses (likely at chord-web
  bolt connections — manual section 4.4).
- **Codec behaviour:** 49 missing, 2 extras — almost no codec emission.
- **Affected sticks:** Concentrated entirely in HG260001 GF-TIN-70.075
  (49 of the 49 cross-corpus misses). HG260044 GF-TIN does not exhibit this
  — possibly different chord/web style.
- **Estimated pp gain if fixed:** ~+0.13pp combined. Small but **easy**:
  the gap is concentrated in one plan + one tool, and the manual confirms
  the rule.
- **File pointer for fix:** `src/simplify-tin-truss.ts` has the TIN
  vocabulary but ScrewHoles isn't in `TOOL_TO_CSV` as a separate column
  beyond `ANCHOR` (`src/csv.ts:31`). Check whether the TIN simplifier emits
  ScrewHoles at all.

### Gap #6 — TB2B Right/LeftFlange double-flange ops (HG260044 only)

- **Pattern (Detailer):** TB2B chords get RightFlange + LeftFlange paired
  notches at certain web-crossings.
- **Codec behaviour:** 75 RightFlange + 51 LeftFlange missing combined
  (HG260044 dominates: 31 RF + 24 LF in HG260044 TB2B alone).
- **Affected sticks:** All HG260044 TB2B plans + a handful in HG260001 TB2B.
- **Estimated pp gain if fixed:** ~+0.35pp combined.
- **File pointer for fix:** Same TB2B simplifier work as Gap #2 —
  `scripts/diff-vs-detailer.mjs:84-280`. The flange-pair rule isn't fired
  on the right web-crossings.

### Gap #7 — InnerService over-emission in NLBW (HG260001 PK1+PK2)

- **Pattern (Detailer):** InnerService holes at fixed Z-heights on Kbs.
- **Codec behaviour:** 568 extras vs 494 missing — i.e. we emit InnerService
  in the **wrong position** on lots of Kbs. PK1-NLBW: 56 miss + 42 extras;
  PK2-NLBW: 52 miss + 71 extras.
- **Root cause hypothesis (per resume doc):** "Detailer places InnerService
  at fixed world Z heights (~300, ~450). For diagonal Kbs, parametrize the
  outline as a line and find where it crosses each target Z." Codec
  currently places at fixed local position regardless of stick angle.
- **Estimated pp gain if fixed:** ~+0.5pp combined (mostly from extras
  cancelling matched ops).
- **File pointer for fix:** `src/rules/frame-context.ts` Kb stick handler
  (search for `InnerService` in that file, ~Kb section).

### Gap #8 — LBW LipNotch over-emission (HG260044)

- **Pattern (Detailer):** LipNotch on LBW frames at specific stud / nog
  crossings.
- **Codec behaviour:** HG260044 GF-LBW emits **204 extras** vs 147 missing.
  Net we have too many at the wrong positions.
- **Affected sticks:** GF-LBW dominantly; smaller in NLBW.
- **Estimated pp gain if fixed:** ~+0.5pp combined.
- **File pointer for fix:** `src/rules/frame-context.ts:530-644` (the LBW
  stud + nog crossing logic — the comment-heavy region modified
  2026-05-01..04 with HG260044 GF-LBW S3+S4 verification).

### Gap #9 — TIN Swage rebalancing (small, both corpora)

- **Pattern (Detailer):** Swage start/end on TIN truss webs.
- **Codec behaviour:** HG260044 GF-TIN-70.075: 65 miss + 44 extras;
  HG260044 GF-TIN-70.095: 13 miss + 13 extras (perfect rebalance — ops at
  wrong position); HG260001 GF-TIN-70.075: 53 miss + 42 extras.
- **Estimated pp gain if fixed:** ~+0.3pp combined.
- **File pointer for fix:** `src/simplify-tin-truss.ts` Swage emission.
  Likely a small offset bug (Float32 rounding or wrong end-clearance).

### Gap #10 — Bolt mis-emission in NLBW (HG260044 GF-NLBW-70.075)

- **Pattern (Detailer):** Bolt (ANCHOR) ops on bottom plates at fixed offset.
- **Codec behaviour:** HG260044 GF-NLBW-70.075 has 42 Bolt extras vs 0 miss
  — codec is emitting genuine bonus Bolt ops Detailer never asked for.
  HG260001 PK1-NLBW: 5 extras + 1 miss.
- **Estimated pp gain if fixed:** ~+0.13pp combined (small).
- **File pointer for fix:** Investigate where Bolt is emitted on bottom
  plates (`src/rules/table.ts` BOLT_OFFSET_70 = 62 area). The
  HG260044-specific over-emission suggests a stick-name or length predicate
  is firing where it shouldn't.

---

## 4 · Divergences — Detailer in-memory vs RFY-serialised

**Skipped per brief.** Would require parsing reference RFYs and matching
frame_id → RFY-stick — and would need the binary decoder finished first.
Recommend a Phase-2 dispatch when the codec hits ~95% to identify the last
mile.

---

## 5 · Recommended dispatch order for "Agent K"

If the next round can dispatch parallel agents, this is the priority list
ranked by **(estimated pp gain) × (independence)**:

| # | Agent | Target gap | Est pp | Risk | Independence |
|---|---|---|---:|---|---|
| 1 | **K1 — RP simplifier** | Gap #1 (RP rules) | +3.7pp | Medium — net new module | Independent |
| 2 | **K2 — TB2B web/flange fix** | Gaps #2 + #6 | +1.7pp | High — touches 500-line diff harness | Independent |
| 3 | **K3 — Per-profile Fastener1** | Gap #4 (InnerDimple) | +0.8pp | Low — already TODO'd | Independent |
| 4 | **K4 — LBW Chamfer + LipNotch** | Gaps #3 + #8 | +1.0pp | Medium — frame-context.ts hot spot | **Conflicts with K3** if both touch frame-context.ts |
| 5 | **K5 — Kb InnerService + TIN Swage** | Gaps #7 + #9 | +0.8pp | Low | Independent |

**Total estimated gain if all 5 land cleanly:** **+8.0pp** (HG260001
82.8% → ~91%; HG260044 80.3% → ~88%).

**Critical first move:** Before dispatching, the binary op decoder needs to
be finished, OR cross-reference the captures against reference RFY ops
(Step 2) to validate the gap hypotheses. Currently all gap rankings rely
on the existing baselines — which are accurate for matched/missing but
don't tell us which **specific frame** has the gap. K1's RP simplifier in
particular needs reference ops for a few RP frames before any rule design
can start.

---

## 6 · Files & data pointers

- **Captures:** `scripts/catalog/ops_by_frame.json`,
  `scripts/catalog-hg260044/ops_by_frame.json`,
  `scripts/catalog-hg260023/ops_by_frame.json`
- **Records (full Frida output incl. SectionLookupRecord):**
  `scripts/catalog/records.jsonl` and parallel for hg260044/23.
- **Baselines:** `scripts/baselines/hg260001-baseline.json`,
  `scripts/baselines/hg260044/baseline.json`
- **Manual audit:** `docs/manual-audit.md` (the source-of-truth for which
  gaps map to v5.0 manual sections — read alongside this report)
- **Resume doc:** `RESUME-WORK-PC.md` (Section "Phase 5: Cross-corpus
  rules-derivation" — that's exactly what this report is)

---

## 7 · Caveats — what this report can NOT tell you

1. **No frame-name mapping.** `ops_by_frame.json` indexes by Detailer's
   internal numeric `frame_id`, not by RFY frame_name. Without finishing
   the binary decoder + walking the records.jsonl `endpoint1`/`endpoint2`
   pairs to match against reference RFY frame elevations, we can't say
   "frame R1 is missing op X". The gaps above are at the (plan, tool-type)
   level — sufficient to dispatch agents but not to write unit tests.
2. **HG260023 has zero baseline.** Its capture is included in the
   marker-pattern aggregates only. To use it for gap-mining, build
   `scripts/diff-all-hg260023.mjs` (see RESUME-WORK-PC.md §"Phase 6").
3. **Extras vs missings rebalancing.** Many tools (Web, Swage, InnerDimple,
   InnerService) have similar miss + extras counts — i.e. the codec emits
   the right tool at the **wrong position**. The pp-gain estimates assume
   fixing the position fixes both at once. If the extras stay (e.g. wrong
   stick entirely) the gain halves.
