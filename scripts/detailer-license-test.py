"""
Probe the license dialog: click 'Check for Hasp' and 'Show License Information'
to determine WHY there's no valid license, and whether we can resolve it.
"""
import subprocess
import time
import os
import psutil
import pyautogui
from pywinauto import Application

EXE = r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\FRAMECAD Detailer.exe"
SHOT_DIR = r"C:\Users\Scott\CLAUDE CODE\hytek-rfy-codec\scripts"


def shot(name):
    p = os.path.join(SHOT_DIR, f"detailer-license-{name}.png")
    pyautogui.screenshot().save(p)
    print(f"  shot: {p}")
    return p


def find_pid():
    for p in psutil.process_iter(["pid", "name"]):
        if "Detailer" in (p.info["name"] or ""):
            return p.info["pid"]
    return None


def kill_existing():
    for p in psutil.process_iter(["pid", "name"]):
        if "Detailer" in (p.info["name"] or ""):
            try:
                psutil.Process(p.info["pid"]).kill()
            except Exception:
                pass


def main():
    kill_existing()
    time.sleep(1)
    print("Launching Detailer...")
    subprocess.Popen([EXE], cwd=os.path.dirname(EXE))

    # Wait for dialog
    pid = None
    for i in range(30):
        time.sleep(0.5)
        pid = find_pid()
        if pid is None:
            continue
        try:
            app = Application(backend="win32").connect(process=pid, timeout=1)
            for w in app.windows():
                if w.is_visible() and w.class_name() == "TfrmLicenseNotice":
                    break
            else:
                continue
            break
        except Exception:
            continue
    else:
        print("License dialog never appeared.")
        return

    print(f"Connected to PID {pid}")
    app = Application(backend="win32").connect(process=pid)
    lic = app.window(class_name="TfrmLicenseNotice")
    lic.wait("visible", timeout=5)

    # Re-find via process windows to get a real WindowSpecification
    main_w = None
    for w in app.windows():
        if w.is_visible() and w.class_name() == "TfrmLicenseNotice":
            main_w = w
            break

    print(f"License window handle: {main_w.handle}")

    shot("01-initial")

    # Read message via TMemo child
    children = main_w.children()
    for c in children:
        try:
            print(f"  child: class={c.class_name()!r}  text={c.window_text()!r}")
        except Exception as e:
            print(f"  child err: {e}")

    print("\n--- Click 'Show License Information' ---")
    try:
        # use the WindowSpecification via app.window
        spec = app.window(class_name="TfrmLicenseNotice")
        spec.child_window(title="Show License Information", class_name="TButton").click()
        time.sleep(2)
        shot("02-after-show-license-info")

        # See what new windows appeared
        print("Top-level windows now:")
        for w in app.windows():
            try:
                if w.is_visible():
                    print(f"  - {w.window_text()!r}  class={w.class_name()!r}")
            except Exception:
                pass

        # Try to find a license info window
        for w in app.windows():
            try:
                if w.is_visible() and w.class_name() != "TfrmLicenseNotice" and w.class_name().startswith("Tfrm"):
                    print(f"\nFound new dialog: {w.class_name()}")
                    for c in w.children():
                        try:
                            print(f"  child: class={c.class_name()!r}  text={c.window_text()!r}")
                        except Exception:
                            pass
            except Exception:
                pass
    except Exception as e:
        print(f"err: {e}")
        import traceback
        traceback.print_exc()

    print("\nDONE — leaving Detailer running so you can inspect.")


if __name__ == "__main__":
    main()
