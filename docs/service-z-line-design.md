# Service z-line consumption — design (Agent S)

**Date:** 2026-05-05
**Predecessor research:** Agent P (`docs/lbw-gap-research.md` §2.3)
**Predecessor negative result:** Agent R — predicate-only gating cannot
distinguish e.g. HG260001/L23/S8 from S9 (same length, same profile,
same plan; only world-X discriminates).

---

## 1 · The schema (verified across all 3 corpora)

Every Detailer-source XML contains, **per frame**, zero or more
`<tool_action name="Service">` elements. There are TWO geometric kinds:

### 1.1 Vertical drops (per-stud electrical run-down)

```
<tool_action name="Service">
  <start>X, Y, z_lo</start>
  <end>X, Y, z_hi</end>     <!-- same X+Y, varying z -->
</tool_action>
```

These mark a single **stud's** vertical electrical conduit run.
Already consumed by the existing post-decode block at
`scripts/diff-vs-detailer.mjs:642` for `T` plates and `N` nogs only —
it places one `InnerService` op on the plate/nog at the run's X position.

**Out of scope for this dispatch.** Studs don't get InnerService from
these directly; they're emitted on the plate that crosses them.

### 1.2 Horizontal runs (cross-stud electrical wiring runs)

```
<tool_action name="Service">
  <start>X1, Y, z</start>
  <end>X2, Y, z</end>     <!-- same Y+z, varying X -->
</tool_action>
```
or with the wall on the y-axis:
```
<start>X, Y1, z</start>
<end>X, Y2, z</end>      <!-- same X+z, varying Y -->
```

These are the canonical **outlet/switch wiring heights** at z=300mm and
z=450mm (Australian rough-in standard) — but per-frame Detailer can also
emit additional runs at any other height. Each horizontal run is bounded
in its **wall-axis** direction (its x-or-y span gives the wall-segment
that this z-line covers).

**This is the signal the InnerService rule must consume.**

### 1.3 Examples mined from corpora

HG260001 PK5-GF-LBW-70.075 / Frame L23 (Agent R's evidence frame):

| z-line z | wall-axis range | crosses studs at world-x      |
|---------:|-----------------|-------------------------------|
| 450      | x = 73249..73748 | small section (only S1..S3 area) |
| 300      | x = 73249..73748 | "                                |
| 450      | x = 70537..72496 | main wall section (S9..S16)      |
| 300      | x = 70537..72496 | "                                |

L23/S8 at x=72537 is **outside** range 70537..72496 (margin -41mm).
L23/S9 at x=72078 is **inside** (margin +459mm). Hence S8 should have NO
InnerService and S9 should have two — exactly what Detailer's reference
RFY shows.

HG260001 PK5-GF-LBW-70.075 / Frame L38 / S11: Detailer's reference RFY
has 8 (eight!) InnerService positions. The XML has 8 distinct horizontal
Service runs whose perpendicular-axis range contains S11's x-coord and
whose z value falls within S11's vertical extent. 8 z-lines → 8 ops.
**The static @296/@446 rule cannot represent this — only the dynamic
per-stud projection can.**

---

## 2 · Position formula

Stud is a vertical member with `start.z = z_stud_start` and
`end.z = z_stud_end` (typically `z_stud_start ≈ -43` for ground-floor
studs sitting on a slab tolerance, or `≈ +2` for plate-stacked walls).

For each horizontal Service z-line at height `z_h`:

```
local_pos = z_h - z_stud_start - 2mm
```

The `-2mm` is the consistent end-trim observed across the L23, L26, L38
samples (matches the F300i pre-punch convention). Verified to ±0.2mm on
20+ studs across L23 (z_start=-43 → 343-2=341 ✓, 493-2=491 ✓) and L38
(z_start=+2 → 277-2=275 vs ref 275; 877-2=875 vs ref 875).

---

## 3 · Selection rule (does z-line apply to this stud?)

A horizontal Service z-line at `(start, end)` applies to a stud if:

1. **Stud is vertical:** `|stud.end.z - stud.start.z| / stud.length > 0.99`
2. **Z-line is horizontal:** `|svc.start.z - svc.end.z| < 0.01`
3. **Same wall plane** (perpendicular axis of the wall matches):
   the perpendicular axis (the one *not* varying along stick run) of stud
   and z-line agree within ±5mm.
4. **Stud's wall-axis position lies within z-line's wall-axis span:**
   ```
   svcAxisLo - 5 ≤ stud.x ≤ svcAxisHi + 5   (for a Y-perp wall)
   svcAxisLo - 5 ≤ stud.y ≤ svcAxisHi + 5   (for an X-perp wall)
   ```
5. **Z-height lies within stud's vertical extent:**
   `min(stud.start.z, stud.end.z) ≤ z_h ≤ max(stud.start.z, stud.end.z)`
6. **Computed local_pos is in-bounds:**
   `30 ≤ local_pos ≤ length - 30` (matches the existing rule guard)

A stud whose set of applicable z-lines is empty gets NO InnerService.
This closes the over-emission gap for studs like L23/S8 that the static
@296/@446 rule wrongly hit.

---

## 4 · Architecture (where the code goes)

### 4.1 Input parsing

`scripts/diff-vs-detailer.mjs:141` already parses the `serviceActions`
list per frame. **No parser change needed** — the data is already in
memory. Just need to expose it to the rule pipeline.

### 4.2 Threading into per-stick rule context

Two options considered:

**Option A — Add `serviceLines: number[]` to StickContext.**
Pre-compute (in `buildOurProject`'s per-stick loop) the list of `local_pos`
values from filtering+projecting the frame's `serviceActions`. Pass them
to `generateTooling` via the context. The InnerService rule in `table.ts`
consumes them.

Drawback: Anchor types (`startAnchored`/`endAnchored`/`spaced`) are
currently a closed enum in `src/rules/types.ts`. Adding a "from-context"
anchor would add a new variant and changes to `applyAnchor()` in
`src/rules/engine.ts`. Significant surface area.

**Option B — Suppress the static rule + emit dynamically post-decode.** ✅

Make the static @296/@446 rule a **fallback only** by gating its predicate
to "no service-line context provided". For sticks where context exists,
the rule fires zero ops. Then in `diff-vs-detailer.mjs` (the harness),
inject InnerService positions on studs the same way the existing nog/plate
post-decode block does (line 642), but with the per-stud projection from §3.

This keeps the architectural pattern symmetric with how the harness already
handles nog/plate InnerService, plate Web, and Bolt (all post-decode
augmentation from XML tool_actions). The rule table stays declarative.

**Decision: Option B.** Lower-risk, single-file change, mirrors the Kb
Service-crossing precedent at lines 377-457 exactly.

### 4.3 Files touched

1. `src/rules/table.ts` — gate the static @296/@446 rules off when a new
   `serviceLines` context flag is present (signal that dynamic mode is
   active for this stick). For now, ALWAYS suppress the static rule on
   wall studs (LBW/NLBW plans) — the harness will provide the dynamic ops.
2. `scripts/diff-vs-detailer.mjs` — add a stud-side InnerService block
   alongside the existing T/N block. New code ~50 LOC.
3. `src/rules/types.ts` — extend `StickContext` with optional
   `hasDynamicServiceLines?: boolean` (signal to suppress static).

Production-side parity (`hytek-rfy-tools/lib/framecad-import.ts`) — out
of scope, flagged for Agent T.

---

## 5 · Sanity check vs Agent R's L23 evidence

Pre-fix:
```
S8 (x=72537): codec emits InnerService @296 + @446 → BOTH extra (ref empty)
S9 (x=72078): codec emits InnerService @296 + @446 → BOTH extra; ref @341 + @491 missing
```

Post-fix predicted:
```
S8: no z-line covers x=72537 → emit nothing → matches ref empty ✓
S9: z-lines at z=300/450 cover x=72078 (inside 70537..72496) →
     local_pos = (300 - (-43) - 2) = 341 + (450 - (-43) - 2) = 491 → 2 ops ✓
```

Both flip from "extra" or "missing" to "match". Net delta on this frame
alone: +12 matched, -12 extra, -8 missing across S1/S2/S3/S9/S10/S11/S12/S13/S14/S16
plus L26 similar studs. Estimated +50 ops on PK5-LBW alone.

---

## 6 · Risks

- **L1 short-stud studs:** L23/S6,S7 are TrimStuds at length 826/826 with
  ref `InnerService @341/@491`. Same formula applies (z_start=-43, z=300/450
  cross the stud). Should work. **Verify in commit 3.**
- **Non-LBW plans:** NLBW also has horizontal Service tool_actions. Need
  to confirm rule gates don't accidentally suppress them. Agent P notes
  PK1-NLBW currently sits at 90.5%.
- **89mm walls:** PK3-LBW-89.075 (HG260023) — same XML schema, same
  formula expected. Cross-corpus check on commit 3.
- **Vertical Kb logic at line 377:** independent (uses different filter
  branch on `/^Kb\d/`). Not touched.
- **TIN / TB2B / RP / FJ truss frames:** No horizontal Service z-lines
  in those XMLs (they're not wall plans). Rule should no-op on them.
  Static @296/@446 already gated by `isWallPlan(ctx)` so suppressing it
  won't affect non-wall.

---

## 7 · Implementation plan (4 commits)

1. **C1 — instrument & verify.** Add a `DBG_SERVICE` log path in the
   harness that dumps per-frame z-lines and per-stud projections.
   No rule change. Confirms parse.
2. **C2 — suppress static rule for wall studs.** Set the predicate to
   never fire on wall studs (LBW/NLBW). Run all 3 baselines — expect
   regression (no InnerService on studs at all).
3. **C3 — emit dynamic InnerService.** Add the post-decode block.
   Run all 3 — expect HG260001 to recover and exceed baseline. Cross-
   corpus check.
4. **C4 — edge-case polish.** Investigate any remaining InnerService
   diff across the 3 corpora. Tweak tolerances if required.

Push to master only on green at commit 3 (and 4 if substantive).
