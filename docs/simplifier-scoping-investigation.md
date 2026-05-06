# Simplifier scoping investigation — RESUME LANDMARK

**Status:** Open. Findings captured 2026-05-06. Picked up later by Scott's request.

**Quick context for resume:** The codec has multiple post-pass "simplifier"
modules in `src/simplify-*.ts`. Each is supposed to fire ONLY on its target
plan type (LIN, RP, TB2B, wall services). But A/B testing shows at least one
(`simplify-rp.ts`) is hurting parity overall. Simplifiers should be **strictly
scoped** — they should only affect linear trusses (or their named target),
NEVER bleed onto other frame types.

## How to pick this up

1. Read this doc + `docs/setup-wiring-audit.md` + `docs/manual-audit.md`
2. Read `scripts/ab-test-simplifiers.test.ts` in `hytek-rfy-tools` (this is
   the exact A/B test that surfaced the issue)
3. Re-run the A/B test:
   ```bash
   cd C:/Users/Scott/CLAUDE\ CODE/hytek-rfy-tools
   AB_TEST=1 npx vitest run scripts/ab-test-simplifiers.test.ts
   ```
   Compare against the baseline numbers in §Findings below.
4. Tackle whichever simplifier needs scoping (start with simplify-rp.ts)

## The 4 simplifiers + their plan-name predicates (as of 2026-05-06)

| Simplifier | Predicate (when it fires) | Status |
|---|---|---|
| `simplify-tin-truss.ts` (FrameCAD calls these "linear" trusses) | `/-LIN-/i.test(planName)` | Scoping looks correct — no `-LIN-` plans in 9-job test sample, no measurable effect |
| `simplify-rp.ts` | `/(?:^|-)RP(?:-|$|\d)/i` | **HURTING parity by -0.8pp** — see findings below |
| `simplify-tb2b-truss.ts` | `/-TB2B-/i` AND `frame.type === "Truss"` | Couldn't measure (no TB2B in 9-job sample); needs separate test |
| `simplify-wall-service.ts` | `/-(N?LBW)-/i` | Marginally helping (+0.6pp) but its strip-then-replace logic is over-eager — see "InnerService bimodal gap" below |

## Findings (A/B test, 9 jobs across 9 builders)

### Test setup
9 jobs from Y: drive, varied builders. Per-job XML run through codec under 5
scenarios. Codec output decrypted and parsed; ops paired with Detailer
reference RFY ops via nearest-neighbour-within-(type,tag).

### Aggregate results (47,699 reference ops total)

```
Scenario                                Exact   Drift5  Drift30   Big   Miss   Extra   True%
baseline (all simplifiers ON)          29,072   5,793   1,125   3,353  8,356  5,094   73.1%
WALL_SERVICE off                       28,858   5,722   1,093   3,438  8,588  5,122   72.5%
RP off                                 29,420   5,821   1,055   3,117  8,286  4,802   73.9% <-- best
TB2B off                               29,072   5,793   1,125   3,353  8,356  5,094   73.1%
ALL simplifiers off                    29,206   5,750   1,023   3,202  8,518  4,830   73.3%
```

### Per-op-type effect of disabling RP simplifier

| Op type | Baseline TRUE | RP-off TRUE | Δ | Note |
|---|---:|---:|---:|---|
| InnerDimple | 16,035 | **16,179** | **+144** | RP simplifier mis-positions 144 dimples |
| LipNotch | 5,840 | **5,956** | **+116** | RP simplifier strips/wrong-emits |
| Swage | 7,193 | **7,309** | **+116** | RP simplifier strips/wrong-emits |
| Chamfer (extras) | **955** | **663** | **-292** | RP simplifier emits 292 spurious chamfers |

So `simplify-rp.ts` is:
1. Over-emitting 292 spurious Chamfers on the test RP plan (HG260043)
2. Mis-positioning 376 ops total

The simplifier was tuned on HG260001 + HG260044 RP plans (Agent L,
2026-05-05). It shipped diff-harness wins on those corpora but does NOT
generalize to other RP plans.

## The InnerService bimodal gap (related)

`simplify-wall-service.ts` is marginally helping overall (+0.6pp) but its
behaviour is **bimodal**:

- HG260010 (small LBW, 170 sticks): Detailer emits 8 InnerService ops total;
  codec emits **323** (~40× over-emit). Codec's static rule fires on every
  wall stud + z-line projection compounds.
- HG260045 (89.075 LBW): Detailer emits 73; codec emits 55 (under-emit).

Net: 2,286 missing + 622 extra across all 9 jobs. Detailer is more
SELECTIVE about which studs get service holes — based on architectural
context (load-bearing zone, opening proximity, header proximity) that the
codec doesn't model.

This is a deeper architectural problem (wall-stud-context detection)
separate from the simplifier-scoping question.

## What "strictly scoped" means

A simplifier is correctly scoped iff:
1. Its plan-name predicate matches **only** its target plan-type
2. Within a matching plan, its frame predicate (if any) is correct
3. Within a matching frame, its stick-role predicate is correct
4. **Disabling it on non-target plans is a no-op**

The A/B test confirms this isn't the case for RP — disabling it changes
behaviour on the LBW plans too (likely because some sticks share name
patterns or position predicates that the simplifier touches).

To verify scoping: for each plan type X, compare codec output WITH simplify-X
ON vs OFF. The diff should be ZERO on all non-X plans, non-zero only on X
plans.

## Files / commits

- A/B test: `hytek-rfy-tools/scripts/ab-test-simplifiers.test.ts` (commit `e92106f`)
- Env-var flags in codec: `synthesize-plans.ts` (commit `e09c889`)
- Multi-job comparison spreadsheet: `tmp_detailer_test/MULTI-JOB-COMPARE-v2.xlsx`
  (per-job sheets + summary + aggregate op-type)
- Per-frame XML extracts (HG260017): `tmp_detailer_test/per-frame-xml/`

## Recommended order of work when resumed

1. **Quick win:** Set `CODEC_DISABLE_RP=1` in production (Vercel env). Costs
   nothing on captured-job RP plans (oracle cache covers them) and improves
   match on novel RP plans like HG260043. ~5 minutes.
2. **Re-investigate `simplify-rp.ts` predicate scoping.** Specifically: what
   ops does it emit that affect non-RP-prefixed sticks within RP plans? The
   116 extra LipNotches and 116 extra Swages it touches when ON suggest its
   stick-role detector is too broad.
3. **Fix WALL_SERVICE bimodal behaviour.** The simplifier needs to know
   WHICH wall studs get service holes — this is architectural metadata not
   currently in `StickContext`. Likely a half-day investigation.
4. **Add `tin-only` regression test:** for every TIN plan in the corpus, run
   the codec WITH and WITHOUT `simplify-tin-truss.ts` enabled. Verify the
   non-TIN-plan output is BYTE-IDENTICAL between the two runs. If not, the
   simplifier is bleeding.
5. **Same regression for TB2B, RP, wall-service.** Each should have a
   "scoped-to-target" test verifying it doesn't affect non-target plans.
