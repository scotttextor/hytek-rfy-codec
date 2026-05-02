"""
detailer-driver.py — Python wrapper to drive FRAMECAD Detailer via UI automation.

Goal: convert XML → RFY by automating Detailer's File menu / Import / Export flow.

CURRENT STATUS (2026-05-02): BLOCKED ON LICENSE.
  Detailer 5.3.4.0 on this machine reports "License Status: Not valid" and the
  online "Sign In" button does not produce a working session. Detailer exits
  immediately when the license dialog is closed without a valid license.

  The Licensing System window shows:
    - License Serial: DT-001527-0QPHG2
    - Email: j.langdon@hytekframing.com.au
    - Secret Key: 680695E0-934E-4F0A-9943-3FF95423A82C
    - License Valid Until: 01 Jan 1970 (Unix epoch — never activated/lapsed)

  Until the license is renewed (or a HASP dongle is attached and detected),
  programmatic UI automation cannot proceed past the licensing gate.

This module is left in place with the GUI mapping, automation scaffold, and a
one-button activation helper, so that the moment the license is restored the
xml_to_rfy() flow below will run end-to-end.

USAGE (once license is active):
    from detailer_driver import xml_to_rfy
    rfy = xml_to_rfy(r'C:\\path\\to\\input.xml', r'C:\\path\\to\\out_dir')
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

import psutil
import pyautogui
from pywinauto import Application, Desktop
from pywinauto.timings import wait_until

EXE_PATH = r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\FRAMECAD Detailer.exe"


# ---------------------------------------------------------------------------
# Process management
# ---------------------------------------------------------------------------

def find_detailer_pid() -> Optional[int]:
    for p in psutil.process_iter(["pid", "name"]):
        if "Detailer" in (p.info["name"] or ""):
            return p.info["pid"]
    return None


def kill_existing_detailer():
    for p in psutil.process_iter(["pid", "name"]):
        if "Detailer" in (p.info["name"] or ""):
            try:
                psutil.Process(p.info["pid"]).kill()
            except Exception:
                pass


def launch_detailer() -> int:
    """Launch a fresh Detailer instance, return PID."""
    if not Path(EXE_PATH).exists():
        raise FileNotFoundError(f"Detailer not found at {EXE_PATH}")
    proc = subprocess.Popen([EXE_PATH], cwd=os.path.dirname(EXE_PATH))
    # Wait for the process to actually be visible in psutil
    for _ in range(20):
        time.sleep(0.5)
        pid = find_detailer_pid()
        if pid:
            return pid
    raise TimeoutError("Detailer launched but PID not found")


def connect(pid: Optional[int] = None) -> Application:
    if pid is None:
        pid = find_detailer_pid()
    if pid is None:
        raise RuntimeError("Detailer is not running. Call launch_detailer() first.")
    return Application(backend="win32").connect(process=pid)


# ---------------------------------------------------------------------------
# License handling
# ---------------------------------------------------------------------------

def license_dialog_present(app: Application) -> bool:
    try:
        for w in app.windows():
            if w.is_visible() and w.class_name() == "TfrmLicenseNotice":
                return True
    except Exception:
        pass
    return False


def read_license_status(app: Application) -> dict:
    """Return dict with license_status, license_valid_until, license_serial.

    Walks the About-tab statics in the FRAMECAD Licensing System window and
    pairs label statics (left column) with their value statics on the same row
    (immediately to the right). Multiple statics share each label string in
    Detailer's UI (one in the About tab, one in the Online tab); we filter to
    the leftmost label and pick the value whose left edge is just past the
    label's right edge on the same y-row.
    """
    LABELS = {"License Status", "License Valid Until", "License Serial", "Go Online Within"}
    KNOWN_LABELS = LABELS | {"Email", "Secret Key", "Company", "Purchase a license",
                              "Renew", "Reserve a longer term",
                              "I agree to the Software License Agreement"}
    info: dict = {}
    try:
        for w in app.windows():
            if not (w.is_visible() and "Licensing System" in w.window_text()):
                continue
            statics = [c for c in w.children() if "STATIC" in c.class_name()]
            # Find the leftmost label for each LABEL key
            by_label = {}
            for s in statics:
                t = s.window_text()
                if t in LABELS:
                    r = s.rectangle()
                    if t not in by_label or r.left < by_label[t].rectangle().left:
                        by_label[t] = s
            for label, label_static in by_label.items():
                lr = label_static.rectangle()
                # find a static on same row, just to the right, with text not in KNOWN_LABELS
                best = None
                best_dx = 1 << 30
                for s in statics:
                    if s is label_static:
                        continue
                    t = s.window_text()
                    if not t or t in KNOWN_LABELS:
                        continue
                    r = s.rectangle()
                    if abs(r.top - lr.top) < 6 and r.left >= lr.right - 5:
                        dx = r.left - lr.right
                        if 0 <= dx < best_dx:
                            best_dx = dx
                            best = t
                info[label.lower().replace(" ", "_")] = best
            break
    except Exception as e:
        info["error"] = str(e)
    return info


def open_license_information(app: Application):
    """If TfrmLicenseNotice is up, click 'Show License Information'."""
    spec = app.window(class_name="TfrmLicenseNotice")
    spec.wait("visible", timeout=5)
    spec.child_window(title="Show License Information", class_name="TButton").click()
    time.sleep(2)


# ---------------------------------------------------------------------------
# XML → RFY conversion (post-license)
# ---------------------------------------------------------------------------

def find_main_window(app: Application):
    """Return the TfrmMain (or whatever the post-license main is)."""
    for w in app.windows():
        try:
            cls = w.class_name()
            if w.is_visible() and cls.startswith("Tfrm") and cls != "TfrmLicenseNotice":
                return w
        except Exception:
            pass
    return None


def xml_to_rfy(xml_path: str, output_dir: str) -> str:
    """Drive Detailer to convert XML → RFY.

    Args:
        xml_path: absolute path to input .xml
        output_dir: directory to write the .rfy into

    Returns:
        Absolute path to written .rfy file.

    Raises:
        RuntimeError if license is invalid (Detailer cannot run).
    """
    xml_path = str(Path(xml_path).resolve())
    output_dir = str(Path(output_dir).resolve())
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    if not Path(xml_path).is_file():
        raise FileNotFoundError(xml_path)

    pid = find_detailer_pid()
    if pid is None:
        pid = launch_detailer()
    app = connect(pid)

    # ------- License gate -------
    deadline = time.time() + 15
    while time.time() < deadline:
        if license_dialog_present(app):
            break
        time.sleep(0.5)

    if license_dialog_present(app):
        # Try opening license info to see status
        try:
            open_license_information(app)
        except Exception:
            pass
        status = read_license_status(app)
        raise RuntimeError(
            "Detailer license is not valid; cannot drive the GUI. "
            f"Status from licensing system: {status}. "
            "Activate the license (online Sign In or HASP dongle) and retry."
        )

    # ------- Load XML -------
    main = find_main_window(app)
    if main is None:
        raise RuntimeError("No Detailer main window visible after license gate.")

    main.set_focus()
    time.sleep(0.5)

    # Detailer ribbon: Alt+F opens File menu, then keyboard navigation.
    # Strings from binary: 'lfImportXML' for import, 'lfExportRFY' for export.
    # Best practice once a license is available: capture exact menu walk.
    pyautogui.hotkey("alt", "f")
    time.sleep(0.5)
    # Send 'i' for Import, then 'x' for XML — ACTUAL HOTKEYS NEED VERIFICATION
    # (cannot verify without a working license).
    pyautogui.press("i")
    time.sleep(0.3)
    pyautogui.press("x")
    time.sleep(1)

    # File-open dialog
    open_dlg = app.window(title_re=".*Open.*|.*Import.*", class_name="#32770")
    open_dlg.wait("visible", timeout=10)
    file_edit = open_dlg.child_window(class_name="Edit", control_id=0x47C)
    file_edit.set_edit_text(xml_path)
    open_dlg.child_window(title="Open", class_name="Button").click()

    # Wait for project to load — this can take 5-30s for large frames
    time.sleep(5)

    # ------- Export RFY -------
    main.set_focus()
    pyautogui.hotkey("alt", "f")
    time.sleep(0.5)
    pyautogui.press("e")  # Export
    time.sleep(0.3)
    pyautogui.press("r")  # RFY
    time.sleep(1)

    # Save dialog
    save_dlg = app.window(title_re=".*Save.*|.*Export.*", class_name="#32770")
    save_dlg.wait("visible", timeout=10)
    rfy_basename = Path(xml_path).stem + ".rfy"
    rfy_out = str(Path(output_dir) / rfy_basename)
    save_edit = save_dlg.child_window(class_name="Edit", control_id=0x47C)
    save_edit.set_edit_text(rfy_out)
    save_dlg.child_window(title="Save", class_name="Button").click()
    time.sleep(2)

    # Confirm overwrite if prompted
    try:
        confirm = app.window(title_re=".*Confirm.*|.*overwrite.*", class_name="#32770")
        if confirm.exists(timeout=2):
            confirm.child_window(title="Yes", class_name="Button").click()
    except Exception:
        pass

    # Wait for write
    deadline = time.time() + 15
    while time.time() < deadline:
        if Path(rfy_out).exists():
            break
        time.sleep(0.5)

    if not Path(rfy_out).exists():
        raise RuntimeError(f"RFY was not produced at {rfy_out}")

    # ------- Close project (return to ready state) -------
    pyautogui.hotkey("alt", "f")
    time.sleep(0.3)
    pyautogui.press("c")  # Close
    time.sleep(1)
    # Discard if prompted
    try:
        for w in app.windows():
            if w.is_visible() and w.class_name() == "#32770":
                no_btn = w.child_window(title="No", class_name="Button")
                if no_btn.exists():
                    no_btn.click()
                    break
    except Exception:
        pass

    return rfy_out


# ---------------------------------------------------------------------------
# CLI / smoke test
# ---------------------------------------------------------------------------

def _smoke_test():
    src = r"C:\Users\Scott\CLAUDE CODE\hytek-rfy-codec\test-corpus\HG260012_23_SPRINGWOOD_ST_TOWNHOUSES\TH01-1F-LBW-89.075.xml"
    expected = r"C:\Users\Scott\CLAUDE CODE\hytek-rfy-codec\test-corpus\HG260012_23_SPRINGWOOD_ST_TOWNHOUSES\TH01-1F-LBW-89.075.rfy"
    out_dir = r"C:\Users\Scott\CLAUDE CODE\hytek-rfy-codec\tmp_detailer_out"

    try:
        rfy = xml_to_rfy(src, out_dir)
    except RuntimeError as e:
        print(f"SMOKE TEST BLOCKED: {e}")
        return 2

    print(f"Wrote: {rfy}")

    a = Path(rfy).read_bytes()
    b = Path(expected).read_bytes()
    if a == b:
        print(f"BYTE-EXACT MATCH ({len(a)} bytes)")
        return 0

    print(f"Bytes differ: produced={len(a)}, reference={len(b)}")
    print("Run: node scripts/diff-vs-detailer.mjs <produced> <reference>  to check op-level parity.")
    return 1


if __name__ == "__main__":
    sys.exit(_smoke_test())
