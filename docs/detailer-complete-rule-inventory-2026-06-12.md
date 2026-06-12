# Detailer Complete Rule Inventory — every rule, with capture status

**Date:** 2026-06-12. **Basis:** direct reads of `hytek-rfy-codec/src/`, `hytek-rfy-tools/lib/framecad-import.ts`, `action-defs.json` metadata, and prior binary RE (`docs/detailer-rule-decoded.md`, `docs/cracked/`, `scripts/tooling-rev/`). Status per item: ALREADY-CAPTURED / PARTIAL / NOT-YET-CAPTURED. Source = the authoritative origin of the rule.

This is the checklist behind "all the rules Detailer has and does." It pairs with the design spec
`docs/superpowers/specs/2026-06-12-detailer-ruleset-extraction-design.md`.

---

## The single most important finding — two parallel engines

The codec already contains **two** rule engines:

1. **The Detailer-faithful path** (the *real* architecture): `classify-joint.ts` (ports Detailer's
   `RealClassifier`) → `action-defs.json` (the 27 sections / 346 slots / 1162 alternatives pulled
   from `Tooling.dll`) → `action-emit.ts`. This mirrors how Detailer actually works: classify each
   joint, look up its recipe, emit. **But it is switched OFF by default** (`CODEC_USE_ACTION_DEFS`)
   because its *inputs* aren't faithful yet — the geometry (Area 1) and the classifier flags
   (Area 2) are heuristics/stubs.

2. **The empirical production path** (what actually ships): `table.ts` (per-stick rules by
   role × profile) + `frame-context.ts` (hand-derived per-crossing rules) + six `simplify-*.ts`
   plan-family passes. This was hand-tuned against three jobs (HG260001/044/023). It's why parity
   is high on those jobs and ~0 on unseen ones.

**The road to 100% is to make the faithful path's inputs faithful, then retire the empirical path.**
Concretely: fix Area 1 (geometry) and Area 2 (classifier flags), and the classifier-first engine —
which is literally Detailer's own architecture, with Detailer's own recipe table — takes over and
generalises. The recipes (Area 4) are already externalised as data; the bottleneck is feeding the
classifier the right geometry and flags.

---

## Summary — % captured + biggest gap per area

| # | Area | % captured | Single biggest missing piece |
|---|---|---:|---|
| 1 | XML import / geometry build (positions) | ~55% | True `AutoFrame` edge-distances (le/we/mh/ew) + on-edge/on-flat axis test — codec uses a WW-default heuristic instead of real edge geometry. **The long pole.** |
| 2 | Joint classification + `param_3` flags | ~70% names / ~25% flags | Derivation of 10 of 11 `param_3` flag bits from geometry (only `forBackToBack`←TB2B is wired; the rest default false) |
| 3 | Tooling dispatch (which of 27 sections) | ~85% plumbing | The classifier-driven path is OFF by default — can't promote it until Areas 1–2 are faithful |
| 4 | Op recipes (346 slots / 1162 alternatives) | ~75% | `tab`/`WebTabHoles` ops have no codec equivalent; lip-edge (`rl_`/`ll_`) condition flags never plumbed, so OnEdge-LipNotched* slots fall to fallback |
| 5 | Position / parameter rules | ~70% | `62mm` bolt / `8mm` web / `300–450` electrical heights hardcoded with no traced config source; `120mm` web-hole min-separation documented but unenforced; ~40 `.msup` fields parsed-but-unused |
| 6 | Plan-family logic (production path) | ~80% (70/89mm) | Only 70S41 + 89S41 have rule groups (150mm is a guess); B2B stud-pair Web gating criterion unknown |
| 7 | Project / frame-level context | ~75% | `ProjectConfig` polarity flags are per-project stand-ins for section-data flags (IsHybridFlange etc.) Detailer reads natively |
| 8 | RFY serialization / format | ~100% | None structural. GUID/timestamp nondeterminism is inherent + acknowledged |
| 9 | CSV export | ~95% | ~19 raking-RP start-chamfers need outline corner-angle detection |

---

## Area detail

### Area 1 — XML import / geometry build (the inputs every tooling rule branches on)
Detailer's geometry lives in **`AutoFrame.dll`** (intersection positions, on-edge/on-flat, angles,
edge distances). The codec re-derives these from the input XML's `outlineCorners` instead of
replicating AutoFrame — the single biggest approximation seam.
- CAPTURED: RFY/XML decrypt+parse (`decode.ts`, `format.ts`); stick bbox + centerline endpoints
  (`frame-context.ts:47-104`); wall crossing detection (`action-defs-pass.ts:407-455`); multi-hit
  count; stick angle-from-vertical; flipped normalization.
- PARTIAL/MISSING: truss crossing detection is a heuristic; **on-edge/on-flat classification not
  captured** (inferred from role); angle and **edge-distance (le/we/mh/ew) are heuristics defaulting
  to WW-only**. → The faithful geometry is the #1 gap.

### Area 2 — Joint / relationship classification (joint name + `param_3` 11-bit flag mask)
Detailer's `RealClassifier` (`FUN_00538b00`) names each crossing into one of 28 strings, gated by an
11-bit flag mask. Full TS port exists (`classify-joint.ts:191-537`), incl. all 28 names and
`classifyOnFlat/OnEdge/Mixed`.
- CAPTURED: top-level dispatch, `classifyOnFlat` (742-byte dispatcher), the 28 name strings.
- PARTIAL/MISSING: 3 unresolved `DAT_*` string pointers; `FUN_00538aa0` OnEdge byte semantics;
  **10 of 11 `param_3` flag bits are stubbed false** (`forDualTrack/forLipNotchedCorners/forTabbed/
  forWebIntersection/forReversed/…`). Only `forBackToBack`←TB2B is derived. `_DAT_00539828` mask
  unknown. → Needs a **Frida runtime dump** to confirm + then geometric derivation.

### Area 3 — Tooling dispatch (which of the 27 sections fires)
- CAPTURED: name→section lookup; edge_mask→slot (0..15); alternative selection.
- KEY: the whole faithful dispatch is **env-gated OFF**; the legacy `frame-context.ts` ships instead.
  Promoting it to default requires Area 1–2 fidelity.

### Area 4 — Op recipes (`action-defs.json`: 27 sections / 346 slots / 1162 alternatives)
Externalised data from `Tooling.dll .rdata`. 21 condition tokens, 15 action verbs, op grammar
`<verb>@<src><rel><dst>` all mapped (`action-defs.ts`, `action-emit.ts`).
- MISSING: `tab`/`WebTabHoles` ops (header-cap joints) suppressed; side-aware `rl_/ll_/rh_/lh_`
  lipnotch CopyType/corner field collapsed to plain LipNotch; lip-edge condition flags not plumbed.
- Note: Point ops (Bolt, InnerDimple, InnerService, ScrewHoles, Web) and Chamfer are **not** in
  action-defs — they come from Areas 5/6.

### Area 5 — Position / parameter rules (where each op goes + parameter source)
Source split: spans/offsets/tool-lengths from `.msup`; truss geometry from `.dat`; some hardcoded.
- CAPTURED from `.msup`: end-clearance span 39 (`Tab.size1 35 + endClearance 4`); InnerDimple
  end-offset 16.5; LipNotch tool length 48/60/75; internal LipNotch span 45; swage clearances; CSV
  tiling strides. Empirical fits: wall-W end-swage span `39/cosθ + 8·tan²θ`; Kb long-cap span;
  header paired dimple @58.5; web stiffener holes.
- HARDCODED, no traced source: **slab-anchor Bolt @62**, **Web @8**, **electrical heights 300/450**.
- PARTIAL `.dat`: truss web-hole min c-c 120 (documented, **unenforced**); chord centre-hole
  distances; linear-truss web setbacks. ~40 `.msup` tolerance fields parsed but never read.

### Area 6 — Plan-family logic (the production path that actually ships)
Hand-derived per-family passes, tuned to the 3 corpora: LBW, NLBW, RP, TIN(linear), TB2B,
Linear(-LIN-, 4-layer-gated), wall-service, wall-web, CP/MH(partial), FJ. Plus the universal
per-stick `table.ts` (Studs/Plates/Nogs/Kb/W/Rails/Braces).
- LIMIT: only **70S41 + 89S41** have rule groups (150mm is a guess); CP/MH partial; B2B stud-pair
  Web emission disabled (gating criterion unknown).

### Area 7 — Project / frame-level context
Per-frame switches: `kbChamferMode` (xnor-paired vs uniform), `wChamferAngleThreshold` (28°),
`slabBoltOnUpperFloor` (elevation>100 gate), `nogAsymmetricCapMode`, `framePairedHeader`,
ground-floor detection, openings/TrimStud zones. These `ProjectConfig` polarity flags are
per-project stand-ins for section-data flags (IsHybridFlange etc.) Detailer reads natively.

### Area 8 — RFY serialization / format  — SOLVED
AES-128-CBC (key `4433bea8ab8792c07f95b593a06418b0`, IV=bytes[0:16], body=deflate(utf8 xml));
record tree schedule→project→plan→frame→stick→tooling; 14 ToolTypes; per-frame transformation
matrix. GUIDs/timestamps regenerated per export — inherently nondeterministic, acknowledged.

### Area 9 — CSV export  — nearly complete
`TOOL_TO_CSV` label map; span expansion/tiling (offset+stride per type); Float32 position
formatting; same-position ordering (edge priority → type trio); chamfer convention (start −3,
end length+3); dimension columns; role labels; per-frame DETAILS header; FILLER separator rows;
selective start-chamfer emission. Remaining: ~19 raking-RP start-chamfers need corner-angle
detection.

---

## Prioritised path to 100% (what the convergence loop attacks, in leverage order)

1. **Area 1 geometry** — reproduce `AutoFrame`'s on-edge/on-flat + true le/we/mh/ew edge-distances so
   positions and the edge_mask are real, not WW-default. (The oracle gives true positions to verify
   against; Frida exposes the classification AutoFrame computed.)
2. **Area 2 `param_3` flags** — Frida runtime dump to capture the executed flag bits + classification
   name per crossing, then derive each bit from geometry. Resolves the 3 `DAT_*` strings,
   `_DAT_00539828`, `FUN_00538aa0`.
3. **Promote the faithful path** (Area 3) to default once 1–2 hold; begin retiring the empirical
   `table.ts`/`frame-context.ts` rules.
4. **Area 4 residue** — implement `tab`/`WebTabHoles`; plumb lip-edge flags so OnEdge-LipNotched*
   slots fire.
5. **Area 5 parameters** — trace or pin the hardcoded constants (62/8/300/450); wire the unused
   `.msup` fields; enforce the 120mm web-hole separation.
6. **Profiles** — extend rule coverage beyond 70/89mm (75/78/104/150) via the oracle probe matrix.

Items requiring a Frida runtime dump to close (decoded but not recovered): the 3 `DAT_0053954c`
classification strings, `_DAT_00539828` mask, `FUN_00538aa0` OnEdge byte semantics, lip-edge
(`rl_/ll_`) flag derivation — all referenced in `docs/detailer-rule-decoded.md:645-671`.
