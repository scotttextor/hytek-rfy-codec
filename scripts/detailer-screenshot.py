"""Screenshot Detailer's main window via PrintWindow (works even when hidden)."""
import sys
import warnings
warnings.filterwarnings("ignore")

from pywinauto import Application


def main():
    pid = int(sys.argv[1])
    out = sys.argv[2] if len(sys.argv) > 2 else "scripts/detailer-state.png"

    app = Application(backend="win32").connect(process=pid)
    main = None
    for w in app.windows():
        try:
            if w.is_visible() and w.class_name() == "TfrmContainer":
                main = w
                break
        except Exception:
            pass
    # Also enumerate any visible dialogs
    for w in app.windows():
        try:
            if w.is_visible() and w.class_name() == "#32770":
                print(f"  dialog visible: {w.window_text()!r}")
        except Exception:
            pass

    if not main:
        print("[!] no main TfrmContainer")
        return

    img = main.capture_as_image()
    img.save(out)
    print(f"saved {out} {img.size}")


if __name__ == "__main__":
    main()
