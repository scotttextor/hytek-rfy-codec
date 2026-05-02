# Linear-Truss Simplifier Integration — Design Spec

**Date:** 2026-05-02
**Author:** Scott Textor + Claude (panel-reviewed)
**Status:** Approved for implementation
**Repos affected:** `hytek-rfy-codec`, `hytek-itm`

---

## 1. Context

A standalone post-processor that simplifies FrameCAD's RFY output for HYTEK Linear trusses (89×41 LC system, model M81) was built and tested 2026-05-02. It replaces FrameCAD's offset-cluster BOLT HOLES on web members with a centreline-intersection rule (3×Ø3.8mm holes at 17mm pitch, perpendicular to each stick at every pairwise centreline crossing). On the reference job `2603191 ROCKVILLE TH-TYPE-A1-LT-GF-LIN-89.075` it cuts BOLT HOLES per job by ~38% (1,359 → 837) while preserving all physical-fit ops (TrussChamfer, Flange, PartialFlange, LipNotch, Swage, InnerDimple) byte-for-byte from the source RFY.

The script lives at `hytek-rfy-codec/scripts/simplify-rfy-direct.mjs`. It has never been wired into the production pipeline — `hytek-itm/lib/bundle-server.ts` calls `synthesizeRfyFromCsv()` and writes the synthesized RFY directly. This spec is the integration design.

A 4-lens expert panel (architect, mathematician, strategist, UX) reviewed the work on 2026-05-02. The mathematician surfaced four invariant violations the standalone script doesn't enforce; this spec hardens them.

## 2. Goals

- **G1.** Lift the simplifier from a Node script into a typed, exported function in `@hytek/rfy-codec`.
- **G2.** Wire it into `hytek-itm/lib/bundle-server.ts` behind an opt-in flag, default OFF.
- **G3.** Enforce four invariants currently violated by the standalone script (INV-4 end-zone, parallel-pair handling, apex collision dedup, zero-length stick guard).
- **G4.** Expose the flag as a single toggle in the Pack Builder UI.
- **G5.** Surface every per-frame decision (APPLY / SKIP / FALLBACK) in the post-bundle audit table.
- **G6.** Reach engineering signoff via reproducible tests + reference-corpus diffs before any production run.

## 3. Non-goals (v1)

- Default-ON behaviour. The flag stays OFF until engineering signs off on the centreline-cluster shear-equivalence vs FrameCAD's offset-cluster.
- Auto-clamping bolts that violate INV-4 (the math lens established that clamping moves the bolt onto an adjacent stick's centreline — cure worse than disease). Fall back to source RFY's Web ops for that stick instead.
- Mixed RFY format-version support. Pin to ≥2.12.0; refuse <2.12.0 with a clear error rather than guess.
- Inferring plan name from frame name. Pass `planNameByFrame` map explicitly or refuse to run.
- Per-pack flag. The simplifier gate is profile-based (89×41 LC + 0.75 gauge + `-LIN-` plan + Truss type), not pack-based.
- Non-Linear truss systems (LR, LH, etc.). v1 explicitly handles M81 / Linear / 89-LC only.

## 4. Architecture

```
┌────────────────────────────┐         ┌──────────────────────────┐
│ hytek-itm                   │         │ @hytek/rfy-codec          │
│  Pack Builder UI            │         │                           │
│   ├─ [☐ Simplify LIN]      │         │  src/simplify-linear-truss│
│   └─ Generate Bundle ──────►│         │   ├─ simplifyLinearTrussRfy
│                             │  call   │   ├─ validators           │
│  lib/bundle-server.ts       │ ───────►│   │   ├─ assertEndZone    │
│   line ~99 (after synth)    │         │   │   ├─ handleParallelPair
│                             │         │   │   ├─ dedupApex         │
│  POST /api/generate-bundle  │         │   │   └─ guardZeroLength   │
│   { applyLinear: true }     │         │   └─ types (decisions)    │
└────────────────────────────┘         └──────────────────────────┘
```

The simplifier is **format-domain logic** (RFY XML mutation, point-tool ops, profile rules) — owned by the codec. The hytek-itm integration is one call site; future call sites (offline batch reprocessor, factory CLI) reuse the same export.

Insertion point in `hytek-itm/lib/bundle-server.ts`:

```ts
// Line ~93 — current
const synth = synthesizeRfyFromCsv(csvText, { ... });
splitFolder.file(`${input.jobNum}_${pack.id}.rfy`, synth.rfy);

// After
let rfyBytes = synth.rfy;
if (input.applyLinearSimplification) {
  const planByFrame = new Map<string, string>();
  for (const p of input.bundle.plans) for (const f of p.frames) planByFrame.set(f.name, p.name);
  const result = simplifyLinearTrussRfy(rfyBytes, frames, planByFrame);
  rfyBytes = result.rfy;
  simplifyDecisions.push(...result.decisions.map(d => ({ pack: pack.id, ...d })));
}
splitFolder.file(`${input.jobNum}_${pack.id}.rfy`, rfyBytes);
```

`simplifyDecisions` accumulates across packs and surfaces in `BundleResult.stats.simplifyDecisions` for the UI to render.

## 5. Public API

```ts
// hytek-rfy-codec/src/simplify-linear-truss.ts
import type { ParsedFrame } from "./synthesize-plans.js";

export interface SimplifyLinearTrussOptions {
  /** Default true. False = audit only (returns decisions, no rewrite). */
  rewrite?: boolean;
  /** Frame names to skip even if they pass the 4-layer gate. */
  excludeFrames?: ReadonlySet<string>;
  /** Slack (mm) for centreline-intersection bounds-check. Default 20. */
  intersectionSlackMm?: number;
  /** End-zone exclusion (mm). No bolts within this distance of either stick end.
   *  Default 30. Enforces INV-4 against TrussChamfer cut-zone collision. */
  endZoneMm?: number;
  /** Apex collision tolerance (mm). Two clusters within this distance on the same
   *  stick are merged. Default 17 (= machine bolt-pitch). */
  apexCollisionMm?: number;
  /** Profile/gauge gate. Default: HYTEK Linear 89×41 lipped C, 0.75. */
  profileGate?: {
    web: 89; rFlange: 41; lFlange: 38; lLip: 11; rLip: 11;
    shape: "C"; gauge: "0.75";
  };
}

export interface SimplifyDecision {
  frame: string;
  decision: "APPLY" | "SKIP" | "FALLBACK";
  reason: string;
  modifiedSticks?: number;
  newBoltCount?: number;
  /** Sticks where INV-4 / apex / parallel-pair triggered fallback to source ops. */
  fallbackSticks?: string[];
}

export interface SimplifyResult {
  /** Re-encrypted RFY bytes. Identical to input bytes when no APPLY occurred. */
  rfy: Buffer;
  decisions: SimplifyDecision[];
  appliedFrames: string[];
}

export function simplifyLinearTrussRfy(
  rfyBytes: Buffer,
  frames: readonly ParsedFrame[],
  planNameByFrame: ReadonlyMap<string, string>,
  opts?: SimplifyLinearTrussOptions
): SimplifyResult;
```

`planNameByFrame` is mandatory (the `-LIN-` plan-name gate). Cleaner than overloading `ParsedFrame`.

Re-exported from `src/index.ts`:

```ts
export {
  simplifyLinearTrussRfy,
  type SimplifyLinearTrussOptions,
  type SimplifyDecision,
  type SimplifyResult,
} from "./simplify-linear-truss.js";
```

## 6. Validators

Hardened from the math lens findings.

| Validator | What it catches | Behaviour on violation |
|---|---|---|
| **assertEndZone** (INV-4) | Any emitted bolt where `pos < endZoneMm` or `pos > stickLength − endZoneMm`. Slack-saturated short webs and >70° apex geometry trigger this. | Mark stick as `FALLBACK` — keep source RFY's Web ops for that stick only. The frame's other sticks still receive the new rule. |
| **handleParallelPair** | Stick pairs where `lineIntersection()` denom < 1e-9 (parallel centrelines). Includes back-to-back chord pairs (`B1` + `B1 (Box1)`). | Detect co-linear-within-tolerance pairs (e.g. distance between centrelines ≤ 5mm). Emit synthetic intersection at midspan-overlap. If centrelines are parallel but truly distinct, emit nothing (no junction physically exists). |
| **dedupApex** | Two clusters on the same stick within `apexCollisionMm`. Caused by 3-stick apex >70°. | Merge clusters: keep the one nearer the centreline-of-frame; drop the other. Log fallbackSticks entry. |
| **guardZeroLength** | Stick where `Math.hypot(end−start) < 1e-3` mm. | SKIP entire frame with reason `"zero-length stick {name}"`. Never write `pos="NaN"` to RFY. |
| **frameNameMatch** | RFY's `<frame name>` doesn't match any `ParsedFrame.name`. | SKIP frame with reason `"RFY frame name {n} not in input ParsedFrame[]"`. |
| **rfyVersion** | Decrypted RFY's version element <2.12.0 (or missing). | Refuse: throw `RfyVersionMismatch`. Caller falls back to source bytes. |

Failure mode coverage from the architect's list:

- **Boxed/paired sticks** (`T3 (Box1)`): handled by handleParallelPair (paired box members will be parallel within tolerance) — emit one set of bolts, not two.
- **Non-Truss panels in the same pack:** profile gate catches them; SKIP cleanly without mutating bytes.
- **fast-xml-parser preserveOrder roundtrip drift:** add a roundtrip-equality test (parse→build→parse) on a known-skipped wall; pin `fast-xml-parser` dependency version.
- **Empty frames array** for a pack: no-op, return original bytes.

## 7. UI surface

In `hytek-itm/components/PackBuilder.tsx` header, immediately left of the Generate Bundle button:

```
[ ☐ Simplify linear trusses ]   [ Generate Bundle ]
```

- Default OFF.
- Tooltip: "Reduces BOLT HOLES on -LIN- truss webs by ~38% at chord/web crossings. Engineering signoff required before production use."
- 1 extra tap when opting in.
- Flag flows: checkbox state → request body `applyLinearSimplification` → bundle-server → simplifier.

Post-bundle screen (`/bundle/[id]/result` or equivalent) shows the audit table:

| Frame | Decision | Reason | Bolts before → after | Fallback sticks |
|---|---|---|---|---|
| TN2-1 | APPLY | 12 sticks updated | 76 → 33 | — |
| TN2-2 | APPLY | 11 sticks updated | 71 → 30 | W5 (INV-4 violation) |
| W3 | SKIP | plan "GF-NLBW-89.075" not Linear | — | — |

Audit data lives in `BundleResult.stats.simplifyDecisions` and is rendered client-side from the response.

## 8. Tests

```
hytek-rfy-codec/src/simplify-linear-truss.test.ts
  ├─ positive: 2603191 ROCKVILLE → 1359 → 837 holes; preserved ops byte-equal
  ├─ negative: HG260044 GF-NLBW-89.075 (wall) → SKIP; output byte-identical to source
  ├─ edge zero-length: synthetic XML → SKIP frame, no NaN in output
  ├─ edge parallel chord: synthetic XML with B1+B1(Box1) → handled, ≤1 cluster pair
  ├─ edge 90° apex: synthetic XML → no two ops within 17mm on same stick
  ├─ rfy-version: synthetic <2.12.0 RFY → throws RfyVersionMismatch
  ├─ frame-name-mismatch: empty ParsedFrame array → SKIP all frames, byte-identical
  └─ property: 100 random LIN truss XMLs → ∀ ops: 30 ≤ pos ≤ length−30
```

Plus a roundtrip-equality test: parse → build → parse on `HG260044#1-1_GF-NLBW-89.075.rfy` (a known-skipped wall) — output bytes must equal input bytes.

Plus integration: byte-match against existing diff harness `hytek-rfy-codec/scripts/diff-vs-detailer.mjs` running on the 2603191 reference corpus before and after simplification.

Reference fixtures already cached:
- `memory/reference_data/2603191/` (Linear truss — to be added if not present)
- `memory/reference_data/HG260044/` (panels + B2B trusses — for negative cases)
- New fixture: `hytek-rfy-codec/test-fixtures/synthetic/` for edge cases.

## 9. Rollout

| Phase | Scope | Gate to next phase |
|---|---|---|
| **PR-1** (codec) | Lift `simplifyLinearTrussRfy()` into TS, add 6 validators, all tests passing including byte-match against reference. Flag-gated API only — no UI yet. | All tests green; reference-corpus byte-match diff is clean (only Web-op positions change). |
| **PR-2** (hytek-itm) | UI toggle in Pack Builder header. Audit table on post-bundle screen. Default OFF. | Internal smoke test on test job; audit output reviewed manually. |
| **Engineering review** | Run on 5 reference jobs (mix of Linear trusses + walls). Send simplified RFYs + side-by-side hole-position drawings to HYTEK engineering for shear-equivalence signoff vs FrameCAD's offset-cluster. | Signed acknowledgement that the centreline-cluster meets the structural requirement (FrameCAD shop drawing already states "Minimum 3 fasteners per joint"; engineering must verify position-equivalence). |
| **Production trial** | Operator opt-in on real jobs for 2 weeks. Audit every output. Compare factory rejection rate vs control. | No factory-floor issues; no engineering escalations. |
| **PR-3** | Document, decide whether to flip default ON for `-LIN-` packs. | Scott + engineering joint decision. Flag default change is reversible. |

Rollback at any stage: ship a release that toggles the flag default to OFF. The flag is per-bundle, so any in-flight job can be rebuilt without simplification by re-clicking Generate Bundle.

## 10. Refusals (v1)

- Auto-on default before engineering signs off.
- Silent skips. Every SKIP / FALLBACK must surface in the audit table with a reason.
- Best-effort RFY format-version support — pin to ≥2.12.0, error otherwise.
- Inferring plan name from frame name.
- Per-pack flag granularity (it's profile-based; a per-pack toggle would mislead operators).

## 11. Open questions for engineering review

These don't block PR-1 or PR-2 but must be answered before flipping the flag default:

1. **Shear capacity.** Centreline-cluster vs FrameCAD's offset-cluster — equivalent under typical truss loading? Identical bolt count per junction (3 per stick, 6 per pair) but different geometric arrangement.
2. **Boundary-of-applicability.** Does the rule hold for all Linear truss spans (e.g. very long bottom chords, very steep apex angles)? Math lens flagged collision risk at apex >70°.
3. **Boxed-pair fastening.** Is one set of bolts through the paired chord (B1+B1(Box1)) sufficient, or does each box-pair member need its own fasteners?
4. **Production tolerance.** What's the acceptable hole-position error (mm) at the rollformer? `toFixed(2)` gives 0.01mm precision — verify against machine spec.

---

## File checklist

When PR-1 lands, expect these files in `hytek-rfy-codec`:

- `src/simplify-linear-truss.ts` (new)
- `src/simplify-linear-truss.test.ts` (new)
- `src/index.ts` (modified — add 4 exports)
- `test-fixtures/synthetic/zero-length.xml` + `.rfy` (new)
- `test-fixtures/synthetic/parallel-chord.xml` + `.rfy` (new)
- `test-fixtures/synthetic/apex-90.xml` + `.rfy` (new)
- `package.json` (pin fast-xml-parser version)

When PR-2 lands, expect these files in `hytek-itm`:

- `lib/bundle-server.ts` (modified — line ~99, accept `applyLinearSimplification`, accumulate decisions)
- `app/api/generate-bundle/route.ts` (modified — pass-through flag)
- `components/PackBuilder.tsx` (modified — checkbox + tooltip)
- `components/BundleResult.tsx` or equivalent (modified — render audit table)
- `lib/types.ts` (modified — extend BundleInput / BundleResult.stats)
