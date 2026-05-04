"""
Probe Detailer build hotkeys: send candidate keystrokes one at a time,
watch the live frida capture log for new add_frameobject hits, report
which key triggered a build. Also dismisses any open dialog first.

Usage:
    python detailer-trigger-build.py 45340 scripts/capture-records.log
"""
import sys
import time
import warnings
from pathlib import Path
warnings.filterwarnings("ignore")

import pyautogui
from pywinauto import Application


CAPTURE_LOG = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("scripts/capture-records.log")


def count_addframe_lines(p: Path) -> int:
    if not p.exists():
        return 0
    try:
        with open(p, "r", encoding="utf-8", errors="replace") as f:
            return sum(1 for line in f if "add_frameobject call" in line)
    except Exception:
        return 0


def focus_main(pid: int):
    app = Application(backend="win32").connect(process=pid)
    main = None
    for w in app.windows():
        try:
            if w.is_visible() and w.class_name() == "TfrmContainer":
                main = w
                break
        except Exception:
            pass
    if main:
        main.set_focus()
        return main
    return None


def main():
    pid = int(sys.argv[1])

    print(f"[*] capture log: {CAPTURE_LOG}")
    print(f"[*] starting count: {count_addframe_lines(CAPTURE_LOG)}")

    main = focus_main(pid)
    if not main:
        print("[!] no main window")
        return

    # Dismiss any leftover dialog (the earlier Open dialog)
    print("[*] sending Esc to dismiss any open dialog")
    pyautogui.press("escape")
    time.sleep(0.5)
    pyautogui.press("escape")
    time.sleep(0.5)

    # Re-focus main
    main = focus_main(pid)
    if not main:
        print("[!] lost main window after Esc")
        return

    # Selecting the project root node first improves the chance Auto Build
    # operates on every plan/frame. Click on the root of the project tree.
    # Try keyboard shortcut Ctrl+Home in the tree to go to root, then End to
    # extend selection. We'll do that after focus.

    candidates = [
        ("F9", lambda: pyautogui.press("f9")),
        ("F2", lambda: pyautogui.press("f2")),
        ("F5", lambda: pyautogui.press("f5")),
        ("F8", lambda: pyautogui.press("f8")),
        ("Ctrl+B", lambda: pyautogui.hotkey("ctrl", "b")),
        ("Ctrl+R", lambda: pyautogui.hotkey("ctrl", "r")),
        ("Ctrl+F9", lambda: pyautogui.hotkey("ctrl", "f9")),
        ("Shift+F9", lambda: pyautogui.hotkey("shift", "f9")),
        ("Ctrl+Shift+B", lambda: pyautogui.hotkey("ctrl", "shift", "b")),
    ]

    for label, action in candidates:
        baseline = count_addframe_lines(CAPTURE_LOG)
        # Re-focus before each press in case focus drifted
        main = focus_main(pid)
        if not main:
            print(f"[{label}] lost main window")
            continue
        time.sleep(0.3)
        print(f"[*] trying {label} (baseline={baseline})")
        try:
            action()
        except Exception as e:
            print(f"   action error: {e}")
            continue
        # Wait up to 6s for new calls
        deadline = time.time() + 6.0
        new_count = baseline
        while time.time() < deadline:
            new_count = count_addframe_lines(CAPTURE_LOG)
            if new_count > baseline:
                break
            time.sleep(0.25)
        delta = new_count - baseline
        if delta > 0:
            print(f"   ✓ {label} fired {delta} add_frameobject calls")
            return
        else:
            print(f"   - {label} no new calls")

    print("[!] no build hotkey worked")


if __name__ == "__main__":
    main()
