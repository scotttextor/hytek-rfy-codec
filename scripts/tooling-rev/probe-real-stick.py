"""Probe — feed a REAL-LOOKING stick record (proper non-zero endpoints, length,
lipped, profile name) and see if generate_operations actually produces ops.

We've now established that the IsZeroDouble gate at 0x586493 wants distance(p1,p2)
to be NON-ZERO (the prior analysis had the polarity inverted). With proper
endpoints (0,0)→(2616,0), distance=2616, IsZeroDouble=0, gate passes naturally.

Run with 32-bit Python.
"""
from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
import os
import sys
import struct

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

# ------------- AUTH BYPASS -------------
IS_AUTHED_VA = va(0x0058fb80)
G_ENGINE_VA = va(0x00596c74)
write_bytes(IS_AUTHED_VA, b"\x01")
print(f"[+] auth flipped, gate byte = {read_bytes(IS_AUTHED_VA, 1).hex()}")


# ------------- BUILD RECORDS WITH NON-ZERO STICK -------------

# FrameRecord (50 bytes)
# Layout per record-layouts.md:
#   +0x00  flag_a (byte)
#   +0x01..+0x10  endpoint2 (4 dwords = 2 doubles?)
#   +0x11  vmethod_result (byte)
#   +0x12  frame_id (int32)
#   +0x16  flag_b (byte)
#   +0x17..+0x1e  unknown (2 dwords) — stick length double?
#   +0x1f  lipped_flag (byte)
#   +0x20  flag_d
#   +0x21  flag_e
#   +0x22..+0x31  endpoint1 (4 dwords = 2 doubles?)
#
# At 0x586461 the marshaller pushes [esi+0x26], [esi+0x22], [esi+0x2e], [esi+0x2a]
# in that ORDER, then calls 0x42f5a0 (TPoint ctor) with eax=ebp-0x1c.
#
# tpoint_ctor maps stack args to output:
#   [ebp+0x10] (third push from end = [esi+0x26]) → out[+0]   ← double_low_32
#   [ebp+0x14] (first push = [esi+0x22])         → out[+4]   ← double_high_32
#   [ebp+0x08] (last push = [esi+0x2e])          → out[+8]   ← double2_low
#   [ebp+0x0c] (second-to-last = [esi+0x2a])     → out[+0xc] ← double2_high
#
# So out_TPoint[+0..+7] = double assembled from (esi[+0x26], esi[+0x22])
#    out_TPoint[+8..+15] = double assembled from (esi[+0x2e], esi[+0x2a])
#
# In x86 little-endian, a double's low 4 bytes are at low offset. So:
#   double1_at_TPoint[+0] = bytes (esi[+0x26..+0x29] | esi[+0x22..+0x25])
#                          = esi[+0x22..+0x29] BUT WITH HALVES SWAPPED
#
# That's strange. Let me re-verify by looking at the 4 successive pushes:
#   push [esi+0x26]  → TOP of stack (highest pushed last → lowest stack addr)
# Actually NO. push DECREMENTS esp. So:
#   1st push [esi+0x26] → at [esp+0x0c] when ctor entered (4 pushes deep)
#   2nd push [esi+0x22] → at [esp+0x08]
#   3rd push [esi+0x2e] → at [esp+0x04]
#   4th push [esi+0x2a] → at [esp+0x00]   (top of stack, where call return addr goes)
# After call, ebp+8 = first arg slot (just above return addr).
#   [ebp+0x08] = 4th push = [esi+0x2a]
#   [ebp+0x0c] = 3rd push = [esi+0x2e]
#   [ebp+0x10] = 2nd push = [esi+0x22]   (was [esi+0x26] — WRONG. Let me redo.)
#
# Actually call instruction pushes return addr after ALL arg-pushes. So with 4
# arg-pushes the stack on entry to callee is:
#   [esp+0x00]  = return addr
#   [esp+0x04]  = arg1 = LAST push  (i.e. push [esi+0x2a])
#   [esp+0x08]  = arg2 = 2nd-last   (push [esi+0x2e])
#   [esp+0x0c]  = arg3 = 3rd-last   (push [esi+0x22])
#   [esp+0x10]  = arg4 = FIRST push (push [esi+0x26])
# After `push ebp; mov ebp, esp`, ebp+8 = arg1.
#   [ebp+0x08] = [esi+0x2a]
#   [ebp+0x0c] = [esi+0x2e]
#   [ebp+0x10] = [esi+0x22]
#   [ebp+0x14] = [esi+0x26]
#
# tpoint_ctor maps:
#   [ebp+0x10] = [esi+0x22] → out[+0]
#   [ebp+0x14] = [esi+0x26] → out[+4]
#   [ebp+0x08] = [esi+0x2a] → out[+8]
#   [ebp+0x0c] = [esi+0x2e] → out[+0xc]
#
# So out_TPoint:
#   bytes [0..3]  = esi[0x22..0x25]  ← x_double_low4
#   bytes [4..7]  = esi[0x26..0x29]  ← x_double_high4
#   bytes [8..11] = esi[0x2a..0x2d]  ← y_double_low4
#   bytes [12..15]= esi[0x2e..0x31]  ← y_double_high4
#
# Beautifully sequential. So FrameRecord +0x22..+0x31 is just two consecutive
# little-endian doubles (x, y) of endpoint1.
# Similarly +0x01..+0x10 is two doubles (x, y) of endpoint2 (per push pattern
# at 0x586466..0x58646f: push [esi+5], [esi+1], [esi+0xd], [esi+9] → out
# bytes esi[1..4]=x_lo, esi[5..8]=x_hi, esi[9..0xc]=y_lo, esi[0xd..0x10]=y_hi).
# So endpoint2.x = double at FrameRecord+0x01, endpoint2.y = double at +0x09.

fr_buf = (ctypes.c_uint8 * 0x32)()
ctypes.memset(ctypes.byref(fr_buf), 0, 0x32)
fr_buf[0] = 1                                                  # flag_a
fr_buf[0x11] = 1                                               # vmethod_result
ctypes.c_int32.from_buffer(fr_buf, 0x12).value = 1             # frame_id

# endpoint2 = (0,0): leave at zero
ctypes.memmove(ctypes.addressof(fr_buf) + 0x01, struct.pack("<dd", 0.0, 0.0), 16)
# endpoint1 = (2616,0): stick of length 2616 along x axis
ctypes.memmove(ctypes.addressof(fr_buf) + 0x22, struct.pack("<dd", 2616.0, 0.0), 16)
# stick length double at +0x17 (in case engine reads this too)
ctypes.memmove(ctypes.addressof(fr_buf) + 0x17, struct.pack("<d", 2616.0), 8)

# Print FrameRecord hex for sanity
print(f"[+] FrameRecord (50 bytes):")
for i in range(0, 0x32, 16):
    chunk = bytes(fr_buf[i:i+16])
    print(f"    +{i:02x}  {chunk.hex(' ')}")

# SectionLookupRecord (185 bytes)
# CORRECTION 2026-05-02: +0x9f is NOT an AnsiString pointer — it's a pointer to
# an array of 14-byte SectionRule records, and +0xa3 is the COUNT.
# Zero them both out so the section ctor's rule-loading loops do nothing.
sl_buf = (ctypes.c_uint8 * 0xb9)()
ctypes.memset(ctypes.byref(sl_buf), 0, 0xb9)
# +0x9f (rules ptr) = 0; +0xa3 (rules count) = 0  → no iterations

# FrameDefRecord (75 bytes)
fd_buf = (ctypes.c_uint8 * 0x4b)()
ctypes.memset(ctypes.byref(fd_buf), 0, 0x4b)


print()
print(f"[+] Calling add_frameobject (NO gate patch — endpoints differ so dist != 0)...")
try:
    rc_full = add_frameobject(ctypes.byref(fr_buf), ctypes.byref(sl_buf),
                              ctypes.byref(fd_buf))
    rc = rc_full & 0xFF
    print(f"[+] rc=0x{rc:02x} ({rc})")
except OSError as e:
    print(f"[!] add_frameobject crashed: {e}")
    rc = -1

# Inspect engine state
g_engine_ptr = ctypes.c_uint32.from_address(G_ENGINE_VA).value
if g_engine_ptr:
    print(f"[+] g_engine = 0x{g_engine_ptr:08x}")
    sections_list = ctypes.c_uint32.from_address(g_engine_ptr + 4).value
    frames_list = ctypes.c_uint32.from_address(g_engine_ptr + 8).value
    print(f"    sections_list = 0x{sections_list:08x}")
    print(f"    frames_list   = 0x{frames_list:08x}")
    if frames_list:
        # Delphi TList layout: +0 vtable, +4 array ptr, +8 count
        flist_count = ctypes.c_int32.from_address(frames_list + 8).value
        print(f"    frames_list.Count = {flist_count}")
    if sections_list:
        slist_count = ctypes.c_int32.from_address(sections_list + 8).value
        print(f"    sections_list.Count = {slist_count}")

if rc == 0:
    # generate ops
    print()
    print(f"[+] Calling generate_operations(1)...")
    rc2 = generate_operations(1)
    print(f"    rc={rc2}")

    out_arr = ctypes.c_void_p(0)
    out_len = ctypes.c_int32(0)
    rc2 = get_operations_for(1, ctypes.byref(out_arr), ctypes.byref(out_len))
    print(f"[+] get_operations_for(1) -> rc={rc2}, ops_len={out_len.value}, "
          f"ops_ptr=0x{out_arr.value or 0:08x}")

    if out_arr.value and out_len.value > 0:
        # Each op has unknown record size — sample
        # If TArray<T> in Delphi, the length-prefix is at out_arr[-4].
        try:
            payload_len = ctypes.c_int32.from_address(out_arr.value - 4).value
            print(f"    array len header at -4: {payload_len}")
        except Exception:
            pass
        n_bytes = min(out_len.value * 64, 1024)
        dump = ctypes.string_at(out_arr.value, n_bytes)
        print(f"    First {n_bytes} bytes:")
        for i in range(0, len(dump), 16):
            chunk = dump[i:i+16]
            hex_str = " ".join(f"{b:02x}" for b in chunk)
            ascii_str = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
            print(f"      +{i:04x}  {hex_str:48}  {ascii_str}")

    # Also try frame_id 0
    out_arr = ctypes.c_void_p(0)
    out_len = ctypes.c_int32(0)
    rc2 = get_operations_for(0, ctypes.byref(out_arr), ctypes.byref(out_len))
    print(f"[+] get_operations_for(0) -> rc={rc2}, ops_len={out_len.value}")

cleanup()
print()
print("[+] cleanup() done.")
