"""
Exploration script: Connect to running FRAMECAD Detailer and dump its window tree.
"""
import sys
import time
import psutil
from pywinauto import Application, Desktop

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


def main():
    open(OUTPUT_LOG, "w").close()

    log("=" * 80)
    log("FRAMECAD Detailer GUI exploration")
    log("=" * 80)

    pid = find_detailer_pid()
    if pid is None:
        log("Detailer is not running. Launch it first.")
        return

    log(f"\nFound Detailer PID: {pid}")

    app = Application(backend="win32").connect(process=pid)

    log("\n[Top-level windows for this PID]:")
    main_window = None
    for w in app.windows():
        try:
            title = w.window_text()
            cls = w.class_name()
            visible = w.is_visible()
            log(f"  - title={title!r}  class={cls!r}  visible={visible}  handle={w.handle}")
            if visible and cls.startswith("Tfrm") and main_window is None:
                main_window = w
        except Exception as e:
            log(f"  - error: {e}")

    if main_window is None:
        # try anything visible with class starting with T
        for w in app.windows():
            try:
                if w.is_visible() and w.class_name().startswith("T"):
                    main_window = w
                    break
            except Exception:
                pass

    if main_window is None:
        log("\nNo visible Tfrm* main window found.")
        return

    log(f"\n[Selected main window]: title={main_window.window_text()!r}  class={main_window.class_name()!r}")

    log("\n[Control identifiers, depth=3]:")
    log("-" * 80)
    try:
        import io
        buf = io.StringIO()
        old_stdout = sys.stdout
        sys.stdout = buf
        try:
            main_window.print_control_identifiers(depth=3)
        finally:
            sys.stdout = old_stdout
        output = buf.getvalue()
        lines = output.splitlines()
        for line in lines[:600]:
            log(line)
        if len(lines) > 600:
            log(f"... [{len(lines) - 600} more lines truncated]")
    except Exception as e:
        log(f"  ERROR: {e}")

    # Try to enumerate menu items
    log("\n[Menu items]:")
    log("-" * 80)
    try:
        menu = main_window.menu()
        if menu:
            for item in menu.items():
                try:
                    log(f"  Menu: text={item.text()!r}  index={item.index()}")
                    submenu = item.sub_menu() if hasattr(item, 'sub_menu') else None
                    if submenu:
                        for sub in submenu.items():
                            log(f"    Sub: text={sub.text()!r}  index={sub.index()}")
                except Exception as e:
                    log(f"  menu err: {e}")
        else:
            log("  No menu found via .menu()")
    except Exception as e:
        log(f"  Menu enum error: {e}")

    log("\n[Done]")


if __name__ == "__main__":
    main()
