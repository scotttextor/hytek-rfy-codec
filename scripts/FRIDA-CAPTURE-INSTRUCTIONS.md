# Frida Capture — How to Use When Detailer Works

**Pre-requisite:** A working FRAMECAD Detailer install (license active or HASP dongle attached).

## What this captures

The 185-byte `SectionLookupRecord` for every stick Detailer processes. This record contains the catalog payload our headless driver currently can't synthesize. Once captured, we can:
1. Replay it byte-for-byte in our headless `tooling-driver.py`
2. Get bit-exact tooling ops from `get_operations_for`
3. Encode as RFY → 100% match guaranteed

## Setup (one-time)

```bash
# Install Frida + Frida-tools
pip install frida frida-tools

# Verify Detailer is in PATH (not strictly needed, just for sanity)
"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\FRAMECAD Detailer.exe" --help 2>nul
```

## Capture run

1. **Launch Detailer.** It must successfully load (license valid).
2. **Open a project file.** Use one with known reference output, e.g.:
   - HG260012's input XMLs in `test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES/`
   - Known reference RFY output for byte-exact comparison
3. **Find Detailer's PID:**
   ```bash
   tasklist | grep -i detailer
   # OR
   frida-ps | grep -i detailer
   ```
4. **Attach the hook:**
   ```bash
   frida -p <PID> -l scripts/frida-capture-records.js -o capture.log
   ```
5. **Trigger frame builds** in Detailer:
   - File → Build (or whatever menu rebuilds the frames)
   - Each `add_frameobject` call will dump 3 records to capture.log
6. **Stop Frida** when capture is complete (Ctrl+D or Ctrl+Z then `kill`)

## What you get

`capture.log` contains, for each stick:
- 50-byte FrameRecord (geometry: endpoints, length)
- **185-byte SectionLookupRecord** (the catalog payload — this is what we need)
- 75-byte FrameDefRecord
- The resulting `get_operations_for` output (ops array)

Example output:
```
========================= add_frameobject call #1 =========================
  FrameRecord*       = 0x019a4520
  SectionLookupRec*  = 0x019a4560
  FrameDefRecord*    = 0x019a4620

FrameRecord (50 bytes):
  00 d8 0a 00 00 00 00 c8 c0 | 00 00 00 00 00 00 00 c8
  ...

SectionLookupRecord (CATALOG PAYLOAD) (185 bytes):
  3b 00 00 00 ...
  ...

Decoded:
  frame_id = 1
  endpoint1 = (2616.000, 0.000)
  endpoint2 = (0.000, 0.000)
  SectionLookupRecord rule_count @ +0xa3 = 4

  → rc = 0x00 (OK)

  get_operations_for(frame_id=1) → rc=0, len=4
    op[0]: 00 00 00 00 27 00 00 00 ...    ← Swage 0..39
    op[1]: 02 00 00 00 21 00 00 00 ...    ← InnerDimple @16.5
    op[2]: 00 00 00 00 27 00 00 00 ...    ← Swage 2577..2616
    op[3]: 02 00 00 00 21 00 00 00 ...    ← InnerDimple @2599.5
```

## After capture: replay

Once you have a real `SectionLookupRecord` in capture.log:

1. Extract the 185 hex bytes from one capture
2. Paste into `scripts/tooling-driver.py` as a hex literal
3. Run the driver — it should now output real ops
4. Compare to reference RFY → should match bit-exactly

## Why this works

- Detailer's auth check is bypassed by our existing single-byte write
- Detailer has its catalog populated (it loaded the .msup files at startup)
- We just need to capture what Detailer constructs and feeds to add_frameobject
- That captured data IS the catalog — replay it from headless Python

## Catalog reuse across sticks

The same SectionLookupRecord is reused for multiple sticks of the same profile. So capturing ONE call for each profile (89S41_0.75, 70S41_0.75, etc.) gives us catalogs for all sticks of that type. We need ~10 captures total to cover all HYTEK profiles.

## If you can't get Detailer running

The empirical codec at `scotttextor/hytek-rfy-codec` is at 73.75% match without Detailer. Continue iterative reverse-engineering — slower but no Detailer dependency.

---

**Status when this was written:** All static RE complete. Auth bypass works. Records flow through the engine cleanly. Only the catalog payload (SectionLookupRecord +0x9f area) needs to be captured from a real Detailer call. Frida hook is ready to deploy.
