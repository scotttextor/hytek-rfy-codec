# Action-defs final wire-up — TToolDef integration

**Date:** 2026-05-08
**Outcome:** Foundation committed; flag remains default OFF.
**Wide-corpus delta estimate:** 0pp on the local 8-pair HG260044 + 1-pair HG260001 corpus.

## Summary

The TToolDef table extracted into `docs/cracked/tooldef-table.json` has been wired
into the action-emit pipeline via a new `src/rules/tooldef-table.ts` module.
The action-emit logic now consults the table to authoritatively determine
whether each verb's span is GEOMETRY-driven (LeftFlange / RightFlange — span =
src..dst position pair) or FIXED-LENGTH centred on the crossing
(LipNotch / Swage / InnerNotch / variants).

The wire-up alone does not move parity on the cohorts available locally
(HG260044 + HG260001) because the gains are gated by the
`SUPPRESSED_CLASSIFICATIONS` list and the deliberately-minimal
`findCrossings` scan in `action-defs-pass.ts`. To unlock the TIN/RP-cohort
wins anticipated in the task brief, the next step is widening that scan
and the geometry resolver — outside the scope of "wire the TToolDef table."

A latent bug in `dedupeNearDuplicates` was discovered and fixed: it was
collapsing legitimate duplicate legacy ops (e.g. paired InnerDimples on N
nogs from multi-direction crossings) when the action-defs flag was ON.
The fix replaces global dedup with a `mergeActionDefsOps` pass that only
suppresses action-defs ops that match a legacy op — never legacy×legacy.

## A/B parity table (local corpus, 9 pairs, 16,693 ref ops)

### HG260044 — 8 cohort pairs

| Cohort       | Setup       | OFF cov | ON cov | Δ      | OFF miss | ON miss | OFF extra | ON extra |
|--------------|-------------|---------|--------|--------|----------|---------|-----------|----------|
| LBW-70.075   | F325iT 70mm | 85.11%  | 85.11% | +0.00pp| 1050     | 1050    | 699       | 699      |
| NLBW-70.075  | F325iT 70mm | 91.42%  | 91.42% | +0.00pp| 460      | 460     | 595       | 595      |
| NLBW-89.075  | F325iT 89mm | 89.69%  | 89.69% | +0.00pp| 10       | 10      | 14        | 14       |
| CP-70.075    | F325iT 70mm | 100.00% | 100.00%| +0.00pp| 0        | 0       | 0         | 0        |
| TIN-70.075   | F325iT 70mm | 81.63%  | 81.63% | +0.00pp| 176      | 176     | 64        | 64       |
| TIN-70.095   | F325iT 70mm | 95.15%  | 95.15% | +0.00pp| 13       | 13      | 13        | 13       |
| TB2B-70.075  | F325iT 70mm | 82.31%  | 82.31% | +0.00pp| 66       | 66      | 93        | 93       |
| RP-70.075    | F325iT 70mm | 18.49%  | 18.49% | +0.00pp| 996      | 996     | 741       | 741      |
| **TOTAL**    | —           | 82.08%  | 82.08% | +0.00pp| 2771     | 2771    | 2219      | 2219     |

### HG260001 — 1 cohort pair (LBW-70.075)

| Cohort | OFF cov | ON cov | Δ      | OFF miss | ON miss | OFF extra | ON extra |
|--------|---------|--------|--------|----------|---------|-----------|----------|
| LBW    | 72.83%  | 72.83% | +0.00pp| 2076     | 2076    | 3083      | 3083     |

(Prior to the `mergeActionDefsOps` fix, ON regressed HG260001 LBW by
3 ops — `MATCHED 5565→5562`, `MISSING 2076→2079`. The merge-pass fix
restores parity. See "Latent bug fixed" below.)

## Decision: flag stays default OFF

**Scenario B applied.** The wire-up produces zero measurable wide-corpus
delta. Per the task brief — "TIN/RP gain ≥+5pp without LBW/NLBW losing
more than -1pp" required for Scenario A — neither criterion is met on the
local corpus.

We commit the foundation (`tooldef-table.ts`, the cleaner action-emit
geometry-vs-fixed-length branching, and the safer `mergeActionDefsOps`
pass) so that subsequent work can flip the flag confidently once the
suppression list is widened and the geometry resolver is upgraded.

## Why no gain was observed

1. `SUPPRESSED_CLASSIFICATIONS` excludes the 9 dominant OnFlat-* wall
   classifications. That's the correct conservative posture (the legacy
   OnFlat path is at 85–95% parity already), but it means the new path
   barely fires on LBW/NLBW.
2. `findCrossings` is wall-oriented (`connector.horizontal`, partner roles
   in the wall set). Truss W members crossing chords don't reliably hit
   it, so TIN/RP/TB2B don't get OnEdge action-defs ops.
3. `deriveStickProps` and `deriveFrameFlags` are heuristic ports of
   Detailer's stick-property derivation. Several flags
   (`isHybridFlange`, `secondaryFlag`, `swageClearance`, `forBoxing`,
   `forLayer2`) default to neutral values, so classifyJoint mostly
   returns `OnFlat - Standard` even on cases where Detailer would return
   an OnEdge variant.

The TToolDef wire-up itself is correct — it eliminated a potential
class of bugs around guessing "centred vs anchored" for spanned ops, and
locked in geometry-driven semantics for flange verbs. Verifiable via the
21 new + existing emit tests and the per-cohort A/B numbers (all +0pp,
no regressions).

## What still needs work to unlock the TIN/RP gains

(Outside the scope of this wire-up. Listed for the next session.)

1. **Widen `findCrossings`** to handle non-horizontal connectors (peaked
   truss top chords) and PARTNER_ROLES extension for vertical-V truss
   webs. Currently a chord with even slight pitch is excluded.
2. **Upgrade `deriveStickProps`** — the `secondaryFlag`, `isBoxing` bit
   semantics, `swageClearance`, `isHybridFlange` need real plumbing from
   the section-descriptor data we already have post-decode.
3. **Upgrade `deriveFrameFlags`** — `forBoxing` (BOX/FRAMA), `forLayer2`
   (Over2/Swaged2/Swaged3), `forDualTrack` need plan-name + stick-shape
   derivation. The current implementation only handles the simplest cases.
4. **Edge-mask resolution** — `findCrossings` defaults to `ww=true`
   regardless of the actual web/lip touch geometry. The OnEdge slot
   selection depends on this 4-bit mask being right.
5. **Side-aware emit** for `rl_lipnotch` / `ll_lipnotch` / `rh_lipnotch` /
   `lh_lipnotch` — currently all collapse to plain `LipNotch` with a
   centred span. The corner-side metadata (CopyType in Detailer) maps to
   anchored-span semantics that aren't yet captured in our op shape.

## Latent bug fixed

`dedupeNearDuplicates` (now removed; replaced by `mergeActionDefsOps`)
collapsed ALL near-duplicates in a stick's tooling array, including
two-emit-from-different-directions InnerDimples that Detailer's reference
RFY also has. With the flag ON, this regressed HG260001 LBW by 3
matched-→-missing on N nogs. The new `mergeActionDefsOps` pass operates
strictly action-defs-vs-legacy, never legacy-vs-legacy, preserving
intentional duplicates.

Tests added in `src/rules/action-defs-pass.test.ts`:
- `preserves duplicate legacy ops at the same position`
- `skips action-defs ops with a near-duplicate already in legacy`
- `appends action-defs ops with no legacy match`
- `treats different ToolTypes at the same position as distinct`

## Files touched

- `src/rules/tooldef-table.ts` — NEW. Per-verb opType + lengthMm map.
- `src/rules/tooldef-table.test.ts` — NEW. 7 lookup-table tests.
- `src/rules/action-emit.ts` — MODIFIED. Consults `getToolDef(verb)` for
  geometry-vs-fixed-length branching; legacy semantics preserved.
- `src/rules/frame-context.ts` — MODIFIED. Replaced `dedupeNearDuplicates`
  global dedup with `mergeActionDefsOps` (legacy-preserving merge).
- `src/rules/action-defs-pass.test.ts` — MODIFIED. Added 4 merge tests.
- `scripts/ab-action-defs.mjs` — NEW. A/B sweep harness across cohorts.
- `scripts/baselines/ab-action-defs/` — NEW. A/B sweep results JSONs.
- `docs/action-defs-final-wireup.md` — NEW. This report.

## Build + tests

```
npm run build  # tsc clean
npm test       # 613 / 613 passing (was 602; +11 new tests)
```

## Commit hash

`d1ddb0e` on `master`.
