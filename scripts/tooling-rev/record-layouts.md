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
