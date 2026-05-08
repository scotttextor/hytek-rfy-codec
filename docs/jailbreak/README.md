# jailbreak/ — RE pipeline source artifacts (HD1)

Source artifacts from the FrameCAD Detailer reverse-engineering effort that
produced this codec's rule dictionary. Imported into the codec repo on
2026-05-09 as part of the HD1 freeze so the extraction tooling lives next
to the code that consumes it.

## What's here

- `RUN-THESE-TOOLS.md` — runbook for re-running the off-the-shelf RE
  pipeline (Process Monitor, System Informer, x32dbg, Resource Hacker, DIE).
- `parsed/`
  - `action-defs.json` (777 KB) — **canonical rule dictionary**, 27
    sections, 346 slots. **This is the same file as `src/rules/action-defs.json`**
    (verified md5-equal); kept here as the historical extraction record.
  - `action-defs.raw.txt` — 373 lines, the exact ASCII rule blob as it
    appeared in `Tooling.dll`'s `.rdata` section.
  - `tooling-strings.txt` — 13733 strings extracted from `Tooling.dll`.
  - `die-{Tooling,Detailer,AutoFrame}.txt` — Detect-It-Easy output
    showing PE32, Embarcadero Delphi 10.4, no packer, signed.
- `extracted-resources/{AutoFrame,Tooling}/` — small Delphi runtime
  metadata (DVCLAL.bin, PACKAGEINFO.bin, PLATFORMTARGETS.bin, all.rc).

## What's intentionally NOT here

- **`Tooling.dll` (and any other FrameCAD binary)** — IP-sensitive, never
  committed.
- **`extracted-resources/Detailer/`** — 19 MB of FrameCAD branded UI
  assets (logos, splash screens, icons, .dfm form definitions). Trademark-
  sensitive; not committed to GitHub. They were captured in the local HD1
  zip archive only and can be re-extracted with Resource Hacker against a
  user-supplied copy of `FRAMECAD Detailer.exe`.

If you need the Detailer resources to verify something:
1. Run Resource Hacker against `FRAMECAD Detailer.exe` on a machine where
   it's licensed and installed.
2. The output will reproduce `extracted-resources/Detailer/`.

## Re-deriving action-defs.json

Should the canonical dictionary ever go missing:
1. Run `strings -e l Tooling.dll > tooling-strings.txt` (or use the
   captured copy in `parsed/`).
2. Run the parser at `scripts/jailbreak/parse-action-defs.py` (in the
   hytek-budget worktree referenced in RUN-THESE-TOOLS.md). It locates
   the `OnFlat - Standard` etc. anchor strings, decomposes the contiguous
   `.rdata` block, and emits `action-defs.json`.
3. Diff against the committed `parsed/action-defs.json`. They should be
   md5-equal (last verified 2026-05-09: `260ed6dcad409a5b0cffc8cceffbf260`).
