"""
Inspect the FRAMECAD Licensing System window (.NET WinForms).
Bring to front, capture screenshot, dump controls.
"""
import time
import os
import psutil
import pyautogui
from pywinauto import Application, Desktop

SHOT_DIR = r"C:\Users\Scott\CLAUDE CODE\hytek-rfy-codec\scripts"


def shot(name):
    p = os.path.join(SHOT_DIR, f"detailer-{name}.png")
    pyautogui.screenshot().save(p)
    print(f"  shot: {p}")


def find_pid():
    for p in psutil.process_iter(["pid", "name"]):
        if "Detailer" in (p.info["name"] or ""):
            return p.info["pid"]
    return None


def main():
    pid = find_pid()
    if not pid:
        print("Detailer not running.")
        return

    # Try UIA backend for the .NET window
    print("--- Win32 backend, all windows ---")
    app = Application(backend="win32").connect(process=pid)
    for w in app.windows():
        try:
            if w.is_visible():
                print(f"  - {w.window_text()!r}  class={w.class_name()!r}  handle={w.handle}")
        except Exception:
            pass

    # The licensing window is a WindowsForms class — bring it to front
    lic_sys = None
    for w in app.windows():
        try:
            if w.is_visible() and "Licensing System" in w.window_text():
                lic_sys = w
                break
        except Exception:
            pass

    if lic_sys is None:
        print("Licensing System window not visible.")
        return

    print(f"\nLicensing System handle: {lic_sys.handle}")
    try:
        lic_sys.set_focus()
        time.sleep(0.5)
    except Exception as e:
        print(f"set_focus err: {e}")
    shot("license-system-focused")

    # Dump children via win32
    print("\n--- Children (win32 backend) ---")
    try:
        for c in lic_sys.children():
            try:
                print(f"  - class={c.class_name()!r}  text={c.window_text()!r}  rect={c.rectangle()}")
            except Exception as e:
                print(f"  - err: {e}")
    except Exception as e:
        print(f"children err: {e}")

    # Try UIA backend on this same window
    print("\n--- UIA backend ---")
    try:
        app_uia = Application(backend="uia").connect(process=pid)
        found = False
        for w in app_uia.windows():
            try:
                if "Licensing System" in w.window_text():
                    found = True
                    import io, sys
                    buf = io.StringIO()
                    old = sys.stdout
                    sys.stdout = buf
                    w.print_control_identifiers(depth=4)
                    sys.stdout = old
                    out = buf.getvalue()
                    for line in out.splitlines()[:200]:
                        print(line)
                    break
            except Exception:
                pass
        if not found:
            print("Not found in UIA")
    except Exception as e:
        print(f"UIA err: {e}")
        import traceback; traceback.print_exc()


if __name__ == "__main__":
    main()
