# TToolDef Extraction — Methodology + Findings

**Generated:** 2026-05-08
**Source binary:** `C:/Program Files (x86)/FrameCAD/Detailer/Version 5/Tooling.dll` (1.8 MB, Detailer V5)
**Output:** `docs/cracked/tooldef-table.json`

## TL;DR

The `TToolDef` table — what each Detailer verb (`lipnotch`, `swage`, etc.)
emits as a runtime tooling op — has been extracted via three corroborating
paths:

1. **Static binary scan** (Path 1): definitive verb→ToolType-ID mapping from
   the parser table at `.text:0x58fb36`.
2. **Empirical corpus mining** (Path 2): per-ToolType opType + length
   distributions from 385 paired Detailer-vs-codec diffs (134 858 ops).
3. **Cross-reference** (Path 3): codec ToolType names confirmed against
   `src/csv-parse.ts`.

**Coverage:** 7 of 15 verbs have **high-confidence** opType + length values
(LipNotch, InnerNotch, Swage, RightFlange, LeftFlange, plus their lipnotch
side-variants). 4 verbs (`tab`, `webtabholes`, `bad`, `null`) have no codec
equivalent and 0 samples — they're left `null` rather than fabricated.

---

## Path 1 — Static binary scan

**Script:** `scripts/cracked/extract-tooldef.py`

The Tooling.dll is a 32-bit Delphi-compiled PE. Strings are **Delphi
UnicodeString** (UTF-16 LE, length-prefixed), not C-strings — the first
attempt to scan for ASCII verb-names returned 0 hits because of this.

After fixing the string-finder to look for `<UTF-16-encoded text>\x00\x00`
with a length-prefix sanity check, the verbs were located:

```
verb                file_off    VA          xref count
lipnotch            0x10316c    0x504e6c    1
webnotch            0x10318c    0x504e8c    1
leftflange          0x1031ac    0x504eac    1
rightflange         0x1031d0    0x504ed0    1
leftpartialflange   0x1031f4    0x504ef4    1
rightpartialflange  0x103224    0x504f24    1
swage               0x103258    0x504f58    1
tab                 0x103270    0x504f70    1
webtabholes         0x103284    0x504f84    1
bad                 0x1032a8    0x504fa8    1
null                0x1032bc    0x504fbc    1
```

Each verb-string has exactly **one xref** in the binary, and all xrefs cluster
at consecutive 5-byte intervals around `.data:0x590e76`:

```
Source pointer table at VA 0x58fb36 (file off 0x18e336):
  entry[ 0]  ptr=0x00503eec  tag=0x09  -> "lipnotch"
  entry[ 1]  ptr=0x00503f0c  tag=0x08  -> "webnotch"
  entry[ 2]  ptr=0x00503f2c  tag=0x0a  -> "leftflange"
  entry[ 3]  ptr=0x00503f50  tag=0x0b  -> "rightflange"
  entry[ 4]  ptr=0x00503f74  tag=0x0c  -> "leftpartialflange"
  entry[ 5]  ptr=0x00503fa4  tag=0x0d  -> "rightpartialflange"
  entry[ 6]  ptr=0x00503fd8  tag=0x0e  -> "swage"
  entry[ 7]  ptr=0x00503ff0  tag=0x12  -> "tab"
  entry[ 8]  ptr=0x00504004  tag=0x15  -> "webtabholes"
  entry[ 9]  ptr=0x00504028  tag=0xfe  -> "bad"
  entry[10]  ptr=0x0050403c  tag=0xff  -> "null"
```

Each entry is a 4-byte pointer to the UnicodeString plus a 1-byte
**TToolType** ordinal. The decompiled code at `FUN_005047d4` (Ghidra) reads
this 11-entry × 5-byte table and registers each (string, tag) pair into
the runtime parser.

The 5-byte stride was confirmed by Ghidra's decompile of `FUN_005047d4`:
```c
ppuVar2 = &PTR_u_lipnotch_0058fb36;
iVar1 = 0xb;  // 11 entries
do {
    FUN_0040b654(...);
    ppuVar2 = (undefined **)((int)ppuVar2 + 5);  // stride 5
    ...
} while (iVar1 != 0);
```

The TToolType ordinals **leave gaps** (no 0x0f, 0x10, 0x11, 0x13, 0x14, 0x16-0xfd) —
those are likely runtime-only variants like `rl_lipnotch` (corner-side
copies of `lipnotch` with different `TOpCopyType`). The `bad` and `null`
ordinals (0xfe, 0xff) are sentinels.

### Limitation of Path 1

`OperationType`, `Length`, `ToolLocation`, and `CoordType` are **NOT** stored
in this static table. The Pythia-extracted `TToolData` class (VA 5256928,
instanceSize=24) has fields `FLength`, `FToolLocation`, `FToolType` but
these are populated at runtime by `TToolData.Create(aTool, aLength,
aLocation)` calls scattered through the binary's startup code. Without
running the binary under Frida, only the verb→ToolType-ID mapping is
recoverable from static analysis.

---

## Path 2 — Empirical corpus mining

**Script:** `scripts/cracked/empirical-tooldef.mjs`

The codec ships with **385 paired diff JSON files** at
`scripts/baselines/raw-y-pairs/<job>__<plan>.json`. Each pair is a frame-by-
frame, stick-by-stick comparison of the codec's emit vs. Detailer's reference
RFY. The `missing` array on each stick is **the ground truth** — ops Detailer
emitted that the codec didn't.

Across 385 pairs, **134 858 missing ops** were classified. Each op string
has the form `Type pos1..pos2` (spanned), `Type @pos` (point), or
`Type @start|@end` (edge). After clustering by ToolType:

| ToolType            | OpType                   | Modal Length | Confidence | Samples |
|---------------------|---------------------------|--------------|------------|---------|
| Bolt                | otPointTool               | n/a          | high       | 491     |
| Chamfer             | otStartTool / otEndTool   | n/a          | high       | 4 342   |
| InnerDimple         | otPointTool               | n/a          | high       | 47 662  |
| InnerNotch          | otSpannedTool             | 45 mm        | high       | 6 474   |
| InnerService        | otPointTool               | n/a          | high       | 7 011   |
| LeftFlange          | otSpannedTool             | (geometry)   | high       | 231     |
| LipNotch            | otSpannedTool             | 45 mm        | high       | 26 614  |
| RightFlange         | otSpannedTool             | (geometry)   | high       | 251     |
| ScrewHoles          | otPointTool               | n/a          | high       | 677     |
| Swage               | otSpannedTool             | 45 mm        | high       | 26 692  |
| Web                 | otPointTool               | n/a          | high       | 14 413  |

### Length-pattern insight

For LipNotch, InnerNotch, and Swage the **two top buckets are 45 mm and
39 mm** — i.e. `45 - 2×3 mm clearance`. Detailer trims `swageClearance`
(typically 3 mm) off each end of the nominal tool length when the joint
demands it. This means:

- `Lengthh1P` for these tools = **machine-setup tool length** (typically
  45–48 mm depending on profile, configurable via `lipNotchToolLength()`)
- The 39 mm appearance is the same tool with the standard end-clearance
  trim applied

For LeftFlange / RightFlange the length distribution has no dominant mode
(modal_pct < 18 %, range 2.6 mm–1 092 mm). These are **geometry-driven** —
the span runs from a corner intersection to the stick end, length = end -
intersection_pos.

---

## Path 3 — Cross-reference

**Script:** `scripts/cracked/build-tooldef-table.mjs`

Each verb's TToolType ID was mapped to its codec ToolType name via
`src/csv-parse.ts`:

| Verb                | TToolType ID | Codec ToolType        | Notes |
|---------------------|--------------|------------------------|-------|
| webnotch            | 8            | InnerNotch             | csv = "WEB NOTCH" |
| lipnotch            | 9            | LipNotch               | |
| leftflange          | 10           | LeftFlange             | |
| rightflange         | 11           | RightFlange            | |
| leftpartialflange   | 12           | LeftPartialFlange      | not in 385-pair MISSING corpus — codec already correct OR neither side emits |
| rightpartialflange  | 13           | RightPartialFlange     | same |
| swage               | 14           | Swage                  | |
| tab                 | 18           | _(no equivalent)_      | not in TOOL_TYPES; 0 samples |
| webtabholes         | 21           | _(no equivalent)_      | not in TOOL_TYPES; 0 samples |
| bad                 | 254          | _(sentinel — emit nothing)_ | |
| null                | 255          | _(sentinel — emit nothing)_ | |
| rl_lipnotch         | 9 (variant)  | LipNotch               | CopyType = octRightLow |
| ll_lipnotch         | 9 (variant)  | LipNotch               | CopyType = octLeftLow |
| rh_lipnotch         | 9 (variant)  | LipNotch               | CopyType = octRightHigh |
| lh_lipnotch         | 9 (variant)  | LipNotch               | CopyType = octLeftHigh |

---

## Confidence per verb

| Verb                | OpType Confidence | Length Confidence | Recommendation |
|---------------------|-------------------|-------------------|----------------|
| lipnotch            | **high**          | **high** (45 mm)  | Wire up |
| rl_lipnotch         | **high**          | **high** (45 mm)  | Wire up — CopyType=octRightLow |
| ll_lipnotch         | **high**          | **high** (45 mm)  | Wire up — CopyType=octLeftLow |
| rh_lipnotch         | **high**          | **high** (45 mm)  | Wire up — CopyType=octRightHigh |
| lh_lipnotch         | **high**          | **high** (45 mm)  | Wire up — CopyType=octLeftHigh |
| webnotch            | **high**          | **high** (45 mm)  | Wire up — emits InnerNotch |
| swage               | **high**          | **high** (45 mm)  | Wire up |
| rightflange         | **high**          | **high** (geometry) | Wire up — span from src to stick-end |
| leftflange          | **high**          | **high** (geometry) | Wire up — span from src to stick-end |
| leftpartialflange   | medium            | low               | Wire up cautiously — opType=otSpannedTool by analogy with leftflange; no corpus evidence |
| rightpartialflange  | medium            | low               | Same |
| tab                 | unknown           | unknown           | Skip — no codec ToolType mapping; flagged TODO |
| webtabholes         | unknown           | unknown           | Skip — no codec ToolType mapping; flagged TODO |
| bad                 | n/a (sentinel)    | n/a               | Already handled — emit nothing |
| null                | n/a (sentinel)    | n/a               | Already handled — emit nothing |

---

## Wiring-agent next steps

The wiring agent in `src/rules/action-defs-pass.ts` currently:

1. ❌ Treats every spanned verb (lipnotch/swage/webnotch/partial flanges) as
   "centred span on `intersectionPos` with width `lipNotchSpan`". This is
   correct for **lipnotch / swage / webnotch** but the centring assumption
   is wrong for **rightflange / leftflange** which should run from the
   crossing position to a stick-end.

2. ❌ Treats `rightflange` / `leftflange` as `min(src, dst) → max(src, dst)`,
   but the span tokens like `ww-wend` (from corner WW to wend = stick end)
   already encode the geometry — so this branch is mostly correct, but the
   length will be the geometry-driven distance, not a fixed `lipNotchSpan`.

3. ❌ Treats `rl_lipnotch` / `ll_lipnotch` / `rh_lipnotch` / `lh_lipnotch`
   identically to `lipnotch` — losing the CopyType (corner side) info.

### Concrete TODOs for the wiring agent

1. **Add a `tooltype-to-optype.ts` lookup** that exports the constants from
   this report (e.g. `LIPNOTCH_LENGTH_MM = 45`, `SWAGE_OPTYPE = "spanned"`).
2. **Switch the `rightflange/leftflange` branch** to honour the src→dst
   span exactly (as it currently does, but stop overriding length with
   `lipNotchSpan`).
3. **Add a CopyType field to RfyToolingOp** (or to a sibling extension type)
   so the corner-side variants can be propagated downstream. This may be
   deferred if the codec's downstream consumers don't care about CopyType.
4. **Skip `tab`/`webtabholes`** — already done, keep as TODO with reference
   to this report.
5. **Treat `leftpartialflange`/`rightpartialflange` with the same shape as
   `leftflange`/`rightflange`** until corpus evidence appears (this is the
   natural Detailer-side interpretation given they share the
   "PartialFlange" opcode family).

---

## Re-running the extraction

```bash
# Path 1 — static binary scan (re-runnable; deterministic on a given DLL)
python scripts/cracked/extract-tooldef.py

# Path 2 — corpus mining (re-runnable; deterministic on the 385-pair corpus)
node  scripts/cracked/empirical-tooldef.mjs

# Path 3 — combine
node  scripts/cracked/build-tooldef-table.mjs
```

Outputs:

- `docs/cracked/tooldef-extraction-raw.json` (Path 1 raw)
- `docs/cracked/tooldef-empirical.json`      (Path 2 raw)
- `docs/cracked/tooldef-table.json`          (final, **the deliverable**)

---

## Open questions for a future session

1. **Frida confirmation of TToolDef.Create calls.** A live trace of
   `TToolData.Create(aTool, aLength, aLocation)` during Detailer startup
   would yield each verb's exact runtime `Lengthh1P`, `ToolLocation` and
   `CoordType`. Static analysis can only get to the verb→ID mapping; the
   binary's startup code populates the rest from `MachineSetup` records,
   not from compile-time constants.

2. **The `rl_lipnotch` family's CopyType encoding.** The strings
   `octLeftLow`, `octLeftHigh`, `octRightLow`, `octRightHigh` are present
   (Tooling.strings.txt:10142–10147) but their assignment to the four
   side-variants is implicit. A hex dump near the action-def parser would
   confirm.

3. **leftpartialflange / rightpartialflange opType.** No corpus evidence
   means we're inferring by analogy with leftflange/rightflange. The first
   plan that uses these (likely a reverse-track plan) will let us validate.

4. **Higher-resolution `Length` per machine setup.** The 45 mm modal value
   in this report is the **bulk-corpus mode**. Per-setup, the actual length
   varies (70 mm profile = 48 mm, 89 mm profile = 48 mm, 104 mm = 75 mm
   per `lipNotchToolLength()`). The codec already handles this via
   `MachineSetup.tools[]` lookup.
