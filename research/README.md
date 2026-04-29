# Detailer-replacement rules engine — research workspace

**Goal:** derive FrameCAD Detailer's per-stick tooling-placement rules by
analysing matched `(framecad_import.xml, *.rfy)` pairs from real HYTEK jobs,
then encode those rules in TypeScript so we can synthesize machine-functional
RFY files without Detailer in the pipeline.

## Folder layout

```
research/
├── README.md                      ← this file
├── corpus/                        ← drop matched (XML, RFY) pairs here
│   └── <jobname>/                 ← one subfolder per job
│       ├── framecad_import.xml    ← the input fed to Detailer
│       └── <plan>.rfy             ← Detailer's output (one per plan)
├── scripts/
│   ├── analyze-pair.mjs           ← analyse one (XML, RFY) pair
│   └── analyze-corpus.mjs         ← run analyze-pair across the entire corpus
└── output/
    ├── stick-database.csv         ← every Detailer stick across all pairs (for stats)
    └── rules-draft.json           ← derived rules (regenerated each analyser run)
```

## Step-by-step

### 1. Drop pairs into `corpus/`

For every job HYTEK has run, copy:

- **The input XML** — usually `framecad_import.xml` or a similarly-named
  CNC export. This is what Detailer ingested.
- **All the `.rfy` files Detailer produced** — typically in
  `06 MANUFACTURING/04 ROLLFORMER FILES/Split_<jobnum>/`. One RFY per plan
  (e.g. `<job>_GF-LBW-89.95.rfy`, `<job>_GF-RP-70.075.rfy`).

Each job goes in its own subfolder under `corpus/`.

Aim for **at least 30 jobs** spanning:
- Modular containers (ATCO 6×3, 12×3, etc.)
- Residential homes (Coral, BMD)
- Sheds / farm buildings
- Trusses (different rule set)
- Light commercial

The more pairs we have, and the more varied the job types, the more
accurately we can derive Detailer's rules.

### 2. Run the analyser

```bash
cd hytek-rfy-codec
node research/scripts/analyze-corpus.mjs
```

This walks `corpus/`, decodes every RFY, parses every XML, matches sticks
between them, and writes:

- `output/stick-database.csv` — one row per Detailer stick: name, type,
  profile, length, position, neighbours, list of ops + positions
- `output/rules-draft.json` — initial rules (most-common op patterns
  grouped by stick-type × profile family)

### 3. Iterate

- Read the rules draft
- Encode them in `src/rules/` (the actual codec rules engine)
- Run `node research/scripts/validate.mjs` (next phase) — re-synthesize
  every job and compare against Detailer's RFY, report match rate

## What the analyser looks for

For each Detailer-produced stick:

| Stick attribute | Used to group rules |
|-----------------|---------------------|
| Type (STUD, NOG, TOPPLATE, …) | Primary key |
| Profile (web, flange, gauge) | Secondary key |
| Length bucket (≤500, 500-1500, 1500-3000, 3000+) | Tertiary key |
| Frame type (CeilingPanel, RoofPanel, LoadBearingWall, …) | Context |
| Neighbour-stick types | Context |

For each (group of similar sticks), records:

- Which op types appeared on this stick
- Where (positions in mm from start)
- Spacing patterns (every 600mm, every length/N, etc.)
- End-relative offsets (e.g. SWAGE always at end - 27.5mm)

## Confidence ladder

The analyser tags each derived rule with a confidence score:

- **HIGH** — pattern appears in >90% of sticks in the group, with consistent positioning
- **MEDIUM** — pattern appears in 50-90% of sticks; positioning variance < 10mm
- **LOW** — pattern appears in 10-50% of sticks (may be situational)
- **NOISE** — pattern appears in <10% of sticks (probably edge case or error)

Phase 1 codec ships with HIGH-confidence rules. Phase 2 adds MEDIUM with
contextual decision logic. Phase 3 catches the LOW edge cases.

## Why this works

Detailer is deterministic — the same input always produces the same
output (for the same Detailer version). That means there ARE rules; we
just don't have them documented. Statistical analysis of enough
input/output pairs will reveal them.

## Open questions

- Does Detailer's output depend on hidden settings/preferences (per-job
  overrides) that aren't in the XML? If yes, those need to be captured.
- Are there any rule changes between Detailer versions? If HYTEK uses a
  fixed version (5.3.4.0 currently), this isn't a problem.
- Are some op positions calculated from manufacturing-tolerance settings
  (e.g. fastener edge distance)? May need to extract these from a
  Detailer config file.
