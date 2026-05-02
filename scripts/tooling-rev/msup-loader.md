# `.msup` loader investigation — 2026-05-03

## TL;DR — there is no single `.msup` loader to call

The premise of "find the loader and call it from headless Python" is built on
two assumptions that turn out to be wrong:

1. **`.msup` files don't exist on this system.** The
   `%APPDATA%\FRAMECAD\Detailer\Version 5\Machine Setups\` directory is
   **empty** (verified `find` 2026-05-03). Detailer ships with **zero**
   default setups — the user must import them via the Machine-Setups dialog.
2. **`.sups` (the actual HYTEK file format) is plaintext UTF-8 JSON, not
   encrypted.** Verified by reading the first 512 bytes of every `.sups`
   file under `Y:\(08) DETAILING\(13) FRAMECAD\FrameCAD DETAILER\HYTEK
   MACHINE_FRAME TYPES\`. They start with a UTF-8 BOM and a `{`. There is
   no decryption to bypass — Delphi's stock JSON reader handles them.

So the real question is: **what code in Detailer.exe parses the JSON and
constructs `TMachineSetup` / `TSectionSetup` / `TSectionSpecificOptions`
instances and inserts them into the engine's global catalog?** And: **can
that code be invoked from a headless `ctypes` driver?**

## What I found

### String-table evidence

The literal `.msup` (UTF-16-LE) is at Detailer.exe `0x008ae6e8`. It sits in
a Delphi string-pool block alongside two siblings:

```
2e 00 6d 00 73 00 75 00 70 00 00 00     ".msup"
2e 00 66 00 74 00 79 00 70 00 00 00     ".ftyp"
2e 00 73 00 75 00 70 00 73 00 00 00     ".sups"
```

So Detailer recognises **three extensions**: `.msup` (single Machine Setup),
`.ftyp` (single Frame Type), `.sups` (bundle of both). The HYTEK files are
all `.sups` bundles — one file per snapshot.

### No xrefs to the strings (the real story)

Searched all three binaries for any code that loads the VA of these strings:

| Binary | `.msup` xrefs | `Machine Setups` xrefs | `LoadFromFile` xrefs |
|--------|---------------|------------------------|----------------------|
| Detailer.exe | **0** | **0** | 2 (RTTI metadata, not code) |
| AutoFrame.dll | n/a | n/a | 0 |
| Tooling.dll | n/a | n/a | 0 |

This is the giveaway. In Delphi 32-bit, string constants are loaded via
`mov eax, OFFSET StringConstant_VA`. **Zero xrefs means the strings are
never accessed from generated code** — they live only in RTTI / typeinfo
metadata for the `TFileExt` enumeration, used by the file-dialog filter
builder at runtime. The actual file-extension dispatch happens via a
runtime `case` on the file dialog's filter index, **not** by string compare.

### Tooling.dll has eight exports, none of which is a loader

```
add_explicit_route, add_frameobject, authenticate, cleanup,
generate_operations, get_authcode_key, get_intersections_for,
get_operations_for
```

There is no `load_msup`, `load_setup`, or anything similar. The catalog is
loaded entirely inside Detailer.exe (the GUI process), which then funnels
already-constructed `TMachineSetup` objects into the engine via the
`SectionLookupRecord` parameter of `add_frameobject`.

### The catalog lookup the engine performs

From `section-rule-layout.md` (prior session): the rule loop in
`add_frameobject` at VA `0x586507..0x586535` calls `0x52f9f8(setup, key)`
on each rule's `lookup_key`. `0x52f9f8` searches the `TList` at
`[setup+0x9f]+0x10`. **That `TList` is populated from
`SectionLookupRecord +0x9f`**, which the prior agent left at NULL
("rule_array_ptr=0, rule_array_count=0"). With an empty list, every rule
lookup fails → `ops_len = 0`.

So the missing piece isn't a `.msup` loader — it's the **per-stick
`SectionLookupRecord`** payload. Detailer.exe builds it by walking the
in-memory `TMachineSetup` for the stick's profile and serialising the
relevant fields. The `TMachineSetup` itself comes from the JSON parse.

## Why "calling the loader" can't work as the task imagined

Even if we found Delphi's JSON parser entry point in Detailer.exe and
called it, the parser would:

1. Allocate a `TMachineSetup` Delphi object on the heap of the **calling
   process** (our Python process).
2. Insert the object into a **module-private global registry** inside
   Detailer.exe — a different DLL/EXE module than `Tooling.dll`.
3. The engine in `Tooling.dll` reads the registry not via a global pointer
   but via the `SectionLookupRecord` parameter that the **calling code in
   Detailer.exe** marshals from the registry.

So the chain is: Detailer.exe's GUI → JSON parser → TMachineSetup registry
→ marshaller (`0x016ba118`) → SectionLookupRecord → Tooling.dll's
`add_frameobject`. The marshaller is the linchpin, and replaying it in
headless Python requires either:

- **Re-implementing the marshaller's field-mapping pass** — it reads
  ~30 fields from a TMachineSetup, applies per-profile overrides from a
  TSectionSpecificOptions list, and writes a 185-byte record. Reverse-
  engineering this from disasm is a multi-day project.
- **Hooking `add_frameobject` inside a running Detailer.exe** to capture
  one ground-truth trio (FrameRecord, SectionLookupRecord, FrameDefRecord)
  per profile, then replaying those bytes from headless Python (Path A in
  `record-layouts.md`).

## Verdict

The "single .msup loader" concept doesn't exist. The information the user
needs lives in the `SectionLookupRecord` byte payload that Detailer's
marshaller emits. Path A (Frida hook on a running Detailer.exe to capture
real records) is still the right next step. It's measured in hours, not
days.

The current driver behaviour (`ops_len = 0`) is correct behaviour — the
engine accepts the call but emits zero ops because the input rule set is
empty. That's not a bug to chase down: it's confirmation that the
catalog-shaped data must be supplied. The bytes-on-the-wire are the goal,
not the parser.

## Files

- Investigation script: `scripts/tooling-rev/find-msup-loader2.py`
- String-context dump: `scripts/tooling-rev/dump-msup-context.py`
- xref output: `scripts/tooling-rev/msup-xrefs2.txt`
- Plain JSON `.sups` sample: `Y:\(08) DETAILING\(13) FRAMECAD\FrameCAD
  DETAILER\HYTEK MACHINE_FRAME TYPES\HYTEK MACHINE TYPES 20260402.sups`
  (272 829 bytes, UTF-8 BOM, JSON `{ "FrameTypes": …, "MachineSetups": … }`)
- Already-extracted JSON cache:
  `OneDrive/CLAUDE DATA FILE/memory/reference_data/HYTEK-MACHINE-TYPES.json`
  (272 829 bytes — byte-for-byte identical to the above)

## Live in-process diagnostic (new this session)

After a successful `add_frameobject` call with all-zero
SectionLookupRecord, the resulting `TFrameObject` looks like:

```
TFrameObject @ 0x032365c0
  +00  54 83 54 00          ; vmt = 0x00548354 (TFrameObject)
  +10  00 00 00 00 00 00 00 00     ; nothing — no parent setup ref here
  +28  c8 b0 2d 03                  ; ptr to something allocated
  +30  ptr ptr ptr ptr               ; four pointers (TLists or TCoords)
  +60  10 f6 22 03 80 f6 22 03 f0 f6 22 03 60 f7 22 03  ; four sub-lists
  +70  01 00 00 00          ; frame_id = 1
  +80  c0 b2 2d 03          ; some object ptr
  +84  00 00 00 00          ; ops dynamic array — STILL EMPTY
  +88  c0 02 2b 03          ; another object ptr
```

The four sub-lists at `+0x60..+0x6c` have `vmt=0x004f9118` (Delphi TList)
and `count=0`. `section-rule-layout.md` was wrong: the lists are always
allocated in the ctor; the check at `vmt+8` is on `count > 0`, not pointer
non-null. With `count=0` for all four, the op-generator early-exits on
every branch, leaving `+0x84` (the ops dyn-array) empty.

The lists are populated by `0x4fbf64(setup)` calls in the ctor, where
`setup` is the TMachineSetup built from SectionLookupRecord. **`0x4fbf64`
enumerates a list inside the setup and copies matching items into the
sub-list** — but with our all-zero SectionLookupRecord, that source list
is empty.

So the verified chain is:

```
SectionLookupRecord  →  TMachineSetup (frame_id_resolve_585f90)  →
TMachineSetup contains a TList of (key, payload) entries inside its
own +0x9f area  →  TFrameObject ctor's 0x4fbf64 calls filter that list
into four sub-lists at +0x60..+0x6c  →  TFrameObject_vmt8 emits ops
when those sub-lists are non-empty
```

**The seed of the entire op-generation pipeline is the TList at
TMachineSetup +0x9f area, which comes from the bytes at
SectionLookupRecord +0x9f area.** The previous session zeroed that
region. Re-populating it with the right (key, payload) entries is the
real next step.

## What to do next session

1. Run a **live Detailer.exe** with the auth bypass + the test job
   `HG260044`, attach Frida (or a small `MinHook` DLL injected via
   `CreateRemoteThread`), and trap `Tooling.dll!add_frameobject` (RVA
   `0x186410`). On every call, write the three records to disk as raw
   bytes (sizes are known: 50 / 185 / 75).
2. After one job, you'll have ~hundreds of (FrameRecord,
   SectionLookupRecord, FrameDefRecord) trios — one per stick.
3. Replay any one trio from `tooling-driver.py`. `ops_len > 0` should be
   immediate.
4. Then reverse-engineer the **marshalling** (TMachineSetup JSON →
   SectionLookupRecord) by diffing trios across profiles. Unlike the .msup
   loader, this is a pure data-format mapping job and parallelises well.

The `SectionLookupRecord` byte format is the actual missing artifact.
There is no shortcut by calling a hidden loader — there is no hidden
loader.
