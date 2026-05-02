# HANDOVER — ITM Linear-Truss Simplifier

**Last session:** 2026-05-02
**Status:** Standalone simplifier WORKING and COMMITTED. Next: integrate into `hytek-itm`.

---

## What's done

A post-processor that rewrites FrameCAD's RFY output to use a **centreline-intersection web-hole rule** for Linear trusses (89S41 LC system / model M81). Cuts BOLT HOLES per job by ~38% while preserving all other tooling exactly.

### Files added to `scripts/`

| Script | Purpose |
|---|---|
| `simplify-rfy-direct.mjs` | **THE production tool** — RFY+XML → simplified RFY. Preserves TrussChamfer / Flange / PartialFlange / LipNotch / Swage / InnerDimple byte-for-byte. |
| `simplify-truss.py` | Python CSV-only path (for inspection) |
| `csv-to-rfy.mjs` | CSV→RFY synth helper using the existing codec |
| `verify-simplified.py` | Math verification — proves simplified bolts = exact CL crossings |

### Verified end-to-end on test job

```
Job: 2603191 ROCKVILLE TH-TYPE-A1-LT-GF-LIN-89.075
Original BOLT HOLES: 1359
Simplified:           837   (-522, -38%)
SWAGE/LIP/LEG/DIMPLE: unchanged ✓
22 frames detected as Linear, 0 wrongly skipped, 0 wrongly applied
```

### Verification spot-check (TN2-1/W5)

```
Original:    7 BOLT HOLES at 58.5, 77.0, 1841.33, 1859.83, 1912.33, 1958.23, 1971.22
Simplified:  3 BOLT HOLES at 41.5, 1876.83, 1989.62

CL crossings (computed from XML coords):
  W5 ∩ B1  (bottom chord)  → 41.50  ✓
  W5 ∩ C4  (collar tie)    → 1876.83 ✓
  W5 ∩ T3  (top chord)     → 1989.62 ✓

PASS — bolts are at exact centreline-intersection positions.
```

---

## The rule (locked in — don't re-debate)

### Connection rule (replaces FrameCAD's offset-based BOLT HOLES)

```
WEB HOLE = 3 × Ø3.8mm at 17mm pitch, perpendicular to each stick's length

For every pair of sticks (A, B) whose centrelines intersect within
both sticks' physical bounds (slack 20mm tolerance):
  → Stick A: 3 holes perpendicular to A, middle hole at intersection
  → Stick B: 3 holes perpendicular to B, middle hole at intersection
  → Middle holes coincide → ASSEMBLY REGISTRATION
  → 3 screws → position + angle locked, 3× shear capacity

Applies to ALL pair types: W↔T, W↔B, W↔C, C↔T, T↔T, T↔B, B↔B, W↔W
NO clustering. Every pairwise intersection = its own pattern.
```

### Tools preserved exactly from source RFY

```
TrussChamfer        @ stick ends → keeps stick inside chord boundary
LeftFlange / RightFlange         → trims chord-end flange flush w/ angled cut
LeftPartialFlange / RightPartialFlange  → web-end flange cut so web lays flat
LipNotch            → lip cut so it doesn't poke up
Swage (continuous span)           → web stiffness at connection points
InnerDimple         @ chord splices → alignment registration (Ø5.1)
```

### 4-layer bullet-proof detection (per-frame)

```
Layer 1: frame.type === "Truss"             (filter walls/floors)
Layer 2: plan.name matches /-LIN-/i          (filter non-Linear systems)
Layer 3: every stick is 89×41 lipped C 0.75  (filter wrong materials)
Layer 4: frame has chord+web members         (sanity check)

ALL FOUR must pass. Single failure = silent skip with audit log.
```

---

## ITM context (research from this session)

### "ITM" has TWO meanings

1. **OLD ITM** = Frame ITM Report in legacy HYTEK Portal. Read-only LM tally. No frame mutations.
2. **NEW ITM** = `hytek-itm` app. Replaces FrameCAD Detailer V5 + legacy Portal. Takes FrameCAD Structure XML, builds packs interactively, emits full factory bundle.

### Where the simplifier integrates

**In the manual procedure** (`Y:\(17) 2026 HYTEK PROJECTS\(01) DEPARTMENT FOLDERS\(02) DETAILING\ITM Procedure.pdf`, 32 pages):

```
Part L — Export RFY and CSV Manufacturing Files   ← simplifier slots here
```

**In the new `hytek-itm` app** (`C:\Users\Scott\OneDrive - Textor Metal Industries\HYTEK CODE BACKUP\hytek-itm\`):

`lib/bundle-server.ts` already imports `synthesizeRfyFromCsv` from `@hytek/rfy-codec`. Adding the simplifier is small glue:

```typescript
import { synthesizeRfyFromCsv, simplifyLinearTrussRfy } from "@hytek/rfy-codec";

// In buildBundle:
let rfy = synthesizeRfyFromCsv(csv, opts).rfy;
if (input.applyLinearSimplification) {
  rfy = simplifyLinearTrussRfy(rfy, xmlText);
}
```

### Critical caveat

The CSV Editor in the OLD Portal does **structural edits** during CSV generation:
- `checkBoxedAndAddLipNotches` (BMT > 0.95)
- `checkBoxedAndRemoveSwages`
- `checkWebNotchesAtEnds` (clamps to ≥30mm from end)

The new `hytek-itm` app's `lib/tooling/` does the equivalent. **The simplifier MUST run AFTER these edits**, or it could place bolts where the structural rules later move material. In `bundle-server.ts`, that means after `frameToComponents()` and the tooling pipeline, before final RFY emit.

---

## Phase B integration plan (NEXT SESSION DOES THIS)

### Step 1 — Lift `simplifyLinearTrussRfy` into TS module

Currently in `scripts/simplify-rfy-direct.mjs` (a CLI script). Move the core logic to:

```
src/simplify-truss.ts        ← new module
src/simplify-truss.test.ts   ← TDD tests
```

Export from `src/index.ts`:

```typescript
export {
  simplifyLinearTrussRfy,
  type SimplifyOptions,
  type SimplifyResult,
} from "./simplify-truss.js";
```

### Step 2 — Wire into `hytek-itm/lib/bundle-server.ts`

Add `applyLinearSimplification?: boolean` to `BundleInput`. When true, run `simplifyLinearTrussRfy()` on each emitted RFY.

### Step 3 — Add UI checkbox in Pack Builder

`components/PackBuilder.tsx` or wherever the "Generate Bundle" button lives. Default OFF. Tooltip: "Apply Linear-truss centreline-rule (engineering review required before production use)".

### Step 4 — Audit log surfacing

The simplifier already produces a per-frame audit log (APPLY/SKIP + reason). Surface this in the bundle UI so the operator can verify which frames got the rule.

### Step 5 — Engineering review

The 3-bolts-per-junction rule reduces shear capacity vs FrameCAD's offset clusters. The FrameCAD shop drawing states "Minimum number of fasteners required is 3 per joint" — the simplifier meets this minimum but at different positions. **Engineering must verify** the centreline-cluster is structurally equivalent before the flag defaults ON.

---

## Decision log (don't re-debate)

| Decision | Resolution |
|---|---|
| Modify .dat or post-process? | **Post-process.** .dat changes parameters; FrameCAD's algorithm is in the EXE. |
| Cluster apex/heel intersections? | **No clustering.** Every CL pair-crossing = own pattern. |
| 3 holes vertical or perp to stick? | **Perpendicular to each stick's own length**, middle hole on stick centreline at intersection. |
| Apply to all -LIN- frames? | **Yes** (whole job uses M81 model). Per-frame 4-layer detection still required. |
| Where to integrate? | **Phase B: hytek-itm/lib/bundle-server.ts behind opt-in flag.** |
| Default for the flag? | **OFF until engineering signs off.** |

---

## Test commands

```bash
cd "C:\Users\Scott\CLAUDE CODE\hytek-rfy-codec"
npm run build

# Run on test job
node scripts/simplify-rfy-direct.mjs \
  "C:\Users\Scott\AppData\Local\Temp\2603191-GF-LIN-89.075 (4).rfy" \
  "C:\Users\Scott\AppData\Local\Temp\2603191 ROCKVILLE TH-TYPE-A1-LT-GF-LIN-89.075 (1).xml" \
  --out "C:\Users\Scott\OneDrive - Textor Metal Industries\Desktop\test.simplified.rfy"

# Verify math
python scripts/verify-simplified.py xml.xml orig.csv simp.csv TN2-1-W5

# Inspect a stick after simplification
node scripts/decode-frame.mjs simplified.rfy "TN2-1" "W5"
```

---

## Read these first when resuming

1. `C:\Users\Scott\OneDrive - Textor Metal Industries\CLAUDE DATA FILE\memory\session_landmark_itm_simplifier_integration.md` (auto-loaded via memory)
2. `Y:\(17) 2026 HYTEK PROJECTS\(01) DEPARTMENT FOLDERS\(02) DETAILING\ITM Procedure.pdf` (32 pages — the official procedure)
3. `C:\Users\Scott\OneDrive - Textor Metal Industries\HYTEK CODE BACKUP\hytek-itm\CLAUDE.md`
4. `C:\Users\Scott\OneDrive - Textor Metal Industries\HYTEK CODE BACKUP\hytek-itm\lib\bundle-server.ts`
5. `C:\Users\Scott\CLAUDE CODE\hytek-rfy-codec\scripts\simplify-rfy-direct.mjs` (the source for Step 1's TS lift)

---

## Outputs sitting on Scott's Desktop (test artefacts)

```
C:\Users\Scott\OneDrive - Textor Metal Industries\Desktop\
├── 2603191-GF-LIN-89.075.csv                    (source-of-truth CSV from Scott)
├── 2603191-GF-LIN-89.075.simplified.csv         (Python path output)
└── 2603191-GF-LIN-89.075.simplified-direct.rfy  (THE RFY for F300i testing)
```
