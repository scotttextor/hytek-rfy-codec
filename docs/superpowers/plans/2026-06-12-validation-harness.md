# Detailer-Parity Validation Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the span-aware, tiered, gap-bucketing op-diff scorer ("truth meter") that measures how close any generated RFY is to a Detailer reference — the foundation the convergence loop and every later parity claim depends on.

**Architecture:** A pure scoring module `src/validation/op-diff.ts` (no I/O, fully unit-tested) plus a thin CLI `scripts/score-rfy-pair.mjs` that decodes two RFY files and reports tiered parity + gap buckets. The scorer fixes the two flaws the recon found in the existing `diff-vs-detailer.mjs`: spanned ops match on start-position only (span-blind), and non-matches aren't classified by cause.

**Tech Stack:** TypeScript (ESM, `tsc` → `dist/`), vitest, Node 20. Scripts import from `../dist/index.js` (build before running), matching the repo convention in `scripts/diff-vs-detailer.mjs`.

**Scope note:** This is sub-plan 1 of the Detailer-ruleset-extraction project (spec: `docs/superpowers/specs/2026-06-12-detailer-ruleset-extraction-design.md`, §9/§9b). It delivers the *scorer*. Wiring it into the generation pipeline to print the official held-out baseline number is the first task of sub-plan 2 (oracle/generation), because it needs the RFY-generation step that lives in `diff-vs-detailer.mjs`. This plan stays dependency-free (no Detailer, no VPN, no home PC).

---

## File Structure

- `src/validation/op-diff.ts` — **Create.** Pure scorer: `scoreOps(ours, ref, opts)` → matched / extras / missing / gaps / parity. Span-aware matching + 4-bucket gap classification. One responsibility: compare two op lists.
- `src/validation/op-diff.test.ts` — **Create.** Unit tests for matching, tiers, and each gap bucket.
- `src/index.ts` — **Modify.** Re-export the validation module.
- `scripts/score-rfy-pair.mjs` — **Create.** CLI: decode two RFYs, pair frames+sticks by name, aggregate `scoreOps`, print tiered report + buckets, write JSON.
- `scripts/corpus/heldout-manifest.json` — **Create.** The derive/score job split the convergence loop consumes (data only).

---

### Task 1: Span-aware op matching + parity (the core scorer)

**Files:**
- Create: `src/validation/op-diff.ts`
- Test: `src/validation/op-diff.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/validation/op-diff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scoreOps } from "./op-diff.js";
import type { RfyToolingOp } from "../format.js";

const span = (type: string, startPos: number, endPos: number): RfyToolingOp =>
  ({ kind: "spanned", type: type as RfyToolingOp["type"], startPos, endPos });
const point = (type: string, pos: number): RfyToolingOp =>
  ({ kind: "point", type: type as RfyToolingOp["type"], pos });
const edge = (type: string, kind: "start" | "end"): RfyToolingOp =>
  ({ kind, type: type as RfyToolingOp["type"] });

describe("scoreOps — matching & parity", () => {
  it("scores identical op lists as 100% parity with zero gaps", () => {
    const ops = [span("Swage", 0, 39), point("InnerDimple", 16.5), edge("Chamfer", "start")];
    const r = scoreOps(structuredClone(ops), structuredClone(ops));
    expect(r.parity).toBe(1);
    expect(r.matched.length).toBe(3);
    expect(r.extras.length).toBe(0);
    expect(r.missing.length).toBe(0);
    expect(r.gaps.length).toBe(0);
  });

  it("is span-aware: same type+start but different end is NOT a match (old harness bug)", () => {
    const ours = [span("Swage", 0, 39)];
    const ref = [span("Swage", 0, 92)]; // same start, very different end
    const r = scoreOps(ours, ref, { toleranceMm: 1.5 });
    expect(r.matched.length).toBe(0);
    expect(r.parity).toBe(0);
  });

  it("matches a point op that drifted within tolerance, recording drift", () => {
    const r = scoreOps([point("InnerDimple", 17.0)], [point("InnerDimple", 16.5)], { toleranceMm: 1.5 });
    expect(r.matched.length).toBe(1);
    expect(r.matched[0].drift).toBeCloseTo(0.5, 5);
  });

  it("does NOT match a point op drifted beyond tolerance", () => {
    const r = scoreOps([point("InnerDimple", 20.0)], [point("InnerDimple", 16.5)], { toleranceMm: 1.5 });
    expect(r.matched.length).toBe(0);
    expect(r.extras.length).toBe(1);
    expect(r.missing.length).toBe(1);
  });

  it("matches start/end edge ops by type ignoring position", () => {
    const r = scoreOps([edge("Chamfer", "start")], [edge("Chamfer", "start")]);
    expect(r.matched.length).toBe(1);
    expect(r.matched[0].drift).toBe(0);
  });

  it("tiered tolerance: a 0.5mm drift matches at 1.5mm but not at 0.01mm", () => {
    const ours = [point("Swage", 27.5)];
    const ref = [point("Swage", 28.0)];
    expect(scoreOps(ours, ref, { toleranceMm: 1.5 }).matched.length).toBe(1);
    expect(scoreOps(ours, ref, { toleranceMm: 0.01 }).matched.length).toBe(0);
  });

  it("parity is matched/refTotal; empty-vs-empty is 1", () => {
    expect(scoreOps([], []).parity).toBe(1);
    expect(scoreOps([point("Swage", 5)], []).parity).toBe(1); // refTotal 0, nothing to match → 1 by convention
    const r = scoreOps([point("Swage", 5)], [point("Swage", 5), point("Swage", 100)]);
    expect(r.parity).toBeCloseTo(0.5, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/validation/op-diff.test.ts`
Expected: FAIL — `Failed to resolve import "./op-diff.js"` / `scoreOps is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/validation/op-diff.ts`:

```ts
import type { RfyToolingOp } from "../format.js";

/** A successful pairing of one of our ops to a reference op. */
export interface MatchedPair {
  ours: RfyToolingOp;
  ref: RfyToolingOp;
  /** mm distance: max(|Δstart|,|Δend|) for spanned, |Δpos| for point, 0 for edge. */
  drift: number;
}

export interface ScoreOptions {
  /** Match radius in mm. T1a (machine-functional) = 1.5; T1b (geometry-faithful) = 0.01. */
  toleranceMm?: number;
}

export interface OpDiffResult {
  refTotal: number;
  oursTotal: number;
  matched: MatchedPair[];
  /** Our ops with no reference match. */
  extras: RfyToolingOp[];
  /** Reference ops we failed to produce. */
  missing: RfyToolingOp[];
  /** matched / refTotal, in [0,1]. refTotal 0 → 1. */
  parity: number;
  /** Filled by classifyGaps (Task 2); empty here. */
  gaps: GapItem[];
}

export type GapKind = "missing-rule" | "over-emission" | "wrong-gate" | "position-drift";

export interface GapItem {
  kind: GapKind;
  side: "ours" | "ref";
  op: RfyToolingOp;
  partner?: RfyToolingOp;
  distanceMm?: number;
}

const DEFAULT_TOLERANCE_MM = 1.5;

function opKey(op: RfyToolingOp): string {
  return `${op.type}@${op.kind}`;
}

/** Distance between two same-key ops; 0 for positionless edge ops. */
function opDistance(a: RfyToolingOp, b: RfyToolingOp): number {
  if (a.kind === "spanned" && b.kind === "spanned") {
    return Math.max(Math.abs(a.startPos - b.startPos), Math.abs(a.endPos - b.endPos));
  }
  if (a.kind === "point" && b.kind === "point") {
    return Math.abs(a.pos - b.pos);
  }
  return 0; // start/end singletons
}

function matchOps(
  ours: RfyToolingOp[],
  ref: RfyToolingOp[],
  tol: number,
): { matched: MatchedPair[]; extras: RfyToolingOp[]; missing: RfyToolingOp[] } {
  const matched: MatchedPair[] = [];
  const extras: RfyToolingOp[] = [];
  const refUsed = new Set<number>();

  for (const o of ours) {
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < ref.length; i++) {
      if (refUsed.has(i)) continue;
      const r = ref[i];
      if (opKey(r) !== opKey(o)) continue;
      if (o.kind === "start" || o.kind === "end") {
        bestIdx = i;
        bestDist = 0;
        break; // singleton per stick — first same-key wins
      }
      const d = opDistance(o, r);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestDist <= tol) {
      matched.push({ ours: o, ref: ref[bestIdx], drift: bestDist });
      refUsed.add(bestIdx);
    } else {
      extras.push(o);
    }
  }

  const missing = ref.filter((_, i) => !refUsed.has(i));
  return { matched, extras, missing };
}

export function scoreOps(
  ours: RfyToolingOp[],
  ref: RfyToolingOp[],
  opts: ScoreOptions = {},
): OpDiffResult {
  const tol = opts.toleranceMm ?? DEFAULT_TOLERANCE_MM;
  const { matched, extras, missing } = matchOps(ours, ref, tol);
  const refTotal = ref.length;
  const parity = refTotal === 0 ? 1 : matched.length / refTotal;
  return { refTotal, oursTotal: ours.length, matched, extras, missing, parity, gaps: [] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/validation/op-diff.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/validation/op-diff.ts src/validation/op-diff.test.ts
git commit -m "feat(validation): span-aware tiered op-diff scorer (matching + parity)"
```

---

### Task 2: Gap bucketing (classify every non-match by cause)

**Files:**
- Modify: `src/validation/op-diff.ts` (add `classifyGaps`, call it inside `scoreOps`)
- Test: `src/validation/op-diff.test.ts` (add a describe block)

The recon's key finding: extras ≈ missing, so the gap is mostly *wrong-gating / mis-positioning*, not absent rules. Bucketing makes that visible:
- **position-drift** — same type+kind in both, within a wider window (≤ 25 mm) but beyond tolerance → geometry off (the AutoFrame long pole).
- **wrong-gate** — different type at ~same spot (≤ 8 mm), same kind → wrong recipe chosen.
- **over-emission** — our op with no nearby reference partner → spurious rule.
- **missing-rule** — reference op we never produced anything near.

- [ ] **Step 1: Write the failing test**

Append to `src/validation/op-diff.test.ts`:

```ts
describe("scoreOps — gap classification", () => {
  it("flags a same-type spanned op drifted beyond tolerance as position-drift", () => {
    const ours = [span("Swage", 0, 39)];
    const ref = [span("Swage", 5, 44)]; // +5mm, within 25mm window, > 1.5 tol
    const r = scoreOps(ours, ref, { toleranceMm: 1.5 });
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0].kind).toBe("position-drift");
    expect(r.gaps[0].partner).toBeDefined();
    expect(r.gaps[0].distanceMm).toBeCloseTo(5, 5);
  });

  it("flags a different-type op at the same spot as wrong-gate", () => {
    const ours = [point("Swage", 16.5)];
    const ref = [point("LipNotch", 16.5)]; // same pos+kind, different type
    const r = scoreOps(ours, ref, { toleranceMm: 1.5 });
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0].kind).toBe("wrong-gate");
  });

  it("flags an isolated extra as over-emission", () => {
    const ours = [point("InnerDimple", 500)];
    const ref: RfyToolingOp[] = [];
    const r = scoreOps(ours, ref);
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0].kind).toBe("over-emission");
    expect(r.gaps[0].side).toBe("ours");
  });

  it("flags an unproduced reference op as missing-rule", () => {
    const ours: RfyToolingOp[] = [];
    const ref = [point("Web", 8)];
    const r = scoreOps(ours, ref);
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0].kind).toBe("missing-rule");
    expect(r.gaps[0].side).toBe("ref");
  });

  it("a clean match produces no gaps", () => {
    const ops = [point("Swage", 10)];
    expect(scoreOps(structuredClone(ops), structuredClone(ops)).gaps).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/validation/op-diff.test.ts`
Expected: FAIL — the new "gap classification" tests fail (gaps is empty `[]`), earlier tests still pass.

- [ ] **Step 3: Write the implementation**

In `src/validation/op-diff.ts`, add these constants + function ABOVE `scoreOps`:

```ts
const WRONG_GATE_WINDOW_MM = 8;   // different op at ~same spot = a recipe swap
const DRIFT_WINDOW_MM = 25;       // same op, drifted = geometry off

/** Position of an op for gap-windowing; null for positionless edge ops. */
function opPosition(op: RfyToolingOp): number | null {
  if (op.kind === "spanned") return op.startPos;
  if (op.kind === "point") return op.pos;
  return null;
}

/** Bucket leftover extras + missing into the 4 gap kinds. Each missing is used once. */
export function classifyGaps(
  extras: RfyToolingOp[],
  missing: RfyToolingOp[],
  tol: number,
): GapItem[] {
  const gaps: GapItem[] = [];
  const missUsed = new Set<number>();

  const findPartner = (
    e: RfyToolingOp,
    predicate: (m: RfyToolingOp, d: number) => boolean,
  ): { idx: number; dist: number } | null => {
    const ep = opPosition(e);
    if (ep === null) return null;
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < missing.length; i++) {
      if (missUsed.has(i)) continue;
      const m = missing[i];
      if (m.kind !== e.kind) continue;
      const mp = opPosition(m);
      if (mp === null) continue;
      const d = Math.abs(ep - mp);
      if (predicate(m, d) && d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx >= 0 ? { idx: bestIdx, dist: bestDist } : null;
  };

  for (const e of extras) {
    // 1) same-type drift wins first (geometry)
    let hit = findPartner(e, (m, d) => m.type === e.type && d > tol && d <= DRIFT_WINDOW_MM);
    if (hit) {
      missUsed.add(hit.idx);
      gaps.push({ kind: "position-drift", side: "ours", op: e, partner: missing[hit.idx], distanceMm: hit.dist });
      continue;
    }
    // 2) different-type swap at ~same spot (wrong recipe)
    hit = findPartner(e, (m, d) => m.type !== e.type && d <= WRONG_GATE_WINDOW_MM);
    if (hit) {
      missUsed.add(hit.idx);
      gaps.push({ kind: "wrong-gate", side: "ours", op: e, partner: missing[hit.idx], distanceMm: hit.dist });
      continue;
    }
    // 3) nothing nearby → spurious
    gaps.push({ kind: "over-emission", side: "ours", op: e });
  }

  for (let i = 0; i < missing.length; i++) {
    if (!missUsed.has(i)) gaps.push({ kind: "missing-rule", side: "ref", op: missing[i] });
  }

  return gaps;
}
```

Then in `scoreOps`, replace the `gaps: []` line so the result carries classified gaps:

```ts
  const gaps = classifyGaps(extras, missing, tol);
  return { refTotal, oursTotal: ours.length, matched, extras, missing, parity, gaps };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/validation/op-diff.test.ts`
Expected: PASS — all 12 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/validation/op-diff.ts src/validation/op-diff.test.ts
git commit -m "feat(validation): classify non-matches into 4 gap buckets"
```

---

### Task 3: Export the validation module + build

**Files:**
- Modify: `src/index.ts` (add export block near the other `export { ... }` groups)

- [ ] **Step 1: Add the export**

In `src/index.ts`, after the `export { ... } from "./simplify-rp.js";` block (around line 112), add:

```ts
export {
  scoreOps,
  classifyGaps,
  type ScoreOptions,
  type OpDiffResult,
  type MatchedPair,
  type GapItem,
  type GapKind,
} from "./validation/op-diff.js";
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0, no TypeScript errors. `dist/validation/op-diff.js` now exists.

- [ ] **Step 3: Typecheck + full test run**

Run: `npm run typecheck && npm test`
Expected: typecheck clean; full suite passes (existing tests + the 12 new ones).

- [ ] **Step 4: Commit**

```bash
git add src/index.ts dist
git commit -m "build(validation): export op-diff scorer from package index"
```

---

### Task 4: CLI — score any two RFY files

**Files:**
- Create: `scripts/score-rfy-pair.mjs`

Compares two decoded RFYs op-for-op using the new scorer, pairing frames and sticks by name (the same identity the existing harness uses). Useful immediately: run it on `(refA.rfy, refA.rfy)` for a 1.0 sanity check, on two different reference plans to see gap buckets, or later on `(codec-output.rfy, detailer-ref.rfy)`.

- [ ] **Step 1: Create the CLI**

Create `scripts/score-rfy-pair.mjs`:

```js
#!/usr/bin/env node
/**
 * Score one RFY against another, op-by-op, with the span-aware tiered metric.
 *
 * Usage:
 *   node scripts/score-rfy-pair.mjs <ours.rfy> <ref.rfy> [out.json]
 *
 * Pairs frames by name, then sticks by name (order within a name). Reports
 * parity at T1a (1.5mm) and T1b (0.01mm) and the 4 gap-bucket counts.
 * Build first: npm run build
 */
import fs from "node:fs";
import { decode, scoreOps } from "../dist/index.js";

const [, , oursPath, refPath, outJson] = process.argv;
if (!oursPath || !refPath) {
  console.error("Usage: node scripts/score-rfy-pair.mjs <ours.rfy> <ref.rfy> [out.json]");
  process.exit(2);
}

const oursDoc = decode(fs.readFileSync(oursPath));
const refDoc = decode(fs.readFileSync(refPath));

// Flatten ref frames by name (ref may span multiple plans).
const refFrames = new Map();
for (const p of refDoc.project.plans) for (const f of p.frames) refFrames.set(f.name, f);

// Group a frame's sticks by name, preserving order.
function sticksByName(frame) {
  const m = new Map();
  for (const s of frame.sticks) {
    if (!m.has(s.name)) m.set(s.name, []);
    m.get(s.name).push(s);
  }
  return m;
}

const TIERS = { T1a: 1.5, T1b: 0.01 };
const totals = {
  T1a: { matched: 0, ref: 0, ours: 0 },
  T1b: { matched: 0, ref: 0, ours: 0 },
  buckets: { "missing-rule": 0, "over-emission": 0, "wrong-gate": 0, "position-drift": 0 },
  byOpType: {}, // opType -> {missing, extra}
};

for (const ourFrame of oursDoc.project.plans[0].frames) {
  const refFrame = refFrames.get(ourFrame.name);
  if (!refFrame) continue;
  const ourByName = sticksByName(ourFrame);
  const refByName = sticksByName(refFrame);
  const names = new Set([...ourByName.keys(), ...refByName.keys()]);

  for (const name of names) {
    const ourList = ourByName.get(name) ?? [];
    const refList = refByName.get(name) ?? [];
    const n = Math.max(ourList.length, refList.length);
    for (let i = 0; i < n; i++) {
      const ourOps = ourList[i]?.tooling ?? [];
      const refOps = refList[i]?.tooling ?? [];

      for (const [tier, tol] of Object.entries(TIERS)) {
        const r = scoreOps(ourOps, refOps, { toleranceMm: tol });
        totals[tier].matched += r.matched.length;
        totals[tier].ref += r.refTotal;
        totals[tier].ours += r.oursTotal;
      }

      // Buckets + per-op-type from the functional tier (T1a).
      const fr = scoreOps(ourOps, refOps, { toleranceMm: TIERS.T1a });
      for (const g of fr.gaps) {
        totals.buckets[g.kind]++;
        const t = g.op.type;
        totals.byOpType[t] ??= { missing: 0, extra: 0 };
        if (g.side === "ref") totals.byOpType[t].missing++;
        else totals.byOpType[t].extra++;
      }
    }
  }
}

const pct = (m, r) => (r === 0 ? 100 : (100 * m) / r);
const report = {
  ours: oursPath,
  ref: refPath,
  parity: {
    T1a_1p5mm: { pct: pct(totals.T1a.matched, totals.T1a.ref), matched: totals.T1a.matched, ref: totals.T1a.ref, ours: totals.T1a.ours },
    T1b_0p01mm: { pct: pct(totals.T1b.matched, totals.T1b.ref), matched: totals.T1b.matched, ref: totals.T1b.ref, ours: totals.T1b.ours },
  },
  gapBuckets: totals.buckets,
  byOpType: totals.byOpType,
};

console.log(`\nT1a (1.5mm, machine-functional): ${report.parity.T1a_1p5mm.pct.toFixed(2)}%  (${totals.T1a.matched}/${totals.T1a.ref})`);
console.log(`T1b (0.01mm, geometry-faithful): ${report.parity.T1b_0p01mm.pct.toFixed(2)}%  (${totals.T1b.matched}/${totals.T1b.ref})`);
console.log(`\nGap buckets (at 1.5mm):`);
for (const [k, v] of Object.entries(totals.buckets)) console.log(`  ${k.padEnd(16)} ${v}`);
console.log(`\nTop divergent op types (missing | extra):`);
Object.entries(totals.byOpType)
  .sort((a, b) => (b[1].missing + b[1].extra) - (a[1].missing + a[1].extra))
  .slice(0, 10)
  .forEach(([t, v]) => console.log(`  ${t.padEnd(14)} ${String(v.missing).padStart(5)} | ${v.extra}`));

if (outJson) {
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outJson}`);
}
```

- [ ] **Step 2: Build (CLI imports from dist)**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Sanity-run — a reference RFY against itself must be 100%**

Pick any reference RFY in the local cache and compare it to itself:

```bash
node scripts/score-rfy-pair.mjs \
  "C:/Users/scott.TEXTOR/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data/HG260044/HG260044#1-1_GF-LBW-70.075.rfy" \
  "C:/Users/scott.TEXTOR/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data/HG260044/HG260044#1-1_GF-LBW-70.075.rfy"
```

Expected: `T1a ... 100.00%`, `T1b ... 100.00%`, all gap buckets 0. (If the exact filename differs, list the folder and use any `*.rfy` present — the self-compare must be 100%.)

- [ ] **Step 4: Cross-run — two different plans must show buckets**

Compare two *different* reference plans (any two distinct `*.rfy` in that folder). Expected: parity well below 100% and non-zero gap buckets — confirms the tool discriminates and classifies. Record the printed numbers in the commit message.

- [ ] **Step 5: Commit**

```bash
git add scripts/score-rfy-pair.mjs
git commit -m "feat(validation): score-rfy-pair CLI (tiered parity + gap buckets)"
```

---

### Task 5: Held-out corpus manifest (data for the convergence loop)

**Files:**
- Create: `scripts/corpus/heldout-manifest.json`

The convergence loop (spec §9) must score on jobs it was NOT tuned on. This manifest fixes that split so no future tuning silently leaks held-out jobs into the derivation set. The current rules were hand-fit to HG260001/044/023, so all three are "tainted"; the manifest reserves one as held-out and flags the rest for re-derivation under the new method.

- [ ] **Step 1: Create the manifest**

Create `scripts/corpus/heldout-manifest.json`:

```json
{
  "_comment": "Detailer-parity corpus split. 'score' jobs are HELD OUT — never tune rules on them; they exist only to measure generalisation. 'derive' jobs may be used to build/tune rules. 'tainted' lists jobs the legacy empirical engine was already hand-fit to (their high parity does not prove generalisation). See docs/superpowers/specs/2026-06-12-detailer-ruleset-extraction-design.md §9b.",
  "version": 1,
  "score": ["HG260001"],
  "derive": ["HG260044", "HG260023"],
  "tainted": ["HG260001", "HG260044", "HG260023"],
  "referenceRoot": "C:/Users/scott.TEXTOR/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data"
}
```

- [ ] **Step 2: Validate it parses**

Run: `node -e "console.log(Object.keys(require('./scripts/corpus/heldout-manifest.json')))"`
Expected: prints `[ '_comment', 'version', 'score', 'derive', 'tainted', 'referenceRoot' ]` (no parse error).

- [ ] **Step 3: Commit**

```bash
git add scripts/corpus/heldout-manifest.json
git commit -m "chore(validation): held-out corpus manifest for generalisation scoring"
```

---

## Self-Review

- **Spec coverage:** Implements spec §9b "tighten the metric" (span-aware via `opDistance` on spanned end-pos; tiered T1a/T1b) and "bucket every non-match" (`classifyGaps` → missing-rule / wrong-gate / position-drift / over-emission), and §1 "held-out" via the manifest. Deferred-by-design (noted in header): wiring into `diff-vs-detailer.mjs` generation to print the *official* baseline number → sub-plan 2; reconciling the 94.91% vs 83.12% baseline discrepancy happens there, once generation feeds this scorer.
- **Placeholder scan:** none — every step has full code/commands/expected output.
- **Type consistency:** `scoreOps`, `classifyGaps`, `OpDiffResult`, `GapItem`, `GapKind`, `MatchedPair`, `ScoreOptions` are defined in Task 1/2 and exported unchanged in Task 3; the CLI uses only `decode` + `scoreOps` + `result.{matched,refTotal,oursTotal,gaps}` + `gap.{kind,side,op,partner,distanceMm}` exactly as defined. Op field names (`kind`, `type`, `pos`, `startPos`, `endPos`) match `src/format.ts`.
