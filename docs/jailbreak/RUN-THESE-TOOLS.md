# RUN-THESE-TOOLS.md

Off-the-shelf RE tooling — runbook for Scott. All tools pre-installed at
`C:\Users\Scott\tools\`. Each section runs in <5 minutes.

> **Status flag:** Static extraction already SOLVED the rules dictionary.
> See `parsed/action-defs.json` (777 KB, 27 sections, 346 slots).
>
> The runs below are now **confirmation passes** — proving the static
> rules match the live ones, plus identifying any auxiliary config files
> Detailer reads at job-load time.

---

## Recommended order (highest ROI first)

1. **Process Monitor** (Tool 1) — confirms which other files Detailer reads at startup. **Run this first if you only have 5 min.**
2. **System Informer / Process Hacker** (Tool 2) — proves rules in live memory match `.rdata` strings.
3. **Resource Hacker** (Tool 5) — already done. No Scott action needed.
4. **DIE** (Tool 6) — already done. No Scott action needed.
5. **x32dbg** (Tool 4) — only needed if procmon/SI return surprising results.

---

## Tool 1 — Process Monitor (5 min)

**What:** Captures every file/registry access by Detailer for ~45 seconds.

```cmd
python "C:\Users\Scott\CLAUDE CODE\hytek-budget\.claude\worktrees\condescending-hofstadter-a58927\scripts\jailbreak\run-procmon.py" 45
```

1. Script will start ProcMon in background and print
   `*** OPEN FRAMECAD DETAILER NOW + LOAD ONE JOB ***`
2. Open Detailer, open ANY job (Test 30 Unit is fine), wait for plan to draw, close.
3. Script auto-stops at 45s, exports CSV, mines for config files.
4. Output: `docs\jailbreak\parsed\procmon-summary.json` — top 50 files
   Detailer touches, ranked by access count.

**What to send back:** Just say "procmon done" — I'll read the JSON.

---

## Tool 2 — System Informer (3 min)

**What:** Dumps live memory containing the rule strings.

```cmd
python "C:\Users\Scott\CLAUDE CODE\hytek-budget\.claude\worktrees\condescending-hofstadter-a58927\scripts\jailbreak\run-process-hacker.py"
```

The script auto-launches SI and prints click instructions. Summary:

1. Detailer must be running with a job loaded.
2. In SI: **Ctrl+F**, Strings tab, filter to `FRAMECAD Detailer.exe`, search `OnFlat - Standard`.
3. Right-click first match -> Read -> **Ctrl+S** -> save as
   `docs\jailbreak\parsed\si-mem-onflat-standard.bin`
4. Search `OnEdge - LipNotchedStandard` -> save as
   `docs\jailbreak\parsed\si-mem-onedge-lipnotched.bin`
5. Run:
   ```cmd
   python "C:\Users\Scott\CLAUDE CODE\hytek-budget\.claude\worktrees\condescending-hofstadter-a58927\scripts\jailbreak\parse-mem-dump.py"
   ```
6. Output: `docs\jailbreak\parsed\live-rules.json`

**What to send back:** "SI done."

---

## Tool 3 — Resource Hacker

**ALREADY DONE.** Output at `docs\jailbreak\extracted-resources\`. No Scott action.

Result: Tooling.dll has only Delphi runtime metadata as PE resources.
Confirms the rules are NOT in resources — they're in `.rdata` (which
strings already extracted).

---

## Tool 4 — DIE (Detect It Easy)

**ALREADY DONE.** Output at `docs\jailbreak\parsed\die-Tooling.txt`.

Result: PE32, Embarcadero Delphi 10.4 Sydney, no packer, signed.
Means: clean static analysis is feasible — no anti-RE measures to defeat.

---

## Tool 5 — x32dbg (only if Tools 1+2 hit a wall)

**Path:** `C:\Users\Scott\tools\x64dbg\release\x32\x32dbg.exe`

**Script:** `scripts\jailbreak\x32dbg-script.txt`

1. Launch x32dbg (the 32-bit debugger; Detailer is 32-bit).
2. **File > Attach** -> pick `FRAMECAD Detailer.exe` (must be running with job loaded).
3. **File > Run Script** -> `scripts\jailbreak\x32dbg-script.txt`.
4. Output appears in Log tab. Saves 32 KB raw memory dump to
   `docs\jailbreak\parsed\x32dbg-rules-dump.bin`.
5. Run `parse-mem-dump.py` to decode.

**What to send back:** "x32dbg done."

---

## Tool 6 — API Monitor (Rohitab)

**SKIP.** Requires registration + a hooked-DLL injection that Frida
already does better. Listed in original brief but not worth the
friction now that static extraction succeeded.

---

## What we already have (no Scott action)

- `parsed/action-defs.json` — 777 KB, 27 sections, 346 slots, fully decomposed.
- `parsed/action-defs.raw.txt` — 373 lines, the exact ASCII rule blob.
- `parsed/tooling-strings.txt` — 13733 strings, full grep-able.
- `parsed/die-Tooling.txt`, `die-Detailer.txt`, `die-AutoFrame.txt` — packer/compiler info.
- `extracted-resources/{Tooling,Detailer,AutoFrame}/` — all PE resources.

---

## If you only have 5 minutes

Run **just procmon**:

```cmd
python "C:\Users\Scott\CLAUDE CODE\hytek-budget\.claude\worktrees\condescending-hofstadter-a58927\scripts\jailbreak\run-procmon.py" 30
```

Open Detailer + load Test 30 Unit + close. Procmon stops itself in 30s.
Send me "procmon done" and I'll mine the result.
