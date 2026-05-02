"""
Attempt online activation: check the agreement box, click Sign In.
Capture screenshots before and after.
"""
import time
import os
import psutil
import pyautogui
import win32gui
import win32api
import win32con
from pywinauto import Application

SHOT_DIR = r"C:\Users\Scott\CLAUDE CODE\hytek-rfy-codec\scripts"


def shot(name):
    p = os.path.join(SHOT_DIR, f"detailer-activate-{name}.png")
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

    app = Application(backend="win32").connect(process=pid)

    lic_sys = None
    for w in app.windows():
        try:
            if w.is_visible() and "Licensing System" in w.window_text():
                lic_sys = w
                break
        except Exception:
            pass

    if not lic_sys:
        print("Licensing System window not visible.")
        return

    lic_sys.set_focus()
    time.sleep(0.5)
    shot("01-before")

    # Find and check the agreement checkbox.
    # In win32 .NET WinForms a checkbox is class WindowsForms10.BUTTON
    # The empty BUTTON near the "I agree" static is the checkbox.
    children = list(lic_sys.children())
    print("\nChildren of Licensing System:")
    for i, c in enumerate(children):
        try:
            print(f"  [{i}] class={c.class_name()!r}  text={c.window_text()!r}  rect={c.rectangle()}")
        except Exception:
            pass

    # Identify the checkbox: BUTTON class with empty text near "I agree" static
    agree_static = None
    sign_in_btn = None
    checkbox_btn = None
    for c in children:
        try:
            cls = c.class_name()
            txt = c.window_text()
            if "BUTTON" in cls:
                if txt == "Sign In":
                    sign_in_btn = c
                elif txt == "":
                    # Probably the checkbox
                    rect = c.rectangle()
                    # checkbox is at L377 T468 (per inspect output)
                    if 460 < rect.top < 500 and rect.width() < 30:
                        checkbox_btn = c
            elif "STATIC" in cls and "I agree" in txt:
                agree_static = c
        except Exception:
            pass

    print(f"\nfound checkbox: {checkbox_btn}")
    print(f"found sign-in: {sign_in_btn}")

    if checkbox_btn:
        print("Clicking checkbox...")
        try:
            checkbox_btn.click()
            time.sleep(0.5)
        except Exception as e:
            print(f"  checkbox click err: {e}")
            # fallback: click coords
            r = checkbox_btn.rectangle()
            cx, cy = (r.left + r.right) // 2, (r.top + r.bottom) // 2
            pyautogui.click(cx, cy)
            time.sleep(0.5)

    shot("02-after-checkbox")

    if sign_in_btn:
        print("Clicking Sign In...")
        try:
            sign_in_btn.click()
        except Exception as e:
            print(f"  sign in click err: {e}")
            r = sign_in_btn.rectangle()
            cx, cy = (r.left + r.right) // 2, (r.top + r.bottom) // 2
            pyautogui.click(cx, cy)
        time.sleep(8)  # Wait for online activation

    shot("03-after-signin")

    # Check status
    print("\nWindows after sign-in:")
    for w in app.windows():
        try:
            if w.is_visible():
                print(f"  - {w.window_text()!r}  class={w.class_name()!r}")
        except Exception:
            pass

    # Re-read the license status
    try:
        lic_sys2 = None
        for w in app.windows():
            if w.is_visible() and "Licensing System" in w.window_text():
                lic_sys2 = w; break
        if lic_sys2:
            for c in lic_sys2.children():
                try:
                    txt = c.window_text()
                    if txt and txt not in ("", "Sign In"):
                        # Just dump statics
                        if "STATIC" in c.class_name():
                            print(f"  status: {txt!r}")
                except Exception:
                    pass
    except Exception as e:
        print(f"status read err: {e}")


if __name__ == "__main__":
    main()
