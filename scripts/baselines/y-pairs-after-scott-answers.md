# Local Corpus Baseline — After Scott's 2026-05-07 Rule Clarifications

**Generated:** 2026-05-08T05:58:00Z
**Test Set:** Local test-corpus (40 pairs from HG260012, HG260044, HG250057,
  HG250082, HG250096, 2603191, LINEAR_TRUSS_TESTING) — Y: drive not mounted
  on this PC, so the full 388-pair y-pairs baseline could not be re-run.

## Overall: **79.87%** matched (was 79.45% before changes)
49,250 / 61,661 ops on local corpus. **Net +0.42pp** on the local subset.

## Headline gains by plan-type (local subset)
| Plan | Pairs | Before | After | Δ |
|---|---:|---:|---:|---:|
| RP-70.075 | 4 | 33.4% | **52.7%** | **+19.3pp** |
| RP-70.095 | 2 | 15.5% | **32.8%** | **+17.3pp** |
| TIN-89.075 | 2 | 54.0% | 54.2% | +0.2pp |

All other plan-types unchanged (no regressions).

## Per-block parity deltas

### Block 1 — Rule 7 (RP top/bottom-of-slope plate caps)
- **Commit:** `8337d6f`
- **File:** `src/simplify-rp.ts`
- **Change:** Disabled the entire simplifier (skip every frame). Per Scott's
  clarification, the previous unconditional chord-style/plate-over-plate cap
  rewrite over-applies. Cross-corpus evidence shows even truly sloped plates
  (R1202 T1 dz=298mm) want STANDARD wall caps in ref Detailer. Standard
  caps from `table.ts` already match ref on the bulk RP corpus.
- **Local Δ:** Overall 79.45% → 79.87% (+0.42pp). RP-70.075 +19.3pp,
  RP-70.095 +17.3pp.
- **Y-pairs estimated Δ:** ~+1-2pp overall (RP is 50/388 pairs = ~13% of
  ops, and our improvement claims ~half of the ~70% RP gap).

### Block 2 — Rule 3 (raised B-plates never get slab anchors)
- **Commit:** `46d566c`
- **File:** `src/rules/table.ts`
- **Change:** Removed three NLBW-gated sub-rules from the 70mm Bh raised-B
  plate rule (Web@8, Bolt@62 start, Bolt@end-62). Scott confirmed the
  reference data emissions were "human error" — raised B plates never
  attach to the slab.
- **Local Δ:** No change (local corpus doesn't include the affected NLBW
  raised-B frames).
- **Y-pairs estimated Δ:** Spot-check of `raw-y-pairs/HG250009__GF-NLBW-70.075.txt`
  shows ~30 EXTRAS like `B2 EXTRAS: Web@8 | Bolt@62 | Bolt@982` repeated
  across N3, N13, N16, N19, N25, N34, N43, N47 frames — likely +0.3-0.5pp
  on Y-pairs NLBW corpus.

### Block 3 — Rule 11 (Rails get standard stud-style tooling)
- **Commit:** `81aa0b2`
- **File:** `src/rules/table.ts`
- **Change:** Removed R from the Br/R brace rolePattern (which used 41mm
  Swage + ID@11). Added dedicated R-rail rules using SPAN_70/SPAN_89 (39mm)
  + DIMPLE_OFFSET_70/89 (16.5mm) — standard stud-style end caps.
- **Local Δ:** TIN-89.075 +0.2pp.

## Blocks NOT implemented (skipped due to risk/scope)

### Block A — Rule 1 + 12 (truss panel-point chord/web crossings)
**Decision:** SKIPPED — too risky without full y-pairs harness.

The codec already has crossing geometry in `src/rules/frame-context.ts`
that handles (T-plate ↔ stud) crossings on walls. Extending the same to
truss (TopChord/BottomChord ↔ web/rail) is conceptually identical, but:

1. The previous agent attempt (noted in `simplify-tin-truss.ts` line 34)
   regressed by 5pp because of position-offset errors (`chord_half_depth ×
   tan(angle)` correction direction) and cohort-split issues (~80% of long
   chords have panel-point dimples but ~20% don't, no clean discriminator).
2. The local TIN corpus is small (4 jobs = 16K ref ops). Full y-pairs has
   90 TIN pairs — much better signal/noise. Without Y-drive access, can't
   verify a panel-point fix doesn't regress on TIN frames the local corpus
   doesn't cover.
3. The diff harness shows TIN T2 misses are dominated by ScrewHoles +
   paired InnerDimples in patterns like `(@383.4, @434.6, @959.8, @1011.0)`
   — pairs spaced ~51mm at the panel point. The exact positions involve
   chord arc-length parameterisation that isn't a clean "centerline
   intersection" the docstring claims. Needs frida-corpus mining to derive
   the right offset constants per cohort (HN-prefix vs TN-prefix vs TS).

**Estimated upside:** +5-10pp on TIN if done right (TIN currently 65.2%
on the y-pairs baseline). Deferred to a future session with Y-drive access.

### Block B — Rule 6 (auto-chamfer geometric collision)
**Decision:** SKIPPED — partly already handled.

The 28°-from-vertical threshold for wall-W chamfer in `src/rules/table.ts`
is already a coarse approximation of geometric collision. Replacing with
"would unchamfered corner hit the next stick within 2-4mm tolerance"
requires neighbour-stick lookup that doesn't exist in the rules-engine
context object today. Adding the neighbour search would touch the rules
engine API. Scope+risk too large for this session.

### Block C — Rule 2 (TB2B chord caps suppression)
**Decision:** SKIPPED — TB2B simplifier already strips most caps.

`simplify-tb2b-truss.ts` line 583 already filters out start/end-anchored
ops on TB2B truss-member sticks (`if (op.kind === "start" || op.kind ===
"end") return false;` for chamfer; `if (op.type === "Swage") return false;`
for Swage). Investigated whether additional cap-suppression at chord ends
would help — checked TB2B baselines; current TB2B parity is 69.8% on
y-pairs. The cap-stack rules already explicitly suppress what Scott
described. No further suppression needed.

### Block D — Rule 4 (24mm + 1200mm slab bolt placement)
**Decision:** SKIPPED — single-bolt-per-end is dominant in current corpus.

The current `Bolt @62 + Bolt @end-62` pattern works for short-to-medium
B-plates. Long B-plates >2400mm wanting 1200mm-spacing intermediate bolts
is documented but the local corpus shows few such cases. Scott's rule is
correct — left for a future session that can mine the long-B-plate cohort
on Y-pairs.

### Block E — Rule 5 (Web@8 orientation marker)
**Decision:** PARTIAL — already gated by `isPrimaryBPlate`.

The `Web@8` rule already only fires on the primary slab-bearing B-plate
(B1 OR length≥1500mm). Scott says it's a single marker per plate
regardless of bolt count, which IS the current behavior — the rule emits
exactly one Web@8 per primary B. No change needed.

### Block F — Rule 8 (crossings notch type: LipNotch / WebNotch / both)
**Decision:** SKIPPED — too deep without full corpus testing.

Determining "stud crosses through lip side OR web side OR both" requires
3D section-profile geometry the current 2D crossing detection doesn't
have. Adding this would touch frame-context.ts crossing emission deeply.
Risk of regression too high without y-pairs verification.

### Block G — Rule 9 (head-stiffener dimple)
**Decision:** SKIPPED — current rule narrowed to LBW already.

The `InnerDimple @58.5` paired-dimple on headers/sub-plates is already
gated to LBW plans only (per `predicate: (ctx) => /(LBW)/i.test(ctx.planName)`)
in `src/rules/table.ts` rule 268-281 and 511-524. Scott's "loadbearing
walls" wording matches the LBW plan-name gate. The rule is correct.

### Block H — Rule 10 (top-plate service-hole projection)
**Decision:** SKIPPED — `simplify-wall-service.ts` already handles studs;
top-plate centerline projection not in scope without manual XML mining of
service-hole z-lines.

## Validation

- `npx tsc --noEmit` — clean ✓
- `npx vitest run "src/"` — 494/494 tests pass ✓
- Local corpus baseline: 79.87% (improvement, no regressions in any
  category) ✓

## Files changed
- `src/simplify-rp.ts` — disabled simplifier (Rule 7)
- `src/rules/table.ts` — removed NLBW Bh slab-anchor rules (Rule 3),
  split R from Br rolePattern + added dedicated R rules (Rule 11)

## Re-running on Y-drive
When Y-drive is available again, run:
```
node scripts/diff-vs-y-pairs.mjs
```
to refresh `scripts/baselines/y-pairs-baseline.{md,json}` and confirm the
Y-pairs corpus uplift.
