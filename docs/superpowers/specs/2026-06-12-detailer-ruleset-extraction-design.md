# Detailer Ruleset Extraction — Design Spec

**Date:** 2026-06-12
**Author:** Claude (Opus 4.8) + Scott Textor
**Repo:** `hytek-rfy-codec` (work also touches `hytek-rfy-tools`)
**Status:** DESIGN — awaiting Scott's review before writing the implementation plan

---

## 1. Goal

Produce **one file** — `detailer-ruleset.json` — that is the *complete, true* set of
rules FrameCAD Detailer applies when it turns a job XML into a `.rfy` rollformer file
and its `.csv` exports. A standalone, deterministic encoder reads that file and
reproduces Detailer's output **without Detailer running**. A human-readable rulebook
is generated from the same file so the rules can be read and audited.

Detailer is end-of-life. HYTEK must own this ruleset before Detailer dies.

### What "100%" can and cannot mean (verified 2026-06-12)

Two different "100%"s — one is a mirage, one is the real goal:

- **Byte-identical file: impossible, and meaningless.** Detailer regenerates GUIDs +
  timestamps every export (same XML → different bytes), so Detailer doesn't even match
  *itself* byte-for-byte. Op positions are stored as 4-decimal floating-point doubles
  produced by `AutoFrame.dll`'s geometry; last-decimal (0.0001 mm) differences from
  floating-point order-of-operations are unavoidable for any independent engine. None of
  this affects the manufactured steel. We do **not** chase byte-identity.
- **Functional 100% — the real target, achievable:** every operation present, of the
  right type/kind, at the right position to **manufacturing precision** (well inside the
  rollformer's tolerance), on jobs the ruleset was never fit to. This is what makes the
  machine produce identical steel. The honest blocker to this is **not** the tooling
  rule-book (we have it) — it is reproducing `AutoFrame.dll`'s geometry, because that is
  where op positions come from (see §8.5).

### Acceptance bar (measurable)

- **T1 — op-level (RFY):** standalone encoder reproduces Detailer's RFY operations
  op-exact (same type + kind + position within tolerance **AND** matching span
  end-position) on a **held-out** corpus the ruleset was *not* derived from. Two tiers:
  **T1a** position ≤ 1.5 mm (machine-functional); **T1b** position ≤ 0.01 mm
  (geometry-faithful — requires AutoFrame parity per §8.5). Target: T1a ≥ 99.9%, then
  drive T1b → 100% via the convergence loop (§9). Extras and missing each → 0.
- **T2 — CSV:** Detailer expands spanned-tool ranges into per-position cells **at export**
  (verified — *not* downstream Factory firmware, see §8), so the Rollforming CSV is
  reproducible from the RFY/ruleset. Target: **line-exact** CSV, residual limited only to
  op-ordering and ≤ 0.1 mm rounding, both closeable.
- The ruleset carries **provenance per rule** (observed / decoded-from-binary /
  config-derived / both) and is **generalisable** — scored on jobs outside the derivation
  set, never the jobs it was fit to.

---

## 2. The reframe (why prior work plateaued)

Five years of effort split across the team's prior sessions reached ~80% honest op-level
parity (the 93–95% headline is inflated by lenient tolerance, harness-resident magic
constants, and per-job hand-tuned `ProjectConfig`; cross-corpus generalisation scored 0).
The recon panel (2026-06-12, 6 agents, binary-grounded) found the real reason:

**Detailer's inner rule-book is already extracted. The plateau is in the *gating around
it*, which has been guessed instead of captured.**

- `src/rules/action-defs.json` (777 KB, pulled from `Tooling.dll` `.rdata`) already holds
  **27 sections / 346 slots** with a real condition→operation mini-language
  (tokens: `le we mh ew el ee nmh box_l box_r t_bchord b_tchord is90 lt90 gt90 ll_lf …`).
  These are the actual op **recipes**. Provenance is in its `_meta` block.
- What is **not** yet captured, and what every inference pass has been guessing:
  1. **Outer dispatch** — *which* of the 27 sections fires and *which* condition tokens
     are true for a given stick+intersection. This is compiled Delphi code in
     `Tooling.dll` (pipeline classes recoverable by name via intact RTTI:
     `RelationshipClassifier → ToolingClassifier → ActionDefsChooser →
     ToolActions_OnFlat/OnEdge_*`, ~30 emit methods at RTTI offsets 0x189644–0x189A93).
  2. **Condition geometry** — the numeric inputs those tokens test (intersection
     positions, on-edge vs on-flat, 90/<90/>90 angles, `le`/`we`/`mh` edge distances)
     are computed in a **separate** binary, `AutoFrame.dll` (geometry engine: Coord2D,
     InfiniteLine2D, Polygon, Intersection RTTI). `Tooling.dll` has almost no geometry.

- The gap is **wrong-gating, not missing rules.** On HG260001 extras ≈ missing
  (1133 vs 1151): the codec emits about the right *count* of ops but fires the wrong
  recipe or places it wrong. Confirms the lever is the *gating*, not more recipes.

**Conclusion: stop inferring the gating. Capture the true gating two independent ways,
and bind it to the rule-book we already have.**

---

## 3. Architecture — Triangulation

Three derivation tracks feed one ruleset file, validated on held-out data. Each track
already has substantial infrastructure on disk; none starts from zero.

```
                         ┌─────────────────────────────────────────┐
  Track 1: ORACLE        │ controlled multi-stick mini-frame XMLs   │
  (observed truth) ─────▶│  → live Detailer → RFY+CSV → decode      │──┐
  runs on THIS laptop    │  → observed (context → ops) truth table  │  │
                         └─────────────────────────────────────────┘  │
                                                                       ▼
                         ┌─────────────────────────────────────────┐  ┌───────────────────┐
  Track 2: WHITE-BOX     │ action-defs.json predicates DECODED      │  │ detailer-         │
  (executed logic) ─────▶│  + Frida decision-trace (home PC):       │─▶│ ruleset.json      │
  Frida runs on HOME PC  │   classification name + flags + edge-mask│  │ (the brain)       │
                         │   + selected slot  = the true dispatch   │  │                   │
                         └─────────────────────────────────────────┘  │ + generated       │
                                                                       │   rulebook.md     │
                         ┌─────────────────────────────────────────┐  │ + standalone      │
  Track 3: CONFIG        │ .dat (geometry/fixings) + .msup (machine │─▶│   encoder reads it│
  (real parameters) ────▶│  dimensions) + .ftyp (frame→section)     │  └───────────────────┘
  files already located  │  → parameter bindings, not hardcoded mm  │           │
                         └─────────────────────────────────────────┘           ▼
                         ┌─────────────────────────────────────────────────────────────┐
  VALIDATION             │ held-out corpus, span-aware metric, NO per-job hand-tuning   │
                         └─────────────────────────────────────────────────────────────┘
```

Why triangulation beats single-track inference: the **oracle** gives zero-inference
ground truth but is a black-box truth table that doesn't explain *why*; the **white-box**
explains *why* (the executed predicate) so the rule **generalises** to unseen frames; the
**config** supplies real per-profile/per-machine parameters so the ruleset **covers
everything**, not just the two tuned jobs. Each track cross-checks the others: an oracle
observation that contradicts the decoded predicate flags a bug in our decode; a predicate
that the oracle never exercises flags a probe-coverage hole.

---

## 4. The ruleset file — `detailer-ruleset.json`

A single declarative artifact the standalone encoder consumes. Shape (illustrative):

```jsonc
{
  "_meta": {
    "version": "1.0.0",
    "derivedFrom": ["oracle:<corpus-hash>", "tooling.dll:1.0.0.23", "config:<hash>"],
    "detailerVersion": "5.3.5.0 / Tooling.dll 1.0.0.23",
    "heldOutScore": { "opExact": 0.0, "extras": 0, "missing": 0 }
  },

  // The 27 op recipes (already have these — from action-defs.json, normalised)
  "sections": {
    "OnEdge - LipNotchedStandard": {
      "slots": [ { "conditions": ["ee","is90"], "ops": [ /* op recipe */ ] } ]
    }
    // … 26 more, 346 slots total
  },

  // The OUTER DISPATCH — the part we are NEWLY capturing, not guessing.
  // Decision: given a stick + an intersection, which section + which tokens are true.
  "dispatch": {
    "classifierName": "...",           // from Frida joint-classification string
    "rules": [
      {
        "when": { "role":"...", "profile":"...", "intersection":"...", "angle":"90",
                  "edgeMask":"LL|WW", "flags":["param3.bitN"] },
        "select": "OnEdge - LipNotchedStandard",
        "provenance": "frida+oracle",  // observed AND explained
        "confidence": 1.0
      }
    ]
  },

  // The condition predicates, made evaluable from frame geometry we can compute
  "predicates": {
    "ee": "edge-to-edge intersection (def…)",
    "mh": "mid-hole distance = f(geometry)…"
    // decoded from action-defs.json _meta.conditions + AutoFrame geometry semantics
  },

  // Real parameters per profile / machine / frame-type (Track 3) — no hardcoded 70/89
  "parameters": {
    "byProfile":  { "70S41": { "endClearanceSpan": 39, "boxDimpleSpacing": 1200, … } },
    "byMachine":  { "<F325iT-70 GUID>": { … } },
    "byFrameType":{ "89 Truss B2B": { "section":"B2B - Standard", "script":"Truss- Full" } }
  }
}
```

The encoder is a thin, deterministic interpreter: for each stick it computes geometry,
evaluates `predicates`, walks `dispatch` to choose a `section`, applies the section's
matching `slot` ops with `parameters`, and emits RFY ops (and the CSV projection).
**All intelligence lives in the data file; the encoder is dumb on purpose** so the
ruleset is the single source of truth and is auditable.

---

## 5. Track 1 — Oracle probing (start here, this laptop)

**Idea:** instead of mining a few messy real jobs (incidental coverage → plateau),
*design* experiments. Emit many minimal frames, each varying **one frame-level variable**,
run each through Detailer, and read each rule straight off the isolated output. Each
probe's output **is** the rule for that cell — zero inference.

**Critical design constraint (from recon):** context rules fire at the **frame** level,
not the stick level. `InnerDimple`/`LipNotch`/`InnerService`/`Web` are placed at
**crossings between two sticks**; `kbChamferMode`, slab-anchor gating (`frameElevation>100`),
and NLBW asymmetric nog-caps key on frame-level signals. A naive single-stick matrix would
miss exactly the ~5–6% inference already can't get. **Probes are controlled *multi-stick
mini-frames*, varying one frame-level signal at a time** (one crossing geometry, one
opening, one uniform-vs-mixed flip pattern, one elevation band).

**Components (each isolated, testable):**
- `probe/generator.ts` — emits one minimal valid XML per matrix cell into a manifest.
  Axes (from `HYTEK-FRAME-TYPES.json` + machine setups + codec enums): script family ×
  profile (70/75/78/89/104/9010/9012/104055) × usage (TopPlate/BottomPlate/HeadPlate/
  Stud/TrimStud/Nog/Sill/Brace) × length bucket × `flipped` × crossing-type × {elevation
  band, opening present, uniform-vs-mixed} frame-level signals. Generator records the
  exact independent variable per cell.
- `probe/driver` — reuse `hytek-rfy-tools/forge/worker/detailer-worker.py` (single-shot,
  ~45 s/run, exit-code taxonomy) + `forge/orchestrator/detailer-orchestrator.py`
  (retry/resume, multi-job). Already proven (374-file cache exists).
- `probe/decode` — reuse `src/crypto.ts` (AES-128-CBC, key `4433bea8…`, IV[0:16]+deflate)
  + `src/decode.ts` to read RFY ops back; CSV captured directly from Detailer export.
- `probe/aggregate.ts` — fold decoded ops keyed by (cell variables) into an **observed
  rule table**: `(context signature) → ops`. This is Track 1's output, fed into the
  ruleset's `dispatch` + cross-checked against Track 2.

**First validation step:** strip `HG260001-LBW-INPUT.xml` to one plan + one frame +
(1 TopPlate + 1 BottomPlate + 2 Studs + 1 Nog), run it, decode, and confirm the per-crossing
ops match the same sticks in the full job — proving a tiny frame reproduces context ops in
isolation before scaling the matrix.

**Risks:** Detailer license activates only **off-VPN**; GUI automation is somewhat brittle
(historically needed Save-dialog fixes). Mitigation: run unattended overnight via the
orchestrator's retry/resume; checkpoint the manifest so runs are resumable.

---

## 6. Track 2 — White-box gating (home PC, x64)

Turns Track 1's black-box truth table into **explained, generalisable** rules, and recovers
the dispatch **order** pure observation can't see.

**2a — Decode `action-defs.json` predicates (can start on this laptop, no Detailer):**
map each condition token (`le we mh ew el ee box_l t_bchord is90 lt90 gt90 …`) to an
executable predicate over computable frame geometry, using `action-defs.json _meta.conditions`
cross-referenced with `Tooling.dll` RTTI enums (`TIntersectionType`, `ctInnerWeb/ctLeftLip/
ctCenter/ctDontCare`, `TOpCopyType`, `TChamferOverrideType`) and `docs/detailer-rule-decoded.md`.

**2b — Frida decision-trace (home PC, x64 — Frida can't reliably inject the 32-bit x86
target on this ARM64 laptop):** the hook is **already written** —
`scripts/frida-dump-actiondefs.js` (660 lines) hooks `ApplyRule` (RVA 0x145b94),
`MakeOperations` (0x145af8), `LookupActionSection` (0x120cc8), and walks the
`ActionDefsManager` dictionary. RVAs are **validated against the installed v5.3.5.0**
(Tooling.dll stayed at 1.0.0.23 — no offset drift). Run it end-to-end to capture, per
crossing, the executed tuple: **edge-mask (LL/LW/WL/WW bytes) + `param_3` flag bits +
joint-classification name + selected action slot**. Extend the stub to also log the
classifier (`RealClassifier` FUN_00538b00 @ 0x138b00) output string + `param_3`. Join back
to named sticks via the existing record hook for unit-testable ground truth.

**2c — `AutoFrame.dll` geometry (only if predicates can't be evaluated from our own
geometry):** the condition inputs are produced upstream in `AutoFrame.dll`. We first try to
**recompute** the needed geometry ourselves (we already place crossings in
`frame-context.ts`). Only if a predicate proves to depend on geometry we can't reproduce do
we RE the specific `AutoFrame.dll` intersection/classification routine. This is a
*contingency*, scoped to specific predicates, not a blanket second decompile.

**Output:** the `dispatch` + `predicates` blocks of the ruleset, with `provenance` showing
which rules are confirmed by *both* Frida (executed) and oracle (observed) — the gold tier.

---

## 7. Track 3 — Config surface wiring

Makes the ruleset cover all profiles/machines/frame-types instead of hardcoded 70/89 mm
constants (the codec currently reads almost no setup data; `setup-wiring-audit.md` shows
nearly every numeric is hardcoded).

- **`.dat`** (Structure-side): decoder `hytek-budget/scripts/decode_dat_final.py`
  (XOR `08 01 09 05`, CRLF-reset, leading-comma); decoded plaintext
  `FC_Textor_Qld.decoded.dat` (33 sections: truss geometry/shape, general fixing,
  materials). Self-describing column headers. → geometry/fixing parameters.
- **`.msup`** (10 live machine setups at `AppData/Roaming/FRAMECAD/Detailer/Version 5/
  Machine Setups/*.msup`, decoded to `HYTEK-MACHINE-TYPES.json`) → per-machine tool
  dimensions.
- **`.ftyp`** (38 plain-JSON frame types) → the **selector** binding each frame type to its
  `DefaultToolingFile` (= an `action-defs.json` section name), `DefaultScriptName`,
  `DefaultMachineSetupGUID`. This is the previously under-exploited link that ties a frame
  type to its exact rule-book section.

**Output:** the `parameters` block (byProfile / byMachine / byFrameType) + the frame-type→
section selector that seeds `dispatch`.

---

## 8. CSV — reproducible (Factory ceiling REFUTED, verified 2026-06-12)

Scott wants RFY **and** CSV. The earlier worry that the CSV's punch columns are produced by
FrameCAD **Factory** firmware (and therefore unreachable) was **investigated and refuted**:

- **Detailer expands the spanned tools at CSV export, itself.** VERIFIED on real paired
  files: in the RFY, a `Swage` is stored as the range `0–39`; in Detailer's exported CSV it
  appears as the single position `27.5`; `LipNotch 1303–1348` → `1325.5`. The expansion is
  **tool-length tiling** (place a punch every tool-length across the span, offset by the
  machine setup's clearances), a clean deterministic rule — not firmware magic. The FrameCAD
  manual passage cited before describes the *rollformer runtime* (RFY → physical steel), a
  different stage than CSV export.
- **Already close:** `rfy-to-csv` on `GF-CP-70.075.rfy` is **17/23 rows byte-identical**
  today via `src/csv.ts` `SPAN_RULES`. Residual differences are only **op-ordering at the
  same position** and **≤ 0.1 mm rounding** — both closeable. Known cheap wins: add the
  missing `LEFT LEG NOTCH` / `RIGHT LEG NOTCH` labels (332 + 75 occurrences, currently
  absent from `TOOL_TO_CSV`) and the elevation-midline geometry columns.

**So:** the CSV target is **line-exact**, reachable from the same ruleset + the tiling rule
(`File → Export → Rollforming CSV`). It does **not** need a Factory model. CSV shares the
RFY's positions, so it inherits the §8.5 geometry dependency but nothing worse.

## 8.5. The real ceiling — `AutoFrame.dll` geometry (this is the long pole)

The honest blocker to functional 100% is **not** the tooling rules. It is that op
**positions** are computed by `AutoFrame.dll`'s 2-D geometry (line/line intersections,
on-edge vs on-flat projection, angle and edge-distance math), then the tooling rules place
ops at offsets from those positions. Best-case current parity is ~95% even at a generous
1.5 mm tolerance — that residual is geometry/gating divergence, not rounding. To reach
functional 100% we must reproduce that geometry faithfully. Two ways, in priority order:

1. **Recompute it ourselves (preferred — keeps the file Detailer-free).** We already place
   crossings in `frame-context.ts`; the work is to make that geometry *match AutoFrame's*.
   The oracle gives the true position for every case (so we can verify), and the Frida trace
   exposes which classification/edge-distance AutoFrame computed (so we can match the math,
   not guess it). Most of this is ordinary deterministic 2-D geometry and is reproducible to
   well under machine tolerance; the convergence loop (§9) drives the residual to zero.
2. **RE the specific `AutoFrame.dll` routine (contingency).** If a particular position
   proves to depend on geometry we genuinely cannot reproduce from the input + config, we
   reverse-engineer *that* routine specifically (RTTI is intact: Coord2D / InfiniteLine2D /
   Polygon / Intersection). Scoped to the failing predicate, not a blanket second decompile.

The oracle is **not** a permanent crutch: it is the *teacher* during development (it judges
every job and supplies ground-truth positions). The deliverable is a file that computes
positions itself and needs no Detailer at run time.

---

## 9. The convergence loop — how 100% is actually reached

You cannot *prove* up front that you have captured every rule. You reach 100% by letting
Detailer find every case you are still wrong on, then extracting the true rule behind each.
The loop, with Detailer as judge and the binary trace as teacher:

1. The standalone encoder produces an RFY (+CSV) from a job's XML.
2. Run the **same** XML through the oracle; diff op-by-op (span-aware, position-tiered).
3. **Every mismatch is a rule we have wrong or missing** — Detailer reported it for free.
4. For each mismatch, the Frida trace (and/or a targeted oracle probe) shows Detailer's
   **actual** decision/geometry for that exact stick → the true rule, not a guess.
5. Fix the rule **structurally** in `detailer-ruleset.json` (so it generalises) — never
   memorise the single case.
6. Repeat across an ever-growing corpus until the file matches Detailer on **held-out** jobs
   with **zero** mismatches for *K* consecutive rounds (loop-until-dry).

This converges (rather than playing whack-a-mole) precisely because each fix is the real rule
from Detailer's own code/execution, not an inference. This is the engine that turns "most
rules" into "all the rules".

## 9b. Validation — making "complete" provable

Per the recon, the current 93–95% is overfit. The validation harness must:
- **Hold out** jobs: derive the ruleset on corpus A, score on corpus B it never saw.
- **Tighten the metric:** op-exact = type+kind+pos ≤ 1.5 mm **AND** matching span end-pos
  (today `diff-vs-detailer.mjs` ignores span length); remove harness-resident LIN magic
  constants and per-job `ProjectConfig` hand-tuning from the scored path.
- **Bucket every non-match** as missing-rule / wrong-gate / position-drift / over-emission,
  so we can see the triangulation closing the *wrong-gate* bucket specifically.
- Reconcile the baseline-number discrepancy (default vs "full" HG260044: 94.91% vs 83.12%)
  and adopt the honest "full" portable number as the headline.

---

## 10. Components & isolation (one job each)

| Unit | Purpose | Depends on |
|---|---|---|
| `probe/generator.ts` | emit minimal mini-frame XML per matrix cell | frame/machine catalogues |
| `probe/run` (reuse worker/orchestrator) | drive Detailer → RFY+CSV | licensed Detailer (off-VPN) |
| `probe/aggregate.ts` | decoded ops → observed (context→ops) table | `decode.ts`, `crypto.ts` |
| `whitebox/decode-predicates.ts` | tokens → evaluable predicates | `action-defs.json`, RTTI enums |
| `whitebox/frida-trace` (reuse hook) | executed dispatch tuple | x64 home PC, licensed Detailer |
| `config/load-dat.ts` `load-msup.ts` `load-ftyp.ts` | real parameters + selectors | decoded config files |
| `ruleset/assemble.ts` | merge 3 tracks → `detailer-ruleset.json` + provenance | all of the above |
| `encoder/interpret.ts` | dumb deterministic encoder reads ruleset → RFY+CSV | `detailer-ruleset.json` |
| `rulebook/generate.ts` | render ruleset → human-readable `rulebook.md` | `detailer-ruleset.json` |
| `validate/score.ts` | held-out, span-aware scoring + gap buckets | held-out corpus |

Each unit has a clear interface and is testable in isolation. The encoder and the rulebook
generator both read *only* `detailer-ruleset.json`, so the file is the single source of truth.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Detailer license needs off-VPN | Run oracle unattended off-VPN; orchestrator retry/resume; do it before EOL |
| Frida x86-on-ARM64 injection fails on laptop | Run Track-2b on x64 home PC (proven there); Track-2a predicate decode runs anywhere |
| Context rules don't fire on tiny probes | Probes are multi-stick mini-frames varying ONE frame-level signal; validate against full-job sticks first |
| Predicates need `AutoFrame.dll` geometry we can't recompute | Try our own crossing geometry first; RE only the specific routine if blocked |
| CSV spanned columns (Factory ceiling) | Scope CSV to structural columns; document the boundary; don't claim byte-exact |
| Overfit / no generalisation | Held-out corpus is mandatory; no per-job hand-tuning in scored path |
| Cross-app damage (Scott's standing rule) | All work in `hytek-rfy-codec`/`hytek-rfy-tools` only; no edits to shared DB/sibling apps |

---

## 12. Phasing (sequenced, oracle-first)

1. **P0 — Foundations (laptop):** rebuild codec, regenerate honest baselines, stand up the
   held-out validation harness + tightened metric. Establishes the true starting number.
2. **P1 — Oracle smoke + minimal probe (laptop):** prove a tiny mini-frame reproduces
   context ops; build `probe/generator.ts` for one script family.
3. **P2 — Oracle matrix sweep (laptop, unattended):** scale the matrix; aggregate the
   observed rule table.
4. **P3 — Predicate decode (laptop):** decode `action-defs.json` tokens → predicates;
   assemble first `detailer-ruleset.json` (sections + parameters + observed dispatch);
   wire the dumb encoder; score on held-out.
5. **P4 — Frida dispatch capture (home PC):** run the existing hook; merge executed-tuple
   provenance; close the wrong-gate bucket; re-score.
6. **P5 — Config wiring + CSV structural:** bind `.dat`/`.msup`/`.ftyp` parameters; finish
   CSV structural columns; generate the rulebook.
7. **P6 — Hardening:** held-out score to target; reconcile baselines; document Factory/CSV
   boundary; freeze ruleset v1.

Each phase is independently shippable and improves the standalone ruleset file.

---

## 13. Out of scope (YAGNI)

- Byte-identical RFY (GUIDs/timestamps regenerate per export; pointless — see §1).
- Bit-exact last-decimal (0.0001 mm) position match (below machine tolerance; §1/§8.5).
- Modelling FrameCAD Factory rollformer-*runtime* firmware (RFY → physical steel). NOTE: the
  CSV export is **not** Factory's — Detailer does it (§8) — so CSV is *in* scope.
- The separate uncracked `sections.xmlx`/`steelspecs.xmlx` AES cipher (superseded by
  `.msup`).
- GUI `ScriptsX/*.vbsx` geometry (panel layout — not tooling rules).
- Re-running the abandoned single-track inference approach.
