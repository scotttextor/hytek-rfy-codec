# LBW Gap Research — HG260023 + Cross-Corpus

**Investigation date:** 2026-05-05 (Agent P)
**Scope:** HG260023 LBW gap closure (4 plans, 1,322 ops missed @ 84.0%
baseline)
**Outcome:** 1 fix landed (89mm wall-W rule, PK3 +16.7pp); 2 hypotheses
investigated; 1 negative result (Swage→LipNotch revert regressed
HG260001).

---

## 1 · 5×5 Frame matrix — actual gap distribution

### HG260023 LBW frames with LOW parity (the prize)

| Plan | Frame | Matched | Missing | Extras | Parity | Dominant gap pattern |
|---|---|---:|---:|---:|---:|---|
| PK5-LBW-70.095 | L36 | 19 | 21 | 21 | 47.5% | 70.095 InnerService position shift (+45mm), Swage→LipNotch swap, 1.2mm length truncation on T1 |
| PK5-LBW-70.095 | L38 | 20 | 20 | 20 | 50.0% | Same as L36 (sister frame, mirrored) |
| PK6-LBW-70.075 | L19 | 8 | 6 | 4 | 57.1% | Kb1+Kb2 cripple-stud Swage end-cap shift |
| PK6-LBW-70.075 | L43 | 12 | 8 | 5 | 60.0% | Short-nog InnerNotch+LipNotch where ref wants Swage |
| PK3-LBW-89.075 | L21 | 95 | 61 | 40 | 60.9% | **89mm wall-W rule missing (FIXED)** + H1 LipNotch ±1.5mm shift + S2/S6/S7 InnerService position |
| PK4-LBW-70.095 | L40 | 216 | 125 | 112 | 63.3% | Mass Swage→LipNotch swap at z~1325 + InnerDimple ±3mm shifts + interior dimples missing |

### HG260023 LBW frames with HIGH parity (the control)

| Plan | Frame | Matched | Missing | Extras | Parity |
|---|---|---:|---:|---:|---:|
| PK6-LBW-70.075 | L44 | 89 | 0 | 6 | 100.0% |
| PK6-LBW-70.075 | L28 | 28 | 0 | 2 | 100.0% |
| PK4-LBW-70.095 | L10 | 44 | 2 | 2 | 95.7% |
| PK4-LBW-70.095 | L29 | 19 | 2 | 2 | 90.5% |
| PK4-LBW-70.095 | L35 | 170 | 25 | 15 | 87.2% |

### HG260001 LBW frames with HIGH parity (cross-corpus control)

| Plan | Frame | Matched | Missing | Extras | Parity |
|---|---|---:|---:|---:|---:|
| PK4-LBW-70.075 | L45 | 6 | 0 | 1 | 100.0% |
| PK4-LBW-70.075 | L12 | 173 | 0 | 9 | 100.0% |
| PK5-LBW-70.075 | L11 | 10 | 0 | 2 | 100.0% |

---

## 2 · Identified discriminators

### 2.1 — 89mm vs 70mm + W-stick role (FIXED 2026-05-05)

**Discriminator:** Plan profile + role + plan type.
- 70S41 + W + LBW/NLBW plan: wall-brace rule (Chamfer + Dimple @10).
- 89S41 + W + LBW/NLBW plan: same rule needed (was missing).
- 89S41 + W + truss/FJ: stud-style (Swage 0..39 + Dimple @16.5).

**Fix:** Mirror 70S41 wall-W rule into 89S41 branch in
`src/rules/table.ts`. Confined to `^W$` + `^89S41$`. No other corpus has
89mm + LBW + W sticks.

**Result:** PK3-LBW-89.075 68.2% → 84.9% (+16.7pp). HG260001/HG260044
unchanged (no 89mm wall-W population to affect).

### 2.2 — Swage→LipNotch swap at mid-wall nog (NOT FIXED — needs deeper signal)

**Pattern:** 80 of 107 Swage-where-LipNotch swaps on studs across 4
LBW plans cluster at midpoint **1303..1348mm** on **2757mm** studs.
Frame examples: HG260001 PK4 L19/S3/S6/S11, HG260023 PK4 L7/S5,
multiple frames in PK4-PK5 across both gauges.

**Root cause:** Codec rule `useSwage = lipNeighbor || !isWallEndStud`
emits Swage on ALL interior-stud nog crossings. Reference data for these
specific 80 cases wants LipNotch (with paired InnerDimple at notch-mid).

**Hypothesis tested:** Revert the 2026-05-04 broadening — keep only
`(isContinuousNog && !isWallEndStud)` so non-continuous nogs go to
LipNotch.

**Outcome (rejected):**
- HG260001: 83.53% → 83.08% (-0.45pp)
- PK4-LBW: 88.2% → 87.5%, PK5-LBW: 86.9% → 85.9%
- PK1-NLBW: 90.5% → 89.9% (NLBW has nogs too, change cascaded)

The broadening DOES capture most nog crossings correctly. Reverting trades
80 LipNotch wins for >100 Swage losses elsewhere. Net negative.

**Refined hypothesis (NOT yet tested):** The discriminator is NOT
continuous-vs-segmented at the wall scale, but **per-row-of-nogs within
the same wall**. A 2757mm wall typically has nog rows at z=1185 (mid)
and z=2200 (header level). Detailer's behaviour:
- `1185mm row` — interior studs get LipNotch (lip clearance for fastener
  installation through the lip surface from outside)
- `2200+ row` — interior studs get Swage

**Evidence supporting:** All 80 swaps cluster at one local-z position
~1325mm = stud-local-pos for the global z=1185 row (since stud bottoms
sit at world-z ≈ 0 + plate offset).

**Evidence to collect:** Pull a single ref RFY frame and dump every nog
on a 2757mm interior stud. Confirm the pattern: top-row Swage,
mid-row LipNotch.

**File pointers for next agent:**
- Rule code: `src/rules/frame-context.ts:696-709` (the nog-crossing
  useSwage block)
- Need to add a `nogZRow` discriminator: classify each nog by its
  world-Z (or stud-local-pos as % of stud length). Probably:
  `localPos / stick.length < 0.6` → LipNotch (mid-row)
  `localPos / stick.length >= 0.6` → Swage (upper rows)

**Risk for the next agent:** This may shake out NLBW too. NLBW has
similar nog rows. Test against PK1+PK2 NLBW after any rule change.

### 2.3 — InnerService position shift (PK4/PK5 70.095 only)

**Pattern:** On 70.095 (gauge 0.95mm) studs, ref InnerService positions
are `@341, @491` instead of `@296, @446`. **Shift = +45mm uniformly.**

Codec emits @296/@446 (the rule in `table.ts:107-118`). 70.075 frames
match correctly with @296/@446. Only 70.095 wants +45mm.

**Hypothesis:** Service-hole height in the ref frame depends on something
plan-specific that's only set on 70.095. Could be:
- Wall storey-height (PK4/PK5 70.095 LBW are upper-floor walls?)
- Different electrical schedule for thicker-gauge walls
- Plan-name suffix encodes the schedule

**File pointer:** `src/rules/table.ts:106-118` — make `296`/`446`
conditional on a per-plan flag. Need to look at the corresponding XML
to see if there's a metadata difference.

**Estimated gain if fixed:** ~80-100 ops on PK4 alone, ~30 on PK5.
Could be ~+1.5pp on HG260023.

### 2.4 — InnerDimple ±3-6mm shifts (PK4/PK5 70.095)

**Pattern:** Mixed delta direction (+4 on L1/B1, -3 on L2/N2 etc).
Frame-specific not profile-specific. Likely tied to specific stud
geometry (B2B partner detection, nog widths).

**Not actionable at this scope.** Would need per-frame geometric
inspection.

---

## 3 · What's left on the table for HG260023 LBW

| Issue | Estimated gain | Risk | Difficulty |
|---|---:|---|---|
| **Swage→LipNotch nog-row discriminator** (2.2 refined) | +1.5pp HG260023, +0.5pp HG260001 | Medium (NLBW cascade) | Need ref frame dump |
| **70.095 InnerService +45mm** (2.3) | +1.0pp HG260023 | Low (gated by plan name) | Need XML metadata inspection |
| **InnerDimple ±3-6mm shifts** (2.4) | ~+0.5pp | High (frame-specific) | Need geom investigation |
| **PK6 short nogs InnerNotch+LipNotch → Swage swap** | ~+0.3pp | Medium | Same root as L17/N1 case |
| **89.075 H1 LipNotch ±1.5mm** | ~+0.2pp | Low | 89mm-specific InnerSpan mismatch |

Total recoverable on HG260023 LBW: estimated **+3.5pp** with the right
rule discriminators.

---

## 4 · Agent H follow-up

Agent H's earlier finding ("end-cap convention differs PER FRAME
INSTANCE") was not directly reproduced here. The HG260023 PK3 89mm wall-W
case turned out to be a **plan-type-level** discriminator (LBW vs truss),
which the codec already encodes via `isWallPlan(ctx)` — just hadn't
wired it into the 89S41 branch.

The ~80 mid-wall nog Swage-vs-LipNotch issue (Section 2.2) is the
closest match to Agent H's "per-frame instance" lead. The discriminator
is not strictly per-frame though — it's **per-nog-row within the frame**.
Multiple frames share the same z-row pattern.

---

## 5 · Method notes for next agent

1. The diff harness at `scripts/diff-all-hg260023.mjs` runs cleanly with
   Y: drive mounted. Takes ~90 seconds. Always run all 3 corpora after
   any rule change.
2. The `scripts/baselines/hg260023/raw/` json files are the raw evidence
   — extras + missing per stick. Use Python+regex to tally patterns;
   don't try to read them by hand.
3. Same-shape ops with different positions (e.g. ours `Swage 1303..1348`
   vs ref `LipNotch 1303..1348`) are TYPE swaps — high-signal because
   they show the codec emitted SOMETHING at the right position, just
   wrong tool. Easier to find than missing-no-replacement gaps.
4. Predicate gates in `src/rules/table.ts` operate on `ctx` which has
   `planName`, `length`, `role`, `usage`, `angleFromVertical`, `gauge`.
   These are the available discriminators. Anything else (per-frame
   structural data) needs to be threaded through `ctx`.
5. Frame-context.ts has NO access to plan name. Discriminators that need
   plan-level info must be applied at the per-stick rule level
   (`table.ts`).

---

## 6 · Open question for Scott

Is **gauge** (.075 vs .095) a real engineering discriminator for op
patterns, or is it incidentally correlated with other things (storey,
load class, etc.)? The InnerService +45mm signal is heavily on 70.095.
If gauge directly drives the schedule, we can gate by gauge cleanly.
If it's a proxy for storey-height, we need the upstream metadata.

Reading the manual (`docs/manual-audit.md`) might answer this without a
session.
