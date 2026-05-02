"""
Click 'Check for Hasp' on the license dialog and observe what happens.
Save before/after screenshots.
"""
import time
import psutil
import pyautogui
from pywinauto import Application

BEFORE_PNG = r"C:\Users\Scott\CLAUDE CODE\hytek-rfy-codec\scripts\detailer-license-before.png"
AFTER_PNG = r"C:\Users\Scott\CLAUDE CODE\hytek-rfy-codec\scripts\detailer-license-after.png"


def find_detailer_pid():
    for proc in psutil.process_iter(["pid", "name"]):
        try:
            if "Detailer" in (proc.info["name"] or ""):
                return proc.info["pid"]
        except Exception:
            pass
    return None


def main():
    pid = find_detailer_pid()
    if pid is None:
        print("Detailer not running.")
        return

    app = Application(backend="win32").connect(process=pid)

    pyautogui.screenshot().save(BEFORE_PNG)
    print(f"Saved before: {BEFORE_PNG}")

    try:
        lic = app.window(class_name="TfrmLicenseNotice")
        if not lic.exists(timeout=2):
            print("No license dialog visible.")
            return

        # Bring to foreground so screenshot captures it
        lic.set_focus()
        time.sleep(0.5)

        # Read the message
        try:
            memo = lic.child_window(class_name="TMemo")
            print(f"License message: {memo.window_text()!r}")
        except Exception as e:
            print(f"memo err: {e}")

        # Click Check for Hasp
        print("Clicking 'Check for Hasp'...")
        btn = lic.child_window(title="Check for Hasp", class_name="TButton")
        btn.click()
        time.sleep(3)

        # See what windows now exist
        print("\nAll top-level windows after Check for Hasp:")
        for w in app.windows():
            try:
                t = w.window_text()
                c = w.class_name()
                v = w.is_visible()
                if v:
                    print(f"  - {t!r}  class={c!r}")
            except Exception:
                pass

        pyautogui.screenshot().save(AFTER_PNG)
        print(f"\nSaved after: {AFTER_PNG}")

        # Check if license dialog still exists
        time.sleep(1)
        if lic.exists():
            try:
                memo2 = lic.child_window(class_name="TMemo")
                print(f"\nLicense message AFTER click: {memo2.window_text()!r}")
            except Exception:
                pass
            # also read any error/popup dialog
            for w in app.windows():
                try:
                    if w.is_visible() and w.class_name() != lic.class_name():
                        cls = w.class_name()
                        if cls.startswith("Tfrm") or cls == "#32770":
                            print(f"\nNew dialog: {w.window_text()!r}  class={cls!r}")
                            try:
                                import io, sys
                                buf = io.StringIO()
                                old = sys.stdout
                                sys.stdout = buf
                                w.print_control_identifiers(depth=3)
                                sys.stdout = old
                                print(buf.getvalue())
                            except Exception as e:
                                print(f"  enum err: {e}")
                except Exception:
                    pass

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
