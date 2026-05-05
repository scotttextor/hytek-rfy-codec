# Wall InnerService z-line simplifier — production-side design (Agent V)

**Date:** 2026-05-05
**Predecessor:** Agent S (`docs/service-z-line-design.md`) — same logic, but
the working code lives in the diff harness `scripts/diff-vs-detailer.mjs`.
**Migration template:** Agent O's TB2B post-decode → `simplify-tb2b-truss.ts`
move (commit `f160e63`-era).

---

## 1 · Why this exists

Agent S's harness patch replaces the static `InnerService @296/@446` rule on
wall studs with a per-stud projection of the frame's
`<tool_action name="Service">` z-lines. The patch lifted cross-corpus parity
+2.61pp / +483 ops.

But the patch lives in the **harness**. Production callers
(`hytek-rfy-tools/lib/framecad-import.ts` → `synthesizeRfyFromPlans`) still
hit the static rule. Same fictional-parity bug Agent O fixed for TB2B:
diff numbers say one thing, deployed RFY files say another.

---

## 2 · Architectural choice — post-pass simplifier

Two options were on the table:

**(a)** Extend `StickContext` with `serviceLines[]`. The InnerService rule
in `table.ts` consumes the context. Cleaner declarative architecture.
**Drawback:** the rule engine's `Anchor` enum is closed; adding a "from-
context" anchor variant requires changes in `src/rules/types.ts` and
`src/rules/engine.ts`. New surface area.

**(b)** Post-pass simplifier `src/simplify-wall-service.ts`. Runs after
the per-stick rules engine, like `simplify-tin-truss.ts`,
`simplify-rp.ts`, `simplify-tb2b-truss.ts`. It receives the frame's
`serviceActions` (parsed from XML upstream), strips static InnerService
ops on wall studs, and emits dynamic ops projected from each
applicable z-line.

**Decision: (b).** Matches the existing pattern (TIN/RP/TB2B all use
post-pass), no breaking change to `StickContext`, smallest blast radius.
Mirrors Agent O's TB2B migration exactly.

---

## 3 · Threading XML data into the codec

`ParsedFrame` (in `src/synthesize-plans.ts`) currently exposes envelope +
sticks but not `tool_action` data. To carry the z-lines through, add an
optional field:

```ts
export interface ServiceAction {
  start: Vec3;
  end: Vec3;
}

export interface ParsedFrame {
  // ...existing fields...
  /** Parsed `<tool_action name="Service">` z-lines for this frame. Optional
   *  — when absent or empty, the wall-service simplifier no-ops (i.e. the
   *  static InnerService rule's output stands). Populated by upstream
   *  importers; consumed by `simplifyWallServiceInProject`. */
  serviceActions?: ServiceAction[];
}
```

Optional (not required) keeps backwards compatibility with any caller
that builds `ParsedProject` from a non-XML source (e.g. tests, internal
fixtures). When the field is missing, the simplifier reuses the harness's
"strip static if wall plan" gate so the migration is semantics-preserving.

---

## 4 · Selection rule (verbatim from Agent S, design doc §3)

For each plan matching `/-(N?LBW)-/i`, for each frame, for each stick
where:
- `usage` ∈ {Stud, TrimStud, EndStud, JackStud}
- stud is vertical: `|stud.dz| / stud.length > 0.99`

Compute applicable z-lines from the frame's `serviceActions`:
1. **Z-line is horizontal:** `|svc.start.z - svc.end.z| < 0.01`
2. **Z within stud's vertical extent:** `min ≤ z_h ≤ max` (±0.5mm)
3. **Run axis** = whichever of x/y the z-line varies in (≥0.5mm range).
4. **Wall plane match:** stud's perpendicular coord matches z-line's
   perpendicular coord within ±5mm.
5. **Wall-axis position:** stud's wall-axis coord lies within the
   z-line's wall-axis span ±5mm.
6. **Position formula:** `local_pos = z_h - sStart.z` (when sStart.z ≤ sEnd.z)
   else `sStart.z - z_h`.
   Implicitly absorbs the −2mm trim because stud start has already been
   trimmed +2mm by the upstream import (verified vs L23/S9: z_start=−41,
   300−(−41)=341 = ref @341).
7. **Bounds:** `30 ≤ local_pos ≤ length − 30`.

After collecting `dynamicPositions` for the stud:
- Strip ALL existing point InnerService ops from the stud's tooling.
- Emit new InnerService ops at the deduped, sorted dynamic positions.
- Re-sort the tooling array by position.

The "strip unconditionally" step matters: even when `dynamicPositions`
is empty (no z-line covers this stud — e.g. L23/S8), the static @296/@446
ops emitted by the rule engine must be removed. Verified vs HG260001
PK1-NLBW N14 ref (zero stud InnerService despite the static rule firing).

---

## 5 · Outer gate — wall plan, not service-action presence

Per Agent S's commit `244976e` (C4): the gate is `wall plan` not
`serviceActions.length > 0`. Wall plans whose frames lack any horizontal
Service z-lines (e.g. small auxiliary frames) still need the static
@296/@446 stripped — those frames simply have no studs hit by any z-line,
which is itself the correct answer.

---

## 6 · Files touched

### Codec (this worktree)

1. `src/synthesize-plans.ts`
   - Add `ServiceAction` type + optional `serviceActions?: ServiceAction[]`
     on `ParsedFrame`.
   - Wire `simplifyWallServiceInProject(project.plans)` into the post-pass
     chain after `simplifyTb2bTrussFramesInProject`.
2. `src/simplify-wall-service.ts` — new module. ~180 LOC:
   - `isWallServicePlanName(name)` predicate
   - `applicableZLines(stud, serviceActions)` — selection rule §4
   - `simplifyWallServiceFrame(frame, planName)` — strip + emit per stud
   - `simplifyWallServiceInProject(plans)` — public entry point
3. `scripts/diff-vs-detailer.mjs:691-805` — REMOVE the duplicate after
   verifying the codec-side simplifier matches harness emission. This is
   the same delete pattern Agent O used.

### Tools (separate repo, separate commit)

4. `hytek-rfy-tools/lib/framecad-import.ts`
   - Parse `<tool_action name="Service">` per frame.
   - Populate `serviceActions: [...]` on the `ParsedFrame` produced by
     `framecadImportToParsedProject`.
5. `hytek-rfy-tools/package.json` — bump codec dep to the final commit
   hash. Run `npm install`, `npm run build`, `npm test`.

---

## 7 · Verification protocol

After each codec commit, run:

```
node scripts/diff-all-hg260001.mjs
node scripts/diff-all-hg260044.mjs
node scripts/diff-all-hg260023.mjs
```

Targets (must hold):
- HG260001 ≥ 84.38%
- HG260044 ≥ 83.12%
- HG260023 ≥ 79.98%

Sequence:
1. **C1:** add `ServiceAction` type + simplifier scaffold (no-op for now).
   Baselines unchanged.
2. **C2:** wire simplifier into `synthesize-plans.ts` AND parse
   `serviceActions` in `buildOurProject` (the harness's parser).
   Then keep the harness duplicate at line 691-805 — but the codec
   simplifier will run FIRST. Confirm baselines unchanged (the harness
   patch is idempotent on the simplifier's output: stripping
   InnerService a 2nd time finds nothing; emitting the same dynamic
   positions a 2nd time will be deduped).
3. **C3:** delete the harness duplicate (lines 691-805).
   Baselines must STILL match. If they drop, the simplifier hasn't
   replicated the patch — diagnose and fix.

---

## 8 · Risk register

| Risk | Mitigation |
|------|------------|
| Harness's `buildOurProject` builds project DIRECTLY (not via `framecadImportToParsedProject`). Won't have `serviceActions` populated unless harness is updated. | Update harness's project-builder to populate `serviceActions` from already-parsed `serviceActions` array (line 141). Trivial. |
| Static rule still fires on stud → emits @296/@446 → simplifier strips them. Test that strip works for studs whose `dynamicPositions` set is empty (e.g. L23/S8). | Direct mirror of harness logic. The "strip unconditionally" guarantees this. |
| Non-wall plans accidentally affected. | Outer gate is `/-(N?LBW)-/i.test(planName)` AND `usage` is wall-stud type. TIN/RP/TB2B/FJ frames don't match either gate. |
| `ParsedFrame` consumers in other codepaths. | Optional field with default `undefined`. No-op when missing. |

---

## 9 · Out of scope

- The follow-up patterns from Agent S §9 ("closest stud wins" and the
  +7.6mm offset PK2-NLBW edge case). Those are still unresolved; this
  dispatch only migrates what's already shipped.
- TIN/RP/TB2B/FJ rule changes — left untouched.
- Agent T's short-N rule (`42ccb5f`) and Agent U's B-plate slab-anchor
  scoping (`90e3af2`) — preserved.
