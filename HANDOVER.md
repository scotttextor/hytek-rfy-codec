# RFY Encoder — Handover Document

**Last updated:** 2026-04-30
**Status:** All 3 test files load on F300i rollformer. Production live at https://hytek-rfy-tools.vercel.app

---

## TL;DR for next session

We are 80% of the way through replacing FrameCAD Detailer. Files we generate now LOAD on the HYTEK F300i rollformer. The rollformer parses the XML, displays jobs and frames in its UI, and accepts our generated RFY exactly like a Detailer-produced RFY.

**The remaining 20%:** the rollformer needs to actually CUT THE STEEL CORRECTLY. Today (2026-04-29 evening) we hadn't tested rolling steel yet. The user planned to roll one frame tomorrow (2026-04-30).

**Three blockers between "loads" and "cuts steel correctly":**

1. **Tooling rules are 54% accurate** vs Detailer (recall against fixture HG260001_LOT289). End-of-stick ops are >65% accurate; mid-stick crossings are weaker.
2. **Pack splitting is missing.** Detailer splits a 44-frame plan into 5 packs (PK1...PK5). We output one big plan with all 44 frames in PK1. The rollformer accepts this for loading but real-world workflow expects split files.
3. **Customer-specific settings unknown.** HYTEK may have tuned their Detailer install with custom preferences that live outside the input XML.

---

## Workspace layout

Three repos in `C:\Users\ScottTextor\CLAUDE CODE\`:

| Repo | Purpose | Deploy |
|---|---|---|
| `hytek-rfy-codec` | TypeScript library that decodes/encodes RFY files. Holds the rules engine. | npm-installed by rfy-tools |
| `hytek-rfy-tools` | Next.js web app: upload XML → download RFY | https://hytek-rfy-tools.vercel.app |
| `hytek-hub` | Central portal — RFY Tools tile already wired in | https://hytek-hub.vercel.app |

**Both rfy-codec and rfy-tools push to GitHub at `scotttextor/<repo>`.**

**rfy-tools pins the codec to a specific commit hash** in package.json. After making codec changes:
```bash
cd hytek-rfy-codec && git push
HASH=$(git rev-parse HEAD)
cd ../hytek-rfy-tools
sed -i "s|hytek-rfy-codec#[a-f0-9]*|hytek-rfy-codec#$HASH|" package.json
rm -f package-lock.json
npm install --no-audit "github:scotttextor/hytek-rfy-codec#$HASH"
git add -A && git commit -m "Pin codec to $HASH" && git push
```
Vercel auto-deploys on push.

---

## What works (verified 2026-04-29)

- ✅ AES-128-CBC encryption (Frida-discovered key in `crypto.ts`)
- ✅ zlib deflate compression (standard params — F300i accepts)
- ✅ Pretty-printed XML with CRLF + 2-space indent matching Detailer's format
- ✅ Self-closing empty tags (`<plan-graphics/>` not `<plan-graphics></plan-graphics>`)
- ✅ Filename pattern `<jobnum>_PK1-<plan>.rfy` matches Detailer
- ✅ All required structural elements:
  - `<schedule version="2">`
  - `<project name design_id client jobnum date>`
  - `<plan name="PK1-..." design_id>`
  - `<plan/elevation>0</elevation>`
  - `<plan/plan-graphics/>`
  - `<frame name design_id weight length height>`
    - `<transformationmatrix>...identity...</transformationmatrix>`
    - `<plan-graphics>` with poly + text
    - `<elevation-graphics>` with poly + text
    - `<stick name design_hash length type flipped>`
      - `<elevation-graphics>` with poly + text + circle markers
      - `<data3d>` with 24-vertex C-section mesh + triangles
      - `<profile metric-label imperial-label gauge yield machine-series="F300i">`
      - `<tooling>` with point-tool / spanned-tool / start-tool / end-tool
- ✅ Deterministic GUIDs for design_id (so same input → same RFY)
- ✅ Universal end-anchored tooling rules (Swage, Dimple, LipNotch, Bolt, etc.)
- ✅ Frame-context tooling (LipNotch+Dimple at stud crossings on plates, SWAGE+Dimple at nog crossings on studs, etc.)
- ✅ Service holes for wall studs (296/446 from start) and top plates (600mm spacing from 306mm)

---

## What's incomplete

### Tooling rules — 54% recall

Per-op-type recall (validated against fixture HG260001_LOT289, 19,251 ops):
| Op | Recall | Notes |
|---|---|---|
| Swage | 79% | End-anchored is high; mid-stick at nog crossings is OK |
| InnerDimple | 68% | Paired with Swage/LipNotch |
| InnerNotch | 58% | Frame-context only |
| LipNotch | 55% | End-anchored + plate stud-crossings |
| Bolt | 55% | Bottom plates only, 62mm offsets |
| InnerService | 52% | Wall studs at 296/446; top plates at 600mm spacing |
| Web | 3% | Mostly missing — varied positions, hard to derive |
| Chamfer | 16% | Kb sticks only — pattern unclear |
| LeftFlange/RightFlange | 0% | Rare special-case ops |
| ScrewHoles | 0% | Rare — anchor screws on bottom plates |

### Pack splitting — not implemented

Detailer splits one logical plan into multiple packs. Example: HG260001 has plan "GF-LBW-70.075" with 44 frames in the input XML. Detailer outputs:
- `HG260001_PK1-GF-LBW-70.075.rfy` (~10 frames)
- `HG260001_PK2-GF-LBW-70.075.rfy` (~10 frames)
- ...up to PK5

Our app outputs ONE file with all 44 frames in plan "PK1-GF-LBW-70.075". Loads OK on the machine but operator workflow expects the split.

The split logic itself is unknown — could be by frame size, gauge change, max sticks per coil run, etc. Need to analyse Detailer outputs across many jobs to derive the rule.

---

## The 38K-stick corpus

`research/output/` contains data extracted from 300 RFY files on the Y: drive:

| File | Contents |
|---|---|
| `stick-database.csv` | One row per op (38,060 unique sticks × ~14 ops avg) |
| `rules-draft.json` | 183 stick groups (role × profile × length-bucket) with derived patterns |
| `coverage-summary.txt` | Human-readable summary of group patterns |
| `quick-scan.txt` | Initial scan output |

To use the corpus to refine rules:
```bash
cd hytek-rfy-codec
node research/scripts/derive-rules.mjs       # produces rules-derived.txt
node research/scripts/sample-sticks.mjs --role T --bucket 3000-6000 --n 5
node research/scripts/validate-rules.mjs     # current recall + per-op breakdown
```

The corpus is gitignored (research/output/ is too big for git). To regenerate:
```bash
LIMIT=300 node research/scripts/scan-fast.mjs &
```
Walks Y: drive at known path `Y:\(YEAR) HYTEK PROJECTS\<customer>\<job>\06 MANUFACTURING\04 ROLLFORMER FILES\Split_<jobnum>\*.rfy`.

---

## Critical files

```
hytek-rfy-codec/src/
├── crypto.ts          ← AES key + IV format (Frida-discovered, do not change)
├── encode.ts          ← XML serialiser with CRLF + self-closing post-process
├── decode.ts          ← RFY → RfyDocument
├── synthesize.ts      ← Builds full RFY from CSV + project metadata
├── csv-parse.ts       ← CSV → CsvComponent[] with tooling
├── csv.ts             ← RfyDocument → CSV
├── format.ts          ← Type definitions
├── apply.ts           ← Apply CSV edits to existing RFY (legacy path)
└── rules/
    ├── types.ts        ← StickContext, OpRule, RuleGroup
    ├── engine.ts       ← Generic rule application
    ├── table.ts        ← The actual rule data (per role × profile × length)
    ├── frame-context.ts ← Crossing-based ops (uses outlineCorners)
    └── index.ts

hytek-rfy-tools/
├── lib/framecad-import.ts  ← XML → CSV converter; calls rules engine
├── app/api/encode-auto/route.ts  ← Main API endpoint
└── package.json            ← Pins @hytek/rfy-codec to specific commit

hytek-rfy-codec/research/scripts/
├── scan-fast.mjs       ← Fast Y: drive scanner
├── sample-sticks.mjs   ← Per-stick raw op viewer
├── derive-rules.mjs    ← Position-clustering analyzer
├── validate-rules.mjs  ← Round-trip validator
└── inspect-structure.mjs
```

---

## How to resume on a different PC

### Setup (one-time)

```bash
git clone https://github.com/scotttextor/hytek-rfy-codec.git
git clone https://github.com/scotttextor/hytek-rfy-tools.git
git clone https://github.com/scotttextor/hytek-hub.git

cd hytek-rfy-codec && npm install && npm run build
cd ../hytek-rfy-tools && npm install
```

### Verify nothing broke

```bash
cd hytek-rfy-codec
npm run build                          # should produce dist/ with no errors
node research/scripts/validate-rules.mjs   # should print 54%+ recall
```

### Test end-to-end against production

```bash
curl -s -X POST -H 'x-filename: framecad_import.xml' \
  --data-binary @<your-framecad_import.xml> \
  -o /tmp/result.rfy \
  https://hytek-rfy-tools.vercel.app/api/encode-auto

# Decode the result locally to inspect:
cd hytek-rfy-codec
node -e "import('./dist/index.js').then(c=>{const d=c.decode(require('fs').readFileSync('/tmp/result.rfy'));console.log(JSON.stringify(d.project.plans[0].frames[0].sticks[0],null,2));})"
```

### Make a change

1. Edit `hytek-rfy-codec/src/...`
2. `cd hytek-rfy-codec && npm run build`
3. Validate locally: `node research/scripts/validate-rules.mjs`
4. Commit + push codec
5. Bump rfy-tools pin (see top of doc)
6. Wait ~2 min for Vercel
7. Re-test against production

---

## Path to 100% — concrete next steps

In order of impact:

### 1. Refine rules from 38K corpus (4-8 hrs)

```bash
cd hytek-rfy-codec
node research/scripts/derive-rules.mjs
# Read research/output/rules-derived.txt
# Update src/rules/table.ts with high-confidence patterns
# Re-validate
```

Expected gain: 54% → 75%+ recall

### 2. Fix the 0%/3% op types (Web, ScrewHoles, LeftFlange, RightFlange) (4 hrs)

These are rare per-op-type but appear on specific stick variants:
```bash
node research/scripts/sample-sticks.mjs --role W --bucket 500-1500 --n 10
# Find the position pattern, encode in table.ts
```

### 3. Implement pack splitting (8 hrs)

Detailer's exact split algorithm is unknown. Best approach:
1. Compare Detailer's PK1...PK5 outputs for same job
2. Find what's common to each pack (e.g. all frames in PK1 are short, PK2 are tall, etc.)
3. Hypothesise the split rule
4. Implement in `synthesize.ts` — output multiple `<plan>` nodes inside one `<schedule>`, OR output a ZIP of multiple RFY files

### 4. Compute proper design_hash (8 hrs)

Reverse-engineer Detailer's algorithm:
```bash
# Look at multiple Detailer RFYs for same stick
node -e "
const c = await import('./dist/index.js');
const fs = require('fs');
for (const f of ['_det_PK4.rfy', '_det_PK5.rfy']) {
  const d = c.decode(fs.readFileSync('test/fixtures/' + f));
  for (const p of d.project.plans) for (const fr of p.frames) for (const s of fr.sticks) {
    if (s.name === 'S1') console.log(f, fr.name, s.designHash);
  }
}
"
```

If hashes for IDENTICAL sticks (same length, profile, ops) match → algorithm depends only on stick content. Try SHA-1 of various canonical forms (XML stick body, profile+length+tooling, etc.).

### 5. Match number formatting (2 hrs)

Detailer outputs `length="3600.00002670288"` (15 decimal places). We output `length="4050"` (integer when possible). To match:

```typescript
// Use double-to-string with 15 sig figs:
function detailerNum(n: number): string {
  // Pascal/Delphi default: ToString prints 15 sig digits
  return n.toPrecision(15).replace(/\.?0+$/, '') || '0';
}
```

Apply to all numeric attributes in synthesize.ts.

### 6. Use 3D coordinates from input XML (4 hrs)

The framecad_import.xml has `<start>x,y,z</start>` and `<end>x,y,z</end>` for every stick. We currently throw these away in the CSV conversion. To match Detailer's elevation-graphics positions and transformationmatrix values:
- Extend CsvComponent to carry start/end 3D coords
- Compute proper frame transformationmatrix from frame's first stick coords
- Compute proper outlineCorners in 2D elevation projection

---

## Anti-patterns (mistakes already made — don't repeat)

1. **Don't guess at the rollformer's requirements one element at a time.** Wasted ~3 hours adding things one by one. Better approach: do a comprehensive element-path diff between a working Detailer file and ours, fix everything in one shot.

2. **Don't forget to bump the rfy-tools codec pin.** Vercel build cache will reuse old code. Pin to specific commit hash in package.json.

3. **Don't hard-refresh the browser** isn't enough — pin the codec hash so npm fetches fresh code on Vercel build.

4. **Don't add stub data without testing.** Empty `<plan-graphics/>` was rejected; needed actual content. Stub data3d worked because the rollformer doesn't use it for cutting, only display.

5. **Don't trust "should work" until you've SEEN it work on the F300i.** The rollformer accepts files that pass its parser, regardless of whether the steel comes out right.

---

## Reference: Discovery notes

- AES key + IV format: discovered via Frida hook of libcrypto-3.dll in FRAMECAD Detailer v5.3.4.0 on 2026-04-24. Key: `4433bea8ab8792c07f95b593a06418b0` (hex).
- Reference RFY: `Y:\(17) 2026 HYTEK PROJECTS\CORAL HOMES\HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI\06 MANUFACTURING\04 ROLLFORMER FILES\Split_HG260001\HG260001_PK5-GF-LBW-70.075.rfy`
- Frida capture: `scripts/capture-20260424-195044.jsonl`
- Detailer v5.3.4.0 will become unusable (license expiry / EOL) — that's why we're replacing it.

---

## Key conversation history

The session that got us here is at:
`C:\Users\ScottTextor\.claude\projects\C--Users-ScottTextor-CLAUDE-CODE\92ee9668-cb7d-4377-a8fa-531aa0bc7d15.jsonl`

Major commits along the way (codec):
- `1860c68` Add rules engine
- `89ee7ad` Add transformationmatrix + design_id GUIDs + plan-graphics
- `bacba9e` Pretty-print with CRLF + 2-space indent
- `8310633` Add data3d + design_hash to every stick
- `9c256fb` Add frame elevation/plan-graphics + stick text/circle
- `55a10a7` Add PK1- plan name prefix

If picking this back up cold: read `research/STATUS.md` first, then this doc.
