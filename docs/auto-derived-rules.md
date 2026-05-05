# Auto-Derived Rules — Agent T (2026-05-05)

Cluster-driven rule derivation across HG260001, HG260044, HG260023 baselines.

## Method

`scripts/cluster-gaps.mjs` reads every per-plan baseline JSON in
`scripts/baselines/{raw,hg260044/raw,hg260023/raw}` and clusters every
missing/extra op by:

```
(plan-frametype × stick-role × tool × kind × gap)
```

Cross-corpus consistent clusters (size >= 5 in ALL 3 corpora) are surfaced for
human review. `scripts/cluster-detail.mjs` drills into one cluster and shows
the position distribution + sample members so we can spot a clean systematic
pattern.

The 16-byte op records in `scripts/catalog/ops_by_frame.json` were inspected
but the binary format only decodes cleanly for `len <= 2` frames. Higher-`len`
frames contain mixed 8-byte doubles + 2-byte type markers + variable padding
that doesn't 16-byte-align. Per the brief's time-box, the deeper binary decode
was deferred — the cluster-mining approach against the existing per-stick
diff baselines turned out to be more directly actionable.

## Rules implemented

### Rule 1 — Short-N (cross-noggin) Swage caps (commit 42ccb5f)

**Cluster:** `NLBW|N|InnerNotch|spanned|extras`, `NLBW|N|LipNotch|spanned|extras`,
`NLBW|N|Swage|spanned|missing` (and the LBW + RP equivalents).

**Confidence:** high. 91/105 short N sticks (refLength <200mm) cross-corpus
showed Detailer wanting Swage where the codec was emitting InnerNotch+LipNotch.
The 14 outliers were all at refLength=164mm (door-head cripple blocks) which
genuinely want Notch caps.

**Length-bucket evidence:**

```
70-150mm:  Detailer wants Swage @start + Swage @end (89/91 mismatched)
164mm:     Detailer wants InnerNotch + LipNotch caps   (14/14 perfect)
170-190mm: Detailer wants Swage @start + Swage @end (14/14 mismatched)
```

**Fix:** narrow the existing "short-N → Notch" rule's lengthRange from
`[0, 200]` to `[162, 168]` so 164mm header-cripples still get Notches and
every other short nog falls through to the long-nog rule (Swage at both ends).

**Result:**
- HG260001 83.53% → 83.66% (+0.13pp / +23 ops)
- HG260044 82.37% → 82.60% (+0.23pp / +39 ops)
- HG260023 78.39% → 78.64% (+0.25pp / +49 ops)

Combined: **+0.61pp / +111 matched ops**.

## Rules investigated but NOT implemented

### Wall-W end-Swage angle-dependence

**Cluster:** `LBW|W|Swage|spanned|missing` (292) + `extras` (292).

**Pattern:** wall-brace W sticks have an end-Swage span that scales with the
stick's angle from vertical. Codec emits a fixed span=41mm; Detailer scales
the span as the W gets more diagonal. Sample reference spans:

```
L4/W1   angle 26.86°  ref span 45.6
L8/W1   angle 26.32°  ref span 45.3
L19/W1  angle 25.53°  ref span 44.7
L33/W3  angle 18.69°  ref span 41.2
L40/W1  angle 39.46°  ref span 56.1
```

**Why deferred:** Implemented `span = 39 / sin(angleFromVertical)` (mirroring
the existing Kb formula at table.ts:178-188), but it regressed HG260023 by 3
ops while only fixing 6 LBW W's. The actual formula does not match
`39/sin(angle)` cleanly — best-fit candidates `41/cos(angle)`,
`39/sin(angleFromHoriz)`, and `41 + tan(angle)*k` all underestimate at high
angles (e.g. 39° gives ref-56 but formula gives 50-53). Reverted in favor of
a known-clean win on the short-N cluster.

**Open queue:** likely needs a 2D elevation-projection of the W's cut at
the end, scaled by both x/y and z components separately. ~+1pp combined if
nailed.

### LBW-S InnerService over-emission

**Cluster:** `LBW|S|InnerService|point|extras` (434, all 3 corpora, position
distribution tightly clustered at exactly @296 + @446).

**Pattern:** the codec emits `InnerService @296 + @446` for every wall stud
with length >= 700mm. Detailer is more selective — within a single LBW
frame, S1-S6 emit IS, but S11+ (door/window jamb studs) do not.

**Why deferred:** the discriminator isn't recoverable from `usage` alone
(some over-emitting sticks are `usage="Stud"`, not `"TrimStud"`). It needs
either world-coord proximity to opening boundaries or stud-row membership
detection, both of which require frame-context the rules engine doesn't
currently thread.

**Open queue:** ~+1pp combined if a clean discriminator is found.

### TIN-W Swage span variability

**Cluster:** `TIN|W|Swage|spanned|missing` (188) / `extras` (152).

**Pattern:** truss webs have Swage spans ranging from 25mm (axis-aligned
short webs) to 127mm (angled long webs). No single formula fits the
distribution.

**Why deferred:** likely depends on truss-geometry (web-to-chord angle +
chord profile) — same angle-dependence as wall-W but with extra terms for
the chord interaction.

### LBW-H LipNotch swap

**Cluster:** `LBW|H|LipNotch|spanned|extras` (346) / `missing` (254).

**Pattern:** codec emits LipNotch with span=50mm at jack-stud crossings
on header H1 sticks. Detailer emits LipNotch with span=59-117mm (paired
jamb LipNotches that span TWO consecutive crossings). Position offsets
and span widths both differ.

**Why deferred:** complex — would need a paired-crossing detection in
`frame-context.ts:530-644` to merge consecutive crossings into a single
wider LipNotch. Agent P investigated similar territory in the LBW gap
research (see `docs/lbw-gap-research.md`).

### Short-N InnerNotch (NLBW)

**Cluster:** `NLBW|N|InnerNotch|spanned|extras` (198) /
`NLBW|N|LipNotch|spanned|extras` (194).

**Status:** mostly resolved by Rule 1 above (the codec no longer emits
Notch caps on short-N's that should be Swage). The residual ~1/3 are 164mm
sticks where the new narrowed rule still fires. Those are correct.

## Infrastructure added

- `scripts/cluster-gaps.mjs` — cross-corpus cluster mining (one-shot).
  Outputs `scripts/baselines/truth-diff/clusters.json` and a top-30 stdout
  summary.
- `scripts/cluster-detail.mjs` — drill into a specific cluster, show
  position distribution histogram + sample members. CLI:
  `node scripts/cluster-detail.mjs <frameType> <role> <tool> <kind> <gap>`

These are corpus-agnostic — they read whatever `scripts/baselines/` contains,
so re-running after a rule commit reflects the latest state.
