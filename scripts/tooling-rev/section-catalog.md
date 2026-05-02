# Section catalog — pre-fill investigation (2026-05-03)

## TL;DR — There is no global section catalog gate

The premise behind this investigation ("rc=8 because TSection ctor rejects an
empty global catalog") is **wrong**. Pre-filling a catalog is unnecessary.

`add_frameobject` now returns `rc=0` and the frame is inserted into
`engine.frames_list` (Count=1). `generate_operations(0)` returns 0.
`get_operations_for(1)` returns 0 with an empty ops array.

The actual root cause of rc=8 was two unrelated bugs in the call site, both
fixed in `tooling-driver.py`:

### Bug #1 — endpoint encoding (was producing rc=8 from the IsZeroDouble gate)

The disasm of `geom_op_42f5fc` proves it computes 2D Euclidean distance:

```
fld qword [esi]      ; tpoint.x at offset 0  (8 bytes)
fld qword [esi+8]    ; tpoint.y at offset 8  (8 bytes)
... fsub, fmul, faddp, sqrt
```

So a TPoint is `(x: double @ 0, y: double @ 8)` — 16 bytes total.

`tpoint_ctor_42f5a0(out, p1=arg, p2=arg, p3=arg, p4=arg)` builds it from 4 args:
```
[eax+0]   = arg3   (lo32 of x)
[eax+4]   = arg4   (hi32 of x)
[eax+8]   = arg1   (lo32 of y)
[eax+0xc] = arg2   (hi32 of y)
```

`add_frameobject` pushes from FrameRecord (esi):
```
endpoint1: push [esi+0x26], push [esi+0x22], push [esi+0x2e], push [esi+0x2a]
           → x_lo=esi+0x22, x_hi=esi+0x26, y_lo=esi+0x2a, y_hi=esi+0x2e
endpoint2: push [esi+5],    push [esi+1],    push [esi+0xd],  push [esi+9]
           → x_lo=esi+0x01, x_hi=esi+0x05, y_lo=esi+0x09, y_hi=esi+0x0d
```

So the doubles live at:

| Offset      | Value             |
|-------------|-------------------|
| +0x01..+0x08 | endpoint2.x (double) |
| +0x09..+0x10 | endpoint2.y (double) |
| +0x22..+0x29 | endpoint1.x (double) |
| +0x2a..+0x31 | endpoint1.y (double) |

Then `is_zero_double_42eeec` returns AL=1 if `|d| ≈ 0`, AL=0 otherwise.
The gate at 0x586493 is `je 0x58649c` — taken when AL==0 (nonzero distance).
So the engine WANTS distance to be NONZERO. With both endpoints at origin,
distance=0 → AL=1 → fail rc=8.

**Fix:** endpoint1=(2616.0, 0.0), endpoint2=(0.0, 0.0). Distance=2616 → AL=0 → pass.

The previous struct-field naming `(p1_x1, p1_y1, p1_x2, p1_y2)` was misleading
because those bytes are actually `(x_lo, x_hi, y_lo, y_hi)` per the disasm.
Fix in driver writes the doubles via `ctypes.memmove` at the correct offsets.

### Bug #2 — fake AnsiString at SectionLookupRecord +0x9f

The previous driver constructed a synthetic Delphi AnsiString header at
`SectionLookupRecord +0x9f / +0xa3` with `SECTION_NAME = b"89S41-1.15"`.
Disassembly of `section_ctor_585f90` shows that `+0x9f` is **not** an
AnsiString — it's a pointer to an array of 14-byte `SectionRule` records,
with `+0xa3` being the **count** (not an AnsiString length header).

When count is non-zero, `0x585f90` iterates the array and calls
`tpoint_ctor_42f5a0` + a Delphi list `Add` for each entry. With our fake
data, those derefs presumably also failed silently or produced rc≠0.

**Fix:** zero the entire SectionLookupRecord. With count=0 in all four
loops (+0x19/+0x21/+0x29/+0x9f), `section_ctor_585f90` runs them zero
times and the engine accepts an empty rule set.

## Verification (live, 2026-05-03 with 32-bit Python + Tooling.dll)

```
[+] Calling add_frameobject(stick_S1, 89S41-1.15, len=2616)...
[+] add_frameobject -> rc=0x00 (0) [full eax=0x00000000]
[+] Calling generate_operations(0)...
[+] generate_operations -> rc=0
[+] get_operations_for(1) -> rc=0, ops_len=0, ops_ptr=0x00000000
[+] engine.frames_list.Count after add: 1
[+] engine.sections_list.Count after add: 0
[+] cleanup() returned, gate restored on next authenticate() call.
```

The engine is live, the stick is registered, and the per-frame "compute ops"
virtual method (`[TFrameObject_vtable + 8]` on class `[0x5482fc]`) ran cleanly.
It produced an empty ops array because we fed it an empty rule set.

## What's still needed for non-empty ops

To get actual `Swage / InnerDimple / TrussChamfer / Flange / PartialFlange /
LipNotch` ops out of `get_operations_for`, the SectionLookupRecord must
contain valid rule data:

| Ptr offset | Count offset | Stride | Notes |
|-----------:|-------------:|-------:|-------|
| +0x19      | +0x1d        | 16 B   | TPoint-flavoured; only iterates if count > 1 |
| +0x21      | +0x25        | 16 B   | TPoint-flavoured; only iterates if count > 1 |
| +0x29      | +0x2d        | 16 B   | TPoint-flavoured; only iterates if count > 1 |
| +0x9f      | +0xa3        | 14 B   | SectionRule array — always iterated (this is the engine's "rule book") |

Per-`SectionRule[14B]` field layout (read inside `0x585f90`):

| Offset | Type  | Notes |
|--------|-------|-------|
| +0x00  | int32 | 1st arg to `0x52be38` (some setter) |
| +0x04  | int32 | 2nd arg to `0x52be38` |
| +0x08  | int32 | range gate: must be ≥ 0 (else AL=6 → rc=6) |
| +0x0c  | byte  | 3rd arg to `0x52be38` |
| +0x0d  | byte  | range gate: must be ≤ 0xfc (else AL=7 → rc=7); also dispatches: if value == 0x17, calls setter twice (cl=4 then cl=6); else single call (cl=value) |

## Path forward (since synthesising rules from scratch is unsafe)

The pragmatic next step is **dynamic capture, not static synthesis**. Hook
`Tooling.dll!add_frameobject` from inside a running Detailer.exe (the
import thunk at `Detailer.exe + 0x16b9ba4` → `[0x1e35454]`), capture the
three records as raw bytes for one well-known stick (e.g. an
`89S41-0.75 / lipped / 2616mm` stud), then replay them from this driver.

Tools:
- Frida (`frida-trace -i 'add_frameobject'`) on `FRAMECAD Detailer.exe`
- Or a small custom DLL that hooks the import via MinHook and dumps to disk

Once one rule array is captured, the byte encoding can be reverse-engineered
against `HYTEK-MACHINE-TYPES.json` / `HYTEK-FRAME-TYPES.json` — that gives
100% Detailer parity without Detailer at runtime.

## Files

- Driver: `scripts/tooling-driver.py` (updated 2026-05-03 — rc=0 verified)
- Disasm: `scripts/tooling-rev/disasm-geom.txt` (geom_op_42f5fc + tpoint_ctor)
- Disasm: `scripts/tooling-rev/disasm-helpers.txt` (section_ctor_585f90)
- Disasm: `scripts/tooling-rev/disasm-all.txt` (add_frameobject @ 0x00586410)
- Layouts: `scripts/tooling-rev/record-layouts.md` (the original investigation)
