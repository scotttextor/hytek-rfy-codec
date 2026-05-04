"""
Drive Detailer by clicking real desktop coordinates with pyautogui.

Usage:
    python detailer-click-driver.py 45340 [open-file]
        # Open file menu, screenshot dropdown to scripts/detailer-file-menu.png

    python detailer-click-driver.py 45340 [click x y]
        # Click at window-relative (x,y), screenshot result

Goal: identify Build/Export menu items so we can drive the auto-capture
end to end.
"""
import sys
import time
import warnings
warnings.filterwarnings("ignore")

import pyautogui
from PIL import ImageGrab
from pywinauto import Application


def get_main_rect(pid: int):
    app = Application(backend="win32").connect(process=pid)
    for w in app.windows():
        try:
            if w.is_visible() and w.class_name() == "TfrmContainer":
                r = w.rectangle()
                return (r.left, r.top, r.right, r.bottom), w
        except Exception:
            pass
    return None, None


def screenshot_full(out_path: str):
    img = ImageGrab.grab(all_screens=True)
    img.save(out_path)
    return img.size


def main():
    pid = int(sys.argv[1])
    cmd = sys.argv[2] if len(sys.argv) > 2 else "open-file"

    rect, main = get_main_rect(pid)
    if not rect:
        print("[!] no main window")
        return
    L, T, R, B = rect
    print(f"[*] main rect: ({L},{T}) - ({R},{B}), size={R-L}x{B-T}")

    # Bring window to foreground using the OS-blessed path
    try:
        main.set_focus()
    except Exception:
        pass
    time.sleep(0.3)

    if cmd == "open-file":
        # File menu is at the very top-left of the menu bar inside the window.
        # Title bar is ~30px, menu bar starts after that. "File" is around
        # x=15-30 from the window left edge.
        fx = L + 22
        fy = T + 50  # likely menu bar y
        print(f"[*] clicking File menu at ({fx}, {fy})")
        pyautogui.click(fx, fy)
        time.sleep(0.8)
        out = "scripts/detailer-file-menu.png"
        size = screenshot_full(out)
        print(f"[*] saved {out} ({size})")
        return

    if cmd == "click":
        rx = int(sys.argv[3])
        ry = int(sys.argv[4])
        ax = L + rx
        ay = T + ry
        out = sys.argv[5] if len(sys.argv) > 5 else "scripts/detailer-after-click.png"
        print(f"[*] clicking ({ax},{ay}) [window-relative ({rx},{ry})]")
        pyautogui.click(ax, ay)
        time.sleep(0.8)
        size = screenshot_full(out)
        print(f"[*] saved {out} ({size})")
        return

    if cmd == "rclick":
        rx = int(sys.argv[3])
        ry = int(sys.argv[4])
        ax = L + rx
        ay = T + ry
        out = sys.argv[5] if len(sys.argv) > 5 else "scripts/detailer-after-rclick.png"
        print(f"[*] right-clicking ({ax},{ay}) [window-relative ({rx},{ry})]")
        pyautogui.rightClick(ax, ay)
        time.sleep(0.8)
        size = screenshot_full(out)
        print(f"[*] saved {out} ({size})")
        return

    if cmd == "key":
        # Send keystroke after focusing
        keys = sys.argv[3]
        print(f"[*] sending keys: {keys!r}")
        pyautogui.typewrite(keys, interval=0.05) if not keys.startswith("{") else pyautogui.press(keys.strip("{}"))
        time.sleep(0.3)
        out = sys.argv[4] if len(sys.argv) > 4 else "scripts/detailer-after-keys.png"
        size = screenshot_full(out)
        print(f"[*] saved {out} ({size})")
        return

    print(f"[!] unknown cmd {cmd!r}")


if __name__ == "__main__":
    main()
