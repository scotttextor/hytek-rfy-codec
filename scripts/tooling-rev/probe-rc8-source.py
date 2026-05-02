"""Probe — which gate is producing rc=8?

Strategy: place a software breakpoint via VEH (Vectored Exception Handler) at
each candidate location and report which one fires first.

Simpler strategy: nop out the rc=8 setter at 0x586495 and observe what happens
next. If we now get rc=6 or rc=7, the IsZeroDouble gate WAS the culprit and
0x585f90 fails on a different path. If we get rc=0, fantastic — the engine
accepts our records and we can move to generate_operations.

Run with 32-bit Python (Tooling.dll is x86).
"""
from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
import os
import sys
import struct
import textwrap

DLL = r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\Tooling.dll"

if struct.calcsize("P") != 4:
    sys.exit("ERROR: 32-bit Python required.")

detailer_dir = os.path.dirname(DLL)
os.add_dll_directory(detailer_dir)
old_cwd = os.getcwd()
os.chdir(detailer_dir)
try:
    tooling = ctypes.WinDLL(DLL)
finally:
    os.chdir(old_cwd)

DLL_BASE = tooling._handle
print(f"[+] Tooling.dll loaded at 0x{DLL_BASE:08x}")


def va(rva: int) -> int:
    return DLL_BASE + (rva - 0x00400000)


def write_bytes(addr: int, data: bytes):
    PAGE_EXECUTE_READWRITE = 0x40
    old = wt.DWORD(0)
    kernel32 = ctypes.windll.kernel32
    if not kernel32.VirtualProtect(ctypes.c_void_p(addr), len(data),
                                   PAGE_EXECUTE_READWRITE, ctypes.byref(old)):
        raise OSError("VirtualProtect (RWX) failed")
    try:
        ctypes.memmove(addr, data, len(data))
    finally:
        kernel32.VirtualProtect(ctypes.c_void_p(addr), len(data), old.value,
                                ctypes.byref(old))
    # Flush instruction cache
    kernel32.FlushInstructionCache(kernel32.GetCurrentProcess(),
                                    ctypes.c_void_p(addr), len(data))


def read_bytes(addr: int, n: int) -> bytes:
    return ctypes.string_at(addr, n)


# Bind exports
authenticate = tooling.authenticate
authenticate.argtypes = [ctypes.c_char_p]
authenticate.restype = ctypes.c_uint32

cleanup = tooling.cleanup
cleanup.argtypes = []

add_frameobject = tooling.add_frameobject
add_frameobject.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]
add_frameobject.restype = ctypes.c_uint32

generate_operations = tooling.generate_operations
generate_operations.argtypes = [ctypes.c_uint16]
generate_operations.restype = ctypes.c_int

get_operations_for = tooling.get_operations_for
get_operations_for.argtypes = [ctypes.c_uint32, ctypes.POINTER(ctypes.c_void_p),
                                 ctypes.POINTER(ctypes.c_int32)]
get_operations_for.restype = ctypes.c_int

# Auth bypass
IS_AUTHED_VA = va(0x0058fb80)
write_bytes(IS_AUTHED_VA, b"\x01")
print(f"[+] auth gate flipped: {read_bytes(IS_AUTHED_VA, 1).hex()}")


# ---------------------------------------------------------------------------
# PATCH the IsZeroDouble gate so it always passes.
#
# Original at 0x586491..0x586497 (in Tooling.dll RVA terms = 0x186491):
#   0x00586491  84c0                  test   al, al
#   0x00586493  7407                  je     0x58649c
#   0x00586495  b008                  mov    al, 8
#   0x00586497  e93b010000            jmp    0x5865d7
#
# Replace `7407` (je +7) with `9090` (two NOPs) so we always FALL THROUGH to
# 0x586495 → wait, that takes the FAIL path. Instead, replace `7407 b008` (5 bytes
# je+7 / mov al,8) with `eb09 90 90 90` (jmp +9 = always skip the al=8 setter,
# landing at 0x58649a, then 2 NOPs of `e93b...` jmp) — actually simpler: change
# the conditional `je +7` to unconditional `jmp +7` (eb 07).
#
# 7407  je  0x58649c     →   eb 07  jmp 0x58649c
# ---------------------------------------------------------------------------
GATE_VA = va(0x00586493)
print(f"[+] gate bytes before patch: {read_bytes(GATE_VA, 6).hex()}")
write_bytes(GATE_VA, b"\xeb\x07")    # je → jmp
print(f"[+] gate bytes after  patch: {read_bytes(GATE_VA, 6).hex()}")


# Build a minimal record set and call add_frameobject — we expect either
# rc=0 (engine accepts) or a different nonzero (revealing the next gate).

# FrameRecord (50 bytes)
fr_buf = (ctypes.c_uint8 * 0x32)()
ctypes.memset(ctypes.byref(fr_buf), 0, 0x32)
# frame_id at +0x12
ctypes.c_int32.from_buffer(fr_buf, 0x12).value = 1
# flag_a at +0
fr_buf[0] = 1
# vmethod_result at +0x11
fr_buf[0x11] = 1
# stick length double at +0x17 (8 bytes)
ctypes.memmove(ctypes.addressof(fr_buf) + 0x17, struct.pack("<d", 2616.0), 8)

# SectionLookupRecord (185 bytes) — leave zeroed, AnsiString at +0x9f = NIL
sl_buf = (ctypes.c_uint8 * 0xb9)()
ctypes.memset(ctypes.byref(sl_buf), 0, 0xb9)

# FrameDefRecord (75 bytes) — leave zeroed
fd_buf = (ctypes.c_uint8 * 0x4b)()
ctypes.memset(ctypes.byref(fd_buf), 0, 0x4b)

print()
print(f"[+] Calling add_frameobject with IsZeroDouble gate patched...")
try:
    rc_full = add_frameobject(ctypes.byref(fr_buf), ctypes.byref(sl_buf),
                              ctypes.byref(fd_buf))
    rc = rc_full & 0xFF
    print(f"[+] rc=0x{rc:02x} ({rc})  full eax=0x{rc_full:08x}")
    if rc == 0:
        print("    => SUCCESS! Section ctor accepted the record.")
    elif rc == 3:
        print("    => duplicate frame_id")
    elif rc == 6:
        print("    => 0x585f90 returned AL=6 (some [esi+8] negative-int gate)")
    elif rc == 7:
        print("    => 0x585f90 returned AL=7 ([esi+0xd] byte range gate)")
    elif rc == 8:
        print("    => still 8 — gate patch didn't take effect, OR rc=8 has a"
              " second source we haven't found")
    else:
        print(f"    => unknown rc=0x{rc:02x}")
except OSError as e:
    print(f"[!] add_frameobject crashed: {e}")
    rc = -1

# If success, try generate_operations + get_operations_for
if rc == 0:
    print(f"[+] Calling generate_operations(0)...")
    rc2 = generate_operations(0)
    print(f"    rc={rc2}")

    out_arr = ctypes.c_void_p(0)
    out_len = ctypes.c_int32(0)
    rc2 = get_operations_for(1, ctypes.byref(out_arr), ctypes.byref(out_len))
    print(f"[+] get_operations_for(1) -> rc={rc2}, ops_len={out_len.value}, "
          f"ops_ptr=0x{out_arr.value or 0:08x}")

cleanup()
print("[+] cleanup() done.")
