"""Disassemble generate_operations and get_operations_for to understand what
they do with engine state."""
import sys
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

DLL = r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\Tooling.dll"

TARGETS = {
    "generate_operations":     0x186678,
    "get_operations_for":      0x1867d4,
    "get_intersections_for":   0x1866d0,
    # The function add_frameobject calls right after the section ctor (line 0x5864b1)
    # 0x52fcb8 → class ptr → 0x531e7c is a method on it.
    "method_531e7c":           0x131e7c,
    # 0x52f9f8 — used in the loop at 0x58650d, related to the FrameDef[+0x3b] array
    "method_52f9f8":           0x12f9f8,
    # Method called right before frames_list.Add — at 0x586556 → class 0x52fe9c, method 0x531c14
    "method_531c14":           0x131c14,
    # 0x586330 called right before frames_list.Add (second-to-last call)
    "helper_586330":           0x186330,
    # 0x54d884 is the Big function called just before adding to frames_list
    "method_54d884":           0x14d884,
    # init_state_at_0x585f68 — the engine bootstrapper, called when [0x596c74] is null
    "init_state_585f68":       0x185f68,
}

pe = pefile.PE(DLL, fast_load=True)
image_base = pe.OPTIONAL_HEADER.ImageBase
md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = True


def disasm(name, rva, max_bytes=0x800, max_insns=300):
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
        if ins.mnemonic == "ret" and count > 5:
            break
        if count >= max_insns:
            print("  ... truncated")
            break


for name, rva in TARGETS.items():
    disasm(name, rva)
