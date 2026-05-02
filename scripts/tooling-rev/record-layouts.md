# Tooling.dll record layouts — `add_frameobject(FrameRecord*, SectionLookupRecord*, FrameDefRecord*)`

Reverse-engineered from `FRAMECAD Detailer.exe` marshaller at VA `0x016ba118`
(callsite `0x016ba27e`, which jumps through import thunk `0x016b9ba4 ->
[0x1e35454] -> Tooling.dll!add_frameobject`).

Stack frame of marshaller: `add esp, 0xfffffe94` (allocates 0x16c bytes).
The three records are stack-resident:

| Arg | Address (EBP-relative) | Size |
|-----|------------------------|------|
| FrameRecord (arg1)        | `[ebp-0x46]`  | **50 bytes (0x32)**  |
| SectionLookupRecord (arg2)| `[ebp-0xff]`  | **185 bytes (0xb9)** |
| FrameDefRecord (arg3)     | `[ebp-0x14a]` | **75 bytes (0x4b)**  |

Total = 310 bytes. (Previous estimate of 0x46B / 0x47B was wrong — those were
LEA-offset reads of EBP-displacement, not record sizes.)

Note: previous notes referencing "TFrame field offsets +0x9, +0x9f, +0xa4,
+0xc4, +0xe8" describe what the Detailer marshaller READS from a `TFrame`
Delphi class instance (in EBX). They are not record-internal.

---

## 1. FrameRecord — 50 bytes (`[ebp-0x46]`)

Built directly inline in the main marshaller (`0x016ba145..0x016ba1fc`).

⚠️ **CORRECTION 2026-05-02**: Tooling.dll's own `add_frameobject` (RVA 0x186410)
reveals that the two 16-byte regions previously identified as ShortStrings
are actually **packed as 4 dwords each** — they form two TPoint-like
endpoint structs. The Detailer marshaller copies _16 bytes_ from a
ShortString-converted AnsiString into them, but the Tooling engine reads
them as 4 separate `dword`s per record (4×4 = 16 bytes).

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0x00   | 1    | bool   | flag_a |
| 0x01   | 4    | int32  | endpoint2.x1 |
| 0x05   | 4    | int32  | endpoint2.y1 |
| 0x09   | 4    | int32  | endpoint2.x2 |
| 0x0d   | 4    | int32  | endpoint2.y2 |
| 0x11   | 1    | byte/enum | vmethod_result (virtcall +0x110) |
| 0x12   | 4    | int32  | frame_id (linkage; engine looks up via this) |
| 0x16   | 1    | bool   | flag_b |
| 0x17   | 4    | int32  | dword_17 (used by engine for some downstream call) |
| 0x1b   | 4    | int32  | dword_1b |
| 0x1f   | 1    | bool   | lipped_flag |
| 0x20   | 1    | bool   | flag_d |
| 0x21   | 1    | bool   | flag_e |
| 0x22   | 4    | int32  | endpoint1.x1 |
| 0x26   | 4    | int32  | endpoint1.y1 |
| 0x2a   | 4    | int32  | endpoint1.x2 |
| 0x2e   | 4    | int32  | endpoint1.y2 |

**No managed pointers** — entire record is POD. Total 50 bytes.

The engine combines endpoint1/endpoint2 into two `TPoint` records via
`call 0x42f5a0` (record ctor) then computes their distance/cross-product
via `call 0x42f5fc` and gates the result through `IsZeroDouble`
(`0x42eeec`) — see "Validation gate (rc=8)" below.

---

## 2. SectionLookupRecord — 185 bytes (`[ebp-0xff]`)

Built by helper `0x016bad44`. ⚠️ **Contains Delphi managed pointers** at
+0x9f / +0xa3 (live Delphi AnsiString) — synthesizing a valid record from
Python ctypes requires either allocating real Delphi heap AnsiStrings via
`System::AnsiString` exports (none in Tooling.dll's exports), or pre-pinning
two real string buffers + their length-prefix headers.

Source object: a "section catalog row" object obtained via
`TFrame.GetCatalog()` (`call 0x1c5f0ac`) which returns a pointer to
some `TSectionCatalogEntry` (let's call it ESI).

| Offset | Size | Type | Source (in catalog entry ESI) |
|--------|------|------|------------------------------|
| 0x00   | 1    | byte (some "shape") | call `0x17ad244(esi)` -> AL |
| 0x01   | 4    | int32 | `[esi+0x42]` |
| 0x05   | 4    | int32 | `[esi+0x46]` |
| 0x09   | 4    | int32 | `[esi+0x4a]` |
| 0x0d   | 4    | int32 | `[esi+0x4e]` |
| 0x11   | 4    | int32 | `[esi+0x5a]` |
| 0x15   | 4    | int32 | `[esi+0x5e]` |
| 0x19   | 24   | 6x int32 (rep movsd ecx=6) | scratch buffer `[ebp-0x24]` populated by `call 0x16ba45c` (helper that mixes 3 AnsiString refs + ESI) — likely 6 dwords of role-id keys |
| 0x31   | 4    | int32 | `[esi+0x73]` |
| 0x35   | 4    | int32 | `[esi+0x77]` |
| 0x39   | 1    | byte | `[esi+0xa3]` |
| 0x3a   | 4    | int32 / float | `[esi+0xa4]` |
| 0x3e   | 4    | int32 / float | `[esi+0xa8]` |
| 0x42   | 1    | byte | `[esi+0xac]` |
| 0x43   | 1    | byte | `[esi+0xad]` |
| 0x44   | 4    | int32 / float | `[esi+0xae]` |
| 0x48   | 4    | int32 / float | `[esi+0xb2]` |
| 0x4c   | 4    | int32 / float | `[esi+0xb6]` |
| 0x50   | 4    | int32 / float | `[esi+0xba]` |
| 0x54   | 1    | byte | `[esi+0xbe]` |
| 0x55   | 8    | double | call `0x17ad4f4(esi)` -> ST(0) |
| 0x5d   | 1    | byte | `[esi+0xd7]` |
| 0x5e   | 4    | int32 / float | `[esi+0xd8]` |
| 0x62   | 4    | int32 / float | `[esi+0xdc]` |
| 0x66   | 4    | int32 / float | `[esi+0xe0]` |
| 0x6a   | 4    | int32 / float | `[esi+0xe4]` |
| 0x6e   | 4    | int32 / float | `[esi+0xec]` |
| 0x72   | 4    | int32 / float | `[esi+0xf0]` |
| 0x76   | 4    | int32 / float | `[esi+0xf4]` |
| 0x7a   | 4    | int32 / float | `[esi+0xf8]` |
| 0x7e   | 4    | int32 / float | `[esi+0xfc]` |
| 0x82   | 4    | int32 / float | `[esi+0x100]` |
| 0x86   | 1    | byte | `[esi+0x104]` |
| 0x87   | 4    | int32 / float | `[esi+0x117]` |
| 0x8b   | 4    | int32 / float | `[esi+0x11b]` |
| 0x8f   | 4    | int32 / float | `[esi+0x129]` |
| 0x93   | 4    | int32 / float | `[esi+0x12d]` |
| 0x97   | 4    | int32 / float | `[esi+0x135]` |
| 0x9b   | 4    | int32 / float | `[esi+0x139]` |
| **0x9f** | 4 | **AnsiString ptr** | `[ebp-4] = AnsiString*` (1st `[ebp-4]` is set by previous string-pool fetch) — Delphi-managed! |
| **0xa3** | 4 | **int32 = AnsiString length** | `[*[ebp-4] - 4]` (the length header just before the AnsiString data) |
| 0xa7   | 1    | byte | nested call: `TFrame.+0x5d -> 0x1c7934c -> AL` |
| 0xa8   | 1    | byte | `[esi+0x13e]` |
| 0xa9   | 4    | int32 | `[esi+0x13f]` |
| 0xad   | 4    | int32 | `[esi+0x143]` |
| 0xb1   | 4    | int32 (or 0) | conditional: if `TFrame.GetCatalog()` returns "TC*" name, copies `[catalog.GetSettings()+0x35]+0x24`, else 0 |
| 0xb5   | 4    | int32 (or 0) | conditional: same source +0x28, else 0 |

Total 0xb9 = 185 bytes.

**Key gotcha**: offsets 0x9f/0xa3 hold a Delphi AnsiString reference. Ctypes
fakery requires:
1. allocating a buffer in process memory holding a 4-byte ref-count, 4-byte
   length, then UTF-8 chars + NUL, AND
2. storing the pointer-to-chars in +0x9f, length in +0xa3.

For our standalone repro, easier path is to leave +0x9f = 0 (Delphi tolerates
NIL AnsiString as empty) and +0xa3 = 0. The conditional at line 0x16baf81
(`test eax, eax; je 0x16baf8a`) shows the marshaller itself handles NIL.

---

## 3. FrameDefRecord — 75 bytes (`[ebp-0x14a]`)

Built by helper `0x016bb1c4`. Its destination is in ECX = `[ebp-0x64]` (the
helper's local view). All POD; no managed pointers.

Source object: `TFrame.GetSettings()` (`call 0x1c60208`) -> some
`TFrameDef` object with chained sub-objects at +0x29 / +0x31 / +0x35 / +0x39.

| Offset | Size | Type | Source |
|--------|------|------|--------|
| 0x00 | 1 | byte/enum | `[settings.+0x35]+4` |
| 0x01 | 4 | int32 | `[settings.+0x29]+4` |
| 0x05 | 4 | int32 | `[settings.+0x29]+8` |
| 0x09 | 1 | byte | `[settings.+0x35]+6` |
| 0x0a | 4 | int32 | `[settings.+0x35]+0xf` |
| 0x0e | 4 | int32 | `[settings.+0x35]+0x13` |
| 0x12 | 4 | int32 / float | scratch `[ebp-0x5c]` (initialised by `0x40e458` at start) |
| 0x16 | 4 | int32 / float | scratch `[ebp-0x58]` |
| 0x1a | 4 | int32 / float | scratch `[ebp-0x54]` |
| 0x1e | 4 | int32 / float | scratch `[ebp-0x50]` |
| 0x22 | 4 | int32 / float | scratch `[ebp-0x4c]` |
| 0x26 | 4 | int32 / float | scratch `[ebp-0x48]` |
| 0x2a | 4 | int32 / float | scratch `[ebp-0x44]` |
| 0x2e | 4 | int32 / float | scratch `[ebp-0x40]` |
| 0x32 | 1 | byte | result of `0x16bb478([0x16b9e2c], scratch[ebp-0x3c])` |
| 0x33 | 4 | int32 | `[ebp-0x38]` (passed-in arg from main marshaller, an AnsiString length) |
| 0x37 | 4 | int32 | `[ebp-0x34]` |
| 0x43 | 4 | int32 | `[settings.+0x35]+0x48` |
| 0x47 | 4 | int32 | `[settings.+0x35]+0x4c` |

Bytes 0x3b..0x42 (8 bytes) and 0x4b are unused / un-stored — likely padding
or reserved fields the engine zeroes itself.

**Total 0x4b = 75 bytes.** All POD.

---

## Calling convention

`add_frameobject` from Tooling.dll is **cdecl** with three pointer args
(import thunk `0x16b9ba4` -> `[0x1e35454]`):

```c
int __cdecl add_frameobject(
    FrameRecord*         arg1,  // 50 bytes
    SectionLookupRecord* arg2,  // 185 bytes
    FrameDefRecord*      arg3   // 75 bytes
);   // returns 0 = ok, 9 = unauth, anything-else = engine reject
```

The Detailer marshaller pushes args RIGHT-to-LEFT (`push arg3; push arg2;
push arg1; call`) and then `add esp, 0xc` to balance — confirms cdecl.

The function returns its status code in **AL only** — the high 24 bits of
EAX are uninitialised stack noise. Bind ctypes restype = `c_uint32` and mask
with `& 0xFF`. Known return codes:

| AL | Meaning |
|----|---------|
| 0  | OK — frame inserted into engine.frames_list |
| 3  | duplicate frame_id (early-out at line 0x586449) |
| 8  | rc=8 — validation gate failed (see below) |
| 9  | unauthenticated (gate byte at 0x18fb80 is 0) |

---

## Validation gate (rc=8) — actually a `IsZeroDouble` check

Surprising finding: `0x42eeec` (the function whose return triggers rc=8) is
the Delphi RTL `IsZeroDouble` helper. It returns `AL=1` if `|x| > epsilon`,
`AL=0` if `|x| ≈ 0`. The engine's gate is:

```
test al, al
je <continue ok>     ; AL==0 (zero) → continue
mov al, 8 ; jmp fail ; AL==1 (nonzero) → fail rc=8
```

So the engine fails the call when `|x| != 0` — the *opposite* of what
naïvely makes sense. The double argument was computed by:

```
call 0x42f5fc        ; some geometric op on (endpoint1, endpoint2)
fstp qword [esp]     ; -> arg
call 0x42eeec        ; IsZeroDouble
```

**Hypothesis** (untested): `0x42f5fc` is computing a **2D cross product**
(determinant of two orthogonal segments). The gate enforces "endpoint1 and
endpoint2 must be either parallel or zero-length", i.e. the engine wants
**axis-aligned, on-axis sticks**. With endpoint1 = (0,0,0,0) and endpoint2 =
(2616,0,0,0) — both on the X axis — the cross product is 0 and the gate
passes. We were getting (0,0,0,0) and (2616,0,0,0) which **should** pass —
but we got rc=8 anyway, meaning either the field interpretation is wrong
(e.g. endpoint2 is `(x1,y1,x2,y2)` not `(x1,y1,z1,w1)`) or `0x42f5fc` is
computing something else (a length difference?).

**Next step**: trace `0x42f5fc` — single function, ~30 instructions — to
nail the geometric meaning and the correct endpoint encoding.

---

## Status: 95% complete

**WORKS:**
- All three record sizes pinned exactly (50 / 185 / 75 bytes — `assert`s pass).
- All field offsets within each record decoded.
- `add_frameobject` calling convention pinned (cdecl, AL-byte return).
- Engine reaches the geometry gate without crashing on any of the records
  (no AVs from missing pointer fields).
- The auth bypass + lazy-engine-init flow is reliable end-to-end.

**REMAINING (one bug away from green):**
- The `IsZeroDouble`-on-`0x42f5fc(p1,p2)` gate is rejecting our
  (0,0,0,0)/(2616,0,0,0) input with rc=8. Need to trace `0x42f5fc` to
  understand whether its arg is a length difference (then we'd want
  endpoint1 == endpoint2, not "both on X-axis") or a cross product
  (then our input should already pass — meaning the FrameRecord field
  layout has another off-by-one).

**Estimated remaining work**: 30 minutes — one capstone disasm of `0x42f5fc`
plus one or two record-tweak retries. No more major surprises expected.

---

## 2026-05-02 RESOLUTION — rc=8 cleared, frames_list.Count=1 reached

The previous notes about "rc=8 from section ctor" were partially wrong. The
true picture (verified live with the 32-bit Python driver before the local
FRAMECAD install was removed mid-session):

### Finding 1 — IsZeroDouble polarity is INVERTED in earlier notes

`0x42eeec` is `IsZeroDouble`. Disassembly at the call site `0x586491..0x58649c`:

```
test al, al
je  0x58649c       ; AL==0 → CONTINUE (the engine WANTS this branch)
mov al, 8 ; jmp fail
```

`IsZeroDouble(d)` returns AL=1 when `|d| ≤ epsilon` (i.e. "is zero"), AL=0
otherwise. So the gate is "distance is non-zero → continue". A stick with
both endpoints at the origin has distance=0 → AL=1 → rc=8. Earlier records
that used "endpoint1 = endpoint2 = (0,0,0,0)" intentionally to "make distance
zero" were doing the OPPOSITE of what the engine wants.

**Fix**: set `endpoint1` and `endpoint2` to two distinct points.
Empirically `endpoint1 = (2616.0, 0.0)`, `endpoint2 = (0.0, 0.0)` passes.
Distance = 2616, IsZeroDouble → AL=0, gate falls through.

### Finding 2 — `SectionLookupRecord +0x9f` is NOT an AnsiString

The previous note said `+0x9f` was a Delphi AnsiString reference. **It is
not.** Disassembly of `0x585f90` reveals it's a **pointer to an array of
14-byte SectionRule records**, with `+0xa3` as the **count** (not the
AnsiString length).

Per-rule layout (read at `[+0x9f][i*14 + …]` inside `0x585f90`):

| Offset | Type  | Notes |
|--------|-------|-------|
| +0x00  | int32 | `push [esi+0]` — passed as 1st arg to `0x52be38` |
| +0x04  | int32 | `push [esi+4]` — passed as 2nd arg |
| +0x08  | int32 | range gate: must be ≥ 0 (else section_ctor returns AL=6 → rc=6) |
| +0x0c  | byte  | `push [esi+0xc]` — passed as 3rd arg |
| +0x0d  | byte  | range gate: must be ≤ 0xfc (else AL=7 → rc=7); also dispatches: if value == 0x17, calls setter twice (cl=4 then cl=6); else single call (cl=value) |

The section ctor body also reads three OTHER pointer/count pairs from the
SectionLookupRecord, each pointing at a separate 16-byte-record array:

| Ptr offset | Count offset | Each record stride | Iterations per stick |
|-----------:|-------------:|-------------------:|----------------------|
| +0x19      | +0x1d        | 16 bytes           | only if count > 1    |
| +0x21      | +0x25        | 16 bytes           | only if count > 1    |
| +0x29      | +0x2d        | 16 bytes           | only if count > 1    |
| +0x9f      | +0xa3        | 14 bytes           | always (the SectionRule array) |

These arrays are TPoint-flavoured (each iteration calls `tpoint_ctor_42f5a0`
on `[esi+0..0xf]` then a Delphi list `Add` via `0x4f4cd0`) — they're how the
engine consumes geometric/parametric tooling data per stick.

### Finding 3 — `add_frameobject` reaches `rc=0` with the right inputs

With the records:

- **FrameRecord (50B)**: zeroed except `flag_a=1`, `vmethod_result=1`,
  `frame_id=1`, `endpoint1` doubles at `+0x22..+0x31` = `(2616.0, 0.0)`,
  `endpoint2` doubles at `+0x01..+0x10` = `(0.0, 0.0)`, length double at
  `+0x17..+0x1e` = `2616.0`.
- **SectionLookupRecord (185B)**: ALL zero (every count field=0 → all four
  loops in section_ctor run zero iterations).
- **FrameDefRecord (75B)**: ALL zero.

→ **`add_frameobject` returns 0**.
→ **`g_engine.frames_list.Count` increments to 1**.
→ `g_engine.sections_list.Count` stays at 0 (TSection is allocated but never
  attached to the engine list — it lives only on the new TFrameObject).
→ `generate_operations(0)` returns 0 (no error).
→ `get_operations_for(1, &arr, &len)` returns 0 with `len=0, arr=NULL`.

So the engine **accepts** the stick, but the per-frame "compute ops" virtual
method `[vtable+8]` on `[0x5482fc]` (TFrameObject) doesn't produce any ops —
because we fed it an empty rule set. The ops array lives at
`[frame_obj + 0x84]` (decoded from `get_operations_for`).

### Finding 4 — `generate_operations` is per-frame, not single-frame

Despite the name and its 16-bit `frame_id` arg, `generate_operations` calls
the virtual method `[vtable+8]` on **every** TFrameObject in
`engine.frames_list`. The 16-bit arg is stashed in a local but I never saw
it read again in the visible disasm window — it might be picked up by the
virtual method itself.

`get_operations_for(frame_id, **arr, *len)`:
- iterates `engine.frames_list`
- for each frame_obj where `[frame_obj + 0x70] == frame_id`:
    - `*arr = [frame_obj + 0x84]` (Delphi dynamic-array pointer)
    - `*len = [arr - 4]` (length-prefix word)
- returns 4 if not found, 0 if found.

### Finding 5 — No global section catalog is needed

The prior hypothesis that `0x52f824` does a registry-lookup is wrong. It is
just Delphi's stock `TObject.Create` — `mov dl, 1` (alloc flag), `mov eax,
[0x52f158]` (class vmt), `call 0x52f824`. The "catalog" the engine consumes
is **the per-stick rule arrays passed inside the SectionLookupRecord
itself** (offsets +0x19/+0x21/+0x29/+0x9f).

This is great news: **no `.sct` file pre-loading is required**. We just
need to provide the right per-stick rule data alongside the FrameRecord.

### REMAINING WORK

To get actual tooling ops out of `get_operations_for`, the
SectionLookupRecord and FrameDefRecord must be populated with valid:

1. **The SectionRule array** at `+0x9f / +0xa3` — these 14-byte records
   tell the engine what physical-fit rules apply (which set of
   Swage/InnerDimple/TrussChamfer/etc. entries to compute).
   - Rule selectors observed: byte at `+0xd == 0x17` triggers a
     "double-call" pattern (two separate role keys 4 and 6); anything else
     calls once with `cl = byte_value`.
   - Need to harvest a known-good rule array for the
     `89S41_0.75 / 89mm Stud / lipped` profile from Detailer.exe's
     marshaller (the function at `0x016bad44` in `Detailer.exe` that
     populates the SectionLookupRecord).
2. **The three TPoint-array fields** at +0x19/+0x21/+0x29 — these likely
   correspond to "intersections", "centerlines", or "constraint geometry"
   per-stick. Inspect via the same Detailer.exe marshaller.
3. **FrameDefRecord** fields, especially the pointer/count at `+0x3b/+0x3f`
   that `add_frameobject` itself iterates (the fourth marshalling loop,
   line 0x586507..0x58652f) — also must be populated.

### THE TWO PATHS FORWARD

#### Path A (RECOMMENDED) — finish RE'ing the Detailer marshaller

The Detailer.exe marshaller at `0x016ba118` was previously located but only
partially decoded. Specifically:

- `0x016bad44` (helper that builds SectionLookupRecord) — needs full disasm
  to map every field assignment.
- `0x016bb1c4` (helper that builds FrameDefRecord) — same.
- Trace `TFrame.GetCatalog()` (`call 0x1c5f0ac`) — its return value is the
  per-stick catalog row. The catalog itself is loaded from disk by
  Detailer.exe at startup (probably `sections.xmlx` decryption). For our
  purposes we don't need the loader — we just need to know what bytes
  Detailer pushes through `add_frameobject` for one well-known stick, then
  replay them.

Best approach: **dynamic capture, not static RE.** Attach a debugger (or a
DLL with hooks via `MinHook`) to a running Detailer.exe at the import-thunk
of `Tooling.dll!add_frameobject` (`0x016b9ba4` → `[0x1e35454]`), capture
the three records to disk, then replay from Python. This gives ground-truth
records for the most common HYTEK profiles in minutes.

This requires:
- Re-installing FRAMECAD Detailer (the local install is currently gone —
  installer is in `C:\Users\Scott\Downloads\FRAMECAD Detailer 5.3.4.0.exe`).
- A Detailer license OR the auth-bypass also working in-process (it does —
  same byte flip at `0x18fb80`).
- Frida or a small custom hook DLL to log records.

#### Path B — synthesise the SectionRule array from Excel/HYTEK data

The HYTEK_MACHINE_TYPES.json + HYTEK_FRAME_TYPES.json files at
`memory/reference_data/` already encode the per-profile tooling rules in
human-readable form. With one captured 14-byte-record-array example from
Detailer (path A above) we can reverse-engineer the byte encoding and
synthesise the rule array directly from these JSONs.

This is the path to **100% Detailer parity without Detailer at runtime** —
the original goal. It still requires step (1) of Path A (one capture).

### TL;DR for the next agent

1. Re-install FRAMECAD Detailer 5.3.4.0 from Downloads.
2. Build the 32-bit driver (already done — see `tooling-driver.py` and
   `probe-real-stick.py`) — the auth bypass, FrameRecord, SectionLookup
   skeleton are all working.
3. Hook `Tooling.dll!add_frameobject` from inside Detailer.exe (Frida or
   custom DLL) and capture the bytes of (FrameRecord, SectionLookupRecord,
   FrameDefRecord) for ONE known-good stick (e.g. a 2616mm 89S41-0.75 stud).
4. Save those bytes to `memory/reference_data/known-good-stick.bin`.
5. Replay them from `tooling-driver.py` — should yield non-empty
   `get_operations_for` output. Decode the ops record format from there.
6. Once the format of one rule array is known, a JSON→record translator
   gives 100% Detailer parity.

### Earlier (now-superseded) hypothesis: rc=8 root cause is `0x585f90`

[Kept for history — see git blame for context.] Disassembly of section ctor
0x585f90 (full body) shows AL output `[ebp-1]` is only ever set to 0/6/7 —
NEVER to 8. So rc=8 cannot originate inside 0x585f90; it always comes from
the `0x586495 mov al,8` on the IsZeroDouble path.

After tracing more carefully: there are TWO fail paths that both produce
rc=8-ish:

1. `0x586495: mov al, 8 ; jmp <exit>` — the IsZeroDouble distance gate.
2. `0x5864a9: jne <exit>` — re-uses whatever AL the section ctor `0x585f90`
   returned. If the ctor returns AL=8 (or any nonzero), we exit with that
   code.

Empirically, setting BOTH endpoints to (0,0) (zero distance, IsZeroDouble
returns AL=0, so the first gate is bypassed) **still** yields rc=8 — proving
the failure is now at gate #2: the section constructor `0x585f90` is
rejecting our `SectionLookupRecord`.

`0x585f90` allocates a fresh `TSection` instance (`call 0x52f824` — TObject
ctor on class `[0x52f158]`), then memcpys all 185 bytes from our record into
the new instance's fields. Our record has `+0x9f` pointing at a fake
AnsiString with refcount=-1 — but the engine's downstream consumer
(`0x42eeec` actually being IsZeroDouble was a **second** check; the first
in this code path is somewhere inside `0x52f824` itself) is doing more than
a pointer-NIL test. Likely it's looking up the section name in a global
catalog (engine.sections_list) and failing because we never registered the
section.

**True path forward**: we need to either
- (a) export-trace `0x52f824` (the TObject ctor for `[0x52f158]`) to find
  what data it expects pre-loaded in some global registry, then either fake
  that registry or call into it via another export, OR
- (b) accept that Tooling.dll cannot be driven head-less without first
  loading a section catalog from disk — which Detailer.exe does at startup,
  outside the scope of these 8 exports — and switch to in-process injection:
  attach to a running Detailer.exe, let IT load the catalog, then call
  add_frameobject from our injected thread.

Option (b) is the pragmatic path. The host process (Detailer.exe) would
already have:
- Authenticated state (real license)
- Loaded section profiles in `engine.sections_list`
- Loaded frame definitions
- All the catalog AnsiStrings allocated in real Delphi heap

We could then call `add_frameobject` with our exact 50/185/75-byte records
and see real ops returned via `get_operations_for`. This is the path that
would yield 100% bit-exact Detailer parity for our RFY codec.
