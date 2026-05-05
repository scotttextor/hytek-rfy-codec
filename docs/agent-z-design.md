# Agent Z — setup-data wiring design

**Date:** 2026-05-05
**Inputs:** `docs/setup-wiring-audit.md` (Section 4 Top 5)
**Goal:** Make the codec's rule layer consume `MachineSetup` data instead of
hardcoded 70/89mm constants, so 75/78/90/104mm setups produce correct numerics.

## Architecture choice — Option (a): thread `setup` through `StickContext`

The audit recommends Option (a): add `setupContext?: MachineSetup` to
`StickContext`. Verified by reading the call graph:

- `applyRule` / `applyRules` (rules/engine.ts) consume a `StickContext`
- `RULE_TABLE` rules in `rules/table.ts` reference module-level constants
  (`SPAN_70 = 39`, `DIMPLE_OFFSET_70 = 16.5`, etc.). To unfreeze these we need
  per-call data — the rules table is built once at module load.
- `generateFrameContextOps(frame)` is invoked from
  `synthesize-plans.ts:683` (inside `computeFrameContextOps`). The frame is a
  synthetic `RfyFrame` constructed from a `ParsedFrame`. Setup needs to flow
  in alongside the frame.

### Plan

1. **Resolve setup PER FRAME**, not project-wide. The current
   `synthesize-plans.ts:397` resolution uses `project.plans[0].frames[0].sticks[0]`
   which is wrong for multi-profile projects (audit Section 5.H).
   Helper: `getMachineSetupForProfile(stick.profile.web)` per frame's first
   stick. Falls back to default 70mm when web is unknown.

2. **Thread into rule engine via a new optional anchor type AND/OR per-rule
   spanLength functions.** The cleanest minimal change: add a new optional
   `spanLengthFn(ctx)` already exists, and
   `Anchor` already supports formula-based offsets via the offset field.
   Approach: extend `OpRule` to allow `anchor.offset` and `spanLength` to be
   either a number OR a `(setup) => number` resolver — but this complicates
   the engine.
   **Better:** add `setupContext?: MachineSetup` to `StickContext`. Rule
   functions (`spanLengthFn`, `predicate`) already receive `ctx` so they
   can read `ctx.setupContext` directly. Per-rule numeric constants stay
   hardcoded for legacy rules; we only convert rules that have a known
   setup-derived formula by switching their static values to a
   `spanLengthFn` (or new `offsetFn` for anchors).

   Actually the simplest path that preserves all existing
   rule-table semantics while making them setup-aware:
   - Add `setupContext?: MachineSetup` to `StickContext`.
   - For rules whose anchor.offset OR spanLength is a setup-derived
     value, replace the static value with a function-based form. Engine
     supports `spanLengthFn(ctx)` already; for anchors I'll add an
     `offsetFn(ctx)` alternative on the relevant anchor variants.
   - Or simpler: write per-group rule constructors that close over
     a captured setup. But the rule table is module-scoped, not
     per-call. So function-based.

   **Decision:** simplest mechanical change — add `setupContext` to
   `StickContext`, and switch the SPAN/DIMPLE/internalSpan constants to
   call helpers using `ctx.setupContext` at apply time. To avoid
   plumbing every anchor offset, introduce a small extension to
   `Anchor`/`OpRule`: optional resolver functions
   `spanLengthFn(ctx)` (already exists) and an `offsetFnSetup`-style
   function. Look at engine.ts: anchors with `offset` are static; we'd
   need to expand `generatePositions` to call a function. Audit shows
   we have ~80 sites referencing SPAN_70 — too many to convert
   individually. Instead, keep the constants but **resolve them lazily
   per-rule via a `resolveAnchorOffset(anchor, ctx)`** that, when the
   anchor's offset matches a known sentinel value (e.g. SPAN_70 = 39),
   re-derives from the helper. That's hacky.

   Actually the cleanest: rules are structured as data; offsets that
   today say `offset: SPAN_70` mean semantically "start at end-clearance
   span". The right thing is to make rules say
   `offset: { kind: "endClearanceSpan" }` — a tagged-type that resolves
   at apply time. But that's a 50-site refactor.

   **Practical decision (minimum viable):**
   - Add `setupContext?: MachineSetup` to `StickContext`.
   - Resolver helper at the top of `rules/table.ts`:
     `function spanFor(ctx)` returns `endClearanceSpan(ctx.setupContext) ?? 39`.
   - Rules that semantically take SPAN_70 or SPAN_89 are converted to use
     `spanLengthFn: spanFor` (instead of static `spanLength: SPAN_70`).
   - For anchor offsets matching DIMPLE_OFFSET_70: switch to
     `anchor: { kind: "startAnchored", offset: 16.5 }` ⇒
     extend Anchor to support `offsetFn(ctx)`. Add the new shape.

   This converts the ~80 SPAN_70 sites in one mechanical pass (regex
   replace `spanLength: SPAN_70` → `spanLengthFn: spanFor`), and the
   ~50 DIMPLE_OFFSET_70 sites (regex replace
   `offset: DIMPLE_OFFSET_70` → `offsetFn: dimpleOffsetFor`).

3. **For frame-context (`generateFrameContextOps`)**, the function takes
   `RfyFrame` only; the synthetic frame already has stick profiles. Add an
   optional `setupContext?: MachineSetup` param. Pass it from
   `computeFrameContextOps`. Inside the function, helper-resolve
   `internalSpan = lipNotchToolLength(setupContext) - 3` and the related
   constants once at top.

4. **For `simplify-tb2b-truss.ts` BOX_DIMPLE_SPACING** — the simplifier
   already has the frame; resolve setup from frame.sticks[0].profile.web at
   the top of `simplifyTb2bTrussFrame`.

## Risk callout — wiring #6 (minimumTagLength)

Audit explicitly flags wiring #6 as risky: wall LipNotch merge gap is
hardcoded `12`, while `setup.minimumTagLength = 20`. Switching wall to 20
will MERGE more notches and is likely to regress wall parity, because the
12 may be empirically tuned. **Skip wiring #6 for this dispatch.** Top 5
only.

## Per-wiring approach (revised — pragmatic minimum)

The `RULE_TABLE` in `rules/table.ts` is a module-scoped data structure with
~80 references to `SPAN_70` / `SPAN_89` and ~50 to `DIMPLE_OFFSET_70` /
`DIMPLE_OFFSET_89`. Each rule group has a hardcoded `profilePattern` of
either `^70S41$` or `^89S41$` — so by construction, rules in the 70-group
ONLY see 70mm sticks, and rules in the 89-group ONLY see 89mm sticks.
This means:

- The 70mm rules' `SPAN_70 = 39` is correct iff `endClearanceSpan(setup70)`
  is 39. For HYTEK setup[2] this evaluates 35 + 4 = 39. ✓
- Same for SPAN_89, DIMPLE_OFFSET_70, DIMPLE_OFFSET_89.

For 75/78/104mm to work, the rule TABLE itself needs new groups whose
profilePattern matches those profiles. Until those groups are added, threading
a runtime setup through the existing 70S41 / 89S41 groups changes NOTHING
(the groups won't ever fire on a non-70/89 stick).

**Decision:**

- **Wirings #1 + #2 (rules/table.ts):** convert the module-level constants
  to evaluate from helpers using the canonical 70mm / 89mm setup at
  module load. This makes the helpers the single source of truth (no
  more hardcoded 39 / 16.5 magic numbers) and surfaces helper bugs early.
  No `StickContext.setupContext` plumbing needed since each rule group
  is profile-locked.

- **Wirings #3 + #4 (rules/frame-context.ts):** these fire on EVERY plate
  in EVERY frame, regardless of profile. Resolve setup once per frame
  inside `generateFrameContextOps` from the first plate's profile. Pass
  inline to helpers. New optional param `setup?: MachineSetup` on the
  function; default-resolve when absent.

- **Wiring #5 (simplify-tb2b-truss.ts):** resolve setup from
  `frame.sticks[0].profile.web` at the top of `simplifyTb2bTrussFrame`;
  use `setup.boxDimpleSpacing` instead of the hardcoded `1200`.

| # | Wiring | Files | Threading |
|---|---|---|---|
| 1 | `endClearanceSpan(setup)` for SPAN_70/89 | rules/table.ts | module-load helper |
| 2 | `dimpleEndOffset(setup)` for DIMPLE_OFFSET_70/89 | rules/table.ts | module-load helper |
| 3 | `lipNotchToolLength(setup) - 3` for internalSpan = 45 | rules/frame-context.ts | new optional setup param on `generateFrameContextOps` |
| 4 | `setup.toolClearance` for `offsetMagnitudeBase = 2.0` | rules/frame-context.ts | same param as #3 |
| 5 | `setup.boxDimpleSpacing` for `BOX_DIMPLE_SPACING = 1200` | simplify-tb2b-truss.ts | resolve from frame's first stick |

## Expected outcome on existing corpora (HG260001/044/023, all 70/89mm)

All five wirings should be NEUTRAL — helpers return the same values as the
hardcoded constants when fed a 70mm or 89mm setup. The ARCHITECTURAL
deliverable is what this dispatch lands. 75/78/90/104mm parity gains aren't
visible in current corpora but will be once those reference RFYs are
captured.

## Commit-per-wiring, validate-per-commit

For each wiring:
1. Land the change.
2. Run all 3 diff-all baselines.
3. If any corpus drops below floor (HG260001 84.71%, HG260044 83.44%,
   HG260023 80.33%), revert and investigate root cause.
4. Push.

## Commit log

| Wiring | Commit | Notes |
|---|---|---|
| design doc | `67fa48f` | Agent Z: design doc for setup-data wiring (Top 5) |
| #1 + #2 | `bcf3aa4` | SPAN_70/89 + DIMPLE_OFFSET_70/89 → helpers (single commit, same constants) |
| #3 | `40ce761` | internalSpan / internalDimpleOffset → lipNotchToolLength(setup) - 3 |
| #4 | `a2386e0` | offsetMagnitudeBase 2.0 → setup.toolClearance |
| #5 | `20ed4e6` | BOX_DIMPLE_SPACING 1200 → setup.boxDimpleSpacing — author intent was a dedicated "Agent Z #5" commit; an automated auto-save commit absorbed the source change with a generic message before manual commit could land. Content is correct. |

All 5 wirings in the audit's Top 5 landed neutrally on the 70/89mm corpora:
HG260001 84.71% / HG260044 83.44% / HG260023 80.33% — exactly at the floors.
Architectural improvements (wirings #3, #4, #5) deliver setup-correct values
on 75/78/104mm setups; wirings #1 + #2 are module-load constants for
profile-locked rule groups so no per-call setup propagation was required.

## Skipped: wiring #6 (minimumTagLength)

Audit Section 4 #6 explicitly flags wall LipNotch merge gap (hardcoded 12)
vs `setup.minimumTagLength = 20` as risky — flipping wall=20 will MERGE more
LipNotches and likely regress wall corpus parity since the 12 is empirically
tuned. Skipped per dispatch instructions.

## Bonus #7 candidate (`W_END_ANCHOR = 35` ↔ Tab.size1)

Audit Section 4 #7: `simplify-tb2b-truss.ts:367 W_END_ANCHOR = 35` could be
wired to `findTool(setup, "Tab").size1`. All HYTEK setups have Tab.size1=35
(invariant) so this is a pure rename — no parity gain or risk. Not landed
in this dispatch but trivial to add later.

## Bonus #10 candidate (per-stick setup resolution)

Audit Section 4 #10: today the project-level `setup` in
`synthesize-plans.ts:397` was dead code (audit Section 5.I). Wiring #3
landed the per-frame resolution at the call site of
`computeFrameContextOps`, which makes the project-level `setup` no longer
dead — it's the explicit fallback when a frame's first stick has no
profile.web. This partially addresses #10. Per-stick (not per-frame)
resolution would require threading setup through `mergeStickTooling` and
each rule-engine call site; not in scope for this dispatch.
