"""Disassemble geometric helpers: 0x42f5a0 (TPoint ctor), 0x42f5fc (geom op),
0x42eeec (IsZeroDouble), and the full body of section ctor 0x585f90.

Run with 64-bit Python (capstone wheel is x64).
"""
import sys
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

DLL = r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\Tooling.dll"

TARGETS = {
    # Geometric helpers in the rc=8 path.
    "tpoint_ctor_42f5a0":     0x2f5a0,
    "geom_op_42f5fc":         0x2f5fc,
    "is_zero_double_42eeec":  0x2eeec,
    # The section constructor (full body).
    "section_ctor_585f90":    0x185f90,
    # The class vtable (read pointer at this RVA).
    # 0x52f158 = data, but we'll dump bytes around it.
}

# Larger constants we want to look at.
GLOBAL_DUMPS = {
    "vtable_ptr_at_0x52f158":   (0x12f158, 0x40),    # 64 bytes around vtable ptr
    "global_ptr_0x52fcb8":      (0x12fcb8, 0x10),    # for line 0x5864b1
    "global_ptr_0x5280a8":      (0x1280a8, 0x10),    # for line 0x58653b
    "global_ptr_0x52fe9c":      (0x12fe9c, 0x10),    # for line 0x586556
    "global_ptr_0x4f7e68":      (0xf7e68, 0x10),     # for lines 0x586571/0x586581
    "global_ptr_0x5482fc":      (0x1482fc, 0x10),    # for line 0x5865b4
}

pe = pefile.PE(DLL, fast_load=True)
image_base = pe.OPTIONAL_HEADER.ImageBase
md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = True


def disasm(name, rva, max_bytes=0x600, max_insns=200):
    print(f"\n=== {name} @ RVA 0x{rva:08x}  (VA 0x{image_base+rva:08x}) ===")
    try:
        data = pe.get_memory_mapped_image()[rva:rva+max_bytes]
    except Exception as e:
        print(f"  ! couldn't read: {e}")
        return
    va = image_base + rva
    count = 0
    for ins in md.disasm(data, va):
        print(f"  0x{ins.address:08x}  {ins.bytes.hex():<20}  {ins.mnemonic:<6} {ins.op_str}")
        count += 1
        if ins.mnemonic == "ret" and count > 3:
            break
        if count >= max_insns:
            print("  ... truncated")
            break


def dump_data(name, rva, n):
    print(f"\n--- DATA {name} @ RVA 0x{rva:08x} ({n} bytes) ---")
    try:
        data = pe.get_memory_mapped_image()[rva:rva+n]
    except Exception as e:
        print(f"  ! couldn't read: {e}")
        return
    for i in range(0, n, 16):
        chunk = data[i:i+16]
        hex_str = " ".join(f"{b:02x}" for b in chunk)
        ascii_str = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
        print(f"  +{i:04x}  {hex_str:48}  {ascii_str}")


for name, rva in TARGETS.items():
    disasm(name, rva)

for name, (rva, n) in GLOBAL_DUMPS.items():
    dump_data(name, rva, n)
