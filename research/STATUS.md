# Detailer-replacement rules engine — status

## Where we are

The `@hytek/rfy-codec` package now ships a rules engine that derives
per-stick tooling operations from stick metadata (role, profile, length,
plan, frame context). It's wired into `hytek-rfy-tools` so the RFY-tools
web app can produce machine-functional RFYs from `framecad_import.xml`
inputs WITHOUT FrameCAD Detailer in the pipeline.

**Validation against fixture HG260001_LOT289 (1 job, 2,402 sticks, 19,251 ops):**

| Metric | Value |
|---|---|
| Recall | **54.1%** of Detailer's ops match exactly |
| Precision | **58.6%** of our ops appear in Detailer's output |
| Op count ratio | ~95% (we generate ~the same total number of ops) |

**Best per-op-type recall:**
| Op | Recall |
|---|---|
| Swage | 79% |
| InnerDimple | 68% |
| InnerNotch | 58% |
| LipNotch | 55% |
| Bolt | 55% |
| InnerService | 52% |

**Best stick-group recall:**
| Group | Recall |
|---|---|
| B \| 70S41 \| ≤500 (bot plate, short) | 81% |
| N \| 70S41 \| 500-1500 (nog) | 84% |
| N \| 70S41 \| 1500-3000 (nog) | 83% |
| S \| 70S41 \| ≤500 (short stud) | 70% |
| B \| 70S41 \| 500-1500 (bot plate) | 74% |

**Worst groups (need work):**
| Group | Recall | Why |
|---|---|---|
| W \| 70S41 \| 1500-3000 | 14% | Web-bracing rules unclear |
| Kb \| 70S41 \| 500-1500 | 14% | Cripple-stud nuanced patterns |
| T \| 70S41 \| 3000-6000 | ~40% | Frame-context edge cases |

## What's encoded

### Per-stick rules (`src/rules/table.ts`)
- **Studs (S, J)** on 70S41 / 89S41: SWAGE+DIMPLE at both ends, plus
  electrical service holes at 296mm + 446mm in wall plans (LBW/NLBW).
- **Top plates (T, Tp)** on 70S41 / 89S41: LIP NOTCH+DIMPLE at both ends,
  plus 600mm-spaced power-feed service holes from 306mm in wall plans.
- **Bottom plates (B, Bp)** on 70S41: same as top plates plus WEB notch at
  8mm (universal) and BOLT HOLES at 62mm offsets for slab attachment.
- **Nogs (N, Nog)** on 70S41 / 89S41: SWAGE+DIMPLE at both ends.
- **Cripple studs (Kb, H)**: Chamfer at start (only), DIMPLE@10, SWAGE end
  span 43, DIMPLE@length-10.
- **Brace / web (W, Br, R, L)**: SWAGE+DIMPLE at both ends with brace-
  specific offsets (span 41, dimple 11).

### Frame-context rules (`src/rules/frame-context.ts`)
Computed from each stick's outline polygon corners (2D elevation coords):
- **Top/bottom plates** get LIP NOTCH+DIMPLE at every stud's x-coord.
- **Studs** get SWAGE+DIMPLE at every nog's y-coord (not LipNotch — that's
  for non-nog horizontal members like headers/lintels).
- **Nogs** get InnerNotch+LipNotch+DIMPLE at every stud's x-coord.
- Wide-outline cripple sticks (Kb/H) emit two virtual stud-crossings at
  their xMin/xMax edges (their actual jamb attachment points).
- Crossings dedupe by quantized localPos so adjacent studs don't double-
  emit.

## Gaps to close

To push recall past 60% (and toward 100%):

1. **Web POINT ops (~2,854 missed, 15% of total)** — appear on top plates
   at irregular positions, on web-bracing at varying positions, and on
   studs near top-plate connection. Pattern unclear from fixture alone;
   wider corpus may reveal it.

2. **Internal LipNotches at non-stud crossings (~1,291 missed)** —
   Detailer emits LipNotch on plates between studs in some patterns.
   Likely related to drop members like sills, headers, or non-grid
   structural elements.

3. **Plan-type variations** — TB2B and TIN plans have very different
   tooling patterns from LBW/NLBW. The wall-plan rules don't apply to
   trusses or eaves. Need separate rule groups per plan family.

4. **Profile-specific tuning** — 89S41 rules are placeholders pending
   wider corpus. Same for 150S41.

5. **Per-stick variants based on attachment** — same stick type can have
   different ops based on what crosses it. This requires deeper frame
   analysis (e.g., a stud near an opening gets different ops than one
   in mid-wall).

## How to iterate

```bash
# 1. Big corpus scan (Y: drive — slow)
LIMIT=300 nohup node research/scripts/scan-fast.mjs > research/output/scan-fast.log 2>&1 &

# 2. Once it finishes, derive position patterns from corpus
node research/scripts/derive-rules.mjs

# 3. Read research/output/rules-derived.txt to spot high-confidence patterns

# 4. Update src/rules/table.ts and src/rules/frame-context.ts

# 5. Validate
npm run build
node research/scripts/validate-rules.mjs

# 6. Spot-check specific stick patterns
node research/scripts/sample-sticks.mjs --role T --bucket 1500-3000

# 7. Commit + push to GitHub. Vercel auto-deploys hytek-rfy-tools.
```

## Files

```
src/rules/
  types.ts          ← StickContext, OpRule, RuleGroup, Anchor
  engine.ts         ← Generic rule application (applyRule, findGroup)
  table.ts          ← Per-(role × profile × length) rules
  frame-context.ts  ← Crossing detection + virtual cripple-edge studs
  index.ts          ← generateTooling, generateFrameContextOps

research/scripts/
  scan-fast.mjs       ← Targeted Y: drive walker
  sample-sticks.mjs   ← Per-stick raw op viewer
  derive-rules.mjs    ← Position-clustering analyzer
  validate-rules.mjs  ← Round-trip validator
  analyze-fixture.mjs ← Single-fixture stats

research/output/  (gitignored)
  stick-database.csv  ← every op observed in corpus, flat CSV
  rules-derived.json  ← derived placement patterns
  rules-derived.txt   ← human-readable view
  validation-fixture.txt ← latest validation report
```

## Production deployment

- `hytek-rfy-codec` master is on GitHub.
- `hytek-rfy-tools` references the codec via `github:scotttextor/hytek-rfy-codec`
  in `package.json` — Vercel pulls latest on each build.
- Each push to either repo triggers Vercel auto-deploy.
