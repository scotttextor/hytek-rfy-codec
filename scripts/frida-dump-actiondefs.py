"""frida-dump-actiondefs.py
========================================================================

Spawn or attach to FRAMECAD Detailer, load `frida-dump-actiondefs.js`,
and stream the resulting JSONL records to disk.

USAGE
-----
  python scripts/frida-dump-actiondefs.py
      Default: spawns a fresh Detailer and waits for the user to drive
      it (open job, generate RFY).

  python scripts/frida-dump-actiondefs.py --attach
      Attach to an already-running Detailer (auto-detects PID).

  python scripts/frida-dump-actiondefs.py --pid 12345
      Attach to a specific PID.

  python scripts/frida-dump-actiondefs.py --out path/to/dump.jsonl
      Custom output path. Default: docs/frida-out/actiondefs-dump.jsonl

  python scripts/frida-dump-actiondefs.py --detailer "C:\\path\\to\\Detailer.exe"
      Override the auto-detected Detailer path.

WHAT TO DO ONCE ATTACHED
------------------------
The launcher prints status. In Detailer:
  1. Open ONE known XML job (preferably HG260044 — that's our highest-coverage corpus).
  2. Wait for Detailer to finish loading (UI responsive, no spinner).
  3. File -> Export -> RFY (Alt+F E R typically).
  4. Wait for export to complete.
  5. (Optional) trigger a second job for backup coverage.
  6. Press Ctrl+C in this launcher window. The launcher will request a
     final dictionary walk before detaching, so all sections are dumped
     even if they were never looked up at runtime.

The dump file should contain >= 28 unique classification names and
>= 450 RAction records once you stop the launcher.

EXIT CODES
----------
 0  Clean shutdown after Ctrl+C, dump file looks healthy.
 1  Detailer not found / could not be spawned.
 2  Frida hook errored at install time.
 3  Dump file looks empty after stop (zero unique keys).
 4  Other unhandled error.
"""

from __future__ import annotations

import argparse
import json
import signal
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import frida
except ImportError:
    sys.stderr.write(
        "ERROR: frida is not installed. Run:\n"
        "    pip install frida frida-tools\n"
    )
    sys.exit(4)

# Default Detailer install path on Scott's Win11 box.
DEFAULT_DETAILER_PATHS = [
    r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\FRAMECAD Detailer.exe",
    r"C:\Program Files\FRAMECAD\Detailer\Version 5\FRAMECAD Detailer.exe",
    r"C:\Program Files\FrameCAD Detailer\FRAMECAD Detailer.exe",
    r"C:\Program Files (x86)\FrameCAD Detailer\FRAMECAD Detailer.exe",
]

REPO_ROOT = Path(__file__).resolve().parent.parent
JS_PATH = Path(__file__).resolve().parent / "frida-dump-actiondefs.js"
DEFAULT_OUT = REPO_ROOT / "docs" / "frida-out" / "actiondefs-dump.jsonl"


def find_detailer_exe() -> Path | None:
    for p in DEFAULT_DETAILER_PATHS:
        if Path(p).is_file():
            return Path(p)
    # Fall back: walk Program Files to find any FRAMECAD Detailer.exe.
    for root in (Path(r"C:\Program Files (x86)"), Path(r"C:\Program Files")):
        if not root.exists():
            continue
        for sub in root.rglob("FRAMECAD Detailer.exe"):
            return sub
    return None


def find_running_detailer_pid() -> int | None:
    for proc in frida.enumerate_processes():
        if "detailer" in proc.name.lower():
            return proc.pid
    return None


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Dump Detailer's ActionDefsManager via Frida.")
    p.add_argument("--attach", action="store_true",
                   help="Attach to a running Detailer (auto-detects PID) instead of spawning.")
    p.add_argument("--pid", type=int, default=None,
                   help="Attach to this specific PID instead of spawning.")
    p.add_argument("--out", type=Path, default=DEFAULT_OUT,
                   help=f"Output JSONL path (default: {DEFAULT_OUT})")
    p.add_argument("--detailer", type=Path, default=None,
                   help="Path to FRAMECAD Detailer.exe (auto-detected if omitted).")
    p.add_argument("--target", type=str, default=None,
                   help="(Alias for --detailer for compatibility with task spec.)")
    return p.parse_args()


class Capture:
    def __init__(self, out_path: Path):
        self.out_path = out_path
        self.out_path.parent.mkdir(parents=True, exist_ok=True)
        self.fp = self.out_path.open("w", encoding="utf-8", buffering=1)
        self.events_total = 0
        self.events_by_type: dict[str, int] = {}
        self.unique_keys: set[str] = set()
        self.unique_section_ptrs: set[str] = set()
        self.action_records_total = 0
        self.start_ts = time.time()

    def on_message(self, msg, data):
        if msg.get("type") == "send":
            payload = msg.get("payload")
            self._record(payload)
        elif msg.get("type") == "error":
            err = {
                "type": "frida_error",
                "description": msg.get("description"),
                "stack": msg.get("stack"),
                "fileName": msg.get("fileName"),
                "lineNumber": msg.get("lineNumber"),
            }
            self._write(err)
            sys.stderr.write(f"[frida-error] {msg.get('description')}\n")
            if msg.get("stack"):
                sys.stderr.write(msg["stack"] + "\n")

    def _record(self, payload):
        self._write(payload)
        if isinstance(payload, dict):
            t = payload.get("type", "?")
            self.events_total += 1
            self.events_by_type[t] = self.events_by_type.get(t, 0) + 1
            if t == "dict_entry" and payload.get("key"):
                self.unique_keys.add(payload["key"])
            if t == "new_key_seen" and payload.get("key"):
                self.unique_keys.add(payload["key"])
            if t == "section_dump" and payload.get("section_ptr") and payload.get("section_ptr") not in ("0x0", "0", None):
                self.unique_section_ptrs.add(payload["section_ptr"])
                # Count action records inside masks.
                for mask_entry in (payload.get("masks") or []):
                    for slot in (mask_entry.get("slots") or []):
                        actions = slot.get("actions") or {}
                        if isinstance(actions, dict):
                            self.action_records_total += int(actions.get("length", 0) or 0)
            # Surface notable events to stdout.
            if t in ("init", "init_success", "first_apply_rule_fire",
                     "dict_walk_start", "dict_walk_done", "fatal", "init_giveup",
                     "new_key_seen"):
                short = {k: v for k, v in payload.items() if k not in ("masks", "slots", "actions")}
                print(f"[frida] {json.dumps(short, default=str)[:280]}")

    def _write(self, payload):
        try:
            self.fp.write(json.dumps(payload, ensure_ascii=False, default=str) + "\n")
        except Exception as e:
            sys.stderr.write(f"[write-error] {e}\n")

    def status_line(self) -> str:
        elapsed = time.time() - self.start_ts
        return (
            f"[status] t={elapsed:6.1f}s "
            f"events={self.events_total} "
            f"keys={len(self.unique_keys)} "
            f"sections={len(self.unique_section_ptrs)} "
            f"actions={self.action_records_total}"
        )

    def summary(self) -> dict:
        return {
            "type": "summary",
            "elapsed_seconds": round(time.time() - self.start_ts, 1),
            "events_total": self.events_total,
            "events_by_type": self.events_by_type,
            "unique_keys": sorted(self.unique_keys),
            "unique_keys_count": len(self.unique_keys),
            "unique_section_ptrs_count": len(self.unique_section_ptrs),
            "action_records_total": self.action_records_total,
            "out_path": str(self.out_path),
        }

    def close(self):
        try:
            self._write(self.summary())
        except Exception:
            pass
        self.fp.flush()
        self.fp.close()


def banner(out_path: Path):
    print("=" * 72)
    print(" Detailer ActionDefsManager Dumper")
    print(" Output: " + str(out_path))
    print(" Hook:   " + str(JS_PATH))
    print("=" * 72)


def main() -> int:
    args = parse_args()
    detailer_path = args.detailer or (Path(args.target) if args.target else None)

    if not JS_PATH.is_file():
        sys.stderr.write(f"ERROR: hook script missing at {JS_PATH}\n")
        return 4

    out_path = args.out
    capture = Capture(out_path)
    banner(out_path)

    # Decide spawn vs attach.
    spawned_pid: int | None = None
    pid: int

    if args.pid is not None:
        pid = args.pid
        print(f"[main] attaching to PID {pid}")
    elif args.attach:
        pid = find_running_detailer_pid()
        if pid is None:
            sys.stderr.write("ERROR: --attach used but no running Detailer process found.\n")
            capture.close()
            return 1
        print(f"[main] attaching to running Detailer (PID {pid})")
    else:
        # Spawn a fresh Detailer.
        if detailer_path is None:
            detailer_path = find_detailer_exe()
        if detailer_path is None:
            sys.stderr.write(
                "ERROR: could not locate FRAMECAD Detailer.exe. Pass --detailer <path>.\n"
            )
            capture.close()
            return 1
        if not Path(detailer_path).is_file():
            sys.stderr.write(f"ERROR: detailer path does not exist: {detailer_path}\n")
            capture.close()
            return 1
        print(f"[main] spawning {detailer_path}")
        try:
            pid = frida.spawn([str(detailer_path)])
            spawned_pid = pid
        except Exception as e:
            sys.stderr.write(f"ERROR: frida.spawn failed: {e}\n")
            capture.close()
            return 1

    # Attach + load script.
    try:
        session = frida.attach(pid)
    except Exception as e:
        sys.stderr.write(f"ERROR: frida.attach({pid}) failed: {e}\n")
        capture.close()
        return 2

    js_source = JS_PATH.read_text(encoding="utf-8")
    try:
        script = session.create_script(js_source)
    except Exception as e:
        sys.stderr.write(f"ERROR: create_script failed: {e}\n")
        session.detach()
        capture.close()
        return 2
    script.on("message", capture.on_message)
    try:
        script.load()
    except Exception as e:
        sys.stderr.write(f"ERROR: script.load failed: {e}\n")
        session.detach()
        capture.close()
        return 2

    # If we spawned, resume the process now that the hook is installed.
    if spawned_pid is not None:
        try:
            frida.resume(spawned_pid)
            print(f"[main] resumed PID {spawned_pid}")
        except Exception as e:
            sys.stderr.write(f"WARN: frida.resume failed: {e}\n")

    print("\n>>> Hook installed and listening. <<<")
    print("    In Detailer:")
    print("      1. Open ONE known XML job (HG260044 recommended).")
    print("      2. Wait for the build to complete.")
    print("      3. File -> Export -> RFY (Alt+F, E, R).")
    print("      4. Wait for export to finish.")
    print("    Then press Ctrl+C in this window to stop.")
    print()

    # Periodic status loop until user interrupts.
    stop_requested = {"v": False}

    def handle_signal(signum, frame):
        stop_requested["v"] = True
        print("\n[main] Ctrl+C received — requesting final dictionary walk...")

    signal.signal(signal.SIGINT, handle_signal)
    if hasattr(signal, "SIGBREAK"):
        signal.signal(signal.SIGBREAK, handle_signal)

    last_status_ts = 0.0
    try:
        while not stop_requested["v"]:
            time.sleep(0.5)
            now = time.time()
            if now - last_status_ts >= 5.0:
                print(capture.status_line())
                last_status_ts = now
    except KeyboardInterrupt:
        # Belt-and-braces: signal handler should have caught it, but just in case.
        stop_requested["v"] = True
        print("\n[main] KeyboardInterrupt fallthrough — requesting final dump...")

    # Final shutdown walk to ensure complete coverage.
    try:
        script.post({"type": "cmd", "cmd": "shutdown"})
        # Give the JS side ~2 seconds to walk the dictionary and emit events.
        deadline = time.time() + 3.0
        while time.time() < deadline:
            time.sleep(0.1)
    except Exception as e:
        sys.stderr.write(f"WARN: post(shutdown) failed: {e}\n")

    # Request stats one more time.
    try:
        script.post({"type": "cmd", "cmd": "stats"})
        time.sleep(0.5)
    except Exception:
        pass

    try:
        script.unload()
    except Exception:
        pass
    try:
        session.detach()
    except Exception:
        pass

    print()
    print(capture.status_line())
    print(f"[main] dump written to {out_path}")
    capture.close()

    if len(capture.unique_keys) == 0:
        sys.stderr.write(
            "WARN: zero unique classification keys captured. Did Detailer\n"
            "      actually run a job? Re-run and make sure to do File\n"
            "      -> Export -> RFY before stopping.\n"
        )
        return 3
    if len(capture.unique_keys) < 28:
        sys.stderr.write(
            f"WARN: only {len(capture.unique_keys)} unique keys captured (expected >= 28).\n"
            f"      The dump is partial. Try running another job before stopping.\n"
        )
        # Not a hard error — partial dumps are still useful.
    print(f"[done] {len(capture.unique_keys)} unique keys, "
          f"{len(capture.unique_section_ptrs)} sections, "
          f"{capture.action_records_total} action records.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
