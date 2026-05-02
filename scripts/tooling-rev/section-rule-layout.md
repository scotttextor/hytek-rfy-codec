# SectionRule layout — full RE pass (2026-05-03)

## TL;DR — the previous notes were partially wrong

The hypothesised 14-byte SectionRule struct living in
`SectionLookupRecord +0x9f / +0xa3` does NOT exist. What actually exists is:

1. The **real** rule iteration is in `add_frameobject` at `0x586507..0x586535`,
   reading from **arg3 (FrameDefRecord) +0x3b / +0x3f** — pointer + count.
2. The stride is **12 bytes** (`add ebx, 0xc`), not 14.
3. Per-rule fields at offsets +0, +4, +8 — three dwords:
   - `+0x00` (dword): "arg0" — pushed to add-op call as 1st parameter
   - `+0x04` (dword): "arg1" — pushed to add-op call as 2nd parameter
   - `+0x08` (dword): "lookup_key" — used to query a list inside TSectionSetup

The previous "14-byte" hypothesis was a misread of `0x585f90`
(`frame_id_resolve_585f90`). That function is just a `rep movsd ecx=6` block
copying 6 dwords from SectionLookup `+0x19` to TSection `+0x21`. It does NOT
iterate any rule array.

## Class identification (confirmed live via VMT walk 2026-05-03)

| Class slot | VMT VA  | Class name |
|------------|---------|------------|
| `0x52f158` | 0x52f1b0 | **TMachineSetup** (NOT TSection) |
| `0x5482fc` | 0x548354 | **TFrameObject** |
| `0x52fcb8` | 0x52fd10 | **TSectionSpecificOptions** |
| `0x52fe9c` | 0x52fef4 | **TSectionSetup** |
| `0x4f7e68` | 0x4f7ec0 | **TCoord2D** |
| `0x5280a8` | 0x528100 | **TProfileShape** |

This confirms the .msup `SectionOptions` JSON IS literally
`TSectionSpecificOptions` instances. The .msup is the source of truth for
the catalog data.

## The real op-generation chain

```
add_frameobject(FrameRecord*, SectionLookupRecord*, FrameDefRecord*)
  ├─ validate distance > 0  (rc=8 gate)
  ├─ frame_id_resolve_585f90(SectionLookupRecord) → TSection*    (just memcpy)
  ├─ TSectionSpecificOptions ctor (alloc)                          (52fcb8)
  ├─ Loop: for each rule in FrameDef[+0x3b..+0x3f]:
  │     if 0x52f9f8(setup, key=rule[+8]):
  │        0x532ad8(setup, key, rule[+0], rule[+4])  ← register-op
  ├─ 0x528b18(eax=TProfileShape_classvar, edx=FrameDef+0x12)       (build profile)
  ├─ TSectionSetup ctor 0x531c14(eax, dl=1, args=…)
  ├─ TFrameObject ctor 0x54d884(...) — has 0x30 stack args
  │     └─ inside ctor: call [vtable+8]   ← ACTUAL op generator
  └─ frames_list.Add(TFrameObject*)
```

### The op-generator method — TFrameObject vmt+8 @ RVA 0x14da9c

```
TFrameObject_vmt8 (this=ebx):
  call 0x53a17c                              ; ?
  free [ebx+0x44] / [ebx+0x48]               ; clear two TLists

  if [ebx+0x60] != 0 AND [ebx+0x64] != 0:    ; both Swage lists exist
    tools = 0x4fc938(this.tools)             ; alloc TCoord2D pair
    arg2 = 0x4fcf94(setup_38, dl=1)          ; setup_38.GetByIdx(1)
    arg1 = 0x4fcf94(setup_38, dl=0)          ; setup_38.GetByIdx(0)
    0x4fbdfc(eax=this[+0x60], edx=arg1, ecx=arg2)   ; APPEND OP to list[+0x60]
    arg2 = 0x4fcf94(setup_3c, dl=1)
    arg1 = 0x4fcf94(setup_3c, dl=0)
    0x4fbdfc(eax=this[+0x64], edx=arg1, ecx=arg2)   ; APPEND OP to list[+0x64]
    push [setup_4d+0x3d]; push [setup_4d+0x39]
    0x4fce08(eax=this[+0x60], edx=tools, push qword) ; emit OP with position
    push [setup_4d+0x3d]; push [setup_4d+0x39]
    0x4fce08(eax=this[+0x64], edx=tools, push qword)

  if [ebx+0x68] != 0 AND [ebx+0x6c] != 0:    ; second Swage pair
    (same pattern with +0x68 / +0x6c)
```

**Critical observation**: The lists at `[ebx+0x60..0x6c]` are populated by
`0x4fbf64()` calls in the TFrameObject constructor. Each `0x4fbf64(setup)`
enumerates `setup[+0x24]` (a TList of TSectionSpecificOptions) and looks up
something — returning a TList* (or NULL).

So the chain is:
- `setup[+0x24]` = TList of TSectionSpecificOptions per rule key
- `[ebx+0x60..0x6c]` = filtered sub-lists (one per fastener type)
- The op-generator at vmt+8 emits ops only when these are non-empty

## Why ops_len=0 with our current setup

With FrameDefRecord all-zeros, the rule loop iterates 0 times → no rules
registered → `setup[+0x24]` empty → `[ebx+0x60..0x6c]` all NULL → vmt+8
emits zero ops.

To fix this requires **populating the rule array on FrameDefRecord+0x3b**:

```python
# Build N x 12-byte rules
rule_bytes = b""
for arg0, arg1, key in rules:
    rule_bytes += struct.pack("<III", arg0, arg1, key)

rule_buf = ctypes.create_string_buffer(rule_bytes)
# Stash in FrameDefRecord
fd.dword_at_3b = ctypes.addressof(rule_buf)  # field name in driver
fd.count_at_3f = len(rules)
```

But there's a complication: `0x52f9f8` only returns `AL=1` when the rule's
`key` (at `+8`) matches an entry in `[setup_obj+0x9f]+0x10` (another TList).
That setup_obj is allocated FRESH inside add_frameobject — and it's empty
unless someone populated it. But who?

Tracing: `setup_obj` = `[ebp-4]` set by `call 0x531e7c` at line `0x5864b6`,
which is the **TSectionSpecificOptions ctor**:

```
TSectionSpecificOptions ctor (esi=this):
  [esi+5]  = 0     (byte)
  [esi+6]  = 0     (dword)
  [esi+0xa] = 0xbff00000   (dword — looks like double low half: -1.0)
  [esi+4]  = 0     (byte)
  [esi+0x12] = 0   (dword)
  [esi+0x16] = 0x40310000  (dword — looks like double low half: ~17.0)
  [esi+0xe]  = 0x5327c8(eax=[0x5313b4], dl=1)  ← creates a sub-list
```

There's no `[esi+0x9f]` field initialisation. The struct is way smaller
than 0x9f bytes. The `+0x9f` access in `0x52f9f8` must come from a
**different parent object**, not from the freshly-allocated TSectionSpecificOptions.

Looking again at `add_frameobject` at line `0x58650c`:
```
call 0x52f9f8       ; eax = local var [ebp-8] = TSectionSpecificOptions
                    ; edx = [ebx+8] (rule.key)
```

The `[ebp-8]` was set by `call 0x585f90` (frame_id_resolve_585f90) — meaning
it's the **TSection** (which is actually a `TMachineSetup` per the VMT walk!).
And TMachineSetup has 0x9f+ bytes of data, populated by `frame_id_resolve_585f90`
copying from SectionLookupRecord.

So the **lookup table is in the SectionLookupRecord +0x9f area**, but it's NOT
a 14-byte rule array — it's a list (TList) at SectionLookupRecord-derived
offset that holds (key, value) pairs.

## Conclusion: this is too deep to crack in 2-3 hours without runtime data

The 12-byte SectionRule struct in FrameDefRecord+0x3b is the rule iteration
target, but each rule's lookup_key (+8) must match an entry in a TList that
is itself populated from data in SectionLookupRecord +0x9f area. That data
is the actual machine-setup catalog.

**The .msup file is the catalog source.** Building the correct catalog from
the .msup alone, without Detailer's loader (which uses sskeleton.dll +
libcrypto-3.dll for decryption), would require either:

1. **Calling Detailer's catalog loader directly** — find the export/internal
   symbol that loads `.msup` into TMachineSetup objects, call it from our
   driver. Then add_frameobject would just work. Best path forward.
2. **Re-implementing the .msup decryption** in Python and constructing the
   TMachineSetup structures byte-exact — multi-week project.
3. **Hooking add_frameobject inside a running Detailer.exe** — capture the
   3-record bytes for one stick, replay headless. Already the recommended
   path in section-catalog.md / record-layouts.md "Path A".

## What I changed in tooling-driver.py

- Renamed misleading FrameDefRecord field `padding_3b_42` to
  `rule_array_ptr` (+0x3b, dword) and `rule_array_count` (+0x3f, dword).
- Added documentation of the actual 12-byte SectionRule struct.
- Added (commented-out) code path showing how to populate one rule array.

## Files

- Driver: `scripts/tooling-driver.py`
- Disasm of add_frameobject: `scripts/tooling-rev/disasm-all.txt` (lines 85..240)
- Disasm of TFrameObject_vmt8 op-generator: see this doc above
- Class VMT walk: `scripts/tooling-rev/probe-vmts.py`
