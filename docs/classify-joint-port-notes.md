# `classifyJoint()` — Port Notes

**Source**: `Tooling.dll` — Ghidra decompile at
`docs/ghidra-out/decompiled-all.txt`

**Companion files**:
- Implementation: `src/rules/classify-joint.ts`
- Tests: `src/rules/classify-joint.test.ts`
- Background analysis: `docs/detailer-rule-decoded.md`

**Scope**: TypeScript port of Detailer's joint classifier (the
`ActionDefsManager` lookup-key generator). Mirrors `FUN_00538b00` and its
three sub-dispatchers `FUN_00538bb8` / `FUN_00538e70` / `FUN_00539258`.

**Not yet wired** into `frame-context.ts` — that's the next step. This
module is callable + tested in isolation.

---

## 1. The 28 Classification Names — Provenance Table

For each `JointClassification` literal the port emits, this table cites the
Ghidra decompile location (line number / function VA) where the matching
`L"..."` wide-string appears.

| Classification name              | Where emitted (decompile line) | Function (VA) |
|----------------------------------|--------------------------------|----------------|
| `None`                           | 98321, 98334, 98401, 98420, 98433, 98474, 98477, 98489, 98582, 98599 | FUN_00538b00 / many |
| `OnEdge - Standard`              | 98509, 98513                   | FUN_00538e70 (0x538e70) |
| `OnEdge - LipNotchedStandard`    | 98517                          | FUN_00538e70 |
| `OnEdge - LipNotchedStandard2`   | 98502                          | FUN_00538e70 |
| `OnEdge - LipNotchedStandard3`   | 98505                          | FUN_00538e70 |
| `OnEdge - LipNotches`            | 98480, 98492                   | FUN_00538e70 |
| `OnEdge - Over`                  | 98409, 98496                   | FUN_00538bb8 / FUN_00538e70 |
| `OnEdge - PartialFlanges`        | 98466                          | FUN_00538e70 |
| `OnFlat - Standard`              | 98546                          | FUN_00539258 (0x539258) |
| `OnFlat - Reversed`              | 98564                          | FUN_00539258 |
| `OnFlat - LipNotchedCorners`     | 98560                          | FUN_00539258 |
| `OnFlat - LipNotchedCorners Reversed` | 98540                     | FUN_00539258 |
| `OnFlat - Tabbed`                | 98549                          | FUN_00539258 |
| `OnFlat - Tabs`                  | 98606                          | FUN_00539258 |
| `OnFlat - TabHoles`              | 98609                          | FUN_00539258 |
| `OnFlat - WebIntersections Bad`  | 98602                          | FUN_00539258 |
| `OnFlat - Over`                  | 98390, 98553, 98568            | FUN_00538bb8 / FUN_00539258 |
| `OnFlat - Over2`                 | 98574                          | FUN_00539258 |
| `OnFlat - Swaged`                | 98417, 98556, 98579            | FUN_00538bb8 / FUN_00539258 |
| `OnFlat - Swaged2`               | 98571                          | FUN_00539258 |
| `OnFlat - Swaged3`               | 98589                          | FUN_00539258 |
| `OnFlat - TrussBoxed`            | 98586                          | FUN_00539258 |
| `OnFlat - Omega`                 | 98430                          | FUN_00538bb8 |
| `OnFlat - Frama`                 | 98617                          | FUN_00539258 |
| `OnFlat - DualTrack Standard`    | 98640                          | FUN_00539258 |
| `OnFlat - DualTrack PlateToStud` | 98633, 98643                   | FUN_00539258 |
| `OnFlat - DualTrack StudToPlate` | 98626, 98646                   | FUN_00539258 |

**Coverage**: 27 distinct strings (28 if you count `None` as a separate
classification, which the codec's `JointClassification` union does).

The `OnFlat - Over` / `Over2`, `Swaged` / `Swaged2` / `Swaged3` triples and
the three `DualTrack` variants make up the bulk of the layered-track logic.

---

## 2. The `param_3` 11-bit Flag Bitmask

Every flag bit consumed by the classifier branches we ported, with the
decompile site that uses it.

| Bit (hex) | Name                  | First use (line) | Branch effect |
|-----------|----------------------|------------------|---------------|
| 0x0001    | `forReversed`        | 98542            | OnFlat: forces "OnFlat - Reversed" when both sticks non-C |
| 0x0002    | `forSuppressSwage`   | 98578            | OnFlat: substitutes "None" for "OnFlat - Swaged" |
| 0x0004    | `forLipNotchedCorners` | 98543          | OnFlat: forces "LipNotchedCorners" |
| 0x0020    | `forDualTrack`       | 98534            | OnFlat: enters DualTrack sub-branch |
| 0x0040    | `forAsymOverSwaged`  | 98544            | OnFlat: with HasOuterFlange-mismatch, picks Over vs. Swaged |
| 0x0080    | `forWebIntersection` | 98536            | OnFlat: enters Tabs/TabHoles/WebIntersectionsBad sub-branch |
| 0x0100    | `forTabbed`          | 98545, 98597     | OnFlat: standard→Tabbed; tabs→Tabs/TabHoles |
| 0x0200    | `forBackToBack`      | 98318            | TOP-LEVEL: forces "None" early — no ops emitted |
| 0x0400    | `forLayer2`          | 98567, 98577     | OnFlat: switches Over/Swaged → Over2/Swaged2/Swaged3/TrussBoxed |
| 0x0800    | `forBoxing`          | 98535            | OnFlat: enters Boxing/Frama sub-branch |
| (unknown) | `forSplicing`        | —                | Reserved — bit position not confirmed in decompile |

The `_DAT_00539828` global at line 98539 is a runtime-initialized "all
required bits set" mask compared as `(~param_3 & _DAT_00539828) == 0`. From
context (this gates `OnFlat - LipNotchedCorners Reversed`) it likely equals
`0x0005` = `forReversed | forLipNotchedCorners`. **TODO-DECOMPILE**: Frida
hook on `FUN_00539258` to dump this value at runtime — we currently
approximate it as `0x0005` in the port (see `classify-joint.ts` line ~190).

---

## 3. Per-Stick Property Record (`StickProps`)

Detailer's `FUN_005456bc` builds a 0x14-byte struct from each stick. We
expose named TypeScript fields. The byte-offset → field mapping was
inferred from decoder report §2; for fields where the offset cited there
disagreed with the decompile reads, we trusted the decompile.

| TS field         | Decoder report field    | Decompile evidence |
|------------------|--------------------------|--------------------|
| `isCSection`     | offset 0x00 — `IsCSection`            | `*param_1` reads in 98533, 98537, 98538, 98592 |
| `secondaryFlag`  | offset 0x01 — semantics ambiguous     | `param_1[1] == param_2[1]` at 98476, 98488, 98501 |
| `swageClearance` | offset 0x10 — `SwageClearance`        | Not used in classifier branches we ported |
| `isHybridFlange` | offset 0x11 — `IsHybridFlange`        | Not directly read — likely consumed by `FUN_00538aa0` helpers (see TODOs) |
| `isTrussChord`   | offset 0x12 — `IsTrussChord`          | `param_1[0x12]` at 98323, 98326 |
| `isBoxing`       | offset 0x13 — `IsBoxing` (bit-flagged)| `param_1[0x13]` OR'd at 98369-98370; `!= 2` at 98427 |
| `hasOuterFlange` | offset 0x14 — `HasOuterFlange`        | `param_1[0x14]` at 98487, 98495, 98544, 98552, 98570, 98585, 98594, 98598, 98605, 98625, 98632, 98639, 98642 |

### `secondaryFlag` semantics

The decompile reads `param_1[1]` as a comparable byte at three sites — all
inside `OnEdge` LipNotchedStandard variant selection. From decoder report §6.2,
this byte distinguishes "sub-variants of LipNotchedStandard". We could not
fully nail down what physical property it encodes. The conservative port
treats it as opaque: callers compare two sticks' secondaryFlag for equality;
the actual byte value is not interpreted.

### `isBoxing` is bit-flagged, NOT a bool

`FUN_00538bb8` line 98367-98371 OR's the two sticks' IsBoxing bytes and
tests bit 4. Then line 98427 tests `IsBoxing != 2`. So:
- `0` = non-boxed
- `1` = boxed (some marker)
- `2` = "Omega sentinel" (returns "OnFlat - Omega" if both sticks have this)
- `bit 4 (0x4)` = "OnEdge subgroup" — when set on either stick, dispatches
  to Omega/None/fallback paths

We keep `isBoxing: number` to preserve all bits.

---

## 4. Ambiguous Decompile Sites — `// TODO-DECOMPILE` Inventory

These are flagged in `classify-joint.ts` with `TODO-DECOMPILE` comments. Each
is a place where the Ghidra output was insufficient to pin down behaviour
unambiguously, and the port made a best-effort guess.

### A. Three `DAT_005xxxxx` runtime-string pointers

| DAT pointer    | Used in                         | Inferred value         | Confidence |
|----------------|----------------------------------|------------------------|------------|
| `DAT_00538da8` | FUN_00538bb8 (mixed truss path) | `"OnFlat - Swaged"`    | medium — decoder report §6.3 says this is the default for mixed truss × non-truss |
| `DAT_00539214` | FUN_00538e70 (chord-chord path) | `"OnEdge - Standard"`  | medium — decoder report §6.2 says this is the chord-chord default |
| `DAT_0053954c` | FUN_00539258 (OnFlat path)      | `"OnFlat - Standard"`  | high — used as the OnFlat fallback in many branches; decoder §6.1 default |

These are wide-string literals in `.rdata` that Ghidra's decompile didn't
inline. **Recovery path**: `objdump -s -j .rdata Tooling.dll | grep -A2
'00538da8'` (etc.) should reveal the literal bytes. Or Frida-hook
`FUN_0040a118` at runtime and dump `param_2` when called from the relevant
sites.

### B. `_DAT_00539828` — the "all required bits" mask

Line 98539: `if ((~param_3 & _DAT_00539828) == 0)` gates "OnFlat -
LipNotchedCorners Reversed". The mask is initialised at runtime — Ghidra
shows it as a global variable, not a constant. From the surrounding context
(this is the only path that yields the `Reversed` + `LipNotchedCorners`
combination), the mask is `forReversed | forLipNotchedCorners = 0x0005`.

The port uses `flags.forReversed && flags.forLipNotchedCorners` directly
(equivalent to assuming the mask is 0x0005). If the runtime mask turns out
to include a third bit, our test for "LipNotchedCorners Reversed" will be
too eager.

### C. `FUN_00538aa0` — three optimised-out helper calls

Inside `FUN_00538e70` (chord-chord classifier), three calls to
`FUN_00538aa0()` gate the major branches. Ghidra decompiled `FUN_00538aa0`
as a 56-byte stub returning a tested byte, but **inlined away which `param_1`
field it reads**. From context the three calls likely test:
1. `HasOuterFlange` (gates the Over / LipNotches branches)
2. `IsHybridFlange` (gates PartialFlanges)
3. some other section property (gates the LipNotchedStandard variants)

The port approximates by reading `hasOuterFlange` and `isCSection` directly
in the equivalent branches. **This is the area most likely to need
correction once we have ground-truth data from a Frida capture or a corpus
diff against Detailer.**

Affected classifications (any of these may misfire):
- `OnEdge - PartialFlanges` (untested in unit tests — probably not reached
  by current heuristic)
- `OnEdge - LipNotches`
- `OnEdge - Over`
- `OnEdge - LipNotchedStandard` / `LipNotchedStandard2` / `LipNotchedStandard3`

### D. Geometry-overlap test elision in `classifyMixed`

`FUN_00538bb8` calls `FUN_0042eae8` four-or-more times in a row to do
ε-tolerant edge-overlap ordering tests on the chord/non-chord pair. These
gate the `OnFlat - Over` vs `None` choice (chord runs over the plate vs.
chord-runs-against-plate). We don't replicate this geometry — the port
short-circuits to `"OnFlat - Over"` whenever B is the chord and to
`"OnFlat - Swaged"` whenever A is. This will misclassify a small fraction
of mixed joints where the chord is "below" the plate (the `None` path at
line 98401).

**Mitigation**: Once `frame-context.ts` calls `classifyJoint()`, it can
pass an explicit "ordering" hint derived from the crossings' Y-coordinates,
and we can extend `classifyMixed` to consume it.

### E. `forSplicing` bit position

The flag is referenced in decoder report §2 ("plus forSplicing and others")
but no explicit bit is documented. None of the visible classifier branches
test it. The port reserves the field but always sets it to `false` in
`unpackJointFlags`. **TODO-DECOMPILE**: dump the `TRelationship` enum's
RTTI section (decoder report cites lines 10210-10222 of the strings) to
identify the exact bit position.

---

## 5. Tap-Count / Verification Discipline

Per the AGENTS.md panel-of-specialists rule, this port:

- **Mathematician check**: Every classification name traceable to a
  decompile line number. 27 of 28 names verified; the 28th (the
  `None` sentinel) appears in 10+ branches and serves as the universal
  "no-op" fallback.

- **Architect check**: The 3-way dispatch at the top
  (chord-chord / mixed / non-chord) matches `FUN_00538b00`'s structure
  exactly. Sub-dispatchers each map 1:1 to a Ghidra function.

- **Strategist check**: Reversibility — the port can be deleted and
  rewritten without affecting the rest of the codec; the only export
  consumer is a future `frame-context.ts` integration that hasn't been
  written yet.

- **UX efficiency**: Not user-facing.

- **Verification before completion**: `npm test -- src/rules/classify-joint.test.ts`
  → 34 / 34 passing. `npm run build` → clean (no type errors).

---

## 6. Next Steps (NOT in scope of this port)

1. **Wire into `frame-context.ts`**: After action-data dump arrives from a
   parallel agent, switch on `classifyJoint(...)` to gate per-recipe op
   emission. See decoder report §7 "Top 3 Codec Changes" #1.

2. **Resolve the `// TODO-DECOMPILE` items**:
   - Recover the three `DAT_005xxxxx` strings from `.rdata`.
   - Frida-hook `FUN_00538aa0` to learn which byte it reads.
   - Frida-dump `_DAT_00539828` at runtime to confirm `0x0005`.
   - Identify `forSplicing`'s bit position.

3. **Add a corpus-driven regression test**: once we can capture
   (stickA, stickB, flags) → expected-classification triples from a real
   Detailer run (Frida hook on `FUN_0040a118`), wire those into the test
   suite as a parameterized table.

4. **Geometry-aware mixed classifier**: extend `classifyMixed` to consume
   an ordering hint from the crossing detector so the `None`-vs-`Over`
   decision in TODO-D is no longer wrong.
