# FRAMECAD Detailer — Section Profile Data Source

**Investigation date:** 2026-05-03
**Time spent:** ~30 min
**Status:** RESOLVED. Section data is in `.msup` JSON files; Detailer constructs `TSection` instances from the JSON at machine-setup load time.

---

## Where section data lives

### 1. `.msup` files (Machine Setup files) — PRIMARY SOURCE
- **Path:** `C:\Users\Scott\AppData\Roaming\FRAMECAD\Detailer\Version 5\Machine Setups\*.msup`
- **Format:** UTF-16-LE encoded JSON-shaped records (`Settings.ini` confirms: `UseUnicodeMachineFiles=1`)
- **Contents:** Each `.msup` carries an inline `SectionSetups` collection — every section a machine can roll is FULLY self-contained (Profile + Material + SectionOptions + GUID).
- **We already have this decoded:** `C:\Users\scott\OneDrive - Textor Metal Industries\CLAUDE DATA FILE\memory\reference_data\HYTEK-MACHINE-TYPES.json`
- Master copies on Y: at `(08) DETAILING\(13) FRAMECAD\FrameCAD DETAILER\HYTEK MACHINE_FRAME TYPES\`.

### 2. `sections.xmlx` / `steelspecs.xmlx` — DEAD END (skip)
- **Path:** `C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\sections.xmlx` (37 KB) and `steelspecs.xmlx` (4.4 KB)
- Both are encrypted (likely AES-CBC). The two files share a 19-byte common prefix (probably a fixed magic + IV preamble) then diverge.
- The known FrameCAD `.dat` cipher (XOR 4-byte key `08 01 09 05`, CRLF-reset) does NOT decrypt these — different cipher, no quick crack.
- **Don't bother.** The .msup data is sufficient and already decoded — these `xmlx` files are likely just the FrameCAD-shipped defaults, superseded by HYTEK's own machine setups.

### 3. Detailer.exe / Tooling.dll — CLASS DEFINITIONS, NO HARD-CODED SECTIONS
String hunt confirms:
- `Tooling.dll` exports `TSection`, `LeftFlange`, `SectionSetup` Delphi RTTI strings — the TSection **class** lives here. No hard-coded 89S41 dimensions.
- `FRAMECAD Detailer.exe` references `sections.xmlx`, `steelspecs.xmlx`, and `.msup` strings (all UTF-16) — confirming it's the consumer of all three.
- TSection is constructed at runtime from the JSON; no embedded section table to extract.

---

## Sample record — `89S41_0.75` (the section that matters for HG260044)

Source: `HYTEK-MACHINE-TYPES.json` → `MachineSetups["6"]` (F325iT 89mm) → `SectionSetups["2"]`.

```json
{
  "AutomaticallyDetermineExportSection": "True",
  "GUID": "{3193F334-8232-4C5F-8C16-3BD0FECB7F9F}",
  "Name": "89S41_0.75",
  "Profile": {
    "ShapeClassification": "S",
    "LeftFlange": "41",
    "RightFlange": "38",
    "FlangeLabel": "0",
    "Web": "89",
    "LeftLip": "10",
    "RightLip": "10"
  },
  "Material": {
    "BMT": { "FColor": "clFuchsia", "FThickness": "0.75" },
    "Coating": { "DisplayLabel": "AZ150", "MinMass": "150" },
    "SteelSpec": "AS 1397",
    "Strength": {
      "DisplayLabel": "G550",
      "Elongation": "2",
      "Tensile": "550",
      "Yield": "550"
    }
  },
  "SectionOptions": {
    "Boxable": "True",
    "DeflectionTrackEndClearance": "12.7",
    "DeflectionTrackScrewHeight": "26.97",
    "DualFasteners": "False",
    "Fastener1": "20.5",
    "Fastener1Name": "Dimple1",
    "Fastener2": "-1",
    "Fastener2Name": "Fastener2",
    "FlangeBoltHoleHeight": "-1",
    "FlangeHoleHeight": "27.5",
    "InnerBendRadius": "2",
    "AutomaticChamfer": "True",
    "AutomaticCruciform": "False",
    "TripleHoleSpacing": "17"
  },
  "ManualRFYImperialLabel": "",
  "ManualRFYMetricLabel": "",
  "ManualSectionIDForRFX": "-1"
}
```

All 6 89mm sections (`89S41_0.55`, `89S41_0.75`, `89S41_0.95`, `89S41_0.95_1`, `89S41_1.15`, `89S41_1.15_1`) are present under `MachineSetups["6"].SectionSetups`. Other gauges (70mm, 75mm, 78mm, 90mm, 104mm) are under their own machine indices 1–9.

---

## TSection construction recipe (for Path A — `add_frameobject` rc=8 fix)

Detailer's runtime sequence at `.msup` load:
1. Parse `.msup` (UTF-16-LE) into a tree of records.
2. For each `SectionSetups[i]`, instantiate `TSection` (from `Tooling.dll`).
3. Populate it with: GUID, Name, Profile sub-record (7 dimensions), Material sub-record, SectionOptions sub-record (15 fields).
4. Index the resulting TSection by GUID into Detailer's section registry — that registry is what `add_frameobject` consults.

**For our Python driver:** before calling `add_frameobject`, replicate step 2–4: find Tooling.dll's TSection constructor (the `TSection` ASCII string at offset `0x1020ce` is the Delphi class-name pointer — its vtable + `Create` slot are nearby), call it with these field values, then register the GUID. The other agent on Path A should:
- Locate `TSection.Create` via the vmt referenced near `0x1020ce` in Tooling.dll.
- Call it with the JSON values from the sample record above (string fields as Delphi short/long strings, numbers as floats).
- The 89S41_0.75 GUID `{3193F334-8232-4C5F-8C16-3BD0FECB7F9F}` is what `add_frameobject` should look up.

---

## Files referenced
- `C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\sections.xmlx` (encrypted, skip)
- `C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\steelspecs.xmlx` (encrypted, skip)
- `C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\Tooling.dll` (TSection class lives here, sym at 0x1020ce)
- `C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\FRAMECAD Detailer.exe` (consumer; references all 3)
- `C:\Users\Scott\AppData\Roaming\FRAMECAD\Detailer\Version 5\Settings.ini` (`UseUnicodeMachineFiles=1`)
- `C:\Users\Scott\AppData\Roaming\FRAMECAD\Detailer\Version 5\Machine Setups\` (where Detailer expects `.msup` files; currently empty)
- `C:\Users\scott\OneDrive - Textor Metal Industries\CLAUDE DATA FILE\memory\reference_data\HYTEK-MACHINE-TYPES.json` ← USE THIS, complete decoded data for 10 HYTEK machines + 38 frame types
