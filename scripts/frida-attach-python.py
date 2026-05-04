"""Python-driven frida attach. More reliable than the CLI for long-running sessions."""
import sys
import frida
from pathlib import Path

PID = int(sys.argv[1])
JS = Path(sys.argv[2]).read_text(encoding="utf-8")
OUT = Path(sys.argv[3])

print(f"[*] attaching to PID {PID}")
session = frida.attach(PID)
script = session.create_script(JS)

out_file = OUT.open("w", encoding="utf-8", buffering=1)

def on_message(msg, data):
    if msg.get("type") == "send":
        out_file.write(str(msg.get("payload", "")) + "\n")
    elif msg.get("type") == "error":
        out_file.write(f"[ERROR] {msg.get('description', msg)}\n")

# The JS uses console.log, which goes through frida's stdio. Drain that stream too.
def on_log(level, text):
    out_file.write(text + "\n" if not text.endswith("\n") else text)

script.on("message", on_message)
script.set_log_handler(on_log) if hasattr(script, 'set_log_handler') else None

script.load()
print("[*] hook loaded — capturing. press Ctrl+C to stop")
sys.stdout.flush()

import signal
def stop(*_):
    out_file.flush()
    out_file.close()
    session.detach()
    print("[*] detached")
    sys.exit(0)
signal.signal(signal.SIGINT, stop)
signal.signal(signal.SIGTERM, stop)

# Block forever (until killed)
import time
while True:
    time.sleep(60)
    out_file.flush()
