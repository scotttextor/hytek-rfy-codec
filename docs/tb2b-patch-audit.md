# TB2B Patch Audit (Agent O, 2026-05-05)

Audit of every TB2B-related post-decode patch in
`scripts/diff-vs-detailer.mjs`. Each patch is classified by which side of the
diff it modifies:

- **(A) CODEC OUTPUT** — modifies `ourDoc.project.plans[].frames[].sticks[].tooling`.
  The codec's actual `synthesizeRfyFromPlans` output does NOT have these
  modifications. Production parity is whatever the unpatched diff would show.
  **Must move to `src/` to ship.**
- **(B) REFERENCE** — modifies `refDoc...`. The codec's output is being
  compared honestly; the harness is just being lenient on reference quirks.
  Architectural cleanup, not correctness.
- **(C) BOTH** — rare.

## Summary

**ALL TB2B patches are TYPE A.** `refDoc` is never mutated anywhere in
`diff-vs-detailer.mjs`. Confirmed empirically: HG260044 PK1-TB2B drops from
**82.31% (with patches) to 1.34% (patches disabled)**. The codec's production
`.rfy` output for TB2B plans is at ~1% parity, not 82%, until this refactor
ships.

## Patch table

| # | Patch | Lines | Side | Action |
|---|---|---|---|---|
| 1 | `TB2B_META` side-channel capture (per-frame stick geometry from XML) | 1489-1508 | A | move-to-src (data-flow setup) |
| 2 | `computeTB2BWebPositions` (pairwise centerline-intersection + chord-corrections + apex-pairs + panel-point +98 pairs + arc-reversal) | 113-538 | A | move-to-src |
| 3 | TB2B chord no-trim (skip 4mm/end EndClearance trim) | 692-707 | A (input-pre-trim) | move-to-src or pre-trim guard |
| 4 | TB2B header no-trim (skip 1mm/end H trim) | 719-722, 726 | A (input-pre-trim) | move-to-src or pre-trim guard |
| 5 | TB2B vertical-W no-extension (skip +11mm lipDepth) | 760-775 | A (input-pre-trim) | move-to-src or pre-trim guard |
| 6 | TB2B diagonal-W no-trim (skip 2mm Kb-style trim) | 776-790 | A (input-pre-trim) | move-to-src or pre-trim guard |
| 7 | TB2B Web@pt rewrite (strip codec ops, push computed positions) | 1539-1734 | A | move-to-src |
| 8 | TB2B box-piece InnerDimple rule (chord-on-chord overlap) | 1544-1686, 1735-1748 | A | move-to-src |
| 9 | R-rail short-cap pattern (LipNotch+LeftFlange+Web @52.2 both ends) | 1749-1779 | A | move-to-src |
| 10 | H4-header cap-stack (RightFlange+LipNotch+LeftFlange+Web @84.3 both ends, two L bands) | 1780-1810 | A | move-to-src |
| 11 | H7-header start-cap-stack (wider RF/LipNotch/LF + dual bolts + Web @L-35) | 1811-1824 | A | move-to-src |
| 12 | Long horizontal B-chord cap-stack (RightFlange+LipNotch+LeftFlange+Web @60 both ends) | 1825-1855 | A | move-to-src |
| 13 | T-chord end-cap bolt rule (HEEL @53.9 + APEX @91.21) (Agent G) | 1856-1886 | A | move-to-src |
| 14 | Final tooling sort by position | 1887-1891 | A | move-to-src |

### Notes on patches 3–6 (input-pre-trim guards)

These run during `buildOurProject()` while parsing the XML, BEFORE
`synthesizeRfyFromPlans()` is called — they modify the `start`/`end`
endpoints fed into the codec. So they DO affect the codec's `.rfy` output
indirectly (different stick lengths → different positional ops). They live
in the harness's XML-parser today, and that XML-parser is duplicated logic
vs the production `framecad-import.ts`. The cleanest move is to gate them
in `framecad-import.ts` so the production import path matches.

For this refactor (Agent O), we'll concentrate on the post-decode patches
(1, 2, 7-14). The pre-trim guards live in a separate code path
(framecad-import not synthesize-plans) and would need a separate refactor
session targeting `framecad-import.ts`. They are noted here as
**deferred follow-up**.

## Production-correctness verdict

The codec's actual `synthesizeRfyFromPlans` output for TB2B plans is at
**~1% parity, not the reported 82%**. Every diff-harness number for TB2B
plans is currently a fiction maintained by post-decode rewrites. After this
refactor, the codec must achieve the diff-harness numbers WITHOUT any
post-decode patches — that's the definition of "rock solid production
parity".

## Scope of refactor

Build `src/simplify-tb2b-truss.ts`:
- `isTb2bPlanName(planName: string): boolean` — exported gate, mirrors `isRpPlanName`/`isTinPlanName`.
- `computeTb2bWebPositions(...)` — port of `computeTB2BWebPositions` adapted
  to operate on `ParsedStick[]` (which already has `start.x/y/z`,
  `end.x/y/z`, `usage`, `flipped`, `name`).
- `simplifyTb2bTrussFrame(frame: ParsedFrame)` — runs the rewrite scope
  (patches 7-14): strip codec ops on truss members, push computed Web@pt
  positions, apply box-piece InnerDimple rule, apply R-rail short-cap rule,
  apply H4 / H7 cap-stack, long-horiz-B cap-stack, T-chord end-cap bolts.
- `simplifyTb2bTrussFramesInProject(plans)` — public entry, called from
  `synthesize-plans.ts` post-pass.

Wire into `src/synthesize-plans.ts` after the `simplifyRpFramesInProject`
line.

## Plan

After src/ implementation (one commit), remove the post-decode patches from
`scripts/diff-vs-detailer.mjs` (one commit). Diff numbers should be
unchanged. The codec's `.rfy` output bytes will then match what the harness
reports.

Pre-trim guards (patches 3-6) tracked as deferred follow-up — they belong
in `framecad-import.ts` not in `simplify-tb2b-truss.ts`.
