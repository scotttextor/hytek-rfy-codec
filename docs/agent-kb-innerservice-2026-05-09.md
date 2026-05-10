# Agent Kb-IS — Kb InnerService gap closure (2026-05-09)

## Goal

Close the **Kb InnerService missing** gap that Agent SVC documented and Agent
LBW3 confirmed: ~81 missing on HG260044 GF-LBW alone, ~22 on HG260001 PK4
LBW. Build the Kb-on-Service-zline projection rule that Agent CFG plumbed
config for but didn't ship.

## Result

| Corpus    | Master  | After   | Δ         |
|-----------|---------|---------|-----------|
| HG260001  | 88.94%  | 89.42%  | +0.48pp * |
| HG260044  | 90.55%  | 90.74%  | +0.19pp   |
| HG260023  | 84.20%  | 84.60%  | +0.40pp   |

(* Most of HG260001 + HG260023 deltas come from Agent T4's TB2B fix already
on the branch via auto-save. Kb-IS itself contributes ~0pp on HG260001 by
design — the new rule is gated on `projectConfig.kbInnerServiceOffsetExtra
> 0`, which is HG260044-only.)

### Per-plan / per-tool wins (HG260044 GF-LBW)

| Metric                  | Master | After  | Δ    |
|-------------------------|--------|--------|------|
| Parity                  | 93.04% | 93.41% | +0.37pp |
| InnerService missing    | 103    | 77     | -26  |
| InnerService extras     | 19     | 42     | +23 |
| InnerService ref-cov    | 88%    | 91%    | +3pp |

Net `matched` = +26 ops; HG260044 `aggMissing.InnerService` 147 → 115 (-32).

### What was emitted

For HG260044 (`projectConfig.kbInnerServiceOffsetExtra = 19`):

1. **H-Service projection on every Kb (Pattern A formula)**:

       pos = (z_h - z_plate) / sinTheta - 10 + 19

   where `z_plate = stick.end.z` (post-norm plate-attached end). Previously
   the diff harness only emitted this when `(inputFlipped XOR isTopKb) ===
   false`; that gate rejected HG260044 Kb2 sticks (uniform-flipped corpus)
   and missed ~38 IS positions. Migration to the simplifier drops the
   isPatternA gate. Closes ~32 missing IS at z=300 / z=450 horizontal
   service crossings on HG260044 LBW + NLBW Kbs.

2. **V_lower + 1448mm rule on top-attached Kb1**:

       world_z_at_IS = V_lower_z + 1448
       pos = (z_plate - world_z_at_IS) / sinTheta

   Empirical formula: for every Kb1 (top-attached, end.z > start.z) in a
   wall frame with a vertical Service line (V_lower < z_plate), Detailer
   emits a single InnerService at world Z ≈ V_lower + 1448mm. Verified
   ±2mm across 7 HG260044 GF-LBW frames (L2/L7/L9/L14/L20/L21/L22) and
   cross-confirmed against HG260001 PK4 LBW L30 Kb1 (V_lower=489.2, ref
   @874.7 → world_z=1936.8 → world_z - V_lower = 1447.6).

   Gated on `sinTheta < 0.955` (i.e. ≤ 73° from horizontal) to skip
   steeper Kb edge cases (HG260044 L6 sinTheta=0.980, L31 sinTheta=0.972)
   where the formula diverges 4-8mm — emitting on those creates extras
   without earning matches.

   Closes ~13 standard Kb1 missing positions on HG260044 GF-LBW.

## Patterns NOT closed (out of scope or unsolved)

| Case                                         | Count     | Status |
|----------------------------------------------|-----------|--------|
| HG260044 Kb1 with sinTheta > 0.955 (L6/L31)  | ~6        | known gap (gate) |
| HG260044 Kb1 with shorter wall (L12 z=2545)  | ~1        | rule diverges 90mm |
| HG260044 Kb2 V-line crossing (third position)| ~13       | +/-47mm offset, sign per inputFlipped — unsolved |
| HG260001 Kb V-line third position            | several   | same +/-47mm offset issue |
| HG260001 L1/L18 Kb1 IS (different driver)    | ~10       | not the V_lower+1448 pattern |
| L30 HG260001 Kb2 ref ISs at world z 673/846/996 | 3      | non-standard service heights |

## Implementation

- **`src/simplify-wall-service.ts`**: extended to handle Kb sticks alongside
  vertical wall studs. Three new internal helpers:
  - `isKbStick` — name + slope gate.
  - `applicableKbZLinePositions` — Pattern A H-Service formula.
  - `applicableKbVLineTopProjections` — V_lower + 1448 rule for top Kbs.
  Public entry point `simplifyWallServiceInProject` now takes optional
  `projectConfig` parameter.
- **`src/synthesize-plans.ts`**: forwards `options.projectConfig` to
  `simplifyWallServiceInProject` (one-line change at the call site).
- **`scripts/diff-vs-detailer.mjs`**: passes `projectConfig` to
  `synthesizeRfyFromPlans`. Closes the gap that Agent CFG left between
  the harness's per-stick `generateTooling` call (which already received
  `projectConfig`) and the synth call (which previously didn't).

## Validation

- `npm test` — **650/650 passing**, no regressions.
- `node scripts/diff-all-hg260044.mjs` — 90.55% → 90.74% (+0.19pp).
- `node scripts/diff-all-hg260001.mjs` — 88.94% → 89.42% (+0.48pp; mostly
  Agent T4 TB2B).
- `node scripts/diff-all-hg260023.mjs` — 84.20% → 84.60% (+0.40pp).
- HG260001 PK4 LBW parity: 93.68% (was 93.68%, unchanged — gate skips
  HG260001 Kb1 work).
- HG260044 GF-LBW parity: 93.04% → 93.41% (+0.37pp).

## Files changed

- `src/simplify-wall-service.ts` — Kb logic added.
- `src/synthesize-plans.ts` — projectConfig forwarded to simplifier.
- `scripts/diff-vs-detailer.mjs` — projectConfig threaded into synth call.

## Open questions / follow-ups

1. **Kb V-line third position (+/-47mm flip)**: HG260001 Kb2 V crossings
   sit ~+47mm above the formula pos when `inputFlipped=false`, and ~-47mm
   below when `true`. HG260044 follows the inverse convention. The 47mm
   constant is suspicious — possibly related to a stud profile dimension
   (35mm flange + 12mm lip = 47mm). Needs more corpus mining + a
   discriminator that's NOT just inputFlipped (since L30 HG260001 Kb2
   doesn't fit either side).

2. **HG260001 L1/L18 Kb1**: ref @603.1 / @572.0 don't match the V_lower
   + 1448 rule. World Z at ref ≈ 2193-2213 (near top of wall, not the
   1942 expected). Likely a different driver — possibly window-header
   intersection or a bracket-attachment offset. Out of scope for this
   dispatch.

3. **Steep-Kb outlier (sinTheta > 0.955)**: 6 HG260044 Kb1 sticks remain
   missing because the gate skips them. The actual diff is only 5-8mm so
   a finer formula (e.g. variable offset based on V_length) might capture
   them — but every attempt I tried (1450, 1455, ratios) lost wins
   elsewhere or didn't move the needle.
