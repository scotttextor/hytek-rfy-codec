# Action-defs input pipeline upgrade — 2026-05-08

**Date:** 2026-05-08
**Outcome:** Foundation extended; flag remains default OFF.
**Wide-corpus delta estimate:** 0pp on the 9-pair sweep.

## Summary

Followup to `action-defs-final-wireup.md`. Goal was to take the codec from
77% to 90%+ by fixing the input pipeline (findCrossings, deriveStickProps,
edge-mask resolution) so the action-defs path fires meaningfully on
cohorts where Detailer parity is weak (TIN/RP).

What was implemented:

1. **Fix 2 — `deriveStickProps` upgraded** to consume the resolved
   `MachineSetup`'s per-profile `SectionSetup`. `swageClearance`,
   `isHybridFlange`, `isBoxing`, `secondaryFlag` now come from real
   section-descriptor data instead of all defaulting to false/zero.

2. **Fix 1 — `findCrossings` extended** with a second branch that
   computes centerline × centerline intersections for truss panel-points
   (chord × web, chord × chord, brace-end × chord-web). Now classifies
   each crossing as one of the 9 `TIntersectionType` values
   (`ww_inner_edge`, `ew_inner_edge`, `t_bchord`, `b_tchord`, `t_tchord`,
   `ll/lw/wl_inner_edge`, `explicit_tool`).

3. **Fix 3 — Edge mask resolution** now packs the 4-bit
   `FToolActions[mask]` slot index from the intersection type tag rather
   than defaulting to `ww=true`. Conservative posture: panel-point
   crossings get mask=0x8 (ww only) to avoid firing `le&we`-gated
   alternatives that emit junk lipnotches spanning to `lend`.

4. **Fix 4 — `SUPPRESSED_CLASSIFICATIONS` made env-tunable** via
   `CODEC_SUPPRESS_ONFLAT` and `CODEC_SUPPRESS_OVER_SWAGED`. Default
   suppression list now includes `OnFlat - Over` and `OnFlat - Swaged`
   (see "Why no gain" below).

5. **Chord-flag plumbing** — the `ConditionContext` now passes
   `t_tchord/b_tchord/t_bchord` chord flags drawn from the intersection
   type tag, plus a real `multiHit` flag (true when the connector has
   multiple distinct partners).

## A/B parity table (local corpus, 9 pairs, 16,693 ref ops)

### HG260044 — 8 cohort pairs (unchanged from prior wireup)

| Cohort       | OFF cov | ON cov | Δ      |
|--------------|---------|--------|--------|
| LBW-70.075   | 85.11%  | 85.11% | +0.00pp|
| NLBW-70.075  | 91.42%  | 91.42% | +0.00pp|
| NLBW-89.075  | 89.69%  | 89.69% | +0.00pp|
| CP-70.075    | 100.00% | 100.00%| +0.00pp|
| TIN-70.075   | 81.63%  | 81.63% | +0.00pp|
| TIN-70.095   | 95.15%  | 95.15% | +0.00pp|
| TB2B-70.075  | 82.31%  | 82.31% | +0.00pp|
| RP-70.075    | 18.49%  | 18.49% | +0.00pp|
| **TOTAL**    | 82.08%  | 82.08% | +0.00pp|

## Decision: flag stays default OFF

**No regression, no gain.** Not eligible for Scenario A (≥+5pp on TIN/RP
without LBW/NLBW losing > 1pp).

## Why no gain was observed (despite the input-pipeline fixes)

This investigation surfaced a fundamental gap that the brief's scope
doesn't cover. The action-defs grammar — slots 0..15 indexed by edge
mask — is **end-of-stick-oriented**, not interior-crossing-oriented:

- Slot 0 (mask=0): connectee not touching any edge → fallback ops use
  full-stick spans (`swage@ww-wend`, `webnotch@ww-wend`).
- Slot 8 (mask=0x8, ww only): partner crosses connector's web at an
  interior point. The slot-8 alternative for `OnFlat - Swaged` is
  `we:swage@we-wend,swage@lw-lend` — emits TWO full-stick swages at
  both ends.
- Slot 15 (mask=0xF, all 4 edges): probably for end-on-end joints.

When TIN's chord×web crossings classify as `OnFlat - Swaged` (via
`classifyMixed` → "A is the truss chord" branch), the slot-8 alternative
fires and produces stick-end-spanning ops — which DON'T match Detailer's
reference (which has 45mm-wide centred swages at panel-points, NOT
full-stick swages).

Empirically verified on TIN-70.075: un-suppressing `OnFlat - Over` /
`OnFlat - Swaged` ADDED 107 extras (Swage `0..2632` etc.) without
matching any new reference ops. Confirmed by debug trace:

```
T2×W3 class=OnFlat - Swaged mask=8 alt=we:swage@we-wend,swage@lw-lend ops=2
T2×W4 class=OnFlat - Swaged mask=8 alt=we:swage@we-wend,swage@lw-lend ops=2
[...]
```

This means: **the action-defs grammar as we have it cannot fire usefully
on interior chord×web crossings without one of:**

(a) Different action-defs grammar slots that we haven't located in
    `Tooling.dll`'s strings (the `RecalcTooling` path likely calls a
    different OperationType-aware code path for interior ops).
(b) A pre-emit transform that rewrites `swage@ww-wend` →
    `swage@ww-anchored-by-tool-length` when the partner is interior.
(c) Per-CopyType (`octRightLow`, etc.) anchored-span semantics that
    aren't yet captured in our op shape (TODO in
    `action-emit.ts:79-82`).

The gap to close is **NOT** the input pipeline (which is now correct).
It's the emit semantics for `wend`/`lend` tokens when the action-def is
applied to an interior crossing.

## Honest assessment vs 100%

**Where we are:** 82.08% on the 9-pair sweep; ~77.45% on the wider
y-pairs corpus.

**Where we'd be with the action-defs path firing correctly on
interior trusses:** still not 100%. The action-defs path could plausibly
gain +3-5pp on TIN/TB2B (the missing 17 LipNotches and 26 InnerNotches in
TIN-70.075 alone are panel-point ops the action-defs grammar should
handle). But the emit-semantics gap above blocks this.

**Where the BIG gains likely live:**
- RP-70.075 at 18.49% is dominated by 996 missing dimples + 741 extra
  dimples — these are 2-15mm position drifts on InnerDimples emitted by
  the legacy path, NOT missing classifications. Fixing this needs
  geometric work in `frame-context.ts` (offset semantics for rotated
  RP plates), not the action-defs path.
- LBW/NLBW at 85-91% have residual gaps in Kb-edge semantics, B2B
  partner detection, and service-hole positioning — also legacy-path
  geometry.

**The action-defs path is foundational infrastructure.** It's correct
where it fires (truss heel/apex chord-on-chord crossings), but the
biggest parity gains aren't in its hot path. The next session should
focus on legacy-path geometry (RP InnerDimple offsets, Kb edge logic)
where parity is well below ceiling.

## What was tested

- 4 new tests in `src/rules/action-defs-pass.test.ts` (16 total): the
  3 expanded test groups verify the new suppression behaviour and the
  truss panel-point smoke test.
- `npm test` — 616 / 616 passing (was 613).
- `npm run build` — tsc clean.
- `node scripts/ab-action-defs.mjs` — 9-pair sweep, no regression.

## Files touched

- `src/rules/action-defs-pass.ts` — MODIFIED. Extended `findCrossings`
  with truss-panel-point branch; upgraded `deriveStickProps` to use
  `findSectionSetup`; added `getSuppressedSet()` env-tunable;
  intersection-type-aware edge mask resolution.
- `src/rules/action-defs-pass.test.ts` — MODIFIED. +3 tests.
- `docs/action-defs-input-pipeline-2026-05-08.md` — NEW. This report.

## Build + tests

```
npm run build  # tsc clean
npm test       # 616 / 616 passing (+3 new)
```

## Env vars (debug + tuning)

- `CODEC_USE_ACTION_DEFS=1` — enable the pass (default OFF).
- `CODEC_ACTION_DEFS_DEBUG=1` — print per-frame stats and class
  distributions to stderr.
- `CODEC_SUPPRESS_ONFLAT=0` — un-suppress wall OnFlat classifications
  (debug only — regresses parity).
- `CODEC_SUPPRESS_OVER_SWAGED=0` — un-suppress chord×web junk classifications
  (debug only — adds 100+ extras to TIN).
