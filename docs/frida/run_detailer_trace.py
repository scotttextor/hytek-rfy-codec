"""Spawn FRAMECAD Detailer under Frida, attach the trace script, and let
Detailer process a known job. Captures every Tooling.dll function call.

Usage: python run_detailer_trace.py [path-to-fcp]
"""
import frida
import os
import sys
import time
from pathlib import Path

DETAILER_EXE = r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\FRAMECAD Detailer.exe"
SCRIPT_PATH = Path(__file__).parent / "detailer-trace.js"

OUT_LOG = Path(__file__).parent.parent / "frida-traces" / f"trace-{int(time.time())}.jsonl"
OUT_LOG.parent.mkdir(parents=True, exist_ok=True)
log_fp = open(OUT_LOG, "w", encoding="utf-8")
print(f"Trace log: {OUT_LOG}")


def on_message(message, data):
    if message.get("type") == "send":
        payload = message.get("payload", {})
        if isinstance(payload, dict) and payload.get("type") == "log":
            line = payload.get("msg", "")
            print(f"[Frida] {line}")
            log_fp.write(line + "\n")
            log_fp.flush()
        else:
            print(f"[send] {payload}")
    elif message.get("type") == "error":
        print(f"[ERR] {message.get('description')}")


def main():
    print("Spawning FRAMECAD Detailer under Frida...")
    args = [DETAILER_EXE]
    if len(sys.argv) > 1:
        args.append(sys.argv[1])
    pid = frida.spawn(args)
    print(f"PID: {pid}")
    session = frida.attach(pid)
    print("Attached.")

    src = SCRIPT_PATH.read_text(encoding="utf-8")
    script = session.create_script(src)
    script.on("message", on_message)
    script.load()
    print("Script loaded.")

    frida.resume(pid)
    print("Detailer resumed. Press Ctrl-C to stop tracing.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping.")
    finally:
        session.detach()
        log_fp.close()
        print(f"Trace saved to {OUT_LOG}")


if __name__ == "__main__":
    main()
