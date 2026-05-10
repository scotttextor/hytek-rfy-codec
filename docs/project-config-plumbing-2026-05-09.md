# Project-config plumbing — Agent CFG, 2026-05-09

## Goal

Close the project-level Detailer-config blocker that two prior agents (C2 +
SVC, 2026-05-09) hit on Chamfer @end and Kb-InnerService rules. Plumb a
`projectConfig` field through the codec so per-project rule variants can
fire from a single discriminator signal, without forcing a rewrite of the
rule table for every new corpus.

## Result

| Corpus     | Before  | After   | Δ        |
|------------|---------|---------|----------|
| HG260001   | 88.28%  | 88.39%  | +0.11pp  |
| HG260044   | 88.71%  | 89.87%  | +1.16pp  |

### Per-tool gap reductions (HG260044)

| Tool          | Before missing/extras | After missing/extras | Δ missing |
|---------------|-----------------------|----------------------|-----------|
| Chamfer       | 165 / 26              | 20 / 26              | **−145**  |
| InnerService  | 160 / 43              | 147 / 30             | −13 / −13 |

**Chamfer**: 145 missing closed (88% of the gap). Remaining 20 are RP-corpus
non-Kb (out of scope for this dispatch).

**InnerService**: smaller win than projected. The +19mm offset closes the
extras side cleanly (all 13 spurious ours-only positions removed) but the
underlying Kb1 single-position misses (Pattern B Kbs that the harness's
`isPatternA` filter rejects) remain a separate gap. Pattern B mining
deferred — see open questions below.

### HG260001 verification

No regression. `kbFrameUniformFlipped` correctly identifies all 12/12
HG260001 LBW frames as mixed-flipped → falls back to xnor-paired mode →
identical Chamfer behaviour to the pre-CFG baseline. No projectConfig
entry is registered for HG260001, so the +19mm InnerService offset and
14° W threshold do not apply.

## Discriminator signals investigated

Three signals examined in the input XML for each of the 3 reference
corpora (HG260001, HG260044, HG260023):

1. `<framecad_import name="...">`, `<jobnum>`, `<client>`,
   `<drawing_info>` — **no useful signal**. Both HG260001 and HG260044 use
   identical structure, identical `datedrawn` ("05-03-2020"), and the
   only varying field is the literal jobnum/lot identifier.
2. Plan-level `<plan name="...">` — same structure, same naming
   convention. No machine-setup hint.
3. **Per-frame `<flipped>` distribution among Kb sticks** — *the
   discriminator we used*. Counted distinct `flipped` values among the
   frame's Kb sticks:
   - HG260001 GF-LBW: 12/12 frames-with-Kb have **mixed** flipped values
     (size = 2)
   - HG260044 GF-LBW: 21/22 frames-with-Kb have **uniform** flipped
     values (size = 1)
   - HG260044 GF-NLBW: 6/6 frames uniform

The per-frame uniform/mixed signal is the cleanest derivation we found
without machine-setup metadata in the XML. It correctly classifies every
frame in both corpora.

## Schema added

### `ProjectConfig` (new — `src/rules/types.ts`)

```ts
export interface ProjectConfig {
  /** "xnor-paired" (default — HG260001/HG260023 mixed) | "uniform-both-ends"
   *  (HG260044 LBW + NLBW). */
  kbChamferMode?: "xnor-paired" | "uniform-both-ends";

  /** Min angle from vertical for W (wall-brace) Chamfer @start + @end.
   *  Default 28° (HG260001). HG260044 uses 14° to capture short braces
   *  at 14.5°-26°. */
  wChamferAngleThreshold?: number;

  /** Additive term for Pattern-A Kb-InnerService formula. Default 0
   *  (HG260001). HG260044 uses +19mm. */
  kbInnerServiceOffsetExtra?: number;
}
```

### `StickContext` extensions (same file)

```ts
export interface StickContext {
  // ... existing fields ...

  /** True if every Kb stick in the containing frame has the same flipped.
   *  False if mixed. Auto-computed by the diff harness from the input XML. */
  kbFrameUniformFlipped?: boolean;

  /** Per-project Detailer config. Resolved by the caller from XML jobnum
   *  + lookup table. */
  projectConfig?: ProjectConfig;
}
```

### `SynthesizePlansOptions` extension (`src/synthesize-plans.ts`)

```ts
export interface SynthesizePlansOptions {
  // ... existing fields ...
  projectConfig?: ProjectConfig;   // forwarded all the way to rule predicates
}
```

### `resolveProjectConfigFromHints` (new — `src/project-config.ts`)

A small lookup table indexed by jobnum regex. HG260044 is the only
explicit entry today; HG260001 + HG260023 fall through to legacy defaults
on purpose (so the per-frame `kbFrameUniformFlipped` signal can still
take effect for any uniform-Kb frame discovered later).

```ts
{
  matchJobNum: /^HG260044$/,
  config: {
    kbChamferMode: "uniform-both-ends",
    wChamferAngleThreshold: 14,
    kbInnerServiceOffsetExtra: 19,
  },
}
```

Public API surface (re-exported from `src/index.ts`):

```ts
import {
  ProjectConfig,
  resolveProjectConfigFromHints,
  ProjectConfigHints,
} from "@hytek/rfy-codec";
```

## Mode-resolution priority (Kb @end Chamfer)

1. `ctx.projectConfig.kbChamferMode` (caller override) — wins outright
2. `ctx.kbFrameUniformFlipped === true`  → `"uniform-both-ends"`
3. `ctx.kbFrameUniformFlipped === false` → `"xnor-paired"`
4. Default → `"xnor-paired"`

This means:
- HG260044 jobs auto-pick **uniform-both-ends** via the projectConfig
  override (set in the lookup table).
- HG260001/HG260023 jobs (no projectConfig entry) auto-pick the right
  mode per-frame from the XML signal — defaulting to xnor-paired in
  HG260001's case because every frame is mixed.
- Any future job we haven't characterised gets per-frame auto-derivation
  for free, with xnor-paired as the safe fallback.

## How to override from caller

Production users (`hytek-rfy-tools/lib/framecad-import.ts`) will pass
`projectConfig` explicitly when synthesizing:

```ts
import { synthesizeRfyFromPlans, resolveProjectConfigFromHints } from "@hytek/rfy-codec";

const projectConfig = resolveProjectConfigFromHints({
  jobNum: "HG260044",
});

synthesizeRfyFromPlans(parsedProject, {
  machineSetup: ...,
  projectConfig,    // <-- new
});
```

The same config flows to `generateTooling` calls if the caller threads it
through `StickContext.projectConfig`.

## Files changed

- `src/rules/types.ts` — new `ProjectConfig` interface; added
  `kbFrameUniformFlipped` + `projectConfig` to `StickContext`.
- `src/rules/table.ts` — Kb @end Chamfer rule honours mode resolution;
  W @start + @end Chamfer rules (70mm + 89mm) honour the angle threshold.
- `src/project-config.ts` — new `resolveProjectConfigFromHints` lookup
  table.
- `src/synthesize-plans.ts` — added `projectConfig` to
  `SynthesizePlansOptions`.
- `src/index.ts` — re-exports `ProjectConfig`,
  `resolveProjectConfigFromHints`, `ProjectConfigHints`.
- `scripts/diff-vs-detailer.mjs` — resolves projectConfig from XML
  jobnum, computes per-frame `kbFrameUniformFlipped`, plumbs both into
  `generateTooling`. Pattern-A Kb InnerService formula reads
  `projectConfig.kbInnerServiceOffsetExtra`.

## Validation

- `npm test` — **650/650 passing**, no regressions.
- `node scripts/diff-all-hg260001.mjs` — 88.28% → 88.39% (+0.11pp)
- `node scripts/diff-all-hg260044.mjs` — 88.71% → 89.87% (+1.16pp)

## Open questions / follow-ups

1. **Pattern B Kbs** (Agent SVC's gap): the harness's `isPatternA` filter
   rejects half of HG260044's Kbs based on `inputFlipped XOR isTopKb`,
   leaving ~30 Kb1 InnerService positions (one per Kb) unemitted.
   Pattern B's geometric formula was not pinned down — left for a
   separate dispatch. The +19mm shift fixes Pattern-A only.
2. **HG260023 not cached locally** — only HG260001 + HG260044 are in
   `OneDrive/.../reference_data/`. C2's hypothesis that HG260023 PK6 LBW
   has uniform-flipped Kbs (and so wants `uniform-both-ends`) is
   unconfirmed. Add HG260023 reference data and re-run to verify.
3. **W chamfer threshold derivation** — the 14° lower bound was set by
   inspection of HG260044 LBW W angles ({14.6°, 21.5°, 23.5°, 26°,
   27°}). Other corpora may need yet another value (e.g. 12° or 20°);
   the right next step is to mine the angle/Chamfer correlation across
   HG260023 and any future corpus.
4. **HG260044 RP Chamfer (14 missing / 26 extras)** — entirely on
   non-Kb sticks (N/B/T/S). Out of scope for this dispatch but flagged
   as a separate Detailer-config or rule-table issue.
5. **Production wiring** — `hytek-rfy-tools/lib/framecad-import.ts`
   needs to call `resolveProjectConfigFromHints` and pass through
   `projectConfig` to `synthesizeRfyFromPlans`. Today's diff harness
   demonstrates the pattern but production importer hasn't been touched.

## Lessons learned

- The right discriminator was hiding in plain sight: per-frame
  Kb-flipped uniformity. Both prior agents stopped at "this is project
  config we don't have", missing that the project config could be
  *recovered* from the XML by counting flipped values.
- Pinning at the project level (HG260044 → uniform mode) and per-frame
  (kbFrameUniformFlipped) at the same time costs nothing and gives us
  belt-and-braces robustness: even if a project's Kbs go mixed in some
  edge frame, we either honour the per-frame signal (when no override)
  or the explicit override (when set).
- The +19mm InnerService offset was found empirically from one corpus
  pair (HG260044 vs HG260001). It's likely an oversimplification but
  closed enough of the gap to ship; a finer per-Kb-geometry derivation
  is a follow-up, not a blocker.
