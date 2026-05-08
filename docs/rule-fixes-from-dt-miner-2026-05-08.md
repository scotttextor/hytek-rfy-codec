# DT-Miner Rule Fixes — 2026-05-08

Implementation report for the 5 top-leverage rule fixes derived from
`docs/mined-rules-decisiontree-report.md` (Top-20 curated section).

## Measurement methodology

The standard 388-pair y-pairs harness (`scripts/diff-vs-y-pairs.mjs`)
requires the Y: drive to read XML/RFY pairs. Y: was unmounted in this
session (no test machine had the network share). Without Y:, the
y-pairs harness exits 1 on every pair (0% parity).

**Substitute harness:** `scripts/diff-vs-truth-corpus.mjs` (new, this
session). Loads the cached `scripts/truth-corpus.jsonl` (66,262 sticks
across 381 pairs, with Detailer reference tooling per stick) and runs
the codec's per-stick rules engine against each stick, computing
matched/missing/extras using the same matching algorithm as the y-pairs
harness (1.5mm tolerance, opKey on type+kind).

**Limitation:** the truth-corpus harness ONLY measures the per-stick
rules engine. Frame-context crossings (LipNotch/Dimple at stud→plate
intersections) and post-pass simplifiers (TB2B, RP, wall-service,
linear-truss) are NOT included. Aggregate parity is therefore
substantially lower than the y-pairs harness (25.02% vs 77.45%).

What matters for this work: **the DT-miner findings target per-stick
rules**, so the truth-corpus harness is the right level for measuring
each fix's incremental impact in isolation. Cross-fix effects through
simplifier/frame-context interactions are not captured here — when
this work is later validated against the full pipeline (next time Y:
is available), those interactions will be visible.

## Starting baseline

`scripts/baselines/truth-corpus-true-baseline.json`:
- **25.02%** parity (153,937 matched / 615,188 ref)
- Missing: 461,251
- Extras: 171,736

Per plan type (top by ref count):
| Plan | Ref ops | Parity |
|---|---:|---:|
| LBW  | 280,984 | 27.66% |
| NLBW | 173,380 | 29.81% |
| RP   |  68,036 | 11.54% |
| TIN  |  56,539 | 21.45% |
| TB2B |  16,457 |  0.96% |
| FJ   |  13,390 | 19.60% |
| CP   |   6,062 | 27.63% |

Reference y-pairs baseline (full pipeline, pre-existing):
**77.45%** at `scripts/baselines/y-pairs-baseline.md`.

## Per-fix results

### Fix #1 — Kb cripple InnerService LBW+NLBW — REVERTED

**Mining**: DT-miner #3 + #10. n=2,713 (LBW+NLBW combined). conf 95-97%.
Detailer puts ~2 InnerService holes on Kb sticks in wall plans. Brief
suggested copying STUD_ROLES 296/446mm spacing pattern.

**Trial**: added InnerService rules at fixed offsets 296+446 to
`CRIPPLE_ROLES` (both 70S41 and 89S41 groups), gated on `isWallPlan(ctx)
&& length >= 500`.

**Result**: +73 matched, **+5,129 extras**. Parity delta: +0.012pp
(meets criterion since not -0.2pp regression).

**Why reverted (production regression even though parity ticks up)**:
inspecting one ref Kb stick (HG250009 NLBW, length=1429.08, Kb at angle
~22° from vertical):
- Ref InnerService positions: 321.06, 483.43, 582.65 (3 ops)
- Codec rule emits at: 296, 446 (2 ops)
- All 3 ref positions miss by >25mm — outside 1.5mm tolerance window

Kb sticks are diagonal — Detailer's InnerService positions are
ANGLE-PROJECTED (where the Kb centerline crosses horizontal service
z-lines). The 296/446 fixed-position rule cannot match these. The
codec already handles Kb InnerService correctly via geometry-aware
post-decode logic in `scripts/diff-vs-detailer.mjs:411+` — adding a
fixed-position table rule duplicates that work badly.

Mining was correct that Kb sticks have InnerService; mining was wrong
that fixed offsets work.

**Files changed**: none (revert committed; current state of
`src/rules/table.ts` does NOT contain the rule).

**Commits**:
- Auto-save `2e5006e` applied the fix (during exploration).
- Auto-save `4bd6d04` reverted to true baseline state.

### Fix #2 — NLBW T-plate InnerService re-enable

**Mining**: DT-miner #4. n=1,791. conf 90%. Detailer emits InnerService
at 89.5% of NLBW T-plates with mean 3.1 ops/stick.

**Implementation**: `src/rules/table.ts` — re-enabled the T-plate
InnerService rule that was disabled 2026-05-04. Used `spaced` anchor:
`firstOffset:275, spacing:600, lastOffset:200`. Spacing 600 matches
`setup.largeServiceToLeadingEdgeDistance`. Predicate: `/(NLBW|NON-LOAD)/i`.

**Result**: starting baseline 25.02% → 25.08%. +371 matched, +3,186
extras. Parity delta: **+0.055pp** (cumulative).

NLBW cohort: 29.81% → 30.03% (+0.21pp). NLBW/T cohort:
gained ~0.2pp at the per-cohort level.

**Caveat**: position pattern is empirically driven by stud-crossings
beneath the plate (not a fixed offset). Fixed-offset 275+600 only
catches the dominant first-position bucket; future improvement is a
geometry-aware version (mirror the Kb code in
`diff-vs-detailer.mjs:411+`).

**Commit**: `e354bd5 dt-miner-fix-2: re-enable NLBW T-plate
InnerService`.

### Fix #3 — LBW T-plate InnerService re-enable

**Mining**: DT-miner #6. n=1,648. conf 75%. LBW T-plates emit at 75.3%
with mean 3.27 ops/stick. The 2026-05-04 disable was based on
HG260001 PK1-PK5 sample (4 plans, 0 emission) — unrepresentative.

**Implementation**: `src/rules/table.ts` — extended the predicate from
`/(NLBW|NON-LOAD)/i` to `isWallPlan(ctx)`. Same `spaced` anchor as Fix
#2.

**Result**: 25.08% → 25.09%. +39 matched, +3,002 extras. Parity delta:
**+0.006pp** (cumulative).

LBW cohort: 27.66% → 27.67% (+0.01pp). LBW/T cohort:
matched +39 / extras +3,002 — most LBW/T positions miss the 1.5mm
tolerance window because Detailer's positions are stud-crossing-driven.

**Caveat**: marginal gain. Same future-improvement note as Fix #2 —
the geometry-aware version would land most of the +29,500 missing
LBW/T InnerService ops.

**Commits**: `f8c0924 Auto-save` (auto-save grabbed the table.ts edit
before the named commit landed; the diff in `f8c0924` is the fix-3
content).

### Fix #4 — RP T-plate dimple offset 10mm not 16.5mm

**Mining**: DT-miner #12. n=1,154. conf 47%. 47% of RP/T start-dimples
are at 10mm, only 21% at 16.5mm.

**Empirical truth-corpus analysis**:
- RP/T start-pos buckets: 10→541, 16→240, 90→138 (10 wins 2.3:1)
- RP/T end-offset: 8→202, 9→185 (8-9 dominates), 16-17 absent
- RP/B start-pos: 16→521, 10→469 (16 wins 10%)  ← do NOT change
- RP/N start-pos: 16→601, 10→281 (16 wins 2:1)  ← do NOT change
- RP/S start-pos: 16→1381, 78→1293, 10→1043 (16 wins) ← do NOT change

**Implementation**: `src/rules/table.ts` — added `isRpPlan()` helper.
Gated existing 16.5mm dimple to `!isRpPlan(ctx)`. Added new 10mm
dimple gated to `isRpPlan(ctx)`. Both ends. T-plate 70S41 group only.

**Result**: 25.09% → 25.17%. **+504 matched, -504 extras** (1:1
swap). Parity delta: **+0.082pp** (cumulative).

RP cohort: 11.54% → 12.28% (+0.74pp).
RP/T cohort: 6.81% → 10.73% (**+3.92pp** — best single-cohort gain).

**Mining findings #15 (RP/B), #20 (RP/N), #5 (RP/S panel-point)
NOT applied**: empirical analysis on the full truth corpus shows
16mm dominates 10mm for all three roles. The mining had low
confidence (31-50%) on those — flagged as wrong, consistent with
the brief's "if mining was wrong, revert" instruction.

**Commit**: `65a074b dt-miner-fix-4: RP T-plate dimple offset
16.5->10mm`.

### Fix #5 — TB2B B/T-chord Web stiffeners — NOT APPLIED

**Mining**: DT-miner #16 (n=479, conf 98%) and #19 (n=294, conf 100%).
Detailer emits Web on 100% of TB2B B-chords (avg 10.45/stick) and
98.3% of T-chords (avg 7.6/stick). Brief said codec emits zero.

**Empirical truth-corpus analysis** of TB2B chord Web positions:
- Positions are PAIRED chord-web crossings (intra-pair gap median
  98mm, inter-pair gap 300-1100mm by truss bay)
- Not evenly distributed at any constant spacing
- Existing TB2B simplifier (`src/simplify-tb2b-truss.ts`) emits these
  geometrically at centerline crossings

**Trial**: added Web rule with `evenlyDistributed`, firstOffset:60,
maxSpacing:600 (B) / firstOffset:100, maxSpacing:800 (T), gated on
`/-TB2B-/i && length >= 1000`.

**Result**: 25.17% → 25.19%. +134 matched, **+5,199 extras**. Parity
delta: +0.022pp (meets brief criterion of not -0.2pp regression).

Per cohort:
- TB2B/T: +15 matched / +2,566 extras
- TB2B/B: +119 matched / +2,633 extras

**Why NOT applied**: mining flagged "codec emits zero" only at the
per-stick rule level — but `simplify-tb2b-truss.ts` STRIPS per-stick
`point` ops on TB2B truss frames (line 586) and re-adds Web@pt at
correct centerline crossings. So:
1. In the truth-corpus harness (per-stick only): the rule looks like
   it adds Web ops, but they're at wrong positions
2. In the y-pairs harness (full pipeline): the TB2B simplifier would
   strip the rule's output on truss frames anyway, leaving the rule
   active only on non-truss frames within TB2B plans (a small/empty set)
3. Net production cost: +5,199 wrong-position extras in either case

The proper fix is extending `simplify-tb2b-truss.ts` geometric
coverage of crossing detection — a different problem space than
per-stick rule patches.

REVERTED.

**Commit**: `eebdc41 dt-miner-fix-5: TB2B B/T-chord Web stiffener
fallback NOT applied (revert; 0pp)`.

## Aggregate result

| Metric | Baseline | After all fixes | Delta |
|---|---:|---:|---:|
| Truth-corpus parity | 25.02% | **25.17%** | +0.149pp |
| Matched ops         | 153,937 | 154,851 | +914 |
| Extras              | 171,736 | 177,420 | +5,684 |
| Missing             | 461,251 | 460,337 | -914 |

Per plan type (truth-corpus harness):
| Plan | Baseline | Final | Delta | Ref ops |
|---|---:|---:|---:|---:|
| NLBW | 29.81% | 30.03% | +0.21pp | 173,380 |
| LBW  | 27.66% | 27.67% | +0.01pp | 280,984 |
| RP   | 11.54% | 12.28% | +0.74pp | 68,036 |
| (others unchanged) | — | — | — | — |

## Mapping to the y-pairs 388-pair baseline

The y-pairs harness was unrunnable this session (Y: drive offline).
The 77.45% reference baseline at `scripts/baselines/y-pairs-baseline.md`
remains the production parity number. When Y: comes back online, run

```
node scripts/diff-vs-y-pairs.mjs --pairs scripts/y-drive-pairs.json
```

to refresh the y-pairs baseline. Expected impact:

- **Fix #2 (NLBW T-plate InnerService)**: +371 truth-corpus matched
  ops → ≈+0.05pp y-pairs parity (matched goes 476,815 → ~477,200).
  Extras grow ≈+3,200 — visible in the y-pairs report.
- **Fix #3 (LBW T-plate InnerService)**: +39 matched / +3,002 extras
  → ≈+0.005pp y-pairs parity. Marginal.
- **Fix #4 (RP T-plate dimple @10)**: +504 matched / -504 extras →
  ≈+0.08pp y-pairs parity. Cleanest signal.

Total expected y-pairs delta: **+0.13pp** (77.45% → ~77.58%).

The cumulative parity gain is small in absolute terms because the
remaining gap (138,796 missing ops in the y-pairs baseline) is
dominated by:
- TB2B truss simplifier coverage gaps (Webs at chord-web crossings)
- RP plan simplifier (RP cohort sits at 28% in y-pairs harness)
- Geometry-aware InnerService for wall T/B-plates and Kb cripples
  (current fixed-offset rules catch only ~10% of positions)

These require simplifier-level work (out of scope for this rule-table
patch session per brief's "do NOT touch frame-context.ts" constraint
and the analogous TB2B-simplifier hands-off).

## Reverted fixes summary

| Fix # | What | Why reverted |
|---|---|---|
| 1 | Kb cripple InnerService 296/446mm | Kb sticks are diagonal; Detailer positions are angle-projected, not fixed. 73 matched / 5,129 extras = production regression. Existing `diff-vs-detailer.mjs:411+` already handles geometry-aware. |
| 5 (Web rules) | TB2B chord evenlyDistributed Web @600/@800 | Detailer positions are paired chord-web crossings, not evenly distributed. 134 matched / 5,199 extras. TB2B simplifier already strips per-stick `point` ops on truss frames. Wrong layer to fix. |

## Mining-finding overrides (data-driven counter-evidence)

Two of the brief's prescribed S/T/B/N changes for fix #4 were NOT
applied because empirical truth-corpus analysis contradicted the
mining:

| Mining finding | Empirical truth-corpus (top-2 first-pos buckets) | Decision |
|---|---|---|
| #5 RP/S panel-point @78.7 (37% conf) | start-pos: 16→1381, 78→1293, 10→1043; only 37% of S sticks have @78.7 vs current 16.5 hits 33.9%; 78.7 hits 37%. Adding ANY @78.7 rule on 100% of sticks would create 63% extras. | NOT applied |
| #15/17 RP/B dimple @10 (40% conf) | start-pos: 16→521, 10→469 — 16 wins 10% | NOT applied |
| #20 RP/N dimple @10 (31% conf) | start-pos: 16→601, 10→281 — 16 wins 2:1 | NOT applied |

These overrides are consistent with the brief's instruction to revert
when "the mining was wrong about that one."

## Files changed

- `src/rules/table.ts` (5 hunks total across 3 applied fixes + 2
  documented reverts)
- `scripts/diff-vs-truth-corpus.mjs` (new — substitute harness for
  this session)

Baseline JSON snapshots:
- `scripts/baselines/truth-corpus-true-baseline.{json,md}` —
  starting state
- `scripts/baselines/truth-corpus-final.{json,md}` — after all fixes
- `scripts/baselines/truth-corpus-fix2.{json,md}` — after fix #2
- `scripts/baselines/truth-corpus-fix3.{json,md}` — after fix #3
- `scripts/baselines/truth-corpus-fix4-T-only.{json,md}` — after
  fix #4
- `scripts/baselines/truth-corpus-fix5-trial.{json,md}` — fix #5
  trial (subsequently reverted)

## Final aggregate

**Starting baseline (truth-corpus harness):** 25.02%
**Final (truth-corpus harness):** 25.17%
**Delta: +0.149pp**

**Y-pairs baseline (pre-existing, unrunnable this session):** 77.45%
**Y-pairs estimated final:** ~77.58% (+0.13pp), to be confirmed when
Y: is available.

## Reproducibility

```bash
cd hytek-rfy-codec
git checkout master   # at eebdc41 or later
npm run build
node scripts/diff-vs-truth-corpus.mjs --out /tmp/parity
# expect: OVERALL: 25.17% (154851/615188)
```

When Y: drive is mounted:
```bash
node scripts/diff-vs-y-pairs.mjs --pairs scripts/y-drive-pairs.json
# new reference y-pairs-baseline.{json,md}
```
