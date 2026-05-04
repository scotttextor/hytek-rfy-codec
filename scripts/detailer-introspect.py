"""
Introspect FRAMECAD Detailer via UIA backend (works for 32-bit apps from 64-bit Python).

Lists toolbar buttons (with tooltips) and menu structure for the running PID.

Run with the Detailer PID:
    python detailer-introspect.py 45340
"""
import sys
import warnings
warnings.filterwarnings("ignore")

from pywinauto import Application


def main():
    pid = int(sys.argv[1])
    app = Application(backend="uia").connect(process=pid)

    # Find the main TfrmContainer (UIA exposes class via class_name())
    main = None
    for w in app.windows():
        try:
            if w.class_name() == "TfrmContainer" and w.is_visible():
                main = w
                break
        except Exception:
            pass

    if not main:
        # Fall back: any visible top-level
        for w in app.windows():
            try:
                if w.is_visible() and (w.window_text() or "").startswith("FRAMECAD"):
                    main = w
                    break
            except Exception:
                pass

    if not main:
        print("[!] No FRAMECAD main window found")
        for w in app.windows():
            try:
                print(f"  {w.class_name()!r:30s}  {w.window_text()[:80]!r}")
            except Exception:
                pass
        return

    print(f"=== Main window: {main.window_text()[:100]} ===")

    # Try to enumerate the menu via UIA
    print("\n=== Menu items (UIA) ===")
    try:
        # In UIA, the menu bar is usually a child with control_type 'MenuBar'
        for child in main.descendants(control_type="MenuBar"):
            try:
                print(f"MenuBar: {child}")
                for item in child.descendants(control_type="MenuItem"):
                    try:
                        print(f"  - {item.window_text()!r}")
                    except Exception:
                        pass
            except Exception as e:
                print(f"  menubar err: {e}")
    except Exception as e:
        print(f"  err: {e}")

    # Toolbar buttons with tooltips/names
    print("\n=== Toolbar buttons ===")
    try:
        seen = 0
        for btn in main.descendants(control_type="Button"):
            try:
                name = btn.window_text() or ""
                if name:
                    print(f"  Button: {name!r}")
                    seen += 1
                    if seen >= 50:
                        break
            except Exception:
                pass
    except Exception as e:
        print(f"  err: {e}")

    # Menu items at any depth (sometimes Delphi puts MenuItem in a Pane)
    print("\n=== All MenuItem descendants (max 200) ===")
    try:
        seen = 0
        for mi in main.descendants(control_type="MenuItem"):
            try:
                t = mi.window_text() or ""
                if t:
                    print(f"  - {t!r}")
                    seen += 1
                    if seen >= 200:
                        break
            except Exception:
                pass
    except Exception as e:
        print(f"  err: {e}")


if __name__ == "__main__":
    main()
