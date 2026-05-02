"""Live-process VMT walker. Loads Tooling.dll into the running 32-bit Python
process and walks Delphi VMTs by reading process memory directly.

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
PE_BASE = 0x00400000


def va(rva: int) -> int:
    """Convert a static-image VA (assumes PE base 0x00400000) to a runtime VA."""
    return DLL_BASE + (rva - PE_BASE)


def read_dword(addr: int) -> int:
    return ctypes.c_uint32.from_address(addr).value


def read_byte(addr: int) -> int:
    return ctypes.c_uint8.from_address(addr).value


def read_string(addr: int, n: int) -> bytes:
    return ctypes.string_at(addr, n)


# Each "global class data slot" we care about. The DATA at each address is
# itself a POINTER to the actual class VMT.
SLOTS = {
    "0x52f158 TSection (alloc'd by section_ctor 0x585f90)":  0x12f158,
    "0x5482fc TFrameObject (alloc'd by add_frameobject)":     0x1482fc,
    "0x52fcb8 ?Mid (allocated mid-add_frameobject)":          0x12fcb8,
    "0x52fe9c ?Builder (alloc'd near frames_list.Add)":       0x12fe9c,
    "0x4f7e68 ?Tools (3 sub-allocs in add_frameobject)":      0xf7e68,
    "0x596c74 g_engine ROOT":                                  0x196c74,
    "0x585970 InitState ctor src":                             0x185970,
    "0x54c6a8 TList enumerator class":                         0x14c6a8,
    "0x5280a8 ?ScopeMgr (after TFrameObject ctor)":            0x1280a8,
}


def walk_vmt(name, slot_rva):
    addr = va(slot_rva)
    slot_val = read_dword(addr)
    print(f"\n=== {name} ===")
    print(f"  data slot RVA=0x{slot_rva:08x} VA=0x{addr:08x} -> 0x{slot_val:08x}")
    if slot_val == 0:
        print(f"  (slot empty)")
        return
    # slot_val is the VMT VA (runtime). The Delphi vmtClassName field is at
    # vmt+(-0x38), pointing to a Pascal ShortString.
    for cn_off in (-0x38, -0x4c, -0x40, -0x44, -0x48, -0x3c, -0x34, -0x30):
        try:
            ptr = read_dword(slot_val + cn_off)
            # Heuristic: in-image
            if not (DLL_BASE <= ptr < DLL_BASE + 0x200000):
                continue
            length = read_byte(ptr)
            if 0 < length < 64:
                cand = read_string(ptr + 1, length)
                if all(32 <= b < 127 for b in cand):
                    print(f"  class name (vmt{cn_off:+#04x}): {cand.decode('ascii')!r}")
                    break
        except Exception:
            continue
    # Dump first 0x40 bytes of the VMT (positive virtual methods).
    print(f"  vmt[0..0x3c] virtual methods:")
    for off in range(0, 0x40, 4):
        try:
            mptr = read_dword(slot_val + off)
            if mptr == 0:
                continue
            print(f"    [vmt+0x{off:02x}] = 0x{mptr:08x}")
        except Exception:
            break


for name, rva in SLOTS.items():
    walk_vmt(name, rva)
