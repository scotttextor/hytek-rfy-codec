"""
Launch Detailer and IMMEDIATELY connect / probe — before any auto-exit.
"""
import subprocess
import time
import sys
import os
import psutil
import pyautogui
from pywinauto import Application

EXE = r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\FRAMECAD Detailer.exe"
SHOT = r"C:\Users\Scott\CLAUDE CODE\hytek-rfy-codec\scripts\detailer-fresh-launch.png"


def find_detailer_pid():
    for p in psutil.process_iter(["pid", "name"]):
        n = p.info["name"] or ""
        if "Detailer" in n or "FRAMECAD" in n:
            return p.info["pid"]
    return None


def main():
    # Kill any existing
    for p in psutil.process_iter(["pid", "name"]):
        n = p.info["name"] or ""
        if "Detailer" in n:
            try:
                psutil.Process(p.info["pid"]).kill()
                print(f"Killed PID {p.info['pid']}")
            except Exception as e:
                print(f"Kill err: {e}")
    time.sleep(1)

    print("Launching Detailer...")
    proc = subprocess.Popen([EXE], cwd=os.path.dirname(EXE))
    print(f"Subprocess PID: {proc.pid}")

    # Poll quickly for the dialog
    for i in range(30):
        time.sleep(0.5)
        pid = find_detailer_pid()
        if pid is None:
            print(f"  [{i*0.5:.1f}s] no Detailer process yet")
            continue
        try:
            app = Application(backend="win32").connect(process=pid, timeout=1)
            wins = list(app.windows())
            visible = [w for w in wins if w.is_visible()]
            print(f"  [{i*0.5:.1f}s] PID={pid}, visible windows={len(visible)}")
            for w in visible:
                try:
                    print(f"        {w.window_text()!r}  class={w.class_name()!r}")
                except Exception:
                    pass
            # If we see the license dialog, capture and stop
            for w in visible:
                if w.class_name() == "TfrmLicenseNotice":
                    print(">>> License dialog up, capturing screenshot...")
                    pyautogui.screenshot().save(SHOT)
                    print(f"    saved: {SHOT}")
                    # try to read the message
                    try:
                        memo = w.child_window(class_name="TMemo")
                        print(f"    msg: {memo.window_text()!r}")
                    except Exception as e:
                        print(f"    memo err: {e}")
                    return
                if w.class_name().startswith("Tfrm") and w.class_name() != "TfrmLicenseNotice":
                    print(f">>> Main window up: {w.class_name()}")
                    pyautogui.screenshot().save(SHOT)
                    return
        except Exception as e:
            print(f"  [{i*0.5:.1f}s] connect err: {e}")

    print("Timed out waiting for any visible Detailer window.")


if __name__ == "__main__":
    main()
