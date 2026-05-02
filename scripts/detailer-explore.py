"""
Exploration script: Connect to running FRAMECAD Detailer and dump its window tree.
Handles the license notice dialog if present.
"""
import sys
import time
import psutil
from pywinauto import Application, Desktop
from pywinauto.timings import wait_until

OUTPUT_LOG = r"C:\Users\Scott\CLAUDE CODE\hytek-rfy-codec\scripts\detailer-explore.log"


def log(msg: str):
    print(msg)
    with open(OUTPUT_LOG, "a", encoding="utf-8") as f:
        f.write(str(msg) + "\n")


def find_detailer_pid():
    for proc in psutil.process_iter(["pid", "name"]):
        try:
            name = proc.info["name"] or ""
            if "Detailer" in name or "FRAMECAD" in name:
                return proc.info["pid"]
        except Exception:
            pass
    return None


def dump_window(window, label, depth=4):
    log(f"\n[{label}]: title={window.window_text()!r}  class={window.class_name()!r}")
    log("-" * 80)
    try:
        import io
        buf = io.StringIO()
        old_stdout = sys.stdout
        sys.stdout = buf
        try:
            window.print_control_identifiers(depth=depth)
        finally:
            sys.stdout = old_stdout
        output = buf.getvalue()
        lines = output.splitlines()
        for line in lines[:800]:
            log(line)
        if len(lines) > 800:
            log(f"... [{len(lines) - 800} more lines truncated]")
    except Exception as e:
        log(f"  ERROR: {e}")


def dismiss_license(app):
    """If a TfrmLicenseNotice is up, click its OK / Continue button."""
    try:
        lic = app.window(class_name="TfrmLicenseNotice")
        if lic.exists(timeout=1):
            log("\n[License notice found — exploring before dismissal]")
            dump_window(lic, "TfrmLicenseNotice", depth=3)
            # Try to find a "Continue" / "OK" button
            for btn_text in ["Continue", "OK", "Accept", "I Agree", "Yes"]:
                try:
                    btn = lic.child_window(title=btn_text, control_type="Button")
                    if btn.exists():
                        log(f"  Clicking button: {btn_text!r}")
                        btn.click()
                        time.sleep(2)
                        return True
                except Exception:
                    pass
            # Try first button child
            try:
                children = lic.children()
                for c in children:
                    if c.class_name() == "TButton":
                        log(f"  Clicking first TButton: {c.window_text()!r}")
                        c.click()
                        time.sleep(2)
                        return True
            except Exception as e:
                log(f"  button enum err: {e}")
    except Exception as e:
        log(f"  license dialog err: {e}")
    return False


def main():
    open(OUTPUT_LOG, "w").close()

    log("=" * 80)
    log("FRAMECAD Detailer GUI exploration")
    log("=" * 80)

    pid = find_detailer_pid()
    if pid is None:
        log("Detailer is not running.")
        return

    log(f"\nFound Detailer PID: {pid}")

    app = Application(backend="win32").connect(process=pid)

    # First, list everything
    log("\n[All top-level windows]:")
    for w in app.windows():
        try:
            log(f"  - title={w.window_text()!r}  class={w.class_name()!r}  visible={w.is_visible()}  handle={w.handle}")
        except Exception:
            pass

    # Try to dismiss license
    dismiss_license(app)

    # Now look for the main TfrmMain (or similar) window
    log("\n[After license dismiss — top-level windows]:")
    visible_tfrm = []
    for w in app.windows():
        try:
            cls = w.class_name()
            if w.is_visible() and cls.startswith("Tfrm"):
                visible_tfrm.append(w)
                log(f"  visible Tfrm: title={w.window_text()!r}  class={cls!r}  handle={w.handle}")
        except Exception:
            pass

    if not visible_tfrm:
        log("\n  No visible Tfrm* window. License may not be dismissed.")
        return

    # Pick the largest / main one
    main_window = visible_tfrm[0]
    for w in visible_tfrm:
        if "Detailer" in w.window_text() or "Main" in w.class_name():
            main_window = w
            break

    dump_window(main_window, "Main window", depth=4)

    # Try menu
    log("\n[Menu enumeration on main window]:")
    try:
        menu = main_window.menu()
        if menu:
            log(f"  Menu found: {menu}")
            try:
                items = menu.items()
                for i, item in enumerate(items):
                    try:
                        text = item.text()
                        log(f"  [{i}] text={text!r}")
                    except Exception as e:
                        log(f"  [{i}] error: {e}")
            except Exception as e:
                log(f"  items error: {e}")
        else:
            log("  No menu (Detailer likely uses ribbon, not Win32 menu).")
    except Exception as e:
        log(f"  menu err: {e}")

    log("\n[Done]")


if __name__ == "__main__":
    main()
