# Detailer ActionDefsManager Dump — Run Instructions

This dumps the ~450-record `ActionDefsManager` dictionary that drives every
tooling-op recipe in FRAMECAD Detailer. Once captured, the HYTEK RFY codec
can replicate Detailer 1:1 for the per-edge-mask action lists.

**Time required:** 5-10 minutes. Single shot — please get it right the first time.

## Pre-flight checklist (do these BEFORE starting)

- [ ] FRAMECAD Detailer is installed and licence-active (it must be able to
      open + build a real job from end to end).
- [ ] You have ONE known job XML at hand — preferably **HG260044**, since
      that's our highest-coverage corpus. HG260012 or any other real job
      also works.
- [ ] No other Detailer instance is running (close any existing ones).
- [ ] Frida + Python are installed:
      ```
      pip install frida frida-tools
      ```
      Confirm with `python -c "import frida; print(frida.__version__)"`.
      Should print `17.9.5` (or similar).

## The single command

From a terminal at the repo root (`C:\Users\Scott\CLAUDE CODE\hytek-rfy-codec`):

```
python scripts/frida-dump-actiondefs.py
```

That's it. The launcher will:
1. Auto-detect Detailer's install path.
2. `frida.spawn()` it under instrumentation (Detailer comes up paused).
3. Load the hook script.
4. Resume Detailer.
5. Stream every captured event to `docs/frida-out/actiondefs-dump.jsonl`.
6. Print a status line every 5 seconds.

If the auto-detection misses the EXE, pass it explicitly:
```
python scripts/frida-dump-actiondefs.py --detailer "C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\FRAMECAD Detailer.exe"
```

If you'd rather attach to an already-running Detailer (e.g. you've already
got a job loaded):
```
python scripts/frida-dump-actiondefs.py --attach
```

## What to do once Detailer comes up

The launcher prints `>>> Hook installed and listening. <<<` once it's ready.
Then in **Detailer**:

1. **Open ONE job XML.** File -> Open -> pick the HG260044 XML (or any other
   real job).
2. **Wait for the build to complete.** Detailer will load and process the
   frames. The launcher window will show a steady stream of `events=...`,
   `keys=...`, `sections=...` numbers as they accumulate.
3. **Export the RFY.** File -> Export -> RFY (or Alt+F, E, R). This is the
   important step — it's what fires `FUN_00545b94` (the rule walker) for
   every stick-stick intersection. **Without this step we capture only
   startup state, not runtime lookups.**
4. **Wait for the export dialog to close.** Detailer will write the .rfy
   file. Save it anywhere — we don't need the file, only the side-effect on
   the in-memory dictionary.
5. **(Optional but recommended)** Open a second different job and export
   its RFY too. Different jobs trigger different classification names — a
   linear-truss plan (`-LIN-`) uses different keys than a wall-back-to-back
   plan, etc. More variety = higher coverage.

## Stopping cleanly

Once you've exported one (preferably two) RFYs, switch to the launcher
window and press **Ctrl+C**. The launcher will:

1. Send a `shutdown` command to the in-process script.
2. The script does a one-shot direct walk of `DAT_005968d0` (the dictionary
   global) — this catches every entry that was registered, even ones that
   weren't looked up at runtime.
3. The launcher writes a final `summary` record and detaches cleanly.

**Don't kill Detailer first.** The shutdown walk needs Detailer alive. Stop
the launcher with Ctrl+C, then close Detailer normally afterward.

## What "success" looks like

After the launcher exits, check the dump file:

```
docs/frida-out/actiondefs-dump.jsonl
```

The launcher prints a one-line summary like:

```
[done] 28 unique keys, 28 sections, 487 action records.
```

**Healthy capture indicators:**
- `unique keys >= 28` (the 28 named classifications from `detailer-rule-decoded.md`)
- `unique section ptrs >= 28` (one per key)
- `action records >= 450` (~16-20 actions per section average)
- A line of type `dict_walk_done` appears with `entries_dumped >= 28`
- Multiple `section_dump` records, each with `masks` containing 16 entries

**Spot-check classification names you should see:**
```
OnFlat - Standard
OnFlat - Over
OnFlat - Swaged
OnFlat - LipNotchedCorners
OnFlat - DualTrack Standard
OnFlat - Tabbed
OnEdge - Standard
OnEdge - LipNotches
OnEdge - PartialFlanges
OnEdge - LipNotchedStandard
None
```

Quick check from the terminal:

```
python -c "import json; keys=set(); [keys.add(json.loads(l).get('key','')) for l in open('docs/frida-out/actiondefs-dump.jsonl', encoding='utf-8') if l.strip().startswith('{')]; [print(k) for k in sorted(keys) if k]"
```

## If something goes wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| Launcher exits immediately with "ERROR: could not locate FRAMECAD Detailer.exe" | Non-standard install path | Pass `--detailer <full path>` |
| Launcher hangs after spawn, no events | Detailer's licence-server check failed | Check Detailer can run normally outside Frida; reactivate licence |
| `init_giveup` appears in logs | Tooling.dll never loaded | Detailer crashed early — check the launcher output for crashes |
| `unique keys == 0` after stop | Never opened/exported a job | Re-run; the export step is mandatory |
| `frida.attach` errors with `Failed to attach` | Detailer spawned with elevated privileges | Run the launcher in an Admin terminal |
| `dict_walk_error reason=dict_null` | Dictionary not yet populated | Open a job first; the dictionary is populated lazily |
| Dump file is huge (>50 MB) | apply_rule events not truncating | Check `MAX_APPLY_RULE_LOG` constant in the JS — should cap at 2000 |

## What's in the dump file

The dump is JSONL — one JSON object per line. Notable record types:

| `type` | Meaning |
|---|---|
| `script_loaded` | Hook script entered |
| `init_waiting` | Tooling.dll not yet loaded — retrying |
| `init` | Tooling.dll found, base address recorded |
| `init_success` | All four hooks installed |
| `dict_add` | Dictionary.Add fired (records key + value pointer) |
| `lookup_action_section` | FUN_00520cc8 called with a key → returned section ptr |
| `new_key_seen` | First-time observation of a classification name |
| `section_dump` | Full TToolActionSection: 16 mask entries × N slots × actions |
| `apply_rule` | Per-call snapshot of the FToolActions[mask] being walked |
| `first_apply_rule_fire` | First runtime rule call — triggers the dictionary walk |
| `dict_walk_start/_done` | Direct dictionary walk (one-shot full dump) |
| `dict_entry` | One entry from the direct walk |
| `summary` | Final summary written by the Python launcher on exit |

## Re-running

If the first run misses keys you can run again. The dump file is **overwritten**
each time. To preserve a previous run, rename the old file before re-running:

```
mv docs/frida-out/actiondefs-dump.jsonl docs/frida-out/actiondefs-dump.run1.jsonl
```

## Architecture notes (for the curious)

The hook attaches to four functions in Tooling.dll (Ghidra image base
0x00400000):

- `FUN_00520cc8` (RVA 0x120cc8) - LookupActionSection
- `FUN_00521280` (RVA 0x121280) - Dictionary.Add internal
- `FUN_00545b94` (RVA 0x145b94) - ApplyRule (the rule executor)
- `FUN_00545af8` (RVA 0x145af8) - MakeOperations (parent of ApplyRule)

Plus a direct walk of `DAT_005968d0` (RVA 0x1968d0), which is the
`TObjectDictionary<string, TToolActionSection>` instance.

Each `TToolActionSection` has 16 `FToolActions[mask]` arrays at
`section + 0x10 + mask*4`. Each array entry is an 8-byte slot pair:
`{filterEdges: TArray<u8>, actions: TArray<RAction[5 bytes each]>}`. The
walker picks the first slot whose filterEdges match the connector edge
geometry, then emits ops for every action in that slot's actions array.

Full RE writeup: `docs/detailer-rule-decoded.md`.
