# Detailer Rule Logic — Decoded from Tooling.dll

**Source**: Ghidra pseudo-C decompile at `docs/ghidra-out/decompiled-all.txt`
**Date**: 2026-05-08
**Scope**: The "intersection-based tooling rule executor" — i.e. how Detailer
decides which Swage / LipNotch / InnerDimple / TrussChamfer / etc. ops to
emit at each stick-stick crossing.

---

## TL;DR — Architectural surprise

**Detailer's per-mask op recipes are NOT baked into the DLL.**

`FUN_00545b94` (the "rule executor") is a **generic table-walker**, not a
hard-coded if-chain. It looks up a `TToolActionSection` keyed by classifier
**name string** (e.g. `"OnFlat - Standard"`, `"OnEdge - LipNotchedStandard"`),
and that section holds a 16-entry array `FToolActions[edge_mask]` of action
recipes (`TToolActionsArray`). Each entry is a list of `RAction` records
specifying `{ToolName, ToolType, ActionType, CopyType}`.

The 28 rule names + their per-mask actions live in **external configuration
data** loaded into `DAT_005968d0` (a `TObjectDictionary<string,
TToolActionSection>` named `ActionDefsManager`). This is why we never see
"emit InnerDimple at +16.5" as code — the DLL only has the **plumbing**.

This single fact reframes the whole RFY-100% project. See "Rule Book" and
"Top 3 Codec Changes" below.

---

## 1. `FUN_00545b94` — The Rule Executor (714 bytes)

### Signature

```c
void FUN_00545b94(
    int param_1,        // pointer to TToolActionsArray (FToolActions[edge_mask])
    int *param_2,       // FrameObjectIntersections record (the 2 sticks + edge data)
    int param_3,        // output: TList<TToolData> to append ops to
    undefined4 param_4, // SwageClearance (left)  — comes from TToolActionSection
    undefined4 param_5  // SwageClearance (right) — comes from TToolActionSection
);
```

### What it does — pseudocode

`param_1` is a Delphi dynamic array `TArray<RAction>`. `param_1 + -4` holds
its length (Delphi ABI). For each `RAction` in the array:

```
N = length(param_1)              // 102395-102399
for i = 0 .. N-1:
    aRec = param_1[i]             // 5 bytes per RAction:
                                  //   byte[0]  ToolName index
                                  //   byte[1]  ActionType (atAToB / atATowardsB / atBTowardsA)
                                  //   byte[2]  CopyType (TIntersectionNumber 0..3 — which corner)
                                  //   byte[3]  flags
                                  //   byte[4]  CounterpartIndex
    if FUN_0052f8f4(stickA.section, aRec.ToolName) == 0:
        continue   // ToolName not in section's tool list → skip
    if (aRec.byte2-1)==0 or (aRec.byte2-4)==0:
        if not stickA.IsBlocked(byte2): continue
    elif (byte2-2)>=2 or stickA.IsBlocked(byte2):
        // proceed to emit
        connectorEdge = param_2.intersections[byte2 (top 8 bits)]    // edge midpoint pair
        connecteeEdge = param_2.intersections[byte4]                  // edge midpoint pair
        // adjust for IsTopChord / TrussChamfer overrides (FUN_0054587c)
        if connector.IsTopChord and connectee.IsTopChord and toolType==0xe:    // TrussChamfer
            FUN_0054587c(edges, ...,'\x02')   // ctTrussChamfer
        elif tooltype==0xe:
            FUN_0054587c(edges, ...,'\x07')   // ctNoChamfer
        elif IsBChord and tooltype==0x09:                                       // SwageClearance
            FUN_0054587c(edges, ...,'\x07')   // ctNoChamfer
        // pick the longer of the two endpoint distances
        if dist(connectorStart, plate) < dist(connectorEnd, plate):
            swap(connectorStart, connectorEnd)
            swap(connecteeStart, connecteeEnd)
            // also flip ActionType: atATowardsB <-> atBTowardsA
        // emit op into param_3
        toolID = FUN_0052fa94(stickA.section, aRec.ToolName)   // resolve ToolDef
        coordType = FUN_00545b70(&aRec)        // returns ctDontCare/ctInnerLip/ctInnerWeb/ctLeftLip/ctRightLip
        op = FUN_00547cd8(... toolDef, byte3 /* CopyType */, swageClearanceL, swageClearanceR, ...,
                          stickA, connecteeEdge, connectorEdge, coordType)
        if op != null:
            param_3.append(op)
```

### Key offsets in the FrameObjectIntersections record (`param_2`)

(Confirmed cross-checking `FUN_00545694`, `FUN_00545af8`, `FUN_005456bc`.)

| Offset | Meaning                                          |
|--------|--------------------------------------------------|
| +0x00  | stick1 pointer (connector)                       |
| +0x04  | stick2 pointer (connectee)                       |
| +0x0E + 0x14*k | edge[k] (k=0..3): { left.x, left.y, right.x, right.y } — 0x14 bytes per |
| +0x1e  | char `EdgeHasIntersection[0]` (LL — both leftLips touch)   |
| +0x32  | char `EdgeHasIntersection[1]` (LW — leftLip × web)         |
| +0x46  | char `EdgeHasIntersection[2]` (WL — web × leftLip)         |
| +0x5a  | char `EdgeHasIntersection[3]` (WW — webs cross)            |

Note `FUN_00545694` reads exactly these 4 bytes and packs them into a 4-bit
`edge_mask` bVar1 = (LL ? 1:0) | (LW ? 2:0) | (WL ? 4:0) | (WW ? 8:0). So
mask values 0..15 are LL / LW / WL / WW combinations.

### What is the per-edge-mask "recipe"?

The 16-entry table `iVar2 + 0x10 + edge_mask*4` is a `TArray<RAction>` per
mask, **not 16 distinct recipes** — they're 16 pointers into one
`TToolActionSection`. Each pointer either references the same array (most
common — same ops for all geometric layouts of this classification) or NULL
(no ops for this layout).

**The op recipes are ENCODED IN THE NAME**, not the mask. Mask just
fine-grains which corners get touched within a classified joint type.

### Emitted op shape (FUN_00547cd8)

Each emitted op carries:
- `ToolDef` (resolves ToolName → ToolType + size + lengths)
- `CopyType` (which corner: octDefault / octLeftLow / octLeftHigh / octRightLow / octRightHigh)
- `Source = osTooling` (vs osPrimaryFastener / osBoxing_*)
- `StartPoint` / `EndPoint` (3D positions, derived from edge midpoints)
- `StartOffset` / `EndOffset` (clearances trimmed for adjacent ops)
- `OperationType` (otPointTool / otSpannedTool / otStartTool / otEndTool)
- `ToolLocation` (tlFlange / tlLeftFlange / tlRightFlange)

So each `RAction` triplet (ToolName, edge_mask_index, CopyType) **fully
determines** the op kind, location, and corner — but not its mm offset. The
offset comes from geometry (distance from connectee edge midpoint to
connector edge midpoint, modulo SwageClearance trimming).

---

## 2. `FUN_00538b00` — The Real Classifier (159 bytes + dispatchers)

### Signature

```c
void FUN_00538b00(
    byte *param_1,    // 0x14-byte stick1 props record: 0=IsCSection, 0x12=IsTrussChord, ...
    char *param_2,    // 0x14-byte stick2 props record (same shape)
    uint param_3,     // flag bits (the ushort param_4 from MakeOperations — see below)
    int *param_4      // output: pointer to a Delphi UnicodeString receiving the name
);
```

### Stick property record layout (built in `FUN_005456bc`)

The real classifier doesn't read `TFrameObject` directly — it reads two
small 0x14-byte property records that `FUN_005456bc` builds from each stick:

```
record TStickClassProps {       // 20 bytes total
   0x00  byte    IsCSection           // FUN_00545fb4 result (OnEdge=0, OnFlat=1, etc.)
   0x01..0x10    geometry doubles     // local_1c, local_14: edge endpoint X coords
                                      // (used by FUN_0042eae8 ordering tests)
   0x10  byte    SwageClearance       // *(param + 0x4c) — section's swage-clearance flag
   0x11  byte    IsHybridFlange       // FUN_0054eba4 — true if section.flangeType==onEdge
   0x12  byte    IsTrussChord         // *vtable[0x1c]+8 — true if BChord/TChord
   0x13  byte    IsBoxing             // *(param + 0x5e) — Box/Brace marker
   0x14  byte    HasOuterFlange       // FUN_0054e310 — has Pre-cut flange flag
}
```

### The 3-way classifier dispatch

```
if (param_3 & 0x200) != 0:                     // flag forBackToBack/forBoxing
    return "None"                              // (no ops)

uVar1 = FUN_00539950(stick1, stick2)           // overlap test with ε via FUN_0042eae8
if !uVar1: return "None"

if  stick1.IsTrussChord==0 and stick2.IsTrussChord==0:
    FUN_00539258(...)        // BIG dispatcher — produces "OnFlat - *" names
elif stick1.IsTrussChord == stick2.IsTrussChord:
    FUN_00538e70(...)        // truss-chord + truss-chord    → "OnEdge - *" names
else:
    FUN_00538bb8(...)        // truss-chord + non-truss-chord → "OnFlat - Over/Swaged/Omega/etc"
```

### `param_3` — The flag bitmask (ushort)

This is the `param_4` of `MakeOperations`/`FUN_00545af8`. From its usage in
`FUN_00539258`:

| Bit (hex) | Meaning (inferred)                                              |
|-----------|------------------------------------------------------------------|
| 0x0001    | Reversed (1 = "OnFlat - Reversed" branch)                        |
| 0x0002    | Suppress-swage on cap (1 = "None" instead of "Swaged")           |
| 0x0004    | LipNotchedCorners (1 = corners get notched)                      |
| 0x0020    | DualTrack (1 = double-plate joint — track over track)            |
| 0x0040    | Over-vs-Swaged-asymmetric (used with stick.HasOuterFlange compare) |
| 0x0080    | TabHoles / Tabs (web-intersection-bad pattern)                   |
| 0x0100    | Tabbed (1 = tabbed cap, e.g. truss chord at endgable)            |
| 0x0200    | "BackToBack" (forces "None" — early exit)                        |
| 0x0400    | OnFlat-2 (Over2/Swaged2/Swaged3 variants)                        |
| 0x0800    | Frama (proprietary FRAMA system signal)                          |

`_DAT_00539828` (referenced at 98539) is a global mask that means "all
LipNotchedCorners-Reversed bits set" — the test `(~param_3 & _DAT_00539828) == 0`
is "all those bits are set".

### The 28 classification names (the real "rule keys")

Mined from the strings dump (lines 14477-18290) and confirmed in the
classifier branches:

#### OnEdge group (truss-chord + truss-chord intersections)
- `OnEdge - Over` ............ flush over
- `OnEdge - LipNotches` ..... lip cuts on chord edges
- `OnEdge - Standard` ........ default chord-chord
- `OnEdge - PartialFlanges` .. partial-flange variant
- `OnEdge - LipNotchedStandard` (3 sub-variants: 2, 3, plain)

#### OnFlat group (non-chord + anything)
- `OnFlat - Standard` ........ default plate-stud crossing
- `OnFlat - Over` / `Over2` .. cap on flat (1 or 2 layers)
- `OnFlat - Swaged` / `Swaged2` / `Swaged3` ... swage closures
- `OnFlat - Reversed` ........ flipped direction
- `OnFlat - LipNotchedCorners` / `_Reversed` ... corner notches
- `OnFlat - Tabbed` / `Tabbed_Reversed` ... tabbed cap
- `OnFlat - Tabs` / `TabHoles` ... tab + hole pattern (header)
- `OnFlat - Omega` ........... Ω-section profile
- `OnFlat - Frama` ........... FRAMA proprietary system
- `OnFlat - TrussBoxed` ...... boxed truss chord
- `OnFlat - WebIntersectionsBad` .. error sentinel
- `OnFlat - DualTrack Standard` / `_PlateToStud` / `_StudToPlate`

#### Sentinel
- `None` ........ no ops emitted

---

## 3. `FUN_00545950` — MakeExplicitOperations (420 bytes)

This is the **explicit-tool path** that bypasses the classifier entirely.
Used when a user has explicitly set `osExplicit` / `osPrimaryFastener` /
`osSecondaryFastener` on an op (e.g. via Detailer's "place tool here" UI).

### When is the explicit path taken?

`FUN_00545950` is called when an `RFrameObjectIntersection` has its
"explicit" flag set:
- `param_1 + 0x10E` byte != 0 — there's an explicit operation entry
- `param_1 + 0x10` (intersection record) != 0 — intersection has data

### What it does

```c
explicit_op_data = param_1 + 0xfe   // 17 bytes: type, location, length, two start points...
section_offset_a = param_1 + 0x3a6  // ToolLocation flag (4=tlLeftFlange, 5=tlRightFlange)

if explicit length > 0:
    if section_offset == 4 (left):
        single edge from points[0]
    elif section_offset == 5 (right):
        single edge from points[1]
    else:                            // both flanges
        each edge gets length / _DAT_00545af4 (likely /2)

// then dispatch by tool type:
switch(toolType = explicit_op_data + 0x11):
    case 0x0f:   FUN_0054ecb8(stick, weighted_sum, 2)  // ε for IsTrussOp
    case 0x10:   FUN_0054ecb8(stick, weighted_sum, 3)  // ε for IsWebLipCut
    case 0x11:   FUN_0054ecb8(stick, weighted_sum, 4)  // ε for ?
    default:     FUN_00547cd8(... toolDef, ... pointA, pointB, ToolLocation)
                 → emit a single op with the explicit positions
```

The `0x0f`-`0x11` codes are the truss/weblip variants that use the `IsTrussOp`
short-circuit.

### Codec implication

This path is **not part of the per-stick rule corpus**. It's user-placed
ops, e.g. "extra rivet here". Our codec doesn't need to handle it — these
are emitted ahead of time by Detailer's UI and live in the input frame
spec, not generated by the auto rules. **Skip in v1.** If we see RFY ops
the codec can't account for and the input had `osExplicit` source, that's
why.

---

## 4. `FUN_00585df4` — `TFrame.RecalcTooling` (227 bytes)

### What it iterates over

```c
fun TFrame.RecalcTooling(self):
    // self + 8 = FObjects: TList<TFrameObject> (sticks)
    if FObjects.Count > 0:
        enumerator = FObjects.GetEnumerator()
        while enumerator.MoveNext():
            stick = enumerator.Current
            stick.RecalcTooling()      // virtual @ vtable[8]
```

It's a thin "for stick in frame.sticks: stick.RecalcTooling()" loop.

### What `stick.RecalcTooling()` actually does

The virtual call resolves to a per-section type. The default implementation
(traced via `FUN_00585f90` and the strings):

1. **For each intersection in `stick.Intersections` list** (`+0x88` from stick base):
   1. Compute `edge_mask` (`FUN_00545694`) from the 4 edge-touch booleans.
   2. Build `TToolActionSection` lookup key (`FUN_005456bc` →
      `FUN_00538b00`) — runs the classifier, returns name string.
   3. Look up `section := ActionDefsManager[name]`
      (`FUN_00520cc8` → `FUN_00521c50` hash lookup).
   4. Walk `section.FToolActions[edge_mask]` (`FUN_00545b94`).
   5. Append all emitted ops to `stick.Operations` list.
2. Then call `FUN_00545f08` for primary/secondary-fastener pass:
   - mode 1 (`*(param_1 + 0x3a7) == 1`):  emit 4 hard-coded primary fastener
     ops at offsets 10, 0x27, 0x19, 0x18 (`FUN_00545e60`).
   - mode 2/3:  call `FUN_0053d044` / `FUN_0053d1e4` for additional
     boxing-fastener logic.

### Codec implication

This confirms the order of operations: **classifier first, then per-edge-mask
table walk, then primary-fastener pass**. Our codec follows the same pattern
(table-driven per-stick rules + frame-context crossing pass), so structurally
we're aligned. The miss is purely in the **rule data**, not the engine.

---

## 5. `FUN_0053ad3c` — `GetTrussHolePosition` (384 bytes)

### Signature

```c
void GetTrussHolePosition(
    int param_1,    // owner (TFrame or TToolingClassifier)
    int param_2,    // connector stick (this one's holes are being placed)
    int param_3,    // connectee stick
    int *param_4,   // output: { holeA, holeB, ?, ?, posType, ?, ?, ?, secondaryHole }
    byte param_5    // flags (bit 0x10 = also place secondary hole)
);
```

### What determines the truss-hole positions

```c
local_9 = FUN_0053ab98(param_1, param_2, param_3)  // joint type code 0..4

if local_9 == 4: zero output (no holes); return

// Otherwise resolve dual hole-shape codes (local_a, local_b) per stick:
if connector.IsHybridFlange == connectee.IsHybridFlange:
    if local_9 == 3:     // T-on-T-chord
        local_a = (connector.IsBoxing == 1) ? 2 : 0
        local_b = (connectee.IsBoxing == 1) ? 2 : 0
    else:
        local_a = local_b = local_9
else:
    if local_9 == 3: local_9 = 2
    if connector.IsHybridFlange:
        local_a = 5 (chord-side hole)
        local_b = local_9
    else:
        local_a = local_9
        local_b = 5

FUN_0053b048(... &local_d, &local_c, local_b, local_a)
   // Walks BOTH sticks' Intersections lists, finds best matching
   // pair via FUN_004fd6bc (point-on-line test), picks the
   // intersection with the LARGEST clearance from stick end,
   // returns position and which-corner identifier.
   // Local 0x3d sets the "joint constraint" mode:
   //   '\x05' if either side has flag 0x20 (DualTrack-related)
   //   '\x01' if either side has flag 0x02 (Swage-suppress)
   //   '\x04' otherwise (default)

if first pass found nothing AND local_9 == 3:
    retry FUN_0053b048 with local_a/_b = 2 / 2 (force both to suBChord)

// Resolve hole shape per stick (two FUN_0053b740 calls)
param_4[0] = FUN_0053b740(... connectee.section, local_b, local_d)
param_4[1] = FUN_0053b740(... connector.section, local_a, local_c)

if (both non-zero) AND (param_5 & 0x10):
    // also emit secondary hole at type 2 (suBottomChord)
    param_4[8] = FUN_0053b740(... connector.section, '\x02', '\x00')
```

### Float math?

Yes. The position search uses `FUN_004fd6bc` (point-on-line projection),
`FUN_0053a4b0` (length compute), and `FUN_004fcfa4` (transform to local
coords). Result is a {start_x, end_x, mid_x} triplet stored as offsets in
the intersection record. The hole shape (`FUN_0053b740`) returns NULL if the
section doesn't support that hole-type code at that location.

### Joint-type code (`FUN_0053ab98`) — 0..4

| Code | Meaning                                                       |
|------|---------------------------------------------------------------|
| 0    | "linear web" / non-truss → no truss holes (return value)      |
| 1    | TrussChord → TrussWeb (typical truss web at chord)            |
| 2    | TrussChord cross-orient (e.g. BChord×TChord) — "linearChord"  |
| 3    | T-T or B-B chord-chord                                        |
| 4    | "no holes" sentinel                                           |

Determined by:
- `FUN_0054ebac` (IsHybridFlange) of both sticks
- `FUN_0052f870` (section category: 1=Stud, 2=Plate, 3=BChord, 4=TChord)
- `FUN_0052f8f4(section, '\x07'/'\x06'/'\x05')` (section-supports-truss-op flags 5/6/7)

### Codec implication

This is **truss-only** logic — relevant when we have linear truss plans
(LIN). Our existing simplifier `simplify-rfy-direct.mjs` already emits the
3×Ø3.8mm BOLT HOLE pattern at centerline-crossings for linear-truss plans,
which corresponds to *part* of this. But:

1. We don't compute hole shape per section — we use a fixed 3×Ø3.8mm. Detailer
   actually picks the shape via `FUN_0053b740(section, codeA/B, codeC/D)`,
   which can return null (no hole) or a different hole-type at boxed-vs-non-boxed
   joints.
2. We don't emit the "secondary hole at code 2" when `param_5 & 0x10` is set.
   That's a Detailer-level option (extraFlangeHole) and is plan-dependent.
3. The `local_3d == '\x05'` DualTrack-mode short-circuits after the first
   match — explains why DualTrack truss plans see fewer holes than expected.

---

## 6. Rule Book — Pseudo-Detailer Rules (Reconstructed)

Format: `IF connector.usage == X AND connectee.usage == Y AND cls_flags
THEN classify_as "<NAME>"`. The flag column `forXXX` maps from the
`TRelationship` enum (line 10210-10222).

(Recipes for each NAME are in `ActionDefsManager` — i.e. **external data**,
not in the DLL. Recovering them requires a Detailer install + dumping the
runtime dictionary OR finding the config file that populates it. See "Top 3
codec changes" #1.)

### 6.1 Plate-on-Stud (most common joint)

```
IF connector.IsCSection==1 AND connectee.IsCSection==1
   AND not (param3 & forBackToBack)        // not back-to-back
   AND geometry-overlap-test passes
THEN
  -- both stick records have IsTrussChord==0 → FUN_00539258 path

  IF connector.SwageClearance==1 OR connectee.SwageClearance==1:
    classify "OnFlat - DualTrack ..."        -- variant by which is plate-vs-stud
  ELIF (param3 & forBoxing):
    classify "OnFlat - Frama"                -- proprietary system
  ELIF (param3 & forSplicing == 0)           -- normal layout
       AND connector.HasOuterFlange != connectee.HasOuterFlange
       AND connector.IsBoxing == 1:
    classify "OnFlat - Over"
  ELIF normal:
    classify "OnFlat - Standard"
```

### 6.2 Truss-Chord crossings

```
IF connector.IsTrussChord != 0 AND connectee.IsTrussChord != 0:
  -- FUN_00538e70 path

  IF param2.IsHybrid AND ¬connector.HasOuterFlange:
    classify "OnEdge - PartialFlanges"
  ELIF ¬connector.IsCSection AND connector.IsTrussChord != connectee.IsTrussChord:
    classify "OnEdge - LipNotches"
  ELIF connector.IsTrussChord==1 AND connectee.IsTrussChord==0:
    classify "OnEdge - Over"
  ELIF connector.IsCSection==1 AND connectee.IsCSection==0:
    classify "OnEdge - LipNotchedStandard" (or 2/3 by flange-equality)
  ELSE:
    classify "OnEdge - Standard"
```

### 6.3 Mixed truss + non-truss (T-Bchord etc.)

```
IF connector.IsTrussChord != connectee.IsTrussChord:
  -- FUN_00538bb8 path
  combine = (stick1.flag13 | stick2.flag13)
  IF combine & 4 == 0:                       -- not OnEdge group
    geom_test = order_points(stick.x[2], stick.x[6], stick.x[10], stick.x[14])
    IF geom_test confirms over-on-flat:
      classify "OnFlat - Over"               -- T-chord runs over the bottom plate
    ELSE:
      classify "OnFlat - Swaged"             -- bottom plate swages around
```

### 6.4 Truss web at chord (the "rivet hole" case — `GetTrussHolePosition`)

This is a separate flow from the per-edge-mask classification — it's
**fastener placement** rather than tooling. Per `FUN_0053ad3c`:

```
joint_code = FUN_0053ab98(connector, connectee)
SWITCH joint_code:
  CASE 0: no holes
  CASE 1: TrussChord×Web — primary hole + optional secondary on connector
  CASE 2: linearChord×linearChord — single shared hole
  CASE 3: T-chord×T-chord (or B×B) → split into 2 holes per stick
  CASE 4: explicit-no-holes
```

---

## 7. Cross-reference vs. our codec

### Where we agree (matches Detailer's architecture)

1. **Engine separation**: our `engine.ts` (per-stick rules) + `frame-context.ts`
   (per-crossing rules) parallel Detailer's `MakeOperations` (per-stick) +
   per-intersection `RecalcTooling` loop. Conceptually identical.
2. **Classifier-first design**: we group ops by stick role (S/T/B/N/Kb), which
   is a coarser version of Detailer's section-usage classification (`suStud`,
   `suTopPlate`, `suBChord`, etc.). Our `roleFromName` is the rough
   equivalent of `FUN_0052f870`.
3. **TrussChamfer override**: our 89S41 cripple/header chamfer rules at
   `table.ts:213,225` ("Kb start Swage 42mm cap") align with Detailer's
   `FUN_0054587c(... '\x02')` (ctTrussChamfer) override path. Same idea.

### Where we disagree (likely source of the 18% gap)

1. **FATAL: We don't classify the joint type.** Our codec applies
   role-based rules independently of the partner stick's role and flags.
   Detailer first names the joint (`OnFlat - Standard`, `OnFlat - DualTrack
   PlateToStud`, etc.) THEN looks up ops. Our `frame-context.ts` partly
   approximates this (it generates LipNotch+Dimple at every stud crossing
   on a plate), but it doesn't differentiate `OnFlat - Standard` from
   `OnFlat - Tabbed` or `OnFlat - DualTrack`. **This is the biggest
   structural gap.**

2. **No handling of the `param_3` flag bitmask.** The 11 bits of `param_3`
   (forBackToBack, forBoxing, forSplicing, forReinforcing, etc.) gate
   classifier branches. We have 0 awareness of these. Examples that go wrong:
   - `forBackToBack` (0x200) → no ops; we still emit ops.
   - `forBoxing` (the 0x800 bit fed into FRAMA) — different recipe.
   - DualTrack 0x20 — completely different classification name.

3. **Missing tool: `Tabbed`/`TabHoles`.** Detailer emits these for
   header-cap joints (`OnFlat - Tabs` and `OnFlat - TabHoles` from the
   `(param_3 & 0x80)` branch). Our codec has no `Tabbed` op type. This shows
   up as missing tooling on H-stick caps.

4. **Missing: `OnFlat - LipNotchedCorners`** (param_3 bit 0x04). When the
   classifier flags this, Detailer adds InnerNotch ops at the joint corners
   even on standard plate-stud crossings. Our `frame-context.ts` only emits
   InnerNotch on certain hard-coded plate types. Probably explains some
   "missing InnerNotch" diffs in the LBW corpus.

5. **Header-paired-dimple logic** is correct in our codec
   (`isLBWPlan(planName)` predicate at table.ts:276), but Detailer's
   trigger is the section's IsHybridFlange (`FUN_0054eba4` returns 1) +
   `FUN_0054ebac` returns 1 — a section-data flag, not a plan-name regex.
   We may match too narrowly (only plans whose name says "LBW") when
   Detailer matches every section flagged as a paired-dimple section.

6. **Our truss BOLT HOLE emitter (`simplify-rfy-direct.mjs`) is too eager.**
   We emit at every centerline-crossing. Detailer's `FUN_0053b048` walks
   BOTH sticks' Intersections lists and **picks the single intersection with
   the largest clearance from stick end**. So Detailer emits at most one
   primary + one secondary per stick-pair, not one-per-crossing. This
   matches the captured Frida corpus where simplify-rfy-direct.mjs
   over-emits 40× on small jobs (per the simplifier-scoping landmark).

---

## Top 3 Actionable Codec Changes

### 1. Build a Detailer-classifier-replica to gate `frame-context.ts` ops by joint name

**Why**: the 28 named classifications drive different recipes. Our current
"emit LipNotch+Dimple at every plate-stud crossing" is too coarse — it
fires the same recipe regardless of whether the joint is `OnFlat - Standard`
(LipNotch+Dimple), `OnFlat - DualTrack PlateToStud` (none — already captured),
or `OnFlat - Tabbed` (Tabbed instead of LipNotch).

**How**:
- Add a `classifyJoint(stickA, stickB, frameFlags)` function in
  `frame-context.ts` that mirrors `FUN_00539258`/`FUN_00538e70`/`FUN_00538bb8`.
- Inputs: the 5 stick property bytes (IsCSection / IsTrussChord / IsBoxing
  / SwageClearance / HasOuterFlange) — derive these from our existing
  `RfyStick` data + `MachineSetup.flangeType`.
- Frame flags to derive: BackToBack (any pair of identical sticks
  back-to-back?), Boxing (Box-section frame?), DualTrack (truss plan with
  paired top plates).
- Output: classification name string.
- Then have `applyCrossingOps` switch on the name, with our existing
  recipes mapped to `OnFlat - Standard` (the default).

**Expected gain**: should close the bulk of the 18% Detailer-parity gap on
non-truss plans.

---

### 2. Replace truss BOLT HOLE simplifier's "every crossing" with "biggest-clearance crossing per pair"

**Why**: confirmed over-emission per the Frida corpus comparison and the
simplifier-scoping landmark (40× over-emit on small jobs).

**How**:
- In `simplify-rfy-direct.mjs`, group crossings by `(stickA, stickB)`
  pair.
- For each pair, compute clearance from each crossing point to BOTH sticks'
  ends.
- Keep ONLY the crossing with the maximum min-clearance — discard the rest.
- This mirrors `FUN_0053b048`'s `param_4 + 0x18` "best clearance" tracking.

**Expected gain**: per the simplifier-scoping investigation, ~40× fewer
spurious ops on small jobs; should bring the wall-service simplifier from
+0.6pp net (with bimodal damage on small jobs) to +2-3pp net.

---

### 3. Surface the `param_3` flag bitmask to the engine via plan-name + frame-shape detection

**Why**: 11 distinct boolean flags currently default to 0 in our codec.
Three of them are responsible for visible diff classes:
- `forBackToBack` (0x200) → currently we emit ops on back-to-back stud
  pairs (`SS` joints). Detailer emits zero. Quick win.
- `forBoxing` (0x800 → `OnFlat - Frama`) → we emit standard ops on FRAMA
  proprietary system frames; Detailer suppresses or substitutes.
- `forSplicing` (impacts whether `OnFlat - Reversed` fires at plate-plate
  splice joints).

**How**:
- Add a `classifierFlags(frame: RfyFrame): JointFlags` derivation from frame
  name + plan name + stick patterns:
  - Look for `BB`/`BackToBack` markers in frame name → set `forBackToBack`.
  - `FRM`/`FRAMA` plan suffix → set `forBoxing` (likely Frama).
  - `LIN`/`TIN` plan + truss chord pair → set `forLinearChord`.
- Plumb into `frame-context.ts` so the classifier replica (#1) can read
  these flags.

**Expected gain**: depends on share of FRAMA + back-to-back + splicing
plans in corpus, but each easily worth 1-2pp parity.

---

## Caveats / What We Couldn't Decode

1. **The actual op recipes per `TToolActionSection` are not in the DLL.**
   They live in `ActionDefsManager` populated at runtime from external
   config (probably an `ActionDefs.json` or compiled-in resource). To
   recover the recipes, we need to dump that dictionary at runtime —
   either via Frida hook on `FUN_00521c50` (`HashTable.Lookup`) when the
   user opens a known job, or by scanning the DLL's `.rdata` for the
   resource that initializes the table. **This is a follow-up task.**

2. **`local_19` byte 1 (`ActionType`) values aren't fully mapped.** The
   strings tell us `atAToB` / `atATowardsB` / `atBTowardsA` exist, but the
   numeric encoding (1, 2, 3?) is implicit. Our classifier-replica can
   probably ignore this — it's used to flip which-stick-gets-the-op, which
   we already handle via `connector` vs. `connectee` semantics.

3. **`FUN_0053b740` hole-shape resolver** uses a section-table indexed by
   joint-code + boxing-flag. To replicate fully we'd need to know each
   section's hole-shape table, which is per-machine-setup (.sups file).
   Our existing `MachineSetup` data may already cover this — need to
   audit `HYTEK-MACHINE-TYPES.json` for hole-shape arrays.

4. **`_DAT_00539828`** at line 98539 is a runtime-initialized "all
   LipNotchedCorners-Reversed bits" mask. Without runtime data we can only
   guess its value (likely `0x0005` = bits 0+2: Reversed + LipNotched).
   Worth confirming via Frida.

---

## Appendix: Function Map

| VA          | Function                            | Bytes | Purpose |
|-------------|-------------------------------------|-------|---------|
| 0x00538b00  | RealClassifier (FUN_00538b00)       | 159   | Top-level dispatch by `IsTrussChord` parity |
| 0x00538bb8  | classifyMixed                       | 483   | Truss-chord × non-truss-chord |
| 0x00538e70  | classifyOnEdge                      | 541   | Truss-chord × Truss-chord     |
| 0x00539258  | classifyOnFlat                      | 742   | Non-chord × non-chord          |
| 0x00539950  | overlapTest (FUN_0042eae8 wrapper)  |  69   | ε-overlap test                 |
| 0x0053a228  | dist comparator                     |  79   | endpoint-vs-endpoint distance test |
| 0x0053ab98  | trussJointType                      | 335   | 0..4 code for truss hole placement |
| 0x0053ad3c  | GetTrussHolePosition                | 384   | Truss hole position resolver    |
| 0x0053b048  | hole position search                | 1425  | Walks both sticks' intersection lists |
| 0x0053b740  | resolveHoleShape                    | 209   | Section-table hole-shape lookup |
| 0x00545694  | ClassifyIntersectionType            |  40   | Pack 4 edge bytes → 4-bit mask  |
| 0x005456bc  | BuildClassifierRecord               | 246   | Build 0x14-byte stick props x2 + dispatch |
| 0x00545950  | MakeExplicitOperations              | 420   | Explicit-tool path (osExplicit) |
| 0x00545af8  | MakeOperations                      | 117   | Top dispatcher: classifier → mask → table |
| 0x00545b94  | ApplyRule (rule executor)           | 714   | Walks `FToolActions[mask]` array |
| 0x00545e60  | emitFastener                        | 166   | Per-fastener op factory         |
| 0x00545f08  | applyFasteners                      | 171   | mode-specific fastener pass     |
| 0x00545fb4  | classifyOrientation                 | 632   | OnEdge / OnFlat / Hybrid axis test |
| 0x00547cd8  | createOperation                     | 1349  | Builds final TToolData with offsets |
| 0x00585df4  | TFrame.RecalcTooling                | 227   | for-stick loop                  |
| 0x00520cc8  | LookupActionSection                 |  55   | hash-table fetch by name string |
| 0x0052f870  | sectionCategory                     | 126   | 1=Stud, 2=Plate, 3=BChord, 4=TChord |
| 0x0052f8f4  | sectionSupportsToolType             | 181   | Per-section tool-type filter    |
| 0x0054eba4  | IsHybridFlange                      |  ?    | Section flange-type test        |
| 0x0054ebac  | IsBChord                            |  ?    | Section is bottom-chord         |
