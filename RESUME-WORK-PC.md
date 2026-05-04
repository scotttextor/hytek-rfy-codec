# RFY Codec → 100% Parity — Work-PC Resume

**Created:** 2026-05-04 from home PC, mid-session.
**Goal:** continue the parity push toward 100% Detailer-RFY byte-exact match.
**Repo:** `scotttextor/hytek-rfy-codec` on GitHub.

---

## What's already done

| Phase | Result | Branch |
|---|---|---|
| Pre-agents baseline (HG260001) | **62.79%** matched (10,679/17,007 ops) | `master` (was `599c048`) |
| Phase 1 (TB2B + Walls + Rules-coverage agents) | **76.32%** (+13.5pp) | merged to `master` |
| Phase 2 (TB2B push 2 + Walls push 2 + TIN-70.075 small win) | **82.82%** (+6.5pp) | merged to `master` |
| Phase 3 Agent I (RP envelope crash fix) | RP from 0% (skipped) → **22.4%** | merged to `master` |
| Phase 4 Agent J (TIN-truss vocabulary) | New `src/simplify-tin-truss.ts`, TIN-70.075 63.1% → 66.7% | merged to `master` |
| HG260044 cross-corpus baseline | **80.27%** (codec generalizes — CP 100%, NLBW-89 89.7%) | `scripts/baselines/hg260044/` |

**Three captured op-truth corpora** (Frida hook on running Detailer, all clean, zero errors):
- `scripts/catalog/` (HG260001, 264 frames, 7,206 records)
- `scripts/catalog-hg260044/` (HG260044, 215 frames, 6,324 records)
- `scripts/catalog-hg260023/` (HG260023, 272 frames, 7,698 records)
- Total: **751 unique stick × ops truth records** across 3 projects

---

## Where everything lives

### Codec repo (canonical state)
- **GitHub:** `https://github.com/scotttextor/hytek-rfy-codec`
- **Master tip:** check `git log -1` after pulling
- **All worktree branches pushed**: `worktree-agent-*` (Phase 3 Agent G + Agent H were stuck on Y: drive disconnect — neither has meaningful commits, safe to ignore or delete)

### Captured data (also backed up to OneDrive)
On the work PC, these auto-sync via OneDrive at:
```
C:\Users\ScottTextor\OneDrive - Textor Metal Industries\CLAUDE DATA FILE\sessions\2026-05-04-rfy-100pct\
  capture-hg260001.log         (~13 MB, 5,749 add_frameobject hits)
  capture-hg260044.log         (~12 MB, 6,324 add_frameobject hits)
  capture-hg260023.log         (~15 MB, 7,698 add_frameobject hits)
  catalog-hg260001/            (parsed records.jsonl + ops_by_frame.json + 882 *.bin)
  catalog-hg260044/            (parsed records.jsonl + ops_by_frame.json + 860 *.bin)
  catalog-hg260023/            (parsed records.jsonl + ops_by_frame.json + 1016 *.bin)
  baselines/                   (per-plan JSON + .md reports)
```
The codec repo also has copies under `scripts/` — OneDrive is the safety net.

### Reference data
- HG260001 RFYs: `Y:\(17) 2026 HYTEK PROJECTS\CORAL HOMES\HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI\06 MANUFACTURING\04 ROLLFORMER FILES\Split_HG260001\`
- HG260001 XMLs: `Y:\…\HG260001 …\03 DETAILING\03 FRAMECAD DETAILER\01 XML OUTPUT\`
- HG260044 reference RFYs + XMLs: `C:\Users\ScottTextor\OneDrive - Textor Metal Industries\CLAUDE DATA FILE\memory\reference_data\HG260044\`
- HG260023 RFYs: TBD — find on Y: drive when work-PC starts

---

## RESUME ON WORK PC — copy-paste commands

```powershell
# 1. Pull the codec repo to wherever you keep it on the work PC
cd "$env:USERPROFILE\CLAUDE CODE"
git clone https://github.com/scotttextor/hytek-rfy-codec.git
# (or if already cloned)
cd hytek-rfy-codec; git pull --ff-only

# 2. Install deps
npm install
pip install frida frida-tools psutil pywinauto pillow pefile

# 3. Build
npm run build

# 4. Confirm baseline still works (Y: drive must be reachable)
node scripts/diff-all-hg260001.mjs    # should print OVERALL: 82.82% matched
node scripts/diff-all-hg260044.mjs    # should print OVERALL: 80.27% matched

# 5. Restore captured catalogs from OneDrive (if not already in scripts/)
$src = "$env:USERPROFILE\OneDrive - Textor Metal Industries\CLAUDE DATA FILE\sessions\2026-05-04-rfy-100pct"
Copy-Item "$src\catalog-hg260001"  scripts\catalog              -Recurse -Force
Copy-Item "$src\catalog-hg260044"  scripts\catalog-hg260044     -Recurse -Force
Copy-Item "$src\catalog-hg260023"  scripts\catalog-hg260023     -Recurse -Force
Copy-Item "$src\baselines"         scripts\baselines            -Recurse -Force
```

Then start Claude Code in that folder and tell it: **"Resume the RFY 100% parity push. See `OneDrive/CLAUDE DATA FILE/sessions/2026-05-04-rfy-100pct/RESUME-WORK-PC.md`."**

---

## Where to pick up — pending work in priority order

### Immediate next step: re-dispatch Agents G + H (they got stuck on Y: drive disconnect)

**Agent G — push TB2B from 64% → 85%+.** Specific gaps with concrete next steps:
1. **Web bolt-pair panel-point awareness** (~650 missing + 1505 extras — biggest single line item). Hypothesis: the `+98mm` bolt-pair fires only when the web at this crossing is a "main diagonal" (apex-going) vs a "secondary brace" (heel-going). Need to discriminate using `TB2B_META` direction-vector dot apex-direction sign. See `scripts/diff-vs-detailer.mjs` lines 84-280 (existing TB2B logic).
2. **Box-piece InnerDimples on chord** (192 missing). Hypothesis: emit at every 1000mm starting from chord's heel-end, count = `floor(chord_length / 1000)`. Verify against 3-5 reference chords in `scripts/baselines/scope/HG260001_PK10-GF-TB2B-70.075.txt`.
3. **PK6 long-B1 start/end-region bolt patterns** (~24 ops). Pattern: Web @60, pair @~340 from start, pair @~340 from end, Web @end-60.

**Agent H — push walls from 89% → 95%+.** Specific gaps:
1. **Kb InnerService variable positions** (~150 missing). Detailer places InnerService at fixed world Z heights (~300, ~450). For diagonal Kbs, parametrize the outline as a line and find where it crosses each target Z, emit at that parametric position.
2. **T2/T3/T4 short top-plate header treatment** (~30 missing per plan). Add length<200 predicate that switches T-plate to InnerNotch+LipNotch caps when inside H-frame.
3. **L23/L26 anchor offset** (~17 frames in PK5 — different anchor reference, +45mm). Likely sill-mounted indicator in XML.
4. **Studs missing Web ops** (~96 in PK4) — bracket-connector data in XML. Look at `<bracket>`/`<connector>`/`<tool_action name="Web">` elements.
5. **LipNotch jamb+king pair merging on H plates** (~60 missing). Mark pair-emitted LipNotches and merge only those.

### Phase 5: Cross-corpus rules-derivation
Use all 3 captured catalogs to derive rules systematically. Each frame_id → ops mapping is Detailer-truth. Find systematic patterns the codec doesn't encode. See `scripts/catalog*/ops_by_frame.json`.

### Phase 6: HG260023 baseline
We have its captured ops at `scripts/catalog-hg260023/ops_by_frame.json` but need its reference RFYs. Find them on Y: drive at:
```
Y:\(17) 2026 HYTEK PROJECTS\CORAL HOMES\HG260023 LOT 1165 (69) ATTENBOROUGH DRIVE BANYA\06 MANUFACTURING\04 ROLLFORMER FILES\
```
Then create `scripts/diff-all-hg260023.mjs` (clone the existing `diff-all-hg260044.mjs`).

### Migrate `scripts/diff-vs-detailer.mjs` TB2B post-decode logic into `src/`
TB2B work is currently in the diff harness, NOT in the codec. Production RFYs don't benefit. Move into `src/simplify-tb2b-truss.ts` (parallel to `src/simplify-tin-truss.ts`). This is a substantial refactor (~500 lines).

### RP rules expansion
Phase 3 Agent I unblocked the crash; RP at 22.4%. Remaining: Chamfer at sloped-chord meetings, InnerDimple offset 10mm vs 16.5mm, Swage/LipNotch cap-vocabulary swap, paired InnerNotch+LipNotch on B-chords. See Agent I's report.

---

## Tooling cheat-sheet

```bash
# Per-scope diff (fast iteration during rule work)
node scripts/diff-scope.mjs TB2B    # 7 TB2B plans
node scripts/diff-scope.mjs NLBW    # 2 NLBW plans
node scripts/diff-scope.mjs LBW     # 2 LBW plans
node scripts/diff-scope.mjs TIN     # 2 TIN plans
node scripts/diff-scope.mjs PK1-GF-NLBW   # single plan

# Full HG260001 baseline
node scripts/diff-all-hg260001.mjs

# Full HG260044 baseline (uses OneDrive reference data)
node scripts/diff-all-hg260044.mjs

# Compare baselines (shows pp delta + per-plan + per-tool)
node scripts/compare-baselines.mjs scripts/baselines/before.json scripts/baselines/after.json

# Re-attach Frida to a running Detailer (PID via Get-Process)
python scripts/frida-attach-python.py <PID> scripts/frida-capture-records.js scripts/capture-NEW.log

# Parse a capture log into deduplicated catalogs + ops_by_frame
python scripts/parse-capture.py scripts/capture-NEW.log scripts/catalog-NEW
```

---

## Files I'd want to read on resume

- `docs/rules-coverage.md` — Phase-1 rules-coverage agent's audit of `.sups` data vs codec
- `scripts/baselines/hg260001-baseline.md` — current HG260001 per-plan parity
- `scripts/baselines/hg260044/baseline.json` — HG260044 per-plan parity
- `src/simplify-linear-truss.ts` — LIN truss handling (model for TIN)
- `src/simplify-tin-truss.ts` — Phase 4 TIN truss vocabulary
- `src/rules/frame-context.ts` — main per-frame stick rule logic
- `src/rules/table.ts` — catalog rule patterns
- `scripts/diff-vs-detailer.mjs` — TB2B post-decode logic lives here (lines ~84-280, ~1011-1093, ~1346-1410)
- `scripts/frida-capture-records.js` — Frida hook (Frida 17 API)

---

## Architectural debt to be aware of

1. **TB2B logic lives in diff harness, not src/.** Hundreds of lines of post-decode rewriter in `scripts/diff-vs-detailer.mjs`. Production RFYs don't get the TB2B fixes — only the parity numbers do. Migrate when stable.
2. **`internalSpan = 45` is hardcoded** for 70/89mm profiles. Wrong for 75/78mm (should be 57) and 104mm (should be 72). Phase-1 rules-coverage agent left a TODO comment + the helper function `lipNotchToolLength(setup)` to use. The wall-positioning agent didn't adopt it; future agents should.
3. **Profile-specific dimple Y-position** (`Fastener1`: 70mm=20.5, 75/78mm=22, 89mm=20.5, 104mm=25.5) — exposed via `findSectionSetup(setup, "70S41_0.75").sectionOptions.fastener1` but not yet used in rule sites. TODO markers in `src/rules/table.ts` and `src/rules/frame-context.ts`.
