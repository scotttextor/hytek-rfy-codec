"""
Auto-driver: attach Frida hook to running Detailer, trigger File→Export RFY,
capture the SectionLookupRecord catalog payload to scripts/capture.log.

Usage:
  python frida-auto-capture.py <detailer_pid> [output_path]

Requires Detailer to already be running with a project loaded.
"""

import sys
import os
import time
import subprocess
import signal
from pathlib import Path

import frida
import psutil
import pyautogui
from pywinauto import Application


SCRIPT_DIR = Path(__file__).resolve().parent
HOOK_JS = SCRIPT_DIR / "frida-capture-records.js"


def find_detailer_pid() -> int | None:
    """Find FRAMECAD Detailer.exe pid. Returns None if not running."""
    for p in psutil.process_iter(["pid", "name"]):
        n = (p.info["name"] or "").lower()
        if "framecad detailer" in n or "detailer" in n:
            return p.info["pid"]
    return None


def attach_frida(pid: int, log_path: Path):
    """Attach Frida to the Detailer process and start streaming records."""
    print(f"[frida] attaching to pid {pid}…")
    session = frida.attach(pid)
    js = HOOK_JS.read_text(encoding="utf-8")
    script = session.create_script(js)

    log_file = log_path.open("w", encoding="utf-8")

    def on_message(msg, data):
        if msg.get("type") == "send":
            payload = msg.get("payload", "")
            print(payload, file=log_file, flush=True)
            print(payload, flush=True)
        elif msg.get("type") == "error":
            print(f"[frida-error] {msg.get('description')}", file=log_file, flush=True)

    script.on("message", on_message)
    script.load()
    print("[frida] hook attached & listening — waiting for add_frameobject calls")
    return session, script, log_file


def trigger_build_export_rfy(detailer_pid: int):
    """Use pywinauto to trigger Detailer's Export RFY action (which builds frames
    and produces the RFY)."""
    app = Application(backend="win32").connect(process=detailer_pid)
    main = None
    for w in app.windows():
        try:
            if w.is_visible() and w.class_name().startswith("Tfrm"):
                t = (w.window_text() or "").lower()
                if "license" in t or "licens" in t:
                    continue
                main = w
                break
        except Exception:
            pass
    if main is None:
        print("[ui] no main window found yet, retrying once…")
        time.sleep(3)
        for w in app.windows():
            try:
                if w.is_visible() and w.class_name().startswith("Tfrm") and "license" not in (w.window_text() or "").lower():
                    main = w
                    break
            except Exception:
                pass
    if main is None:
        raise RuntimeError("No Detailer main window — is the project loaded?")

    print(f"[ui] main window: {main.window_text()!r}")
    main.set_focus()
    time.sleep(0.4)

    # Trigger File menu → Export → RFY (or if that doesn't exist, just rebuild).
    # Most reliable: Alt+F to open File, then 'e' for Export, 'r' for RFY.
    pyautogui.hotkey("alt", "f")
    time.sleep(0.5)
    pyautogui.press("e")
    time.sleep(0.4)
    pyautogui.press("r")
    print("[ui] sent Alt+F E R → triggering Export RFY (this fires add_frameobject)")
    time.sleep(2.0)
    # If a save dialog appears, accept default name (Enter).
    pyautogui.press("enter")


def main():
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else (SCRIPT_DIR / "capture.log")
    pid = int(sys.argv[1]) if len(sys.argv) > 1 else find_detailer_pid()
    if not pid:
        print("Detailer not running — launch it first.")
        sys.exit(1)

    session, script, log_file = attach_frida(pid, out_path)

    # Give the hook ~2s to settle, then trigger the build.
    time.sleep(2)
    try:
        trigger_build_export_rfy(pid)
    except Exception as e:
        print(f"[ui] build-trigger failed: {e}")

    print("[main] capturing for 30s — waiting for add_frameobject events…")
    time.sleep(30)

    print("[main] detaching")
    session.detach()
    log_file.close()
    print(f"[main] capture saved to {out_path}")


if __name__ == "__main__":
    main()
