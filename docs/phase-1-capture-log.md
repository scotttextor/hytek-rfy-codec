# Phase 1 — Capture Log

## Environment

- **Python version:** 3.12.10 (installed via `winget install Python.Python.3.12` on 2026-04-24)
- **Python path:** `C:\Users\ScottTextor\AppData\Local\Programs\Python\Python312\python.exe`
- **Frida version:** 17.9.1
- **frida-tools version:** 14.8.1
- **Operating system:** Windows 11 Pro (OS version 10.0.26200)
- **Detailer install path:** `C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\`
- **Detailer archive location:** `C:\Users\ScottTextor\OneDrive - Textor Metal Industries\DETAILER_ARCHIVE\` (archived 2026-04-24, 146 MB)

## How to run the hook

```bash
# 1. Start FRAMECAD Detailer from Start menu (let it fully load)
# 2. From hytek-rfy-codec directory:
"/c/Users/ScottTextor/AppData/Local/Programs/Python/Python312/python.exe" scripts/frida-hook.py
# 3. In Detailer: File -> Export -> Rollforming CSV for a test panel
# 4. Ctrl+C to stop
# 5. Capture file appears at scripts/capture-YYYYMMDD-HHMMSS.jsonl
```

## Capture sessions

*(filled in as sessions are run)*
